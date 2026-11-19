"""
test_baseline_and_recovery.py
==============================
TASK 04.1.2 Verification:
- Objective 1: Daily opening equity baseline immutability during active sessions.
- Objective 2: Comprehensive Long & Short position recovery across symbols.
"""

import os
import sys
import json
import tempfile
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
from unittest.mock import patch

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from engine.live_trader import (
    calculate_buy_costs,
    calculate_sell_proceeds,
    compute_daily_accounting,
    check_daily_rollover,
    get_risk_metrics,
    check_and_enforce_circuit_breaker,
    command_bot_control,
    get_live_state,
    save_live_state,
    record_live_trade
)


class TestBaselineAndRecovery(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_path = os.path.join(self.temp_dir.name, "bot_active_config.json")
        self.history_path = os.path.join(self.temp_dir.name, "trade_history.csv")
        self.today_str = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d")

        self.initial_state = {
            "symbol": "SBIN.NS",
            "strategy": "NSE Intraday ORB Breakout",
            "timeframe": "5m",
            "status": "ACTIVE (MONITORING)",
            "cash": 1_000_000.0,
            "capital": 1_000_000.0,
            "in_position": False,
            "shares": 0,
            "position_side": None,
            "entry_price": 0.0,
            "entry_total_cost": 0.0,
            "max_trades_per_symbol": 1,
            "stop_loss_pct": 0.8,
            "take_profit_multiple": 2.0,
            "max_drawdown_pct": 2.0,
            "daily_baseline_date": self.today_str,
            "daily_starting_equity": 1_000_000.0,
            "daily_realized_pnl": 0.0,
            "daily_charges": 0.0,
            "daily_completed_trades": 0,
            "daily_drawdown_locked": False,
            "daily_drawdown_lock_reason": None,
            "daily_drawdown_lock_date": None
        }
        with open(self.config_path, "w") as f:
            json.dump(self.initial_state, f, indent=2)

    def tearDown(self):
        self.temp_dir.cleanup()

    # ══════════════════════════════════════════════════════════════════════════
    # OBJECTIVE 1: PROTECT DAILY OPENING EQUITY BASELINE
    # ══════════════════════════════════════════════════════════════════════════

    def test_01_baseline_immutability_mid_session(self):
        """Test 1: Changing capital mid-session does NOT overwrite daily opening equity baseline."""
        # 1. Starting equity baseline is ₹10L. Threshold is ₹20k.
        state = get_live_state(self.config_path, self.history_path)
        self.assertEqual(state["daily_starting_equity"], 1_000_000.0)

        # 2. Simulate a loss of ₹15,000 today
        record_live_trade("BUY", "SBIN.NS", 1000, 500.0, -500350.0, self.history_path)
        record_live_trade("SELL", "SBIN.NS", 1000, 485.0, 485350.0, self.history_path)  # -₹15,000 loss

        # 3. User attempts to change capital to ₹25 Lakhs mid-session
        updated = command_bot_control("CONFIG", capital=2_500_000.0, config_file_path=self.config_path, history_file_path=self.history_path)

        # 4. Verify: Configured capital is updated to 25L, BUT opening equity baseline remains ₹10 Lakhs!
        self.assertEqual(updated["capital"], 2_500_000.0)
        self.assertEqual(updated["daily_starting_equity"], 1_000_000.0)

        # 5. Verify: Daily loss threshold remains ₹20,000 (not ₹50,000!)
        risk = get_risk_metrics(updated, current_ltp=485.0, history_file_path=self.history_path)
        self.assertEqual(risk["starting_daily_equity"], 1_000_000.0)
        self.assertEqual(risk["max_daily_loss"], 20_000.0)
        self.assertEqual(risk["remaining_risk_allowance"], 5_000.0)  # 20k - 15k = 5k

    def test_02_capital_increase_cannot_unlock_circuit_breaker(self):
        """Test 2: Changing capital to ₹1 Crore cannot unlock an active circuit breaker."""
        # Breach the ₹20,000 limit with a ₹25,000 loss
        record_live_trade("BUY", "SBIN.NS", 1000, 500.0, -500350.0, self.history_path)
        record_live_trade("SELL", "SBIN.NS", 1000, 475.0, 475350.0, self.history_path)

        state = get_live_state(self.config_path, self.history_path)
        is_triggered, locked_state = check_and_enforce_circuit_breaker(
            state, current_ltp=475.0, history_file_path=self.history_path, config_file_path=self.config_path
        )
        self.assertTrue(is_triggered)
        self.assertTrue(locked_state["daily_drawdown_locked"])

        # Attempt to change capital to ₹10 Crore and max_drawdown_pct to 10%
        updated = command_bot_control(
            "CONFIG", capital=100_000_000.0, max_drawdown_pct=10.0,
            config_file_path=self.config_path, history_file_path=self.history_path
        )

        # Lock must strictly remain active!
        self.assertTrue(updated["daily_drawdown_locked"])
        self.assertEqual(updated["daily_starting_equity"], 1_000_000.0)

        # START must still be rejected
        with self.assertRaises(ValueError) as ctx:
            command_bot_control("START", config_file_path=self.config_path, history_file_path=self.history_path)
        self.assertIn("Daily drawdown circuit breaker is active for today", str(ctx.exception))

    def test_03_capital_change_applied_to_next_session_rollover(self):
        """Test 3: Capital changed to ₹25L mid-session applies cleanly on next session rollover."""
        # Mid-session Day 1 change
        command_bot_control("CONFIG", capital=2_500_000.0, config_file_path=self.config_path, history_file_path=self.history_path)
        state = get_live_state(self.config_path, self.history_path)
        self.assertEqual(state["daily_starting_equity"], 1_000_000.0)

        # Rollover to next trading day
        next_session_dt = datetime(2026, 11, 23, 9, 15, tzinfo=ZoneInfo("Asia/Kolkata"))  # Monday
        rolled_state = check_daily_rollover(state, next_session_dt)

        # Next session baseline is now ₹25 Lakhs!
        self.assertEqual(rolled_state["daily_starting_equity"], 2_500_000.0)
        self.assertEqual(rolled_state["cash"], 2_500_000.0)
        self.assertEqual(rolled_state["daily_baseline_date"], "2026-11-23")

    def test_04_config_change_while_in_position_protects_accounting(self):
        """Test 4: Configuration changes while in position do not alter active position accounting or allow symbol changes."""
        state = get_live_state(self.config_path, self.history_path)
        e_px, e_cost = calculate_buy_costs(500, 500.0)
        state["in_position"] = True
        state["shares"] = 500
        state["position_side"] = "LONG"
        state["entry_price"] = e_px
        state["entry_total_cost"] = e_cost
        state["stop_loss"] = 496.0
        state["target_price"] = 508.0
        save_live_state(state, self.config_path)

        # 1. Attempting to switch symbol while in position must raise ValueError
        with self.assertRaises(ValueError) as ctx:
            command_bot_control("CONFIG", symbol="TCS.NS", config_file_path=self.config_path, history_file_path=self.history_path)
        self.assertIn("Cannot change symbol to 'TCS.NS' while an active position in 'SBIN.NS' is open", str(ctx.exception))

        # 2. Changing capital while in position updates target capital but preserves position accounting
        updated = command_bot_control("CONFIG", capital=5_000_000.0, config_file_path=self.config_path, history_file_path=self.history_path)
        self.assertEqual(updated["capital"], 5_000_000.0)
        self.assertEqual(updated["shares"], 500)
        self.assertEqual(updated["entry_price"], e_px)
        self.assertEqual(updated["entry_total_cost"], e_cost)
        self.assertEqual(updated["stop_loss"], 496.0)

    # ══════════════════════════════════════════════════════════════════════════
    # OBJECTIVE 2: VERIFY LONG AND SHORT POSITION RECOVERY
    # ══════════════════════════════════════════════════════════════════════════

    def test_05_open_long_position_recovery_after_restart(self):
        """Test 5: Open LONG position is fully reconstructed from trade history on restart."""
        # Ledger has BUY 600 shares SBIN @ 500
        record_live_trade("BUY", "SBIN.NS", 600, 500.0, -300200.0, self.history_path)

        # State file crashed / flat
        with open(self.config_path, "w") as f:
            json.dump({"symbol": "SBIN.NS", "cash": 700000.0}, f)

        # On restart / get_live_state:
        state = get_live_state(self.config_path, self.history_path)
        self.assertTrue(state["in_position"])
        self.assertEqual(state["shares"], 600)
        self.assertEqual(state["position_side"], "LONG")
        self.assertEqual(state["entry_price"], 500.0)
        self.assertEqual(state["entry_total_cost"], 300200.0)

    def test_06_open_short_position_recovery_after_restart(self):
        """Test 6: Open SHORT position is fully reconstructed from trade history on restart."""
        # Ledger has SHORT 400 shares SBIN @ 500
        record_live_trade("SHORT", "SBIN.NS", 400, 500.0, -200150.0, self.history_path)

        # State file crashed / flat
        with open(self.config_path, "w") as f:
            json.dump({"symbol": "SBIN.NS", "cash": 800000.0}, f)

        # On restart / get_live_state:
        state = get_live_state(self.config_path, self.history_path)
        self.assertTrue(state["in_position"])
        self.assertEqual(state["shares"], 400)
        self.assertEqual(state["position_side"], "SHORT")
        self.assertEqual(state["entry_price"], 500.0)
        self.assertEqual(state["entry_total_cost"], 200150.0)

    def test_07_fully_closed_long_recovery(self):
        """Test 7: Fully closed LONG position is reconciled to flat on restart."""
        record_live_trade("BUY", "SBIN.NS", 500, 500.0, -250100.0, self.history_path)
        record_live_trade("SELL", "SBIN.NS", 500, 510.0, 254900.0, self.history_path)

        # Stale state claimed position was open
        with open(self.config_path, "w") as f:
            json.dump({"symbol": "SBIN.NS", "in_position": True, "shares": 500, "position_side": "LONG"}, f)

        state = get_live_state(self.config_path, self.history_path)
        self.assertFalse(state["in_position"])
        self.assertEqual(state["shares"], 0)
        self.assertIsNone(state["position_side"])

    def test_08_fully_closed_short_recovery(self):
        """Test 8: Fully closed SHORT position is reconciled to flat on restart."""
        record_live_trade("SHORT", "SBIN.NS", 500, 500.0, -250100.0, self.history_path)
        record_live_trade("COVER", "SBIN.NS", 500, 490.0, 244900.0, self.history_path)

        # Stale state claimed position was open
        with open(self.config_path, "w") as f:
            json.dump({"symbol": "SBIN.NS", "in_position": True, "shares": 500, "position_side": "SHORT"}, f)

        state = get_live_state(self.config_path, self.history_path)
        self.assertFalse(state["in_position"])
        self.assertEqual(state["shares"], 0)
        self.assertIsNone(state["position_side"])

    def test_09_partially_closed_long_recovery(self):
        """Test 9: Partially closed LONG position recovers exact remaining shares."""
        record_live_trade("BUY", "SBIN.NS", 500, 500.0, -250100.0, self.history_path)
        record_live_trade("SELL", "SBIN.NS", 200, 510.0, 101960.0, self.history_path)

        with open(self.config_path, "w") as f:
            json.dump({"symbol": "SBIN.NS"}, f)

        state = get_live_state(self.config_path, self.history_path)
        self.assertTrue(state["in_position"])
        self.assertEqual(state["shares"], 300)
        self.assertEqual(state["position_side"], "LONG")
        self.assertEqual(state["entry_price"], 500.0)

    def test_10_partially_covered_short_recovery(self):
        """Test 10: Partially covered SHORT position recovers exact remaining shares."""
        record_live_trade("SHORT", "SBIN.NS", 500, 500.0, -250100.0, self.history_path)
        record_live_trade("COVER", "SBIN.NS", 200, 490.0, 97960.0, self.history_path)

        with open(self.config_path, "w") as f:
            json.dump({"symbol": "SBIN.NS"}, f)

        state = get_live_state(self.config_path, self.history_path)
        self.assertTrue(state["in_position"])
        self.assertEqual(state["shares"], 300)
        self.assertEqual(state["position_side"], "SHORT")
        self.assertEqual(state["entry_price"], 500.0)

    def test_11_mixed_historical_trades_across_multiple_symbols(self):
        """Test 11: Mixed trades across multiple symbols isolate inventory per symbol without cross-contamination."""
        # 1. TCS LONG closed
        record_live_trade("BUY", "TCS.NS", 100, 4000.0, -400100.0, self.history_path)
        record_live_trade("SELL", "TCS.NS", 100, 4050.0, 404900.0, self.history_path)

        # 2. SBIN SHORT active
        record_live_trade("SHORT", "SBIN.NS", 500, 500.0, -250100.0, self.history_path)

        # 3. RELIANCE LONG active
        record_live_trade("BUY", "RELIANCE.NS", 200, 2500.0, -500150.0, self.history_path)

        # Check SBIN
        with open(self.config_path, "w") as f:
            json.dump({"symbol": "SBIN.NS"}, f)
        sbin_state = get_live_state(self.config_path, self.history_path)
        self.assertTrue(sbin_state["in_position"])
        self.assertEqual(sbin_state["shares"], 500)
        self.assertEqual(sbin_state["position_side"], "SHORT")

        # Check TCS
        with open(self.config_path, "w") as f:
            json.dump({"symbol": "TCS.NS"}, f)
        tcs_state = get_live_state(self.config_path, self.history_path)
        self.assertFalse(tcs_state["in_position"])
        self.assertEqual(tcs_state["shares"], 0)

        # Check RELIANCE
        with open(self.config_path, "w") as f:
            json.dump({"symbol": "RELIANCE.NS"}, f)
        rel_state = get_live_state(self.config_path, self.history_path)
        self.assertTrue(rel_state["in_position"])
        self.assertEqual(rel_state["shares"], 200)
        self.assertEqual(rel_state["position_side"], "LONG")

    def test_12_duplicate_square_off_after_restart(self):
        """Test 12: Duplicate square-off commands after restart do not write duplicate exit rows."""
        # 1. Position is flat
        state = get_live_state(self.config_path, self.history_path)
        self.assertFalse(state["in_position"])

        # 2. Send square off twice
        command_bot_control("SQUARE_OFF", config_file_path=self.config_path, history_file_path=self.history_path)
        command_bot_control("SQUARE_OFF", config_file_path=self.config_path, history_file_path=self.history_path)

        # 3. Check history: 0 exit records created
        if os.path.exists(self.history_path):
            with open(self.history_path) as f:
                lines = [l for l in f if "SQUARE_OFF" in l]
            self.assertEqual(len(lines), 0)


if __name__ == "__main__":
    unittest.main()
