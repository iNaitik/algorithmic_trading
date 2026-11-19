"""
tests/unit/test_order_manager.py
================================
Unit test suite for the Paper Order Management System (OMS) and Execution Simulator.
Covers all 20 required acceptance and edge-case scenarios:
1. Market order immediate fill.
2. Limit order pending state.
3. Single partial fill.
4. Multiple partial fills.
5. Correct weighted average fill price.
6. Complete order fill.
7. Partial cancellation.
8. Full cancellation.
9. Rejected order.
10. Expired order.
11. Invalid state transitions.
12. Duplicate order submission (idempotency).
13. Duplicate fill prevention.
14. Server restart during pending order.
15. Server restart after partial fill.
16. Risk circuit breaker rejection.
17. Insufficient funds rejection.
18. Order-fill-position reconciliation.
19. FIFO accounting regression.
20. Concurrent order submission.
"""

import os
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from zoneinfo import ZoneInfo

from engine.order_manager import (
    OrderManager,
    OrderStatus,
    OrderSide,
    OrderType,
    Fill,
    InvalidStateTransitionError,
    OrderNotFoundError,
    OrderValidationError,
    compute_paper_fill_charges
)
from engine.live_trader import compute_daily_accounting


class TestPaperOrderManager(unittest.TestCase):

    def setUp(self):
        """Creates an isolated temporary sandbox for each test."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.orders_path = os.path.join(self.temp_dir.name, "paper_orders.json")
        self.history_path = os.path.join(self.temp_dir.name, "trade_history.csv")
        self.config_path = os.path.join(self.temp_dir.name, "bot_active_config.json")

        # Create standard starting bot config
        initial_config = {
            "symbol": "SBIN.NS",
            "cash": 1_000_000.0,
            "capital": 1_000_000.0,
            "daily_starting_equity": 1_000_000.0,
            "daily_baseline_date": datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d"),
            "circuit_breaker_triggered": False,
            "in_position": False,
            "shares": 0,
            "status": "ARMED"
        }
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(initial_config, f, indent=2)

        self.oms = OrderManager(
            orders_file_path=self.orders_path,
            history_file_path=self.history_path,
            config_file_path=self.config_path,
            enforce_market_hours=False
        )

    def tearDown(self):
        """Cleans up the isolated temporary sandbox."""
        self.temp_dir.cleanup()

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 1: Market order immediate fill
    # ─────────────────────────────────────────────────────────────────────────
    def test_01_market_order_immediate_fill(self):
        order, is_new = self.oms.submit_order(
            symbol="SBIN.NS",
            side="BUY",
            order_type="MARKET",
            quantity=100,
            simulated_market_price=800.0
        )
        self.assertTrue(is_new)
        self.assertEqual(order.status, OrderStatus.FILLED.value)
        self.assertEqual(order.filled_quantity, 100)
        self.assertEqual(order.remaining_quantity, 0)
        self.assertEqual(len(order.fills), 1)
        self.assertAlmostEqual(order.average_price, 800.40, delta=0.5)  # 800 * 1.0005 slippage
        self.assertEqual(order.execution_source, "PAPER")
        self.assertEqual(order.fills[0].execution_source, "PAPER")

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 2: Limit order pending state
    # ─────────────────────────────────────────────────────────────────────────
    def test_02_limit_order_pending_state(self):
        order, is_new = self.oms.submit_order(
            symbol="RELIANCE.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=50,
            limit_price=2450.0
        )
        self.assertTrue(is_new)
        self.assertEqual(order.status, OrderStatus.PENDING.value)
        self.assertEqual(order.filled_quantity, 0)
        self.assertEqual(order.remaining_quantity, 50)
        self.assertEqual(len(order.fills), 0)
        self.assertEqual(order.limit_price, 2450.0)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 3: Single partial fill
    # ─────────────────────────────────────────────────────────────────────────
    def test_03_single_partial_fill(self):
        order, _ = self.oms.submit_order(
            symbol="TCS.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=100,
            limit_price=4000.0
        )
        fill = self.oms.execute_fill(order.order_id, quantity=40, price=3995.0)
        self.assertEqual(fill.quantity, 40)
        reloaded = self.oms.get_order(order.order_id)
        self.assertEqual(reloaded.status, OrderStatus.PARTIALLY_FILLED.value)
        self.assertEqual(reloaded.filled_quantity, 40)
        self.assertEqual(reloaded.remaining_quantity, 60)
        self.assertEqual(reloaded.average_price, 3995.0)
        self.assertEqual(len(reloaded.fills), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 4: Multiple partial fills
    # ─────────────────────────────────────────────────────────────────────────
    def test_04_multiple_partial_fills(self):
        order, _ = self.oms.submit_order(
            symbol="INFY.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=100,
            limit_price=1800.0
        )
        self.oms.execute_fill(order.order_id, quantity=30, price=1790.0)
        self.oms.execute_fill(order.order_id, quantity=40, price=1795.0)
        reloaded = self.oms.get_order(order.order_id)
        self.assertEqual(reloaded.status, OrderStatus.PARTIALLY_FILLED.value)
        self.assertEqual(reloaded.filled_quantity, 70)
        self.assertEqual(reloaded.remaining_quantity, 30)
        self.assertEqual(len(reloaded.fills), 2)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 5: Correct weighted average fill price
    # ─────────────────────────────────────────────────────────────────────────
    def test_05_correct_weighted_average_fill_price(self):
        order, _ = self.oms.submit_order(
            symbol="HDFCBANK.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=100,
            limit_price=1700.0
        )
        # 40 @ 1600 = 64,000; 60 @ 1650 = 99,000 -> Total = 163,000 / 100 = 1630.00
        self.oms.execute_fill(order.order_id, quantity=40, price=1600.0)
        self.oms.execute_fill(order.order_id, quantity=60, price=1650.0)
        reloaded = self.oms.get_order(order.order_id)
        self.assertEqual(reloaded.average_price, 1630.00)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 6: Complete order fill
    # ─────────────────────────────────────────────────────────────────────────
    def test_06_complete_order_fill(self):
        order, _ = self.oms.submit_order(
            symbol="ICICIBANK.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=50,
            limit_price=1250.0
        )
        self.oms.execute_fill(order.order_id, quantity=20, price=1240.0)
        self.oms.execute_fill(order.order_id, quantity=30, price=1245.0)
        reloaded = self.oms.get_order(order.order_id)
        self.assertEqual(reloaded.status, OrderStatus.FILLED.value)
        self.assertEqual(reloaded.filled_quantity, 50)
        self.assertEqual(reloaded.remaining_quantity, 0)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 7: Partial cancellation
    # ─────────────────────────────────────────────────────────────────────────
    def test_07_partial_cancellation(self):
        order, _ = self.oms.submit_order(
            symbol="SBIN.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=100,
            limit_price=800.0
        )
        self.oms.execute_fill(order.order_id, quantity=35, price=798.0)
        cancelled = self.oms.cancel_order(order.order_id, reason="Client reduced position")
        self.assertEqual(cancelled.status, OrderStatus.CANCELLED.value)
        self.assertEqual(cancelled.filled_quantity, 35)
        self.assertEqual(cancelled.remaining_quantity, 0)
        self.assertEqual(len(cancelled.fills), 1)
        # Check transition history contains CANCEL_PENDING and CANCELLED
        statuses = [h["to_status"] for h in cancelled.history]
        self.assertIn(OrderStatus.CANCEL_PENDING.value, statuses)
        self.assertIn(OrderStatus.CANCELLED.value, statuses)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 8: Full cancellation
    # ─────────────────────────────────────────────────────────────────────────
    def test_08_full_cancellation(self):
        order, _ = self.oms.submit_order(
            symbol="SBIN.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=100,
            limit_price=800.0
        )
        cancelled = self.oms.cancel_order(order.order_id)
        self.assertEqual(cancelled.status, OrderStatus.CANCELLED.value)
        self.assertEqual(cancelled.filled_quantity, 0)
        self.assertEqual(cancelled.remaining_quantity, 0)
        self.assertEqual(len(cancelled.fills), 0)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 9: Rejected order on invalid inputs
    # ─────────────────────────────────────────────────────────────────────────
    def test_09_rejected_order_invalid_inputs(self):
        # Empty symbol
        o1, _ = self.oms.submit_order(symbol="", side="BUY", order_type="MARKET", quantity=10)
        self.assertEqual(o1.status, OrderStatus.REJECTED.value)
        self.assertIn("Invalid instrument", o1.rejection_reason)

        # Non-positive quantity
        o2, _ = self.oms.submit_order(symbol="SBIN.NS", side="BUY", order_type="MARKET", quantity=0)
        self.assertEqual(o2.status, OrderStatus.REJECTED.value)
        self.assertIn("Invalid quantity", o2.rejection_reason)

        # Missing limit price for limit order
        o3, _ = self.oms.submit_order(symbol="SBIN.NS", side="BUY", order_type="LIMIT", quantity=10, limit_price=None)
        self.assertEqual(o3.status, OrderStatus.REJECTED.value)
        self.assertIn("limit_price", o3.rejection_reason)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 10: Expired order
    # ─────────────────────────────────────────────────────────────────────────
    def test_10_expired_order(self):
        order, _ = self.oms.submit_order(
            symbol="SBIN.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=50,
            limit_price=800.0
        )
        expired = self.oms.expire_order(order.order_id, reason="15:30 IST Session Close")
        self.assertEqual(expired.status, OrderStatus.EXPIRED.value)
        self.assertEqual(expired.remaining_quantity, 0)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 11: Invalid state transitions
    # ─────────────────────────────────────────────────────────────────────────
    def test_11_invalid_state_transitions(self):
        # Cannot cancel FILLED order
        o_market, _ = self.oms.submit_order(symbol="SBIN.NS", side="BUY", order_type="MARKET", quantity=10)
        with self.assertRaises(ValueError):
            self.oms.cancel_order(o_market.order_id)

        # Cannot fill CANCELLED order
        o_limit, _ = self.oms.submit_order(symbol="SBIN.NS", side="BUY", order_type="LIMIT", quantity=50, limit_price=800.0)
        self.oms.cancel_order(o_limit.order_id)
        with self.assertRaises(InvalidStateTransitionError):
            self.oms.execute_fill(o_limit.order_id, quantity=10, price=800.0)

        # Direct illegal transition
        with self.assertRaises(InvalidStateTransitionError):
            o_limit.transition_to(OrderStatus.FILLED)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 12: Duplicate order submission (Idempotency)
    # ─────────────────────────────────────────────────────────────────────────
    def test_12_duplicate_order_submission(self):
        key = "IDEMP-CLIENT-REQ-999"
        o1, is_new1 = self.oms.submit_order(
            symbol="SBIN.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=100,
            limit_price=800.0,
            idempotency_key=key
        )
        self.assertTrue(is_new1)

        # Exact retry
        o2, is_new2 = self.oms.submit_order(
            symbol="SBIN.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=100,
            limit_price=800.0,
            idempotency_key=key
        )
        self.assertFalse(is_new2)
        self.assertEqual(o1.order_id, o2.order_id)

        # Ensure only 1 order exists in database
        orders, total = self.oms.list_orders()
        self.assertEqual(total, 1)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 13: Duplicate fill prevention
    # ─────────────────────────────────────────────────────────────────────────
    def test_13_duplicate_fill_prevention(self):
        order, _ = self.oms.submit_order(
            symbol="SBIN.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=100,
            limit_price=800.0
        )
        fill = Fill(
            fill_id="FILL-UNIQUE-001",
            order_id=order.order_id,
            symbol="SBIN.NS",
            side="BUY",
            quantity=50,
            price=800.0,
            slippage=20.0,
            charges=compute_paper_fill_charges(50, 800.0, "BUY"),
            timestamp=datetime.now().isoformat()
        )
        order.record_fill(fill)
        self.assertEqual(order.filled_quantity, 50)

        # Attempt duplicate fill
        with self.assertRaises(ValueError):
            order.record_fill(fill)
        self.assertEqual(order.filled_quantity, 50)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 14: Server restart during pending order
    # ─────────────────────────────────────────────────────────────────────────
    def test_14_server_restart_during_pending_order(self):
        order, _ = self.oms.submit_order(
            symbol="TCS.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=80,
            limit_price=4100.0
        )
        # Simulate server crash and restart
        restarted_oms = OrderManager(
            orders_file_path=self.orders_path,
            history_file_path=self.history_path,
            config_file_path=self.config_path
        )
        recovered = restarted_oms.get_order(order.order_id)
        self.assertEqual(recovered.status, OrderStatus.PENDING.value)
        self.assertEqual(recovered.remaining_quantity, 80)
        self.assertEqual(recovered.filled_quantity, 0)
        self.assertEqual(recovered.limit_price, 4100.0)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 15: Server restart after partial fill
    # ─────────────────────────────────────────────────────────────────────────
    def test_15_server_restart_after_partial_fill(self):
        order, _ = self.oms.submit_order(
            symbol="INFY.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=150,
            limit_price=1800.0
        )
        self.oms.execute_fill(order.order_id, quantity=50, price=1795.0)

        # Simulate restart
        restarted_oms = OrderManager(
            orders_file_path=self.orders_path,
            history_file_path=self.history_path,
            config_file_path=self.config_path
        )
        recovered = restarted_oms.get_order(order.order_id)
        self.assertEqual(recovered.status, OrderStatus.PARTIALLY_FILLED.value)
        self.assertEqual(recovered.filled_quantity, 50)
        self.assertEqual(recovered.remaining_quantity, 100)
        self.assertEqual(len(recovered.fills), 1)
        self.assertEqual(recovered.average_price, 1795.0)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 16: Risk circuit breaker rejection
    # ─────────────────────────────────────────────────────────────────────────
    def test_16_risk_circuit_breaker_rejection(self):
        # Trigger circuit breaker in config
        with open(self.config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        cfg["circuit_breaker_triggered"] = True
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)

        order, _ = self.oms.submit_order(
            symbol="SBIN.NS",
            side="BUY",
            order_type="MARKET",
            quantity=100
        )
        self.assertEqual(order.status, OrderStatus.REJECTED.value)
        self.assertIn("circuit breaker", order.rejection_reason.lower())

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 17: Insufficient funds rejection
    # ─────────────────────────────────────────────────────────────────────────
    def test_17_insufficient_funds_rejection(self):
        # Reduce cash to 5,000
        with open(self.config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        cfg["cash"] = 5_000.0
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)

        # Attempt trade requiring 100 * 800 = 80,000
        order, _ = self.oms.submit_order(
            symbol="SBIN.NS",
            side="BUY",
            order_type="LIMIT",
            quantity=100,
            limit_price=800.0
        )
        self.assertEqual(order.status, OrderStatus.REJECTED.value)
        self.assertIn("insufficient virtual funds", order.rejection_reason.lower())

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 18: Order-fill-position reconciliation
    # ─────────────────────────────────────────────────────────────────────────
    def test_18_order_fill_position_reconciliation(self):
        # Submit and fill market order
        self.oms.submit_order(
            symbol="SBIN.NS",
            side="BUY",
            order_type="MARKET",
            quantity=120,
            simulated_market_price=810.0
        )
        recon = self.oms.reconcile_with_ledger()
        self.assertTrue(recon["is_reconciled"])
        self.assertEqual(recon["orders_filled_quantity"], 120)
        self.assertEqual(recon["ledger_total_quantity"], 120)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 19: FIFO accounting regression
    # ─────────────────────────────────────────────────────────────────────────
    def test_19_fifo_accounting_regression(self):
        today_str = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d")
        # 1. Buy 100 @ 500
        self.oms.submit_order(
            symbol="SBIN.NS",
            side="BUY",
            order_type="MARKET",
            quantity=100,
            simulated_market_price=500.0
        )
        # 2. Sell 100 @ 510
        self.oms.submit_order(
            symbol="SBIN.NS",
            side="SELL",
            order_type="MARKET",
            quantity=100,
            simulated_market_price=510.0
        )

        accounting = compute_daily_accounting(
            history_file_path=self.history_path,
            today_str=today_str
        )
        # Position should be closed (flat)
        inv = accounting["symbols_inventory"].get("SBIN.NS", {})
        self.assertEqual(inv.get("shares", 0), 0)
        # 1 completed round-trip trade
        self.assertEqual(accounting["trades_count"], 1)
        self.assertGreater(accounting["today_charges"], 0.0)
        # Net Realized P&L accounts for both slippage (0.05% on buy and sell ~Rs 50) and statutory charges
        self.assertAlmostEqual(accounting["realized_net_pnl"], 896.35, delta=1.0)

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario 20: Concurrent order submission
    # ─────────────────────────────────────────────────────────────────────────
    def test_20_concurrent_order_submission(self):
        def worker(idx):
            # Mix of unique keys and duplicate keys
            key = f"THREAD-KEY-{idx % 5}"
            return self.oms.submit_order(
                symbol="SBIN.NS",
                side="BUY",
                order_type="LIMIT",
                quantity=10,
                limit_price=800.0,
                idempotency_key=key
            )

        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(worker, range(20)))

        self.assertEqual(len(results), 20)
        # Because keys are idx % 5, exactly 5 unique orders must exist!
        orders, total = self.oms.list_orders()
        self.assertEqual(total, 5)


if __name__ == "__main__":
    unittest.main()
