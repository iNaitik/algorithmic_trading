"""
test_risk_circuit_breaker.py (Unit & Isolation Test Suite)
==========================================================
TASK 04.1 Validation: Daily Drawdown Circuit Breaker & Automation Configuration.

Validates:
1. Drawdown below the threshold (No trigger).
2. Drawdown exactly at the threshold (Triggers).
3. Drawdown beyond the threshold (Triggers).
4. Unrealized losses triggering the threshold.
5. Realized and unrealized P&L combined.
6. Modeled charges included exactly once (No double counting).
7. Automatic square-off after a trigger (Liquidation verified).
8. Square-off failure handling (Safe resilience: position not falsely cleared).
9. Restart while daily lock is active (Survives restart on same date).
10. Automatic lock reset on the next trading day.
11. START attempts during a daily lock (Rejected).
12. Invalid capital, symbols, strategies, and timeframes (Rejected).
13. Safe RESET behaviour with an open position (Rejected).
14. Safe RESET behaviour during an active daily lock (Rejected).

100% Isolation Guarantee:
- Uses temporary directories for config and history files.
- Zero modification to production data/trade_history.csv or bot_active_config.json.
"""

import os
import sys
import json
import csv
import tempfile
import unittest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from unittest.mock import patch

# Ensure root directory is in sys.path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from engine.live_trader import (
    calculate_buy_costs,
    calculate_sell_proceeds,
    calculate_fill_charges,
    compute_daily_accounting,
    check_daily_rollover,
    get_risk_metrics,
    check_and_enforce_circuit_breaker,
    validate_control_request,
    command_bot_control,
    get_live_state,
    save_live_state,
    record_live_trade
)


