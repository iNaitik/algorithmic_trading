"""
engine/live_trader.py
=====================
Autonomous Real-Time Paper Trading Execution Engine for Indian Equities (NSE).
Binds directly to Morning Scanner picks, evaluates live quantitative strategy math,
tracks intra-candle Stop Loss / Target Profit, executes orders with realistic statutory
friction, and streams live calculation logs to the terminal.
"""

import os
import sys
import json
import time
import csv
import threading
from datetime import datetime, date
from typing import Dict, Any, Optional, Tuple
from zoneinfo import ZoneInfo

import pandas as pd
import numpy as np
import yfinance as yf

# Root data directory
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
os.makedirs(DATA_DIR, exist_ok=True)
CONFIG_FILE = os.path.join(DATA_DIR, "bot_active_config.json")
HISTORY_FILE = os.path.join(DATA_DIR, "trade_history.csv")

_ENGINE_LOCK = threading.Lock()
_ENGINE_RUNNING = False
_ENGINE_THREAD: Optional[threading.Thread] = None

# Default parameters
DEFAULT_CASH = 1_000_000.0  # ₹10 Lakhs margin
SLIPPAGE_PCT = 0.0005        # 0.05% slippage on entry and exit

# Supported Allowlist Tokens & Parameters
ALLOWED_ACTIONS = {"START", "STOP", "PAUSE", "SQUARE_OFF", "RESET", "CONFIG", "UPDATE_CONFIG", "UPDATE"}
ALLOWED_SYMBOLS = {
    "SBIN.NS", "RELIANCE.NS", "HDFCBANK.NS", "ICICIBANK.NS", "TCS.NS",
    "INFY.NS", "AXISBANK.NS", "LT.NS", "BAJFINANCE.NS", "BHARTIARTL.NS",
    "MARUTI.NS", "KOTAKBANK.NS", "NTPC.NS", "TITAN.NS", "TATAMOTORS.NS"
}
ALLOWED_STRATEGIES = {
    "NSE Intraday ORB Breakout",
    "NSE Midday VWAP Pullback",
    "Intraday VWAP + RSI Mean Reversion",
    "9/21 EMA Dynamic Momentum",
    "NSE Failed-Gap Fade"
}
ALLOWED_TIMEFRAMES = {"1m", "2m", "5m", "15m", "30m"}


# ─────────────────────────────────────────────────────────────────────────────
# 1. Statutory Costs & Slippage Calculator (NSE Intraday MIS)
# ─────────────────────────────────────────────────────────────────────────────
def calculate_buy_costs(shares: int, price: float) -> Tuple[float, float]:
    """Calculates slippage fill price and total cash outflow for a BUY order."""
    exec_price = round(price * (1.0 + SLIPPAGE_PCT), 2)
    trade_val = shares * exec_price
    brokerage = min(20.0, trade_val * 0.0003)
    exchange_fee = trade_val * 0.0000297
    sebi_fee = trade_val * 0.000001
    stamp_duty = trade_val * 0.00003
    gst = (brokerage + exchange_fee + sebi_fee) * 0.18
    total_cost = round(trade_val + brokerage + exchange_fee + sebi_fee + stamp_duty + gst, 2)
    return exec_price, total_cost


def calculate_sell_proceeds(shares: int, price: float) -> Tuple[float, float]:
    """Calculates slippage fill price and net cash inflow for a SELL order."""
    exec_price = round(price * (1.0 - SLIPPAGE_PCT), 2)
    trade_val = shares * exec_price
    brokerage = min(20.0, trade_val * 0.0003)
    exchange_fee = trade_val * 0.0000297
    sebi_fee = trade_val * 0.000001
    stt = trade_val * 0.00025  # 0.025% STT on intraday sell side
    gst = (brokerage + exchange_fee + sebi_fee) * 0.18
    total_fees = brokerage + exchange_fee + sebi_fee + stt + gst
    total_proceeds = round(trade_val - total_fees, 2)
    return exec_price, total_proceeds


def calculate_fill_charges(shares: int, price: float, action: str) -> float:
    """Calculates all statutory fees for an execution fill (brokerage, STT, ex-fee, SEBI, GST, stamp)."""
    trade_val = shares * price
    brokerage = min(20.0, trade_val * 0.0003)
    exchange_fee = trade_val * 0.0000297
    sebi_fee = trade_val * 0.000001
    act_upper = (action or "").upper()
    is_buy = "BUY" in act_upper or "COVER" in act_upper
    stamp_duty = trade_val * 0.00003 if is_buy else 0.0
    stt = 0.0 if is_buy else trade_val * 0.00025
    gst = (brokerage + exchange_fee + sebi_fee) * 0.18
    return round(brokerage + exchange_fee + sebi_fee + stamp_duty + stt + gst, 2)


# ─────────────────────────────────────────────────────────────────────────────
# 2. NSE Trading Calendar, Daily Rollover & Risk Accounting
# ─────────────────────────────────────────────────────────────────────────────
NSE_TRADING_HOLIDAYS = {
    # 2024 Official Holidays
    "2024-01-22",  # Special Holiday (Ayodhya Ram Mandir)
    "2024-01-26",  # Republic Day
    "2024-03-08",  # Mahashivratri
    "2024-03-25",  # Holi
    "2024-03-29",  # Good Friday
    "2024-04-11",  # Id-Ul-Fitr
    "2024-04-17",  # Shri Ram Navami
    "2024-05-01",  # Maharashtra Day
    "2024-05-20",  # General Parliamentary Elections (Mumbai)
    "2024-06-17",  # Bakri Id / Eid ul-Adha
    "2024-07-17",  # Muharram
    "2024-08-15",  # Independence Day
    "2024-10-02",  # Mahatma Gandhi Jayanti
    "2024-11-01",  # Diwali Laxmi Pujan (regular trading closed)
    "2024-11-15",  # Guru Nanak Jayanti
    "2024-11-20",  # Maharashtra Assembly Elections
    "2024-12-25",  # Christmas
    # 2025 Official Holidays
    "2025-02-26",  # Mahashivratri
    "2025-03-14",  # Holi
    "2025-03-31",  # Id-Ul-Fitr
    "2025-04-10",  # Mahavir Jayanti
    "2025-04-14",  # Dr. Baba Saheb Ambedkar Jayanti
    "2025-04-18",  # Good Friday
    "2025-05-01",  # Maharashtra Day
    "2025-08-15",  # Independence Day
    "2025-08-27",  # Ganesh Chaturthi
    "2025-10-02",  # Mahatma Gandhi Jayanti
    "2025-10-21",  # Diwali Balipratipada
    "2025-10-22",  # Bhaubeej
    "2025-11-05",  # Guru Nanak Jayanti
    "2025-12-25",  # Christmas
    # 2026 Official Holidays
    "2026-01-26",  # Republic Day
    "2026-02-16",  # Mahashivratri
    "2026-03-04",  # Holi
    "2026-03-20",  # Id-Ul-Fitr
    "2026-04-03",  # Good Friday
    "2026-04-14",  # Dr. Baba Saheb Ambedkar Jayanti
    "2026-05-01",  # Maharashtra Day
    "2026-05-27",  # Bakri Id
    "2026-06-26",  # Muharram
    "2026-10-02",  # Mahatma Gandhi Jayanti
    "2026-10-20",  # Dussehra
    "2026-11-09",  # Diwali Balipratipada
    "2026-11-24",  # Guru Nanak Jayanti
    "2026-12-25",  # Christmas
}


def is_nse_trading_day(dt_or_date: Any) -> bool:
    """Returns True if the given date is a valid NSE trading day (Mon-Fri and not an exchange holiday)."""
    if isinstance(dt_or_date, datetime):
        d = dt_or_date.date()
    elif isinstance(dt_or_date, date):
        d = dt_or_date
    elif isinstance(dt_or_date, str):
        try:
            d = datetime.strptime(dt_or_date[:10], "%Y-%m-%d").date()
        except Exception:
            return False
    else:
        return False

    if d.weekday() >= 5:  # Saturday or Sunday
        return False
    date_str = d.strftime("%Y-%m-%d")
    return date_str not in NSE_TRADING_HOLIDAYS


def is_nse_market_open(now_ist: Optional[datetime] = None) -> bool:
    """Returns True if within Indian equity market regular hours (Mon-Fri non-holiday, 09:15 - 15:30 IST)."""
    if now_ist is None:
        now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
    if not is_nse_trading_day(now_ist):
        return False
    return (
        (now_ist.hour == 9 and now_ist.minute >= 15) or
        (9 < now_ist.hour < 15) or
        (now_ist.hour == 15 and now_ist.minute <= 30)
    )


