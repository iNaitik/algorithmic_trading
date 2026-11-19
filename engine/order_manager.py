"""
engine/order_manager.py
=======================
Order Management System (OMS) and Paper Execution Simulator for Algo Trading Bot.
Provides:
- Explicit order data model separate from execution fills.
- Strict 9-state lifecycle management with legal transition enforcement.
- Idempotency key mapping to prevent duplicate submissions.
- Multi-fill weighted average price calculation.
- Partial fills and partial cancellations.
- Deterministic rejection conditions (circuit breaker, insufficient virtual funds, invalid inputs, market closed).
- Persistence to data/paper_orders.json with atomic writes.
- 1:1 reconciliation with the FIFO ledger (trade_history.csv).
- Concurrency protection via threading.RLock.
"""

import os
import json
import uuid
import threading
from enum import Enum
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from zoneinfo import ZoneInfo
import csv
import pandas as pd


# ─────────────────────────────────────────────────────────────────────────────
# 1. Enums and Legal State Transitions
# ─────────────────────────────────────────────────────────────────────────────
class OrderStatus(str, Enum):
    CREATED = "CREATED"
    VALIDATED = "VALIDATED"
    PENDING = "PENDING"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    REJECTED = "REJECTED"
    CANCEL_PENDING = "CANCEL_PENDING"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    SHORT = "SHORT"
    COVER = "COVER"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


class InvalidStateTransitionError(Exception):
    """Raised when an illegal order lifecycle transition is attempted."""
    pass


class OrderNotFoundError(Exception):
    """Raised when an order ID is not found in the repository."""
    pass


class OrderValidationError(Exception):
    """Raised when an order submission fails semantic validation."""
    pass