class TestRiskCircuitBreaker(unittest.TestCase):

    def setUp(self):
        """Create an isolated temporary environment for state and history files."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_path = os.path.join(self.temp_dir.name, "bot_active_config.json")
        self.history_path = os.path.join(self.temp_dir.name, "trade_history.csv")
        self.today_str = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d")

        # Initial baseline state
        self.initial_state = {
            "symbol": "SBIN.NS",
            "strategy": "NSE Intraday ORB Breakout",
            "timeframe": "2m",
            "status": "ACTIVE (MONITORING)",
            "cash": 1_000_000.0,
            "capital": 1_000_000.0,
            "in_position": False,
            "shares": 0,
            "position_side": None,
            "entry_price": 0.0,
            "entry_total_cost": 0.0,
            "stop_loss": None,
            "target_price": None,
            "max_trades_per_symbol": 1,
            "stop_loss_pct": 0.8,
            "take_profit_multiple": 2.0,
            "max_drawdown_pct": 2.0,  # 2% of ₹10L = ₹20,000 threshold
            "daily_baseline_date": self.today_str,
            "daily_starting_equity": 1_000_000.0,
            "daily_realized_pnl": 0.0,
            "daily_charges": 0.0,
            "daily_completed_trades": 0,
            "symbol_locked_for_day": False,
            "daily_drawdown_locked": False,
            "daily_drawdown_lock_reason": None,
            "daily_drawdown_lock_time": None,
            "daily_drawdown_lock_date": None,
            "daily_drawdown_threshold_amount": 20_000.0
        }
        with open(self.config_path, "w") as f:
            json.dump(self.initial_state, f, indent=2)

    def tearDown(self):
        """Clean up the isolated temporary environment."""
        self.temp_dir.cleanup()

    def test_01_drawdown_below_threshold(self):
        """Test 1: Drawdown below the threshold does not trigger circuit breaker."""
        # Record a minor loss trade today of ₹5,000 (well below ₹20,000 threshold)
        record_live_trade("BUY", "SBIN.NS", 100, 500.0, -50035.0, self.history_path)
        record_live_trade("SELL", "SBIN.NS", 100, 450.0, 44965.0, self.history_path)

        state = get_live_state(self.config_path, self.history_path)
        is_triggered, state = check_and_enforce_circuit_breaker(
            state, current_ltp=450.0, history_file_path=self.history_path, config_file_path=self.config_path
        )

        self.assertFalse(is_triggered)
        self.assertFalse(state.get("daily_drawdown_locked"))
        self.assertNotIn("LOCKED", state.get("status"))

    def test_02_drawdown_exactly_at_threshold(self):
        """Test 2: Drawdown exactly reaching threshold triggers circuit breaker."""
        # Record realized loss of exactly ₹20,000 today
        record_live_trade("BUY", "SBIN.NS", 1000, 500.0, -500350.0, self.history_path)
        record_live_trade("SELL", "SBIN.NS", 1000, 480.0, 480350.0, self.history_path)  # Net loss = ₹20,000

        state = get_live_state(self.config_path, self.history_path)
        is_triggered, state = check_and_enforce_circuit_breaker(
            state, current_ltp=480.0, history_file_path=self.history_path, config_file_path=self.config_path
        )

        self.assertTrue(is_triggered)
        self.assertTrue(state.get("daily_drawdown_locked"))
        self.assertEqual(state.get("daily_drawdown_lock_date"), self.today_str)
        self.assertIn("LOCKED", state.get("status"))
        self.assertIn("Daily drawdown limit of ₹20,000.00 (2.0%) breached", state.get("daily_drawdown_lock_reason"))

    def test_03_drawdown_beyond_threshold(self):
        """Test 3: Drawdown beyond threshold triggers circuit breaker immediately."""
        # Record realized loss of ₹25,000 (threshold ₹20,000)
        record_live_trade("BUY", "SBIN.NS", 1000, 500.0, -500350.0, self.history_path)
        record_live_trade("SELL", "SBIN.NS", 1000, 475.0, 475350.0, self.history_path)  # Net loss = ₹25,000

        state = get_live_state(self.config_path, self.history_path)
        is_triggered, state = check_and_enforce_circuit_breaker(
            state, current_ltp=475.0, history_file_path=self.history_path, config_file_path=self.config_path
        )

        self.assertTrue(is_triggered)
        self.assertTrue(state.get("daily_drawdown_locked"))
        self.assertEqual(state.get("status"), "LOCKED (DAILY DRAWDOWN HIT)")

    def test_04_unrealized_losses_trigger_threshold(self):
        """Test 4: Unrealized MTM loss in an open position triggers circuit breaker and forces liquidation."""
        # Bot is holding 1000 shares of SBIN @ 500 (Trade val ₹500,000)
        state = get_live_state(self.config_path, self.history_path)
        exec_price, total_cost = calculate_buy_costs(1000, 500.0)
        state["in_position"] = True
        state["shares"] = 1000
        state["position_side"] = "LONG"
        state["entry_price"] = exec_price
        state["entry_total_cost"] = total_cost
        state["cash"] -= total_cost
        save_live_state(state, self.config_path)

        # Price drops to 475 (-₹25,000 unrealized loss, breaching ₹20,000 max drawdown)
        is_triggered, updated_state = check_and_enforce_circuit_breaker(
            state, current_ltp=475.0, history_file_path=self.history_path, config_file_path=self.config_path
        )

        self.assertTrue(is_triggered)
        self.assertTrue(updated_state.get("daily_drawdown_locked"))
        # Verify position was automatically squared off
        self.assertFalse(updated_state.get("in_position"))
        self.assertEqual(updated_state.get("shares"), 0)
        self.assertIsNone(updated_state.get("position_side"))
        self.assertEqual(updated_state.get("status"), "LOCKED (DAILY DRAWDOWN HIT)")

        # Verify trade history recorded the emergency square-off
        with open(self.history_path) as f:
            lines = f.readlines()
        self.assertTrue(any("MANUAL_SQUARE_OFF" in line for line in lines))

    def test_05_combined_realized_and_unrealized_pnl(self):
        """Test 5: Realized loss (-₹12,000) + Unrealized MTM loss (-₹9,000) = -₹21,000 triggers."""
        # 1. Realized trade of -₹12,000
        record_live_trade("BUY", "SBIN.NS", 600, 500.0, -300200.0, self.history_path)
        record_live_trade("SELL", "SBIN.NS", 600, 480.0, 288200.0, self.history_path)  # -₹12,000 loss

        # 2. Open position with -₹9,000 MTM loss
        state = get_live_state(self.config_path, self.history_path)
        exec_price, total_cost = calculate_buy_costs(500, 500.0)
        state["in_position"] = True
        state["shares"] = 500
        state["position_side"] = "LONG"
        state["entry_price"] = exec_price
        state["entry_total_cost"] = total_cost
        save_live_state(state, self.config_path)

        # LTP is 482 -> 500 shares * (482 - 500) = -9,000
        is_triggered, state = check_and_enforce_circuit_breaker(
            state, current_ltp=482.0, history_file_path=self.history_path, config_file_path=self.config_path
        )

        self.assertTrue(is_triggered)
        self.assertTrue(state.get("daily_drawdown_locked"))
        self.assertFalse(state.get("in_position"))

    def test_06_modeled_charges_included_exactly_once(self):
        """Test 6: Statutory charges are accounted for accurately without double-counting."""
        # 100 shares @ 1000 buy, 100 shares @ 1000 sell (Gross P&L = 0, but statutory fees apply)
        b_exec, b_cost = calculate_buy_costs(100, 1000.0)
        s_exec, s_proceeds = calculate_sell_proceeds(100, 1000.0)

        record_live_trade("BUY", "TCS.NS", 100, b_exec, -b_cost, self.history_path)
        record_live_trade("SELL", "TCS.NS", 100, s_exec, s_proceeds, self.history_path)

        acct = compute_daily_accounting(self.history_path, self.today_str)
        expected_net_loss = round(s_proceeds - b_cost, 2)
        self.assertEqual(acct["realized_net_pnl"], expected_net_loss)
        self.assertLess(acct["realized_net_pnl"], 0.0)  # Pure friction loss

    def test_07_automatic_square_off_after_trigger(self):
        """Test 7: Automatic liquidation confirms flat position before reporting success."""
        state = get_live_state(self.config_path, self.history_path)
        exec_price, total_cost = calculate_buy_costs(1000, 500.0)
        state["in_position"] = True
        state["shares"] = 1000
        state["position_side"] = "LONG"
        state["entry_price"] = exec_price
        state["entry_total_cost"] = total_cost
        save_live_state(state, self.config_path)

        is_triggered, state = check_and_enforce_circuit_breaker(
            state, current_ltp=460.0, history_file_path=self.history_path, config_file_path=self.config_path
        )

        self.assertTrue(is_triggered)
        self.assertEqual(state["shares"], 0)
        self.assertFalse(state["in_position"])
        self.assertEqual(state["status"], "LOCKED (DAILY DRAWDOWN HIT)")

    def test_08_square_off_failure_handling(self):
        """Test 8: Square-off failure does not falsely report flat position."""
        state = get_live_state(self.config_path, self.history_path)
        state["in_position"] = True
        state["shares"] = 500
        state["position_side"] = "LONG"
        state["entry_price"] = 500.0
        state["entry_total_cost"] = 250000.0
        save_live_state(state, self.config_path)

        # Mock record_live_trade to simulate unexpected I/O / execution failure during liquidation
        with patch("engine.live_trader.record_live_trade", side_effect=IOError("Execution write failed during liquidation")):
            is_triggered, state = check_and_enforce_circuit_breaker(
                state, current_ltp=400.0, history_file_path=self.history_path, config_file_path=self.config_path
            )

            self.assertTrue(is_triggered)
            self.assertTrue(state.get("daily_drawdown_locked"))
            # Crucial safety check: Position must NOT be falsely marked cleared!
            self.assertTrue(state.get("in_position"))
            self.assertEqual(state.get("shares"), 500)
            self.assertEqual(state.get("status"), "CIRCUIT_BREAKER_LOCKED (EXIT_FAILED)")

    def test_09_restart_while_daily_lock_is_active(self):
        """Test 9: Lock survives server restart when date is still the same."""
        state = get_live_state(self.config_path, self.history_path)
        state["daily_drawdown_locked"] = True
        state["daily_drawdown_lock_reason"] = "Circuit breaker triggered"
        state["daily_drawdown_lock_date"] = self.today_str
        state["status"] = "LOCKED (DAILY DRAWDOWN HIT)"
        save_live_state(state, self.config_path)

        # Simulate fresh server reload
        reloaded_state = get_live_state(self.config_path, self.history_path)
        self.assertTrue(reloaded_state.get("daily_drawdown_locked"))
        self.assertEqual(reloaded_state.get("status"), "LOCKED (DAILY DRAWDOWN HIT)")
        self.assertEqual(reloaded_state.get("daily_drawdown_lock_date"), self.today_str)

    def test_10_automatic_lock_reset_on_next_trading_day(self):
        """Test 10: Lock resets automatically on the next valid NSE trading day (weekday)."""
        state = get_live_state(self.config_path, self.history_path)
        yesterday_str = (datetime.now(ZoneInfo("Asia/Kolkata")) - timedelta(days=1)).strftime("%Y-%m-%d")
        state["daily_baseline_date"] = yesterday_str
        state["daily_drawdown_locked"] = True
        state["daily_drawdown_lock_date"] = yesterday_str
        state["daily_drawdown_lock_reason"] = "Prior session loss"
        state["status"] = "LOCKED (DAILY DRAWDOWN HIT)"
        save_live_state(state, self.config_path)

        # Simulate date rollover to a Monday morning
        mock_mon = datetime(2026, 11, 23, 9, 30, tzinfo=ZoneInfo("Asia/Kolkata"))  # Monday
        state = check_daily_rollover(state, mock_mon)

        self.assertFalse(state.get("daily_drawdown_locked"))
        self.assertIsNone(state.get("daily_drawdown_lock_reason"))
        self.assertEqual(state.get("daily_baseline_date"), "2026-11-23")
        self.assertNotIn("LOCKED", state.get("status"))

    def test_11_start_attempts_during_daily_lock(self):
        """Test 11: Attempting to START during an active daily lock raises ValueError."""
        state = get_live_state(self.config_path, self.history_path)
        state["daily_drawdown_locked"] = True
        state["daily_drawdown_lock_date"] = self.today_str
        state["daily_drawdown_lock_reason"] = "Max daily loss ₹20,000 breached"
        state["status"] = "LOCKED (DAILY DRAWDOWN HIT)"
        save_live_state(state, self.config_path)

        with self.assertRaises(ValueError) as ctx:
            command_bot_control("START", config_file_path=self.config_path, history_file_path=self.history_path)

        self.assertIn("Daily drawdown circuit breaker is active for today", str(ctx.exception))

    def test_12_validation_invalid_inputs(self):
        """Test 12: Strict validation rejects invalid actions, symbols, strategies, timeframes, and capital."""
        # 1. Invalid action
        with self.assertRaises(ValueError):
            validate_control_request("DESTROY")

        # 2. Unsupported symbol
        with self.assertRaises(ValueError):
            validate_control_request("START", symbol="DOGECOIN")

        # 3. Unsupported strategy
        with self.assertRaises(ValueError):
            validate_control_request("START", strategy_name="Gambling Martingale")

        # 4. Unsupported timeframe
        with self.assertRaises(ValueError):
            validate_control_request("START", timeframe="42m")

        # 5. Invalid capital (negative / too small / too huge)
        with self.assertRaises(ValueError):
            validate_control_request("CONFIG", capital=-500)
        with self.assertRaises(ValueError):
            validate_control_request("CONFIG", capital=5000)  # Min ₹10,000

        # 6. Invalid drawdown pct
        with self.assertRaises(ValueError):
            validate_control_request("CONFIG", max_drawdown_pct=0.1)  # Min 0.5%
        with self.assertRaises(ValueError):
            validate_control_request("CONFIG", max_drawdown_pct=25.0) # Max 20%

    def test_13_safe_reset_behaviour_with_open_position(self):
        """Test 13: Attempting to RESET while an active position is open is rejected."""
        state = get_live_state(self.config_path, self.history_path)
        state["in_position"] = True
        state["shares"] = 500
        state["position_side"] = "LONG"
        state["entry_price"] = 500.0
        save_live_state(state, self.config_path)

        with self.assertRaises(ValueError) as ctx:
            command_bot_control("RESET", config_file_path=self.config_path, history_file_path=self.history_path)

        self.assertIn("Cannot reset bot while an active position is open", str(ctx.exception))

    def test_14_safe_reset_during_daily_lock(self):
        """Test 14: Attempting to RESET while daily lock is active is rejected."""
        state = get_live_state(self.config_path, self.history_path)
        state["daily_drawdown_locked"] = True
        state["daily_drawdown_lock_date"] = self.today_str
        save_live_state(state, self.config_path)

        with self.assertRaises(ValueError) as ctx:
            command_bot_control("RESET", config_file_path=self.config_path, history_file_path=self.history_path)

        self.assertIn("Daily drawdown circuit breaker is active for today", str(ctx.exception))

    def test_15_profit_buffer_allows_trading_and_expands_loss_room(self):
        """Test 15: Positive realized profit expands drawdown room relative to day opening baseline."""
        # Baseline starting equity: ₹1,000,000. 2% max daily loss = ₹20,000.
        # Step 1: Complete a profitable trade today of +₹10,000
        b_px, b_cost = calculate_buy_costs(500, 500.0)
        s_px, s_proc = calculate_sell_proceeds(500, 520.0)  # +₹10k gross
        record_live_trade("BUY", "SBIN.NS", 500, b_px, -b_cost, self.history_path)
        record_live_trade("SELL", "SBIN.NS", 500, s_px, s_proc, self.history_path)

        state = get_live_state(self.config_path, self.history_path)
        risk = get_risk_metrics(state, current_ltp=520.0, history_file_path=self.history_path)
        self.assertGreater(risk["daily_realized_pnl"], 9000.0)
        profit = risk["daily_realized_pnl"]

        # Step 2: Open a second position holding 1000 shares @ 500
        e_px, e_cost = calculate_buy_costs(1000, 500.0)
        state["in_position"] = True
        state["shares"] = 1000
        state["position_side"] = "LONG"
        state["entry_price"] = e_px
        state["entry_total_cost"] = e_cost
        save_live_state(state, self.config_path)

        # Price drops to 482 (Unrealized MTM loss ≈ -₹18,000)
        # From intraday peak, loss is ~₹18,000, but net daily P&L = +₹9,700 - ₹18,000 = -₹8,300.
        # Since -₹8,300 is well within the ₹20,000 baseline loss limit, circuit breaker must NOT trigger!
        is_triggered, state = check_and_enforce_circuit_breaker(
            state, current_ltp=482.0, history_file_path=self.history_path, config_file_path=self.config_path
        )
        self.assertFalse(is_triggered)
        self.assertFalse(state.get("daily_drawdown_locked"))
        self.assertTrue(state.get("in_position"))

        # Step 3: Price drops severely to 468 (Unrealized MTM loss ≈ -₹32,000)
        # Net daily P&L ≈ +₹9,700 - ₹32,000 = -₹22,300 <= -₹20,000.
        # Now it breaches the baseline loss limit and MUST trigger!
        is_triggered, state = check_and_enforce_circuit_breaker(
            state, current_ltp=468.0, history_file_path=self.history_path, config_file_path=self.config_path
        )
        self.assertTrue(is_triggered)
        self.assertTrue(state.get("daily_drawdown_locked"))
        self.assertFalse(state.get("in_position"))
        self.assertEqual(state.get("status"), "LOCKED (DAILY DRAWDOWN HIT)")

    def test_16_holiday_does_not_reset_lock_or_baseline(self):
        """Test 16: An official NSE trading holiday falling on a weekday does NOT reset lock or baseline."""
        state = get_live_state(self.config_path, self.history_path)
        state["daily_baseline_date"] = "2026-01-23"  # Friday
        state["daily_drawdown_locked"] = True
        state["daily_drawdown_lock_date"] = "2026-01-23"
        state["daily_drawdown_lock_reason"] = "Friday session loss"
        state["status"] = "LOCKED (DAILY DRAWDOWN HIT)"
        save_live_state(state, self.config_path)

        # Simulate time arriving at 2026-01-26 10:00 AM IST (Monday, Republic Day - Gazetted NSE Holiday)
        mock_holiday_monday = datetime(2026, 1, 26, 10, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
        state = check_daily_rollover(state, mock_holiday_monday)

        # Must NOT reset! Lock must remain active, baseline date unchanged
        self.assertTrue(state.get("daily_drawdown_locked"))
        self.assertEqual(state.get("daily_baseline_date"), "2026-01-23")
        self.assertEqual(state.get("status"), "LOCKED (DAILY DRAWDOWN HIT)")

        # Now simulate next regular trading day: 2026-01-27 (Tuesday morning)
        mock_tuesday = datetime(2026, 1, 27, 9, 30, tzinfo=ZoneInfo("Asia/Kolkata"))
        state = check_daily_rollover(state, mock_tuesday)

        # Now it MUST reset cleanly
        self.assertFalse(state.get("daily_drawdown_locked"))
        self.assertEqual(state.get("daily_baseline_date"), "2026-01-27")

    def test_17_friday_lock_retained_over_weekend(self):
        """Test 17: Friday risk locks remain active on Saturday and Sunday."""
        state = get_live_state(self.config_path, self.history_path)
        friday_str = "2026-11-20"
        state["daily_baseline_date"] = friday_str
        state["daily_drawdown_locked"] = True
        state["daily_drawdown_lock_date"] = friday_str
        state["status"] = "LOCKED (DAILY DRAWDOWN HIT)"
        save_live_state(state, self.config_path)

        # Saturday check
        sat_dt = datetime(2026, 11, 21, 11, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
        state = check_daily_rollover(state, sat_dt)
        self.assertTrue(state.get("daily_drawdown_locked"))

        # Sunday check
        sun_dt = datetime(2026, 11, 22, 14, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
        state = check_daily_rollover(state, sun_dt)
        self.assertTrue(state.get("daily_drawdown_locked"))

    def test_18_circuit_breaker_retries_liquidation_if_previously_failed(self):
        """Test 18: If emergency liquidation failed previously, circuit breaker retries on subsequent tick."""
        state = get_live_state(self.config_path, self.history_path)
        state["in_position"] = True
        state["shares"] = 500
        state["position_side"] = "LONG"
        state["entry_price"] = 500.0
        state["entry_total_cost"] = 250000.0
        state["daily_drawdown_locked"] = True
        state["daily_drawdown_lock_date"] = self.today_str
        state["status"] = "CIRCUIT_BREAKER_LOCKED (EXIT_FAILED)"
        save_live_state(state, self.config_path)

        # Next tick arrives at LTP 400. Square-off succeeds this time.
        is_triggered, updated = check_and_enforce_circuit_breaker(
            state, current_ltp=400.0, history_file_path=self.history_path, config_file_path=self.config_path
        )
        self.assertTrue(is_triggered)
        self.assertFalse(updated.get("in_position"))
        self.assertEqual(updated.get("shares"), 0)
        self.assertEqual(updated.get("status"), "LOCKED (DAILY DRAWDOWN HIT)")

        # Verify trade history contains the exit
        with open(self.history_path) as f:
            lines = f.readlines()
        self.assertTrue(any("MANUAL_SQUARE_OFF" in l for l in lines))

    def test_19_duplicate_square_off_does_not_create_duplicate_exits(self):
        """Test 19: Calling SQUARE_OFF repeatedly on an already flat position does not append duplicate exits."""
        # Position is flat
        state = get_live_state(self.config_path, self.history_path)
        self.assertFalse(state.get("in_position"))

        # Issue 3 consecutive SQUARE_OFF commands
        command_bot_control("SQUARE_OFF", config_file_path=self.config_path, history_file_path=self.history_path)
        command_bot_control("SQUARE_OFF", config_file_path=self.config_path, history_file_path=self.history_path)
        command_bot_control("SQUARE_OFF", config_file_path=self.config_path, history_file_path=self.history_path)

        # Verify trade history has NO exit records created
        if os.path.exists(self.history_path):
            with open(self.history_path) as f:
                lines = [l for l in f if "SQUARE_OFF" in l]
            self.assertEqual(len(lines), 0)

    def test_20_reconcile_open_position_from_trade_history_on_restart(self):
        """Test 20: If trade history has closed all shares, state crash with in_position=True is reconciled on load."""
        # Write an entry and matching exit into history
        record_live_trade("BUY", "SBIN.NS", 500, 500.0, -250100.0, self.history_path)
        record_live_trade("MANUAL_SQUARE_OFF", "SBIN.NS", 500, 480.0, 239900.0, self.history_path)

        # Simulate config file remaining unpersisted (in_position=True with 500 shares)
        unpersisted_state = {
            "symbol": "SBIN.NS",
            "in_position": True,
            "shares": 500,
            "position_side": "LONG",
            "entry_price": 500.0,
            "entry_total_cost": 250100.0,
            "cash": 750000.0,
            "daily_drawdown_locked": True,
            "daily_drawdown_lock_date": self.today_str,
            "status": "CIRCUIT_BREAKER_LOCKED (EXIT_FAILED)"
        }
        with open(self.config_path, "w") as f:
            json.dump(unpersisted_state, f)

        # On server startup / get_live_state reload:
        reloaded = get_live_state(self.config_path, self.history_path)

        # Verify it reconciled with trade ledger: position is NOT open!
        self.assertFalse(reloaded.get("in_position"))
        self.assertEqual(reloaded.get("shares"), 0)
        self.assertEqual(reloaded.get("status"), "LOCKED (DAILY DRAWDOWN HIT)")

    def test_21_manual_square_off_failure_leaves_position_active(self):
        """Test 21: If record_live_trade raises an exception during manual square-off, position is NOT cleared."""
        state = get_live_state(self.config_path, self.history_path)
        state["in_position"] = True
        state["shares"] = 300
        state["position_side"] = "LONG"
        state["entry_price"] = 500.0
        state["entry_total_cost"] = 150000.0
        save_live_state(state, self.config_path)

        with patch("engine.live_trader.record_live_trade", side_effect=IOError("Disk write failed")):
            with self.assertRaises(RuntimeError) as ctx:
                command_bot_control("SQUARE_OFF", config_file_path=self.config_path, history_file_path=self.history_path)

            self.assertIn("Manual square-off execution failed", str(ctx.exception))

            # State must still reflect active position!
            reloaded = get_live_state(self.config_path, self.history_path)
            self.assertTrue(reloaded.get("in_position"))
            self.assertEqual(reloaded.get("shares"), 300)


if __name__ == "__main__":
    unittest.main()