def compute_daily_accounting(history_file_path: Optional[str] = None, today_str: Optional[str] = None) -> Dict[str, Any]:
    """
    Computes today's net realized P&L, total statutory charges, and completed trade count from trade history.
    Uses multi-leg FIFO matching to calculate exact realized gains/losses on completed legs today.
    """
    hf = history_file_path or HISTORY_FILE
    if today_str is None:
        today_str = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d")

    if not os.path.exists(hf):
        return {
            "realized_net_pnl": 0.0,
            "today_charges": 0.0,
            "trades_count": 0,
            "open_long_shares": 0,
            "open_short_shares": 0
        }

    try:
        with open(hf, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
    except Exception as e:
        print(f"[ACCOUNTING READ ERROR] {e}")
        return {
            "realized_net_pnl": 0.0,
            "today_charges": 0.0,
            "trades_count": 0,
            "open_long_shares": 0,
            "open_short_shares": 0,
            "symbols_inventory": {}
        }

    long_queues: Dict[str, List[Dict[str, Any]]] = {}
    short_queues: Dict[str, List[Dict[str, Any]]] = {}
    daily_realized = 0.0
    daily_charges = 0.0
    completed_trades_today = 0

    for r in rows:
        sym = str(r.get("Symbol", "SBIN.NS")).strip().upper()
        if sym not in long_queues:
            long_queues[sym] = []
        if sym not in short_queues:
            short_queues[sym] = []

        act = str(r.get("Action", "")).strip().upper()
        shs = int(r.get("Shares", 0))
        px = float(r.get("Execution_Price", 0.0))
        raw_cash_str = str(r.get("Cash_Change", "0")).replace("+", "").replace(",", "")
        try:
            amt = float(raw_cash_str)
        except Exception:
            amt = 0.0
        ts = str(r.get("Timestamp", "")).strip()

        is_today = ts.startswith(today_str)
        if is_today:
            fill_fee = calculate_fill_charges(shs, px, act)
            daily_charges += fill_fee

            if act == "BUY":
                long_queues[sym].append({"shares": shs, "amt": amt, "ts": ts, "price": px, "fee": fill_fee})
            elif act == "SHORT":
                short_queues[sym].append({"shares": shs, "amt": amt, "ts": ts, "price": px, "fee": fill_fee})
            elif act in ("SELL", "SQUARE_OFF", "MANUAL_SQUARE_OFF") and long_queues[sym]:
                rem = shs
                completed_trades_today += 1
                while rem > 0 and long_queues[sym]:
                    entry = long_queues[sym][0]
                    matched = min(rem, entry["shares"])
                    fraction = matched / entry["shares"]
                    entry_cost = entry["amt"] * fraction
                    exit_proceeds = amt * (matched / shs)
                    trade_net = exit_proceeds + entry_cost
                    daily_realized += trade_net
                    entry["shares"] -= matched
                    entry["amt"] -= entry_cost
                    rem -= matched
                    if entry["shares"] <= 0:
                        long_queues[sym].pop(0)
            elif act in ("COVER", "SQUARE_OFF", "MANUAL_SQUARE_OFF") and short_queues[sym]:
                rem = shs
                completed_trades_today += 1
                while rem > 0 and short_queues[sym]:
                    entry = short_queues[sym][0]
                    matched = min(rem, entry["shares"])
                    fraction = matched / entry["shares"]
                    entry_margin = entry["amt"] * fraction
                    exit_cost = amt * (matched / shs)
                    trade_net = exit_cost + entry_margin
                    daily_realized += trade_net
                    entry["shares"] -= matched
                    entry["amt"] -= entry_margin
                    rem -= matched
                    if entry["shares"] <= 0:
                        short_queues[sym].pop(0)

    # Reconstruct inventory state per symbol
    symbols_inventory: Dict[str, Dict[str, Any]] = {}
    all_syms = set(list(long_queues.keys()) + list(short_queues.keys()))
    total_open_long = 0
    total_open_short = 0

    for s in all_syms:
        l_shares = sum(e["shares"] for e in long_queues.get(s, []))
        s_shares = sum(e["shares"] for e in short_queues.get(s, []))
        total_open_long += l_shares
        total_open_short += s_shares

        if l_shares > 0:
            total_cost = sum(abs(e["amt"]) for e in long_queues[s])
            avg_px = sum(e["shares"] * e["price"] for e in long_queues[s]) / l_shares
            symbols_inventory[s] = {
                "side": "LONG",
                "shares": l_shares,
                "long_shares": l_shares,
                "short_shares": 0,
                "entry_price": round(avg_px, 2),
                "entry_total_cost": round(total_cost, 2)
            }
        elif s_shares > 0:
            total_margin = sum(abs(e["amt"]) for e in short_queues[s])
            avg_px = sum(e["shares"] * e["price"] for e in short_queues[s]) / s_shares
            symbols_inventory[s] = {
                "side": "SHORT",
                "shares": s_shares,
                "long_shares": 0,
                "short_shares": s_shares,
                "entry_price": round(avg_px, 2),
                "entry_total_cost": round(total_margin, 2)
            }
        else:
            symbols_inventory[s] = {
                "side": None,
                "shares": 0,
                "long_shares": 0,
                "short_shares": 0,
                "entry_price": 0.0,
                "entry_total_cost": 0.0
            }

    return {
        "realized_net_pnl": round(daily_realized, 2),
        "today_charges": round(daily_charges, 2),
        "trades_count": completed_trades_today,
        "open_long_shares": total_open_long,
        "open_short_shares": total_open_short,
        "symbols_inventory": symbols_inventory
    }


def get_today_completed_trades(symbol: str, history_file_path: Optional[str] = None) -> int:
    """Counts completed round-trip trades (SELL, COVER, or MANUAL_SQUARE_OFF) for symbol today."""
    hf = history_file_path or HISTORY_FILE
    if not os.path.exists(hf):
        return 0
    today_str = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d")
    count = 0
    try:
        with open(hf, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                ts = str(row.get("Timestamp", "")).strip()
                sym = str(row.get("Symbol", "")).strip()
                act = str(row.get("Action", "")).strip().upper()
                if ts.startswith(today_str) and sym == symbol and act in ("SELL", "COVER", "MANUAL_SQUARE_OFF", "SQUAREOFF", "SQUARE_OFF"):
                    count += 1
    except Exception as e:
        print(f"[HISTORY READ ERROR] {e}")
    return count


def check_daily_rollover(state: Dict[str, Any], now_ist: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Checks if a new NSE trading session has begun.
    Resets the daily baseline equity and clears previous session's circuit breaker lock.
    Only resets on a valid NSE trading day (Mon-Fri), never over a weekend.
    """
    if now_ist is None:
        now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
    today_str = now_ist.strftime("%Y-%m-%d")
    is_trading_day = is_nse_trading_day(now_ist)
    baseline_date = state.get("daily_baseline_date")

    if baseline_date != today_str and is_trading_day:
        lock_date = state.get("daily_drawdown_lock_date")
        # Clear lock only if it originated from a prior calendar date
        if state.get("daily_drawdown_locked") and lock_date and lock_date < today_str:
            try:
                from server import add_bot_log
                add_bot_log("SYSTEM", f"New trading session detected ({today_str}). Daily drawdown circuit breaker lock cleared.")
            except Exception:
                pass
            state["daily_drawdown_locked"] = False
            state["daily_drawdown_lock_reason"] = None
            state["daily_drawdown_lock_time"] = None
            state["daily_drawdown_lock_date"] = None
            if "LOCKED" in state.get("status", ""):
                state["status"] = "ACTIVE (MONITORING)" if is_nse_market_open(now_ist) else "ARMED (STANDBY • MARKET CLOSED)"

        # Establish baseline starting equity for the session from configured capital or cash
        configured_cap = float(state.get("capital") or 0.0)
        if configured_cap > 0 and not state.get("in_position"):
            state["cash"] = configured_cap
            base_eq = configured_cap
        else:
            base_eq = float(state.get("cash", DEFAULT_CASH))
            if state.get("in_position") and state.get("shares", 0) > 0:
                base_eq += float(state.get("shares", 0)) * float(state.get("entry_price", 0.0))

        state["daily_baseline_date"] = today_str
        state["daily_starting_equity"] = round(base_eq, 2)
        state["daily_realized_pnl"] = 0.0
        state["daily_charges"] = 0.0
        state["daily_completed_trades"] = 0
        state["symbol_locked_for_day"] = False

    return state


def get_risk_metrics(state: Dict[str, Any], current_ltp: Optional[float] = None, history_file_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Computes real-time risk monitor metrics for UI and circuit breaker evaluation.
    """
    hf = history_file_path or HISTORY_FILE
    now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
    today_str = now_ist.strftime("%Y-%m-%d")

    # 1. Realized accounting today
    acct = compute_daily_accounting(hf, today_str)
    daily_realized_pnl = acct["realized_net_pnl"]
    daily_charges = acct["today_charges"]

    # 2. Starting daily equity baseline
    daily_starting_equity = float(state.get("daily_starting_equity") or state.get("cash") or DEFAULT_CASH)

    # 3. Unrealized P&L
    in_pos = bool(state.get("in_position", False) and state.get("shares", 0) > 0)
    shs = int(state.get("shares", 0)) if in_pos else 0
    side = str(state.get("position_side", "LONG"))
    ep = float(state.get("entry_price", 0.0))
    entry_total_cost = float(state.get("entry_total_cost", 0.0))

    ltp = current_ltp or float(state.get("last_ltp") or ep or 0.0)
    unrealized_pnl = 0.0
    current_exposure = 0.0

    if in_pos and shs > 0 and ltp > 0:
        current_exposure = round(shs * ltp, 2)
        try:
            if side == "LONG":
                _, proceeds = calculate_sell_proceeds(shs, ltp)
                unrealized_pnl = round(proceeds - entry_total_cost, 2)
            else:
                _, total_cost = calculate_buy_costs(shs, ltp)
                unrealized_pnl = round(entry_total_cost - total_cost, 2)
        except Exception:
            unrealized_pnl = round((ltp - ep) * shs if side == "LONG" else (ep - ltp) * shs, 2)

    # 4. Daily net P&L
    daily_net_pnl = round(daily_realized_pnl + unrealized_pnl, 2)

    # 5. Drawdown limits
    max_dd_pct = float(state.get("max_drawdown_pct", 2.0))
    max_daily_loss = round(daily_starting_equity * (max_dd_pct / 100.0), 2)
    remaining_risk_allowance = max(0.0, round(max_daily_loss + daily_net_pnl, 2))

    # 6. Current equity
    current_equity = round(daily_starting_equity + daily_net_pnl, 2)
    exposure_pct = round((current_exposure / current_equity) * 100, 2) if current_equity > 0 else 0.0

    return {
        "starting_daily_equity": daily_starting_equity,
        "current_equity": current_equity,
        "daily_realized_pnl": daily_realized_pnl,
        "unrealized_pnl": unrealized_pnl,
        "daily_net_pnl": daily_net_pnl,
        "daily_charges": daily_charges,
        "max_drawdown_pct": max_dd_pct,
        "max_daily_loss": max_daily_loss,
        "remaining_risk_allowance": remaining_risk_allowance,
        "current_exposure": current_exposure,
        "exposure_pct": exposure_pct,
        "position_status": "IN POSITION" if in_pos else "FLAT",
        "circuit_breaker_triggered": bool(state.get("daily_drawdown_locked", False)),
        "circuit_breaker_reason": state.get("daily_drawdown_lock_reason"),
        "lock_date": state.get("daily_drawdown_lock_date"),
        "lock_time": state.get("daily_drawdown_lock_time")
    }


def check_and_enforce_circuit_breaker(
    state: Dict[str, Any],
    current_ltp: float,
    history_file_path: Optional[str] = None,
    config_file_path: Optional[str] = None
) -> Tuple[bool, Dict[str, Any]]:
    """
    Evaluates current net daily P&L against max drawdown limit.
    If breached:
      1. Prevents new entries.
      2. Immediately squares off open position (with slippage & fee modeling).
      3. Verifies liquidation before confirming position is flat.
      4. Transitions into persistent daily lock state.
      5. Records trigger, timestamp, threshold, and reason in execution logs.
    """
    hf = history_file_path or HISTORY_FILE
    cf = config_file_path or CONFIG_FILE
    now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
    today_str = now_ist.strftime("%Y-%m-%d")

    # If already locked for today, verify whether an open position still requires liquidation retry
    if state.get("daily_drawdown_locked") and state.get("daily_drawdown_lock_date") == today_str:
        if not state.get("in_position") or state.get("shares", 0) <= 0:
            return True, state
        # If locked but in_position is still active, fall through to retry emergency liquidation

    risk = get_risk_metrics(state, current_ltp, hf)
    daily_net_pnl = risk["daily_net_pnl"]
    max_daily_loss = risk["max_daily_loss"]
    max_dd_pct = risk["max_drawdown_pct"]

    # Trigger condition: daily loss reaches or exceeds max_daily_loss
    if daily_net_pnl <= -max_daily_loss:
        symbol = state.get("symbol", "SBIN.NS")
        in_pos = bool(state.get("in_position", False) and state.get("shares", 0) > 0)
        shs = int(state.get("shares", 0))
        side = state.get("position_side", "LONG")
        ep = float(state.get("entry_price", current_ltp))

        lock_reason = (
            f"Daily drawdown limit of ₹{max_daily_loss:,.2f} ({max_dd_pct:.1f}%) breached. "
            f"Daily Net Loss: ₹{abs(daily_net_pnl):,.2f} (Realized: ₹{risk['daily_realized_pnl']:+,.2f}, MTM: ₹{risk['unrealized_pnl']:+,.2f}). "
            f"Automated risk circuit breaker engaged. Trading locked for session {today_str}."
        )

        # 1. Attempt square-off if in position
        liquidation_confirmed = False
        if in_pos and shs > 0:
            try:
                if side == "LONG":
                    exec_price, proceeds = calculate_sell_proceeds(shs, current_ltp)
                    realized_pnl = round(proceeds - state.get("entry_total_cost", shs * ep), 2)
                    state["cash"] = round(state["cash"] + proceeds, 2)
                    record_live_trade("MANUAL_SQUARE_OFF", symbol, shs, exec_price, proceeds, hf)
                else:
                    exec_price, total_cost = calculate_buy_costs(shs, current_ltp)
                    realized_pnl = round(state.get("entry_total_cost", shs * ep) - total_cost, 2)
                    state["cash"] = round(state["cash"] + (state.get("entry_total_cost", shs * ep) + realized_pnl), 2)
                    record_live_trade("MANUAL_SQUARE_OFF", symbol, shs, exec_price, total_cost, hf)

                # Reset position fields only after trade recorded successfully
                state["in_position"] = False
                state["shares"] = 0
                state["position_side"] = None
                state["entry_price"] = 0.0
                state["entry_total_cost"] = 0.0
                state["stop_loss"] = None
                state["target_price"] = None
                liquidation_confirmed = True
                try:
                    from server import add_bot_log
                    add_bot_log("ORDER", f"CIRCUIT BREAKER LIQUIDATION: {shs} shares of {symbol} squared off @ ₹{exec_price:.2f}. Realized P&L: ₹{realized_pnl:+,.2f}", symbol)
                except Exception:
                    pass
            except Exception as e:
                liquidation_confirmed = False
                try:
                    from server import add_bot_log
                    add_bot_log("CRITICAL", f"CIRCUIT BREAKER LIQUIDATION FAILED: {e}. Position remains active.", symbol)
                except Exception:
                    pass
        else:
            liquidation_confirmed = True

        # 2. Lock state
        state["daily_drawdown_locked"] = True
        state["daily_drawdown_lock_reason"] = lock_reason
        state["daily_drawdown_lock_time"] = now_ist.strftime("%H:%M:%S")
        state["daily_drawdown_lock_date"] = today_str
        state["status"] = "LOCKED (DAILY DRAWDOWN HIT)" if liquidation_confirmed else "CIRCUIT_BREAKER_LOCKED (EXIT_FAILED)"

        try:
            from server import add_bot_log
            add_bot_log("RISK", f"🚨 {lock_reason}", symbol)
        except Exception:
            pass

        save_live_state(state, cf)

        # Notify Telegram if configured
        try:
            from notifications.telegram_bot import send_telegram_alert
            send_telegram_alert(
                f"🚨 <b>CIRCUIT BREAKER TRIGGERED</b>\n\n"
                f"• <b>Instrument:</b> <code>{symbol}</code>\n"
                f"• <b>Reason:</b> {lock_reason}\n"
                f"• <b>Action:</b> Position squared off & trading locked until next session."
            )
        except Exception:
            pass

        return True, state

    return False, state


def validate_control_request(
    action: str,
    symbol: Optional[str] = None,
    strategy_name: Optional[str] = None,
    capital: Optional[float] = None,
    timeframe: Optional[str] = None,
    max_trades_per_symbol: Optional[int] = None,
    stop_loss_pct: Optional[float] = None,
    take_profit_multiple: Optional[float] = None,
    max_drawdown_pct: Optional[float] = None
):
    """Strictly validates all incoming control and configuration parameters. Raises ValueError on violation."""
    act = (action or "").strip().upper()
    if act not in ALLOWED_ACTIONS:
        raise ValueError(f"Invalid action '{action}'. Supported actions: {', '.join(sorted(ALLOWED_ACTIONS))}")

    if symbol is not None:
        sym = symbol.strip().upper()
        if sym not in ALLOWED_SYMBOLS:
            raise ValueError(f"Unsupported symbol '{symbol}'. Allowed symbols: {', '.join(sorted(ALLOWED_SYMBOLS))}")

    if strategy_name is not None:
        strat = strategy_name.strip()
        if strat not in ALLOWED_STRATEGIES:
            raise ValueError(f"Unsupported strategy '{strategy_name}'. Allowed strategies: {', '.join(sorted(ALLOWED_STRATEGIES))}")

    if timeframe is not None:
        tf = timeframe.strip().lower()
        if tf not in ALLOWED_TIMEFRAMES:
            raise ValueError(f"Unsupported timeframe '{timeframe}'. Allowed timeframes: {', '.join(sorted(ALLOWED_TIMEFRAMES))}")

    if capital is not None:
        try:
            cap_val = float(capital)
            if cap_val < 10_000.0 or cap_val > 100_000_000.0:
                raise ValueError("Capital allocation must be between ₹10,000 and ₹10,00,00,000 (10 Crore).")
        except (ValueError, TypeError) as e:
            if "Capital allocation must be" in str(e):
                raise
            raise ValueError("Capital allocation must be a valid positive number.")

    if max_trades_per_symbol is not None:
        try:
            quota = int(max_trades_per_symbol)
            if quota < 0 or quota > 50:
                raise ValueError("Max trades per symbol must be an integer between 0 (unlimited) and 50.")
        except (ValueError, TypeError) as e:
            if "Max trades per symbol" in str(e):
                raise
            raise ValueError("Max trades per symbol must be an integer.")

    if stop_loss_pct is not None:
        try:
            sl = float(stop_loss_pct)
            if sl < 0.1 or sl > 10.0:
                raise ValueError("Stop-loss percentage must be between 0.1% and 10.0%.")
        except (ValueError, TypeError) as e:
            if "Stop-loss percentage" in str(e):
                raise
            raise ValueError("Stop-loss percentage must be a valid number.")

    if take_profit_multiple is not None:
        try:
            tp = float(take_profit_multiple)
            if tp < 0.5 or tp > 10.0:
                raise ValueError("Take-profit multiple must be between 0.5R and 10.0R.")
        except (ValueError, TypeError) as e:
            if "Take-profit multiple" in str(e):
                raise
            raise ValueError("Take-profit multiple must be a valid number.")

    if max_drawdown_pct is not None:
        try:
            dd = float(max_drawdown_pct)
            if dd < 0.5 or dd > 20.0:
                raise ValueError("Max daily drawdown must be between 0.5% and 20.0%.")
        except (ValueError, TypeError) as e:
            if "Max daily drawdown" in str(e):
                raise
            raise ValueError("Max daily drawdown must be a valid number.")


def get_live_state(config_file_path: Optional[str] = None, history_file_path: Optional[str] = None) -> Dict[str, Any]:
    """Loads the active live bot state from config and validates daily rollover."""
    cf = config_file_path or CONFIG_FILE
    hf = history_file_path or HISTORY_FILE
    now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
    today_str = now_ist.strftime("%Y-%m-%d")
    default_status = "ACTIVE (MONITORING)" if is_nse_market_open(now_ist) else "ARMED (STANDBY • MARKET CLOSED)"

    state = {
        "symbol": "SBIN.NS",
        "strategy": "NSE Intraday ORB Breakout",
        "timeframe": "2m",
        "status": default_status,
        "cash": DEFAULT_CASH,
        "capital": DEFAULT_CASH,
        "in_position": False,
        "shares": 0,
        "position_side": None,
        "entry_price": 0.0,
        "entry_total_cost": 0.0,
        "stop_loss": None,
        "target_price": None,
        "last_updated": datetime.now().isoformat(),
        "last_eval_time": None,
        "last_ltp": None,
        "vwap": None,
        "rsi": None,
        "max_trades_per_symbol": 1,
        "stop_loss_pct": 0.8,
        "take_profit_multiple": 2.0,
        "max_drawdown_pct": 2.0,
        "daily_baseline_date": today_str,
        "daily_starting_equity": DEFAULT_CASH,
        "daily_realized_pnl": 0.0,
        "daily_charges": 0.0,
        "daily_completed_trades": 0,
        "symbol_locked_for_day": False,
        "daily_drawdown_locked": False,
        "daily_drawdown_lock_reason": None,
        "daily_drawdown_lock_time": None,
        "daily_drawdown_lock_date": None,
        "daily_drawdown_threshold_amount": 20000.0
    }

    if os.path.exists(cf):
        try:
            with open(cf, "r") as f:
                saved = json.load(f)
                state.update(saved)
                if "active_symbol" in saved and saved["active_symbol"]:
                    state["symbol"] = saved["active_symbol"]
        except Exception:
            pass

    # Check daily session rollover (clears lock on new NSE session date, retains baseline)
    state = check_daily_rollover(state, now_ist)

    # Synchronize daily completed trade quota & lock status for current symbol
    sym = state.get("symbol", "SBIN.NS")
    completed = get_today_completed_trades(sym, hf)
    max_t = state.get("max_trades_per_symbol", 1)
    state["daily_completed_trades"] = completed
    state["symbol_locked_for_day"] = bool(max_t > 0 and completed >= max_t)
    state.setdefault("max_trades_per_symbol", 1)

    # Cross-reconcile open position state with trade history ledger
    if os.path.exists(hf):
        acct = compute_daily_accounting(hf, today_str)
        inv = acct.get("symbols_inventory", {}).get(sym, {})
        inv_shares = inv.get("shares", 0)
        inv_side = inv.get("side")

        if inv_shares > 0 and inv_side:
            # Reconstruct active position accurately from ledger (supports LONG, SHORT, and partial square-offs)
            state["in_position"] = True
            state["shares"] = inv_shares
            state["position_side"] = inv_side
            state["entry_price"] = inv.get("entry_price", state.get("entry_price", 0.0))
            state["entry_total_cost"] = inv.get("entry_total_cost", state.get("entry_total_cost", 0.0))
        else:
            # Ledger shows flat inventory for this symbol: ensure state is reconciled as flat
            state["in_position"] = False
            state["shares"] = 0
            state["position_side"] = None
            state["entry_price"] = 0.0
            state["entry_total_cost"] = 0.0
            if "EXIT_FAILED" in state.get("status", ""):
                state["status"] = "LOCKED (DAILY DRAWDOWN HIT)"

    # If circuit breaker is active, force locked status
    if state.get("daily_drawdown_locked"):
        state["status"] = "LOCKED (DAILY DRAWDOWN HIT)"
    # If market is closed and state was marked ACTIVE (and not in an active position), normalize to ARMED STANDBY
    elif not is_nse_market_open(now_ist) and not state.get("in_position"):
        if state.get("status", "").startswith("ACTIVE"):
            state["status"] = "ARMED (STANDBY • MARKET CLOSED)"

    return state


def save_live_state(state: Dict[str, Any], config_file_path: Optional[str] = None):
    """Persists the updated live engine state."""
    cf = config_file_path or CONFIG_FILE
    state["last_updated"] = datetime.now().isoformat()
    state["active_symbol"] = state.get("symbol", "SBIN.NS")
    try:
        with open(cf, "w") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        print(f"[ENGINE STATE ERROR] Failed to save {cf}: {e}")

    # Synchronize to symbol-specific file for fallback
    sym = state.get("symbol", "SBIN.NS")
    clean_sym = sym.replace(".", "_").replace("^", "")
    sf = os.path.join(DATA_DIR, f"bot_india_state_{clean_sym}.json")
    try:
        with open(sf, "w") as f:
            json.dump(state, f, indent=2)
    except Exception:
        pass


def record_live_trade(action: str, symbol: str, shares: int, price: float, cash_change: float, history_file_path: Optional[str] = None):
    """Appends an executed trade to trade_history.csv."""
    hf = history_file_path or HISTORY_FILE
    parent_dir = os.path.dirname(hf)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)
    file_exists = os.path.exists(hf)
    now_str = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d %H:%M:%S")
    try:
        with open(hf, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["Timestamp", "Action", "Symbol", "Shares", "Execution_Price", "Cash_Change"])
            writer.writerow([now_str, action, symbol, shares, round(price, 2), f"{cash_change:+.2f}"])
    except Exception as e:
        print(f"[ENGINE CSV ERROR] Failed to log trade: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Market Data Ingestion Pipeline
# ─────────────────────────────────────────────────────────────────────────────
def fetch_intraday_data(symbol: str, interval: str = "2m") -> pd.DataFrame:
    """Fetches rolling 2-day candle data with standardized columns."""
    valid_intervals = {"1m", "2m", "5m", "15m", "30m"}
    if interval not in valid_intervals:
        interval = "2m"

    period = "2d" if interval in {"1m", "2m"} else "5d"

    try:
        df = yf.download(tickers=symbol, period=period, interval=interval, progress=False)
        if not df.empty:
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.droplevel(1)
            df.columns = [c.lower() for c in df.columns]
            df = df.dropna(subset=['close', 'volume'])
            return df
    except Exception:
        pass

    try:
        t = yf.Ticker(symbol)
        df = t.history(period=period, interval=interval)
        if not df.empty:
            df.columns = [c.lower() for c in df.columns]
            df = df.dropna(subset=['close', 'volume'])
            return df
    except Exception:
        pass

    return pd.DataFrame()


def fetch_live_price(symbol: str) -> Optional[float]:
    """Fetches real-time Last Traded Price (LTP)."""
    try:
        t = yf.Ticker(symbol)
        p = t.fast_info.get("last_price")
        if p is not None and not np.isnan(p) and p > 0:
            return float(p)
    except Exception:
        pass

    try:
        df = yf.download(tickers=symbol, period="1d", interval="1m", progress=False)
        if not df.empty:
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.droplevel(1)
            return float(df['Close'].iloc[-1])
    except Exception:
        pass

    return None


def calculate_real_indicators(df: pd.DataFrame) -> Tuple[float, float, float]:
    """Computes real VWAP, RSI(14), and 9/21 EMA spread."""
    if df.empty or len(df) < 5:
        return 0.0, 50.0, 0.0

    # 1. Intraday VWAP
    cum_vol = df['volume'].cumsum()
    cum_tp = ((df['high'] + df['low'] + df['close']) / 3.0 * df['volume']).cumsum()
    vwap_series = cum_tp / cum_vol.replace(0, np.nan)
    vwap_val = round(float(vwap_series.iloc[-1]), 2) if not vwap_series.empty else float(df['close'].iloc[-1])

    # 2. RSI(14)
    delta = df['close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=14, min_periods=5).mean()
    avg_loss = loss.rolling(window=14, min_periods=5).mean().replace(0, 0.00001)
    rs = avg_gain / avg_loss
    rsi_series = 100 - (100 / (1 + rs))
    rsi_val = round(float(rsi_series.iloc[-1]), 1) if not np.isnan(rsi_series.iloc[-1]) else 50.0

    # 3. EMA spread (9 EMA - 21 EMA)
    ema9 = df['close'].ewm(span=9, adjust=False).mean()
    ema21 = df['close'].ewm(span=21, adjust=False).mean()
    ema_spread = round(float(ema9.iloc[-1] - ema21.iloc[-1]), 2)

    return vwap_val, rsi_val, ema_spread


# ─────────────────────────────────────────────────────────────────────────────
# 4. Strategy Ingestion & Signal Evaluator
# ─────────────────────────────────────────────────────────────────────────────
def evaluate_strategy_signal(
    df: pd.DataFrame,
    strategy_name: str,
    stop_loss_pct: float = 0.8,
    take_profit_multiple: float = 2.0
) -> Tuple[int, float, float, str]:
    """
    Evaluates real quantitative strategy on historical candles.
    Returns: (signal: -1, 0, 1, stop_loss: float, target_price: float, reason: str)
    """
    if df.empty or len(df) < 10:
        return 0, 0.0, 0.0, "Insufficient candle bars for strategy calculation"

    sl_fraction = (stop_loss_pct or 0.8) / 100.0
    tp_fraction = sl_fraction * (take_profit_multiple or 2.0)

    try:
        from strategies import get_strategy
        strat_fn = get_strategy(strategy_name)
    except Exception:
        strat_fn = None

    curr_close = float(df['close'].iloc[-1])

    if strat_fn is not None:
        try:
            # 1. Provide standardized DataFrame with lowercase columns ('open', 'high', 'low', 'close', 'volume')
            clean_df = df.copy()
            clean_df.columns = [c.lower() for c in clean_df.columns]
            for col in ['open', 'high', 'low', 'close', 'volume']:
                if col not in clean_df.columns:
                    for alt in [col.capitalize(), col.upper()]:
                        if alt in clean_df.columns:
                            clean_df[col] = clean_df[alt]

            # 2. Ensure IST timezone on DatetimeIndex
            if clean_df.index.tz is None:
                clean_df.index = clean_df.index.tz_localize("Asia/Kolkata")
            elif str(clean_df.index.tz) != "Asia/Kolkata":
                clean_df.index = clean_df.index.tz_convert("Asia/Kolkata")

            res_df = strat_fn(clean_df)

            # 3. Extract signal (check execution_signal, signal, Signal)
            last_sig = 0
            for sig_col in ['execution_signal', 'signal', 'Signal', 'Execution_Signal']:
                if sig_col in res_df.columns and not res_df[sig_col].empty:
                    val = int(res_df[sig_col].iloc[-1])
                    if val != 0:
                        last_sig = val
                        break

            # 4. Extract Stop Loss with directional sanity check
            sl = None
            for sl_col in ['stop_loss', 'StopLoss', 'stop', 'Stop']:
                if sl_col in res_df.columns and not res_df[sl_col].empty:
                    val = float(res_df[sl_col].iloc[-1])
                    if val > 0 and not np.isnan(val):
                        # Verify direction: for LONG, stop must be below price; for SHORT, stop must be above price
                        if (last_sig == 1 and val < curr_close) or (last_sig == -1 and val > curr_close):
                            sl = round(val, 2)
                            break
            if sl is None:
                sl = round(curr_close * (1.0 - sl_fraction) if last_sig == 1 else curr_close * (1.0 + sl_fraction), 2)

            # 5. Extract Target Price with directional sanity check
            tp = None
            for tp_col in ['target_price', 'TargetPrice', 'target', 'Target', 'take_profit']:
                if tp_col in res_df.columns and not res_df[tp_col].empty:
                    val = float(res_df[tp_col].iloc[-1])
                    if val > 0 and not np.isnan(val):
                        # Verify direction: for LONG, target must be above price; for SHORT, target must be below price
                        if (last_sig == 1 and val > curr_close) or (last_sig == -1 and val < curr_close):
                            tp = round(val, 2)
                            break
            if tp is None:
                tp = round(curr_close * (1.0 + tp_fraction) if last_sig == 1 else curr_close * (1.0 - tp_fraction), 2)

            return last_sig, sl, tp, f"Strategy '{strategy_name}' Signal {last_sig} (SL: ₹{sl:.2f}, TP: ₹{tp:.2f})"
        except Exception as e:
            try:
                from server import add_bot_log
                add_bot_log("WARNING", f"Strategy '{strategy_name}' evaluation error: {e}. Falling back to VWAP rule.", "")
            except Exception:
                pass

    # Built-in robust VWAP Pullback Rule if module not found:
    # BUY when close > VWAP and 9 EMA > 21 EMA and RSI > 50
    vwap_val, rsi_val, ema_spread = calculate_real_indicators(df)
    if curr_close > vwap_val and ema_spread > 0 and 52 <= rsi_val <= 68:
        sl = round(curr_close * (1.0 - sl_fraction), 2)
        tp = round(curr_close * (1.0 + tp_fraction), 2)
        return 1, sl, tp, f"VWAP Pullback LONG: Price ₹{curr_close:.2f} > VWAP ₹{vwap_val:.2f} (RSI {rsi_val})"
    elif curr_close < vwap_val and ema_spread < 0 and 32 <= rsi_val <= 48:
        sl = round(curr_close * (1.0 + sl_fraction), 2)
        tp = round(curr_close * (1.0 - tp_fraction), 2)
        return -1, sl, tp, f"VWAP Breakdown SHORT: Price ₹{curr_close:.2f} < VWAP ₹{vwap_val:.2f} (RSI {rsi_val})"

    return 0, 0.0, 0.0, f"No trigger. Price ₹{curr_close:.2f} | VWAP ₹{vwap_val:.2f} | RSI {rsi_val}"


# ─────────────────────────────────────────────────────────────────────────────
# 5. Core Live Execution Worker Thread
# ─────────────────────────────────────────────────────────────────────────────
def _execution_worker():
    """Autonomous live loop running throughout market hours (09:15 - 15:30 IST)."""
    global _ENGINE_RUNNING
    print("🚀 [LIVE ENGINE] Autonomous Execution Worker started.")
    last_standby_pulse = time.time()

    while _ENGINE_RUNNING:
        try:
            with _ENGINE_LOCK:
                state = get_live_state()

            # Check if circuit breaker is locked for today
            now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
            today_str = now_ist.strftime("%Y-%m-%d")
            if state.get("daily_drawdown_locked") and state.get("daily_drawdown_lock_date") == today_str:
                time.sleep(10)
                continue

            status = state.get("status", "STOPPED")
            symbol = state.get("symbol", "SBIN.NS")
            strategy_name = state.get("strategy", "NSE Intraday ORB Breakout")
            timeframe = state.get("timeframe", "2m")
            in_pos = state.get("in_position", False)
            cash = state.get("cash", DEFAULT_CASH)

            # If bot is stopped or paused, sleep and continue
            if status in ("STOPPED", "PAUSED"):
                time.sleep(5)
                continue

            # Check if within market session (09:15 - 15:30 IST Mon-Fri)
            is_market_hours = is_nse_market_open(now_ist)

            # ─────────────────────────────────────────────────────────
            # 1. OUTSIDE MARKET HOURS: Standby Gate (Zero tick spam)
            # ─────────────────────────────────────────────────────────
            if not is_market_hours:
                # If bot was marked ACTIVE, transition to ARMED STANDBY
                if status.startswith("ACTIVE"):
                    state["status"] = "ARMED (STANDBY • MARKET CLOSED)"
                    with _ENGINE_LOCK:
                        save_live_state(state)
                    try:
                        from server import add_bot_log
                        add_bot_log(
                            "STANDBY",
                            f"⏸️ NSE Market is CLOSED (Hours: Mon-Fri 09:15 - 15:30 IST). Engine in STANDBY mode on {symbol}. Auto-execution engages at 09:15 AM opening bell.",
                            symbol
                        )
                    except Exception:
                        pass

                # Periodic heartbeat pulse every 15 minutes
                now_ts = time.time()
                if now_ts - last_standby_pulse > 900:
                    last_standby_pulse = now_ts
                    try:
                        from server import add_bot_log
                        add_bot_log(
                            "STANDBY",
                            f"⏸️ Standby Heartbeat: Outside market hours. Engine armed on {symbol} for 09:15 AM IST open.",
                            symbol
                        )
                    except Exception:
                        pass

                # Sleep 15 seconds before checking clock again (zero fake tick calculations)
                time.sleep(15)
                continue

            # ─────────────────────────────────────────────────────────
            # 2. MARKET IS OPEN: Engage Active Execution
            # ─────────────────────────────────────────────────────────
            # If bot was in ARMED standby mode, transition to ACTIVE!
            if "ARMED" in status or "STANDBY" in status:
                state["status"] = "ACTIVE (IN POSITION)" if in_pos else "ACTIVE (MONITORING)"
                with _ENGINE_LOCK:
                    save_live_state(state)
                try:
                    from server import add_bot_log
                    add_bot_log(
                        "SYSTEM",
                        f"🔔 NSE Market OPEN (09:15 AM IST). Armed execution engine activated for {symbol}. Live calculation loop engaged.",
                        symbol
                    )
                except Exception:
                    pass

            # 1. Fetch live data & LTP
            df = fetch_intraday_data(symbol, interval=timeframe)
            current_ltp = fetch_live_price(symbol)
            if current_ltp is None and not df.empty:
                current_ltp = float(df['close'].iloc[-1])

            if current_ltp is None:
                time.sleep(10)
                continue

            # Check circuit breaker on every price tick
            is_locked, updated_state = check_and_enforce_circuit_breaker(state, current_ltp)
            if is_locked:
                time.sleep(15)
                continue

            # Compute real indicator values
            vwap_val, rsi_val, ema_spread = calculate_real_indicators(df)
            state["last_ltp"] = current_ltp
            state["vwap"] = vwap_val
            state["rsi"] = rsi_val
            state["last_eval_time"] = now_ist.strftime("%H:%M:%S")

            # ─────────────────────────────────────────────────────────
            # A. IF ALREADY IN POSITION: Fast Intra-Candle Risk Monitor
            # ─────────────────────────────────────────────────────────
            if in_pos and state.get("shares", 0) > 0:
                shs = state["shares"]
                side = state.get("position_side", "LONG")
                ep = state.get("entry_price", current_ltp)
                sl = state.get("stop_loss")
                tp = state.get("target_price")

                pnl_per_share = (current_ltp - ep) if side == "LONG" else (ep - current_ltp)
                total_unrealized_pnl = round(pnl_per_share * shs, 2)
                pnl_pct = round((pnl_per_share / ep) * 100, 2)

                # Log intra-candle monitoring tick
                try:
                    from server import add_bot_log
                    add_bot_log(
                        "SIGNAL",
                        f"Holding {side} {shs} units {symbol} @ ₹{ep:.2f} │ LTP: ₹{current_ltp:.2f} │ P&L: {total_unrealized_pnl:+,.2f} ({pnl_pct:+.2f}%) │ SL: ₹{sl:.2f} │ TP: ₹{tp:.2f}",
                        symbol
                    )
                except Exception:
                    pass

                # Check 03:15 PM MIS Intraday Auto-Square-Off Gate
                is_square_off_time = (now_ist.hour == 15 and now_ist.minute >= 15)
                
                # Check Stop Loss / Target Profit / MIS Exit
                should_exit = False
                exit_reason = ""

                if is_square_off_time:
                    should_exit = True
                    exit_reason = "3:15 PM MIS INTRADAY AUTO-SQUARE-OFF"
                elif side == "LONG":
                    if sl is not None and current_ltp <= sl:
                        should_exit = True
                        exit_reason = f"STOP LOSS HIT (LTP ₹{current_ltp:.2f} <= SL ₹{sl:.2f})"
                    elif tp is not None and current_ltp >= tp:
                        should_exit = True
                        exit_reason = f"TARGET 2R ACHIEVED (LTP ₹{current_ltp:.2f} >= TP ₹{tp:.2f})"
                elif side == "SHORT":
                    if sl is not None and current_ltp >= sl:
                        should_exit = True
                        exit_reason = f"STOP LOSS HIT (LTP ₹{current_ltp:.2f} >= SL ₹{sl:.2f})"
                    elif tp is not None and current_ltp <= tp:
                        should_exit = True
                        exit_reason = f"TARGET 2R ACHIEVED (LTP ₹{current_ltp:.2f} <= TP ₹{tp:.2f})"

                if should_exit:
                    # Execute Exit
                    if side == "LONG":
                        exec_price, proceeds = calculate_sell_proceeds(shs, current_ltp)
                        realized_pnl = round(proceeds - state.get("entry_total_cost", shs * ep), 2)
                        realized_pct = round((realized_pnl / state.get("entry_total_cost", shs * ep)) * 100, 2)
                        state["cash"] = round(state["cash"] + proceeds, 2)
                        record_live_trade("SELL", symbol, shs, exec_price, proceeds)
                    else:
                        exec_price, total_cost = calculate_buy_costs(shs, current_ltp)
                        realized_pnl = round(state.get("entry_total_cost", shs * ep) - total_cost, 2)
                        realized_pct = round((realized_pnl / total_cost) * 100, 2)
                        state["cash"] = round(state["cash"] + (state.get("entry_total_cost", shs * ep) + realized_pnl), 2)
                        record_live_trade("COVER", symbol, shs, exec_price, total_cost)

                    # Reset position fields
                    state["in_position"] = False
                    state["shares"] = 0
                    state["position_side"] = None
                    state["entry_price"] = 0.0
                    state["entry_total_cost"] = 0.0
                    state["stop_loss"] = None
                    state["target_price"] = None

                    with _ENGINE_LOCK:
                        save_live_state(state)

                    try:
                        from server import add_bot_log
                        add_bot_log("ORDER", f"EXIT FILLED: {shs} shares of {symbol} closed @ ₹{exec_price:.2f}. Realized P&L: ₹{realized_pnl:+,.2f} ({realized_pct:+.2f}%). Reason: {exit_reason}", symbol)
                    except Exception:
                        pass

                    # Dispatch push notification to Telegram
                    try:
                        from notifications.telegram_bot import notify_trade_exit
                        notify_trade_exit(symbol, exec_price, realized_pnl, realized_pct, exit_reason)
                    except Exception as t_err:
                        print(f"[ENGINE TELEGRAM ERROR] {t_err}")

                # Sleep 15s during active position monitoring
                time.sleep(15)

            # ─────────────────────────────────────────────────────────
            # B. IF FLAT: Evaluate Candle Strategy for New Entry Signal
            # ─────────────────────────────────────────────────────────
            else:
                completed_today = get_today_completed_trades(symbol)
                max_trades = state.get("max_trades_per_symbol", 1)
                daily_quota_reached = (max_trades > 0 and completed_today >= max_trades)

                sig, stop_loss, target_price, reason = evaluate_strategy_signal(
                    df,
                    strategy_name,
                    stop_loss_pct=float(state.get("stop_loss_pct", 0.8)),
                    take_profit_multiple=float(state.get("take_profit_multiple", 2.0))
                )

                # Log actual calculation or quota message
                if daily_quota_reached:
                    now_ts = time.time()
                    if now_ts - last_standby_pulse > 600:
                        last_standby_pulse = now_ts
                        try:
                            from server import add_bot_log
                            add_bot_log(
                                "STANDBY",
                                f"🔒 Daily Lock Active for {symbol}: Quota reached ({completed_today}/{max_trades} completed today). Profit secured; re-entries blocked to prevent chasing runner. Arm another symbol or wait for tomorrow.",
                                symbol
                            )
                        except Exception:
                            pass
                else:
                    try:
                        from server import add_bot_log
                        add_bot_log(
                            "TICK",
                            f"Evaluating {symbol} ({strategy_name} [{timeframe}]): LTP ₹{current_ltp:.2f} │ VWAP ₹{vwap_val:.2f} │ RSI {rsi_val} │ EMA Spread {ema_spread:+.2f} │ Signal: {sig}",
                            symbol
                        )
                    except Exception:
                        pass

                # Check if Entry Signal triggered (only within market hours before 02:45 PM and quota not reached)
                can_enter = is_market_hours and (now_ist.hour < 14 or (now_ist.hour == 14 and now_ist.minute <= 45)) and not daily_quota_reached

                if sig != 0 and can_enter:
                    # Allocate max 50% cash to a single trade for prudent risk sizing
                    alloc_cash = cash * 0.50
                    affordable_shares = int(alloc_cash / (current_ltp * (1.0 + SLIPPAGE_PCT)))

                    if affordable_shares > 0:
                        if sig == 1:
                            # LONG BUY
                            exec_price, total_cost = calculate_buy_costs(affordable_shares, current_ltp)
                            state["cash"] = round(state["cash"] - total_cost, 2)
                            state["shares"] = affordable_shares
                            state["in_position"] = True
                            state["position_side"] = "LONG"
                            state["entry_price"] = exec_price
                            state["entry_total_cost"] = total_cost
                            state["stop_loss"] = stop_loss
                            state["target_price"] = target_price
                            record_live_trade("BUY", symbol, affordable_shares, exec_price, -total_cost)

                            try:
                                from server import add_bot_log
                                add_bot_log("ORDER", f"🟢 ENTRY EXECUTED: BUY {affordable_shares} shares of {symbol} @ ₹{exec_price:.2f} (Total Outflow: ₹{total_cost:,.2f}) │ SL: ₹{stop_loss:.2f} │ Target: ₹{target_price:.2f}", symbol)
                            except Exception:
                                pass

                            try:
                                from notifications.telegram_bot import notify_trade_entry
                                notify_trade_entry(symbol, "BUY", exec_price, affordable_shares, stop_loss, target_price, strategy_name)
                            except Exception as t_err:
                                print(f"[ENGINE TELEGRAM ERROR] {t_err}")

                        elif sig == -1:
                            # SHORT SELL
                            exec_price, total_proceeds = calculate_sell_proceeds(affordable_shares, current_ltp)
                            margin_req = total_proceeds
                            state["cash"] = round(state["cash"] - margin_req, 2)
                            state["shares"] = affordable_shares
                            state["in_position"] = True
                            state["position_side"] = "SHORT"
                            state["entry_price"] = exec_price
                            state["entry_total_cost"] = margin_req
                            state["stop_loss"] = stop_loss
                            state["target_price"] = target_price
                            record_live_trade("SHORT", symbol, affordable_shares, exec_price, -margin_req)

                            try:
                                from server import add_bot_log
                                add_bot_log("ORDER", f"🔴 ENTRY EXECUTED: SHORT {affordable_shares} shares of {symbol} @ ₹{exec_price:.2f} (Margin: ₹{margin_req:,.2f}) │ SL: ₹{stop_loss:.2f} │ Target: ₹{target_price:.2f}", symbol)
                            except Exception:
                                pass

                            try:
                                from notifications.telegram_bot import notify_trade_entry
                                notify_trade_entry(symbol, "SHORT", exec_price, affordable_shares, stop_loss, target_price, strategy_name)
                            except Exception as t_err:
                                print(f"[ENGINE TELEGRAM ERROR] {t_err}")

                        with _ENGINE_LOCK:
                            save_live_state(state)

                # Sleep 20s when flat awaiting candle triggers
                time.sleep(20)

        except Exception as e:
            print(f"[ENGINE WORKER ERROR] {e}")
            time.sleep(15)


# ─────────────────────────────────────────────────────────────────────────────
# 6. Public Controls (START, PAUSE, STOP, SQUARE_OFF, RESET, CONFIG)
# ─────────────────────────────────────────────────────────────────────────────
def start_live_execution_engine():
    """Launches the background execution worker daemon once."""
    global _ENGINE_RUNNING, _ENGINE_THREAD
    if not _ENGINE_RUNNING:
        _ENGINE_RUNNING = True
        _ENGINE_THREAD = threading.Thread(target=_execution_worker, daemon=True, name="LiveExecutionWorker")
        _ENGINE_THREAD.start()
        print("✅ Live Execution Engine daemon armed and running.")


def command_bot_control(
    action: str,
    symbol: Optional[str] = None,
    strategy_name: Optional[str] = None,
    capital: Optional[float] = None,
    timeframe: Optional[str] = None,
    max_trades_per_symbol: Optional[int] = None,
    stop_loss_pct: Optional[float] = None,
    take_profit_multiple: Optional[float] = None,
    max_drawdown_pct: Optional[float] = None,
    config_file_path: Optional[str] = None,
    history_file_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Handles START, PAUSE, STOP, SQUARE_OFF, RESET, and CONFIG directly on the live engine.
    Strictly validates all inputs and enforces safety invariants:
      - Cannot START or RESET if daily drawdown circuit breaker is active for today.
      - Cannot RESET if an open position exists.
      - Automatically saves state and logs transitions.
    """
    cf = config_file_path or CONFIG_FILE
    hf = history_file_path or HISTORY_FILE

    # 1. Strict Input Validation (raises ValueError on failure)
    validate_control_request(
        action=action,
        symbol=symbol,
        strategy_name=strategy_name,
        capital=capital,
        timeframe=timeframe,
        max_trades_per_symbol=max_trades_per_symbol,
        stop_loss_pct=stop_loss_pct,
        take_profit_multiple=take_profit_multiple,
        max_drawdown_pct=max_drawdown_pct
    )

    with _ENGINE_LOCK:
        state = get_live_state(cf, hf)
        now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
        today_str = now_ist.strftime("%Y-%m-%d")
        market_open = is_nse_market_open(now_ist)
        act = action.strip().upper()

        # Update configurable parameters if supplied
        if symbol:
            target_sym = symbol.strip().upper()
            if state.get("in_position") and state.get("shares", 0) > 0 and target_sym != state.get("symbol"):
                raise ValueError(
                    f"Cannot change symbol to '{target_sym}' while an active position in '{state.get('symbol')}' is open. "
                    "Square off the active position first before switching instruments."
                )
            state["symbol"] = target_sym
            state["active_symbol"] = target_sym
        if strategy_name:
            state["strategy"] = strategy_name.strip()
        if timeframe:
            state["timeframe"] = timeframe.strip().lower()
        if max_trades_per_symbol is not None:
            state["max_trades_per_symbol"] = int(max_trades_per_symbol)
        if stop_loss_pct is not None:
            state["stop_loss_pct"] = float(stop_loss_pct)
        if take_profit_multiple is not None:
            state["take_profit_multiple"] = float(take_profit_multiple)
        if max_drawdown_pct is not None:
            state["max_drawdown_pct"] = float(max_drawdown_pct)

        if capital is not None and capital > 0:
            cap_val = float(capital)
            state["capital"] = cap_val

            # Daily opening equity baseline is strictly immutable once established for today's session
            has_today_baseline = bool(state.get("daily_baseline_date") == today_str and float(state.get("daily_starting_equity", 0)) > 0)
            if not has_today_baseline:
                state["daily_baseline_date"] = today_str
                state["daily_starting_equity"] = cap_val
                if not state.get("in_position"):
                    state["cash"] = cap_val
            elif not state.get("in_position") and not state.get("daily_drawdown_locked"):
                # Baseline is active. Preserve daily_starting_equity immutable!
                # Only sync cash if the bot is completely idle with 0 completed trades today
                if state.get("daily_completed_trades", 0) == 0 and abs(state.get("cash", 0) - state.get("daily_starting_equity", 0)) < 0.01:
                    state["cash"] = cap_val

        # 2. Control Invariant Enforcement
        if act == "START":
            # Circuit breaker check: cannot bypass active daily lock
            if state.get("daily_drawdown_locked") and state.get("daily_drawdown_lock_date") == today_str:
                raise ValueError(
                    f"Cannot start bot: Daily drawdown circuit breaker is active for today ({today_str}). "
                    f"Lock reason: {state.get('daily_drawdown_lock_reason')}. Re-entries are locked to protect capital."
                )

            try:
                from server import add_bot_log
                if market_open:
                    state["status"] = "ACTIVE (IN POSITION)" if state.get("in_position") else "ACTIVE (MONITORING)"
                    add_bot_log("CONTROL", f"Bot STARTED on {state['symbol']}. Strategy: '{state['strategy']}' [{state.get('timeframe', '2m')}]. Real-time calculation loop engaged.", state['symbol'])
                else:
                    state["status"] = "ARMED (STANDBY • MARKET CLOSED)"
                    add_bot_log("CONTROL", f"Bot ARMED on {state['symbol']}. Strategy: '{state['strategy']}' [{state.get('timeframe', '2m')}].", state['symbol'])
                    add_bot_log("STANDBY", f"⏸️ NSE Market is currently CLOSED (Trading Hours: Mon-Fri 09:15 - 15:30 IST). Bot placed in STANDBY mode. Auto-execution engages automatically at 09:15 AM IST opening bell.", state['symbol'])
            except Exception:
                pass

        elif act == "PAUSE":
            state["status"] = "PAUSED"
            try:
                from server import add_bot_log
                add_bot_log("CONTROL", f"Bot PAUSED on {state['symbol']}. Real-time trade entries suspended.", state['symbol'])
            except Exception:
                pass

        elif act == "STOP":
            state["status"] = "STOPPED"
            try:
                from server import add_bot_log
                add_bot_log("CONTROL", f"Bot STOPPED on {state['symbol']}.", state['symbol'])
            except Exception:
                pass

        elif act == "RESET":
            # Cannot reset with an active open position
            if state.get("in_position") and state.get("shares", 0) > 0:
                raise ValueError("Cannot reset bot while an active position is open. Please square off the position first.")

            # Cannot reset during an active daily drawdown lock for today
            if state.get("daily_drawdown_locked") and state.get("daily_drawdown_lock_date") == today_str:
                raise ValueError(
                    f"Cannot reset bot: Daily drawdown circuit breaker is active for today ({today_str}). "
                    "Daily risk lock resets automatically on the next trading session."
                )

            base_cap = capital or state.get("capital") or DEFAULT_CASH
            state["status"] = "ACTIVE (MONITORING)" if market_open else "ARMED (STANDBY • MARKET CLOSED)"
            state["cash"] = float(base_cap)
            state["capital"] = float(base_cap)
            state["daily_starting_equity"] = float(base_cap)
            state["in_position"] = False
            state["shares"] = 0
            state["position_side"] = None
            state["entry_price"] = 0.0
            state["entry_total_cost"] = 0.0
            state["stop_loss"] = None
            state["target_price"] = None
            state["daily_completed_trades"] = 0
            state["symbol_locked_for_day"] = False
            try:
                from server import add_bot_log
                add_bot_log("SYSTEM", f"Bot state reset: Margin set to ₹{state['cash']:,.2f}. All position queues cleared.", state['symbol'])
            except Exception:
                pass

        elif act == "SQUARE_OFF":
            if state.get("in_position") and state.get("shares", 0) > 0:
                shs = state["shares"]
                side = state.get("position_side", "LONG")
                curr_price = fetch_live_price(state["symbol"]) or state.get("entry_price", 100.0)

                try:
                    if side == "LONG":
                        exec_price, proceeds = calculate_sell_proceeds(shs, curr_price)
                        realized_pnl = round(proceeds - state.get("entry_total_cost", shs * exec_price), 2)
                        state["cash"] = round(state["cash"] + proceeds, 2)
                        record_live_trade("MANUAL_SQUARE_OFF", state["symbol"], shs, exec_price, proceeds, hf)
                    else:
                        exec_price, total_cost = calculate_buy_costs(shs, curr_price)
                        realized_pnl = round(state.get("entry_total_cost", shs * exec_price) - total_cost, 2)
                        state["cash"] = round(state["cash"] + (state.get("entry_total_cost", shs * exec_price) + realized_pnl), 2)
                        record_live_trade("MANUAL_SQUARE_OFF", state["symbol"], shs, exec_price, total_cost, hf)

                    state["in_position"] = False
                    state["shares"] = 0
                    state["position_side"] = None
                    state["entry_price"] = 0.0
                    state["entry_total_cost"] = 0.0
                    state["stop_loss"] = None
                    state["target_price"] = None
                    if not state.get("daily_drawdown_locked"):
                        state["status"] = "ACTIVE (MONITORING)" if market_open else "ARMED (STANDBY • MARKET CLOSED)"

                    try:
                        from server import add_bot_log
                        add_bot_log("ORDER", f"MANUAL SQUARE-OFF FILLED: {shs} shares of {state['symbol']} closed @ ₹{exec_price:.2f}. Realized P&L: ₹{realized_pnl:+,.2f}.", state['symbol'])
                    except Exception:
                        pass
                except Exception as e:
                    try:
                        from server import add_bot_log
                        add_bot_log("CRITICAL", f"Manual square-off failed: {e}. Position remains active.", state['symbol'])
                    except Exception:
                        pass
                    raise RuntimeError(f"Manual square-off execution failed: {e}")
            else:
                try:
                    from server import add_bot_log
                    add_bot_log("ORDER", f"Manual square-off requested for {state['symbol']}, but no open position exists.", state['symbol'])
                except Exception:
                    pass

        elif act in ("CONFIG", "UPDATE_CONFIG", "UPDATE", "UPDATE_QUOTA"):
            try:
                from server import add_bot_log
                add_bot_log(
                    "CONTROL",
                    f"Configuration updated: Symbol={state['symbol']} | Strategy='{state['strategy']}' [{state.get('timeframe')}] | "
                    f"Capital=₹{state['cash']:,.2f} | Quota={state.get('max_trades_per_symbol', 1)} | "
                    f"SL={state.get('stop_loss_pct', 0.8)}% | TP={state.get('take_profit_multiple', 2.0)}R | MaxDD={state.get('max_drawdown_pct', 2.0)}%",
                    state['symbol']
                )
            except Exception:
                pass

        # Recalculate daily completed trades & quota lock
        completed = get_today_completed_trades(state.get("symbol", "SBIN.NS"), hf)
        max_t = state.get("max_trades_per_symbol", 1)
        state["daily_completed_trades"] = completed
        state["symbol_locked_for_day"] = bool(max_t > 0 and completed >= max_t)

        save_live_state(state, cf)
        return state


# Arm engine on module load
start_live_execution_engine()