# Explicit graph of legal transitions
LEGAL_TRANSITIONS: Dict[OrderStatus, set] = {
    OrderStatus.CREATED: {OrderStatus.VALIDATED, OrderStatus.REJECTED},
    OrderStatus.VALIDATED: {
        OrderStatus.PENDING,
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.FILLED,
        OrderStatus.REJECTED,
    },
    OrderStatus.PENDING: {
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.FILLED,
        OrderStatus.CANCEL_PENDING,
        OrderStatus.CANCELLED,
        OrderStatus.EXPIRED,
        OrderStatus.REJECTED,
    },
    OrderStatus.PARTIALLY_FILLED: {
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.FILLED,
        OrderStatus.CANCEL_PENDING,
        OrderStatus.CANCELLED,
        OrderStatus.EXPIRED,
    },
    OrderStatus.CANCEL_PENDING: {
        OrderStatus.CANCELLED,
    },
    # Terminal states have no outbound transitions
    OrderStatus.FILLED: set(),
    OrderStatus.CANCELLED: set(),
    OrderStatus.REJECTED: set(),
    OrderStatus.EXPIRED: set(),
}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Statutory Fee & Slippage Helpers (Aligned with live_trader.py)
# ─────────────────────────────────────────────────────────────────────────────
def compute_paper_fill_charges(shares: int, price: float, side: str) -> Dict[str, float]:
    """Computes exact statutory charges for an order fill on NSE Intraday MIS."""
    turnover = round(shares * price, 2)
    side_upper = side.upper()

    # Brokerage: min(0.03%, ₹20)
    brokerage = round(min(turnover * 0.0003, 20.0), 2)

    # STT: 0.025% on sell side only (SELL or SHORT)
    stt = round(turnover * 0.00025, 2) if side_upper in {"SELL", "SHORT"} else 0.0

    # Exchange transaction charge: 0.00297%
    exchange = round(turnover * 0.0000297, 2)

    # SEBI turnover charge: ₹10 / crore (0.0001%)
    sebi = round(turnover * 0.000001, 2)

    # Stamp duty: 0.003% on buy side only (BUY or COVER)
    stamp = round(turnover * 0.00003, 2) if side_upper in {"BUY", "COVER"} else 0.0

    # GST: 18% on (Brokerage + Exchange + SEBI)
    gst = round((brokerage + exchange + sebi) * 0.18, 2)

    total_charges = round(brokerage + stt + exchange + sebi + stamp + gst, 2)

    return {
        "brokerage": brokerage,
        "stt": stt,
        "exchange": exchange,
        "sebi": sebi,
        "stamp_duty": stamp,
        "gst": gst,
        "total_charges": total_charges,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Data Models: Fill and Order
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class Fill:
    fill_id: str
    order_id: str
    symbol: str
    side: str
    quantity: int
    price: float
    slippage: float
    charges: Dict[str, float]
    timestamp: str
    execution_source: str = "PAPER"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Fill":
        return cls(**data)


@dataclass
class Order:
    order_id: str
    idempotency_key: str
    symbol: str
    side: str
    order_type: str
    requested_quantity: int
    filled_quantity: int = 0
    remaining_quantity: int = 0
    limit_price: Optional[float] = None
    average_price: float = 0.0
    status: str = OrderStatus.CREATED.value
    created_at: str = ""
    updated_at: str = ""
    rejection_reason: Optional[str] = None
    execution_source: str = "PAPER"
    strategy_name: Optional[str] = "NSE Intraday ORB Breakout"
    bot_id: Optional[str] = "live_bot_1"
    fills: List[Fill] = field(default_factory=list)
    history: List[Dict[str, Any]] = field(default_factory=list)

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat()
        if not self.updated_at:
            self.updated_at = self.created_at
        if self.remaining_quantity == 0 and self.filled_quantity == 0:
            self.remaining_quantity = self.requested_quantity
        if not self.history:
            self.history.append({
                "from_status": None,
                "to_status": self.status,
                "timestamp": self.created_at,
                "reason": "Order created",
            })

    def transition_to(self, new_status: OrderStatus, reason: Optional[str] = None):
        """Enforces legal state transitions and appends to transition history."""
        curr_enum = OrderStatus(self.status)
        target_enum = OrderStatus(new_status)

        if target_enum not in LEGAL_TRANSITIONS.get(curr_enum, set()):
            raise InvalidStateTransitionError(
                f"Illegal state transition from {curr_enum.value} to {target_enum.value} for order {self.order_id}"
            )

        old_status = self.status
        self.status = target_enum.value
        now_iso = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat()
        self.updated_at = now_iso

        if target_enum == OrderStatus.REJECTED and reason and not self.rejection_reason:
            self.rejection_reason = reason

        self.history.append({
            "from_status": old_status,
            "to_status": target_enum.value,
            "timestamp": now_iso,
            "reason": reason or f"Transitioned to {target_enum.value}",
        })

    def record_fill(self, fill: Fill):
        """Records an execution fill, updating cumulative volume and weighted average price."""
        if self.status in {OrderStatus.CANCELLED.value, OrderStatus.REJECTED.value, OrderStatus.EXPIRED.value}:
            raise InvalidStateTransitionError(
                f"Cannot record fill on an order in terminal state {self.status}"
            )
        if self.status == OrderStatus.FILLED.value:
            raise InvalidStateTransitionError(
                f"Cannot record fill on completely filled order {self.order_id}"
            )

        if any(f.fill_id == fill.fill_id for f in self.fills):
            raise ValueError(f"Duplicate fill ID {fill.fill_id} already exists on order {self.order_id}")

        if fill.quantity <= 0:
            raise ValueError("Fill quantity must be greater than 0")

        if self.filled_quantity + fill.quantity > self.requested_quantity:
            raise ValueError(
                f"Fill quantity {fill.quantity} exceeds remaining quantity {self.remaining_quantity}"
            )

        # Weighted average execution price calculation
        current_cost = self.average_price * self.filled_quantity
        fill_cost = fill.price * fill.quantity
        new_filled_qty = self.filled_quantity + fill.quantity

        self.filled_quantity = new_filled_qty
        self.remaining_quantity = self.requested_quantity - new_filled_qty
        self.average_price = round((current_cost + fill_cost) / new_filled_qty, 2)
        self.fills.append(fill)

        now_iso = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat()
        self.updated_at = now_iso

        if self.remaining_quantity == 0:
            self.transition_to(OrderStatus.FILLED, f"Filled completely: {new_filled_qty}/{self.requested_quantity}")
        else:
            if self.status != OrderStatus.PARTIALLY_FILLED.value:
                self.transition_to(
                    OrderStatus.PARTIALLY_FILLED,
                    f"Partial fill: {fill.quantity} shares @ ₹{fill.price:.2f}"
                )
            else:
                self.history.append({
                    "from_status": OrderStatus.PARTIALLY_FILLED.value,
                    "to_status": OrderStatus.PARTIALLY_FILLED.value,
                    "timestamp": now_iso,
                    "reason": f"Additional fill: {fill.quantity} shares @ ₹{fill.price:.2f}",
                })

    def cancel(self, reason: Optional[str] = "Cancelled by user"):
        """Cancels remaining quantity while strictly preserving already executed fills."""
        if self.status == OrderStatus.FILLED.value:
            raise ValueError("Cannot cancel a completely filled order")
        if self.status in {OrderStatus.CANCELLED.value, OrderStatus.REJECTED.value, OrderStatus.EXPIRED.value}:
            raise ValueError(f"Cannot cancel order in status {self.status}")
        if self.status not in {
            OrderStatus.PENDING.value,
            OrderStatus.PARTIALLY_FILLED.value,
            OrderStatus.CANCEL_PENDING.value,
        }:
            raise ValueError(f"Cannot cancel order in state {self.status}")

        if self.status != OrderStatus.CANCEL_PENDING.value:
            self.transition_to(OrderStatus.CANCEL_PENDING, reason)

        # Retain filled quantity, zero out remaining quantity
        self.remaining_quantity = 0
        self.transition_to(OrderStatus.CANCELLED, reason or "Order cancelled")

    def expire(self, reason: Optional[str] = "Order expired at end of session"):
        """Expires remaining quantity on session close."""
        if self.status not in {OrderStatus.PENDING.value, OrderStatus.PARTIALLY_FILLED.value}:
            raise ValueError(f"Cannot expire order with status {self.status}")
        self.remaining_quantity = 0
        self.transition_to(OrderStatus.EXPIRED, reason)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["fills"] = [f.to_dict() if isinstance(f, Fill) else f for f in self.fills]
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Order":
        fills_data = data.pop("fills", [])
        order = cls(**data)
        order.fills = [Fill.from_dict(f) if isinstance(f, dict) else f for f in fills_data]
        return order


# ─────────────────────────────────────────────────────────────────────────────
# 4. Order Management System & Paper Execution Simulator
# ─────────────────────────────────────────────────────────────────────────────
class OrderManager:
    """Thread-safe Order Management System (OMS) and Paper Execution Simulator."""

    def __init__(
        self,
        orders_file_path: Optional[str] = None,
        history_file_path: Optional[str] = None,
        config_file_path: Optional[str] = None,
        enforce_market_hours: bool = False,
    ):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.orders_file = orders_file_path or os.path.join(base_dir, "data", "paper_orders.json")
        self.history_file = history_file_path or os.path.join(base_dir, "data", "trade_history.csv")
        self.config_file = config_file_path or os.path.join(base_dir, "data", "bot_active_config.json")
        self.enforce_market_hours = enforce_market_hours

        self._orders: Dict[str, Order] = {}
        self._idempotency_map: Dict[str, str] = {}
        self._lock = threading.RLock()

        self._load()

    # ─────────────────────────────────────────────────────────────────────────
    # Persistence
    # ─────────────────────────────────────────────────────────────────────────
    def _load(self):
        """Loads persisted orders and rebuilds the idempotency index."""
        with self._lock:
            self._orders.clear()
            self._idempotency_map.clear()
            if not os.path.exists(self.orders_file):
                return

            try:
                with open(self.orders_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    orders_list = data if isinstance(data, list) else data.get("orders", [])
                    for item in orders_list:
                        order = Order.from_dict(item)
                        self._orders[order.order_id] = order
                        if order.idempotency_key:
                            self._idempotency_map[order.idempotency_key] = order.order_id
            except Exception as e:
                print(f"[OMS LOAD WARNING] Could not load {self.orders_file}: {e}")

    def _save(self):
        """Atomically saves all orders to disk."""
        with self._lock:
            parent_dir = os.path.dirname(self.orders_file)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)

            tmp_path = f"{self.orders_file}.tmp.{uuid.uuid4().hex[:8]}"
            orders_data = [o.to_dict() for o in self._orders.values()]
            try:
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump({"orders": orders_data}, f, indent=2)
                os.replace(tmp_path, self.orders_file)
            except Exception as e:
                if os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except Exception:
                        pass
                raise IOError(f"Failed to persist orders to {self.orders_file}: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Validation & Rejection Conditions
    # ─────────────────────────────────────────────────────────────────────────
    def _check_market_hours(self) -> bool:
        """Checks if current time is within regular NSE trading hours (09:15 - 15:30 IST)."""
        now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
        if now_ist.weekday() >= 5:
            return False
        return (
            (now_ist.hour == 9 and now_ist.minute >= 15)
            or (9 < now_ist.hour < 15)
            or (now_ist.hour == 15 and now_ist.minute <= 30)
        )

    def _get_bot_cash_and_circuit(self) -> Tuple[float, bool]:
        """Reads virtual available cash balance and circuit breaker status from config."""
        default_cash = 1_000_000.0
        default_circuit = False
        if not os.path.exists(self.config_file):
            return default_cash, default_circuit

        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                cash = float(cfg.get("cash", default_cash))
                circuit = bool(cfg.get("circuit_breaker_triggered", False))
                return cash, circuit
        except Exception:
            return default_cash, default_circuit

    def _update_bot_cash_and_ledger(
        self,
        action: str,
        symbol: str,
        shares: int,
        price: float,
        cash_change: float,
    ):
        """Synchronizes an executed order fill to the bot config and trade_history.csv."""
        with self._lock:
            # 1. Update bot config cash balance
            if os.path.exists(self.config_file):
                try:
                    with open(self.config_file, "r", encoding="utf-8") as f:
                        cfg = json.load(f)
                    curr_cash = float(cfg.get("cash", 1_000_000.0))
                    cfg["cash"] = round(curr_cash + cash_change, 2)
                    cfg["last_updated"] = datetime.now().isoformat()
                    with open(self.config_file, "w", encoding="utf-8") as f:
                        json.dump(cfg, f, indent=2)
                except Exception as e:
                    print(f"[OMS BOT CONFIG SYNC ERROR] {e}")

            # 2. Append fill to trade_history.csv
            parent_dir = os.path.dirname(self.history_file)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)
            file_exists = os.path.exists(self.history_file)
            now_str = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d %H:%M:%S")
            try:
                with open(self.history_file, "a", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    if not file_exists:
                        writer.writerow(["Timestamp", "Action", "Symbol", "Shares", "Execution_Price", "Cash_Change"])
                    writer.writerow([now_str, action, symbol, shares, round(price, 2), f"{cash_change:+.2f}"])
            except Exception as e:
                print(f"[OMS LEDGER CSV SYNC ERROR] {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Core Order Operations
    # ─────────────────────────────────────────────────────────────────────────
    def submit_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        quantity: int,
        limit_price: Optional[float] = None,
        idempotency_key: Optional[str] = None,
        strategy_name: Optional[str] = "NSE Intraday ORB Breakout",
        bot_id: Optional[str] = "live_bot_1",
        simulated_market_price: Optional[float] = None,
    ) -> Tuple[Order, bool]:
        """
        Submits an order with idempotency protection.
        Returns: (Order, is_new: bool)
        """
        with self._lock:
            # 1. Idempotency Check
            if idempotency_key and idempotency_key in self._idempotency_map:
                existing_id = self._idempotency_map[idempotency_key]
                return self._orders[existing_id], False

            # Generate unique order ID
            order_id = f"ORD-{datetime.now(ZoneInfo('Asia/Kolkata')).strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
            final_idempotency_key = idempotency_key or str(uuid.uuid4())

            # Instantiate Order in CREATED status
            order = Order(
                order_id=order_id,
                idempotency_key=final_idempotency_key,
                symbol=symbol.strip().upper() if symbol else "",
                side=side.strip().upper() if side else "",
                order_type=order_type.strip().upper() if order_type else "",
                requested_quantity=quantity,
                filled_quantity=0,
                remaining_quantity=quantity,
                limit_price=limit_price,
                average_price=0.0,
                status=OrderStatus.CREATED.value,
                strategy_name=strategy_name,
                bot_id=bot_id,
            )

            self._orders[order_id] = order
            self._idempotency_map[final_idempotency_key] = order_id

            # 2. Semantic Validation & Deterministic Rejection
            try:
                self._validate_and_process(order, simulated_market_price)
            except Exception as e:
                if order.status != OrderStatus.REJECTED.value:
                    try:
                        order.transition_to(OrderStatus.REJECTED, str(e))
                    except Exception:
                        order.status = OrderStatus.REJECTED.value
                        order.rejection_reason = str(e)

            self._save()
            return order, True

    def _validate_and_process(self, order: Order, simulated_market_price: Optional[float] = None):
        """Validates inputs, checks risk constraints, and executes or enqueues."""
        # 1. Basic field checks
        if not order.symbol or not isinstance(order.symbol, str) or len(order.symbol) < 2:
            order.transition_to(OrderStatus.REJECTED, "Invalid instrument: empty or malformed symbol")
            return

        valid_sides = {OrderSide.BUY.value, OrderSide.SELL.value, OrderSide.SHORT.value, OrderSide.COVER.value}
        if order.side not in valid_sides:
            order.transition_to(OrderStatus.REJECTED, f"Invalid side: must be one of {valid_sides}")
            return

        valid_types = {OrderType.MARKET.value, OrderType.LIMIT.value}
        if order.order_type not in valid_types:
            order.transition_to(OrderStatus.REJECTED, f"Invalid order type: must be one of {valid_types}")
            return

        if not isinstance(order.requested_quantity, int) or order.requested_quantity <= 0:
            order.transition_to(OrderStatus.REJECTED, "Invalid quantity: must be an integer greater than 0")
            return

        if order.order_type == OrderType.LIMIT.value:
            if order.limit_price is None or order.limit_price <= 0:
                order.transition_to(OrderStatus.REJECTED, "Limit order requires a positive limit_price")
                return

        # 2. Market Hours Check (if enforced)
        if self.enforce_market_hours and not self._check_market_hours():
            order.transition_to(OrderStatus.REJECTED, "Market closed: NSE trading hours are 09:15 to 15:30 IST")
            return

        # 3. Risk Circuit Breaker Check
        cash, is_circuit_active = self._get_bot_cash_and_circuit()
        if is_circuit_active:
            order.transition_to(
                OrderStatus.REJECTED,
                "Risk circuit breaker active: trading is halted for the session"
            )
            return

        # 4. Virtual Funds / Buying Power Check
        est_price = (
            order.limit_price
            if order.order_type == OrderType.LIMIT.value and order.limit_price
            else (simulated_market_price or 1000.0)
        )
        required_funds = est_price * order.requested_quantity
        # If BUY or SHORT (requiring margin/capital)
        if order.side in {OrderSide.BUY.value, OrderSide.SHORT.value}:
            if required_funds > cash:
                order.transition_to(
                    OrderStatus.REJECTED,
                    f"Insufficient virtual funds: required ₹{required_funds:,.2f}, available cash ₹{cash:,.2f}"
                )
                return

        # Passed semantic validation! Transition to VALIDATED
        order.transition_to(OrderStatus.VALIDATED, "Order passed pre-trade validation")

        # 5. Execution Simulation
        if order.order_type == OrderType.MARKET.value:
            # Immediate simulated execution
            ref_price = simulated_market_price or 1000.0
            # Apply 0.05% realistic slippage
            slippage_rate = 0.0005
            if order.side in {OrderSide.BUY.value, OrderSide.COVER.value}:
                exec_price = round(ref_price * (1.0 + slippage_rate), 2)
            else:
                exec_price = round(ref_price * (1.0 - slippage_rate), 2)

            slippage_amt = round(abs(exec_price - ref_price) * order.requested_quantity, 2)
            charges = compute_paper_fill_charges(order.requested_quantity, exec_price, order.side)

            fill_id = f"FILL-{datetime.now(ZoneInfo('Asia/Kolkata')).strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
            fill = Fill(
                fill_id=fill_id,
                order_id=order.order_id,
                symbol=order.symbol,
                side=order.side,
                quantity=order.requested_quantity,
                price=exec_price,
                slippage=slippage_amt,
                charges=charges,
                timestamp=datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(),
                execution_source="PAPER",
            )
            order.record_fill(fill)

            # Sync fill with FIFO ledger and bot cash
            turnover = order.requested_quantity * exec_price
            if order.side in {OrderSide.BUY.value, OrderSide.COVER.value}:
                cash_delta = -(turnover + charges["total_charges"])
            else:
                cash_delta = +(turnover - charges["total_charges"])

            self._update_bot_cash_and_ledger(
                action=order.side,
                symbol=order.symbol,
                shares=order.requested_quantity,
                price=exec_price,
                cash_change=cash_delta,
            )

        elif order.order_type == OrderType.LIMIT.value:
            # Limit order rests in book as PENDING
            order.transition_to(OrderStatus.PENDING, "Limit order queued in order book")

    def execute_fill(
        self,
        order_id: str,
        quantity: int,
        price: float,
        slippage: Optional[float] = None,
        sync_to_ledger: bool = True,
    ) -> Fill:
        """Executes a partial or complete fill on a PENDING or PARTIALLY_FILLED order."""
        with self._lock:
            order = self.get_order(order_id)
            if order.status not in {OrderStatus.PENDING.value, OrderStatus.PARTIALLY_FILLED.value}:
                raise InvalidStateTransitionError(
                    f"Cannot fill order {order_id} in state {order.status}"
                )

            if quantity <= 0 or quantity > order.remaining_quantity:
                raise ValueError(
                    f"Invalid fill quantity {quantity}. Remaining quantity is {order.remaining_quantity}"
                )

            charges = compute_paper_fill_charges(quantity, price, order.side)
            slip = slippage if slippage is not None else round(quantity * price * 0.0005, 2)

            fill_id = f"FILL-{datetime.now(ZoneInfo('Asia/Kolkata')).strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
            fill = Fill(
                fill_id=fill_id,
                order_id=order.order_id,
                symbol=order.symbol,
                side=order.side,
                quantity=quantity,
                price=round(price, 2),
                slippage=slip,
                charges=charges,
                timestamp=datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(),
                execution_source="PAPER",
            )

            order.record_fill(fill)

            if sync_to_ledger:
                turnover = quantity * fill.price
                if order.side in {OrderSide.BUY.value, OrderSide.COVER.value}:
                    cash_delta = -(turnover + charges["total_charges"])
                else:
                    cash_delta = +(turnover - charges["total_charges"])

                self._update_bot_cash_and_ledger(
                    action=order.side,
                    symbol=order.symbol,
                    shares=quantity,
                    price=fill.price,
                    cash_change=cash_delta,
                )

            self._save()
            return fill

    def cancel_order(self, order_id: str, reason: Optional[str] = "Cancelled by user") -> Order:
        """Cancels outstanding quantity on an order."""
        with self._lock:
            order = self.get_order(order_id)
            order.cancel(reason)
            self._save()
            return order

    def expire_order(self, order_id: str, reason: Optional[str] = "Session close expiration") -> Order:
        """Expires an order."""
        with self._lock:
            order = self.get_order(order_id)
            order.expire(reason)
            self._save()
            return order

    def simulate_tick(
        self,
        symbol: str,
        current_price: float,
        available_volume: Optional[int] = None,
        sync_to_ledger: bool = True,
    ) -> List[Fill]:
        """
        Simulates incoming market price ticks against pending and partially filled LIMIT orders.
        - BUY/COVER fills if current_price <= limit_price.
        - SELL/SHORT fills if current_price >= limit_price.
        Returns list of newly generated fills.
        """
        with self._lock:
            sym_clean = symbol.strip().upper()
            fills_generated = []
            for order in list(self._orders.values()):
                if order.symbol != sym_clean:
                    continue
                if order.status not in {OrderStatus.PENDING.value, OrderStatus.PARTIALLY_FILLED.value}:
                    continue
                if order.order_type != OrderType.LIMIT.value or order.limit_price is None:
                    continue

                should_fill = False
                if order.side in {OrderSide.BUY.value, OrderSide.COVER.value}:
                    if current_price <= order.limit_price:
                        should_fill = True
                elif order.side in {OrderSide.SELL.value, OrderSide.SHORT.value}:
                    if current_price >= order.limit_price:
                        should_fill = True

                if should_fill and order.remaining_quantity > 0:
                    fill_qty = (
                        min(available_volume, order.remaining_quantity)
                        if available_volume is not None
                        else order.remaining_quantity
                    )
                    if fill_qty > 0:
                        fill = self.execute_fill(
                            order_id=order.order_id,
                            quantity=fill_qty,
                            price=current_price,
                            sync_to_ledger=sync_to_ledger,
                        )
                        fills_generated.append(fill)

            return fills_generated

    def get_order(self, order_id: str) -> Order:
        """Fetches an order by ID or raises OrderNotFoundError."""
        with self._lock:
            if order_id not in self._orders:
                raise OrderNotFoundError(f"Order {order_id} not found")
            return self._orders[order_id]

    def list_orders(
        self,
        symbol: Optional[str] = None,
        side: Optional[str] = None,
        status: Optional[str] = None,
        strategy: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Order], int]:
        """Filters and paginates orders chronologically (newest first)."""
        with self._lock:
            res = list(self._orders.values())

            if symbol:
                sym_clean = symbol.strip().upper()
                res = [o for o in res if o.symbol == sym_clean]
            if side:
                side_clean = side.strip().upper()
                res = [o for o in res if o.side == side_clean]
            if status:
                status_clean = status.strip().upper()
                res = [o for o in res if o.status == status_clean]
            if strategy:
                strat_clean = strategy.strip().lower()
                res = [o for o in res if o.strategy_name and strat_clean in o.strategy_name.lower()]
            if date_from:
                res = [o for o in res if o.created_at[:10] >= date_from]
            if date_to:
                res = [o for o in res if o.created_at[:10] <= date_to]

            # Sort descending by created_at
            res.sort(key=lambda o: o.created_at, reverse=True)
            total = len(res)
            paginated = res[offset : offset + limit]
            return paginated, total

    def get_order_fills(self, order_id: str) -> List[Fill]:
        """Returns all individual fills for an order."""
        order = self.get_order(order_id)
        return list(order.fills)

    def get_execution_metrics(self) -> Dict[str, Any]:
        """Calculates aggregate execution telemetry across all paper orders."""
        with self._lock:
            orders = list(self._orders.values())
            total_orders = len(orders)
            filled_orders = sum(1 for o in orders if o.status == OrderStatus.FILLED.value)
            partially_filled = sum(1 for o in orders if o.status == OrderStatus.PARTIALLY_FILLED.value)
            pending_orders = sum(1 for o in orders if o.status == OrderStatus.PENDING.value)
            rejected_orders = sum(1 for o in orders if o.status == OrderStatus.REJECTED.value)
            cancelled_orders = sum(1 for o in orders if o.status == OrderStatus.CANCELLED.value)
            expired_orders = sum(1 for o in orders if o.status == OrderStatus.EXPIRED.value)

            total_executed_qty = sum(o.filled_quantity for o in orders)
            total_fill_value = 0.0
            total_slippage = 0.0
            total_charges = 0.0

            for o in orders:
                for f in o.fills:
                    total_fill_value += f.quantity * f.price
                    total_slippage += f.slippage
                    total_charges += f.charges.get("total_charges", 0.0)

            avg_price = (
                round(total_fill_value / total_executed_qty, 2)
                if total_executed_qty > 0
                else 0.0
            )

            return {
                "total_orders": total_orders,
                "filled_orders": filled_orders,
                "partially_filled_orders": partially_filled,
                "pending_orders": pending_orders,
                "rejected_orders": rejected_orders,
                "cancelled_orders": cancelled_orders,
                "expired_orders": expired_orders,
                "total_executed_qty": total_executed_qty,
                "average_execution_price": avg_price,
                "total_slippage": round(total_slippage, 2),
                "total_charges": round(total_charges, 2),
                "execution_source": "PAPER",
            }

    def reconcile_with_ledger(self) -> Dict[str, Any]:
        """
        Reconciles paper order fills against trade_history.csv.
        Ensures 1:1 ledger parity with zero unaccounted quantities.
        """
        with self._lock:
            fills_total_qty = 0
            fills_turnover = 0.0
            for o in self._orders.values():
                for f in o.fills:
                    fills_total_qty += f.quantity
                    fills_turnover += f.quantity * f.price

            ledger_total_qty = 0
            ledger_turnover = 0.0
            if os.path.exists(self.history_file):
                try:
                    df = pd.read_csv(self.history_file)
                    if not df.empty and "Shares" in df.columns and "Execution_Price" in df.columns:
                        ledger_total_qty = int(df["Shares"].sum())
                        ledger_turnover = float((df["Shares"] * df["Execution_Price"]).sum())
                except Exception as e:
                    print(f"[OMS RECONCILE ERROR] {e}")

            return {
                "orders_filled_quantity": fills_total_qty,
                "orders_turnover": round(fills_turnover, 2),
                "ledger_total_quantity": ledger_total_qty,
                "ledger_turnover": round(ledger_turnover, 2),
                "is_reconciled": (fills_total_qty == ledger_total_qty),
            }


# Singleton instance
_GLOBAL_ORDER_MANAGER: Optional[OrderManager] = None
_INIT_LOCK = threading.Lock()


def get_order_manager(
    orders_file_path: Optional[str] = None,
    history_file_path: Optional[str] = None,
    config_file_path: Optional[str] = None,
    enforce_market_hours: bool = False,
) -> OrderManager:
    """Returns the singleton OrderManager instance or creates one."""
    global _GLOBAL_ORDER_MANAGER
    if orders_file_path or history_file_path or config_file_path:
        # Isolated test instance
        return OrderManager(
            orders_file_path=orders_file_path,
            history_file_path=history_file_path,
            config_file_path=config_file_path,
            enforce_market_hours=enforce_market_hours,
        )

    with _INIT_LOCK:
        if _GLOBAL_ORDER_MANAGER is None:
            _GLOBAL_ORDER_MANAGER = OrderManager(enforce_market_hours=enforce_market_hours)
        return _GLOBAL_ORDER_MANAGER
