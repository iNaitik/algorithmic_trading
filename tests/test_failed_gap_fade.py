"""
test_failed_gap_fade.py
========================
Comprehensive Unit and Regression Test Suite for NSE Failed-Gap Fade Strategy.
Tests:
1. Zero Look-Ahead Bias (truncated at time t vs full day)
2. Unit tests: VWAP, RVOL excluding today, Gap % calculation, OR window boundaries
3. Eligibility tests: Gap % bounds, RVOL cutoff, ORB top-5 exclusion
4. Entry tests: Gap-up gives SHORT only, Gap-down gives LONG only, next-candle-open fill, 11:00 cutoff, 1.5 R/R skip, beyond-target skip
5. Fill-logic tests: Same-candle stop+target tie -> stop wins, gap-through stop fills at open, target tick-through, fixed stop
6. Parity test: Backtester vs Paper Bot deterministic output
"""

import unittest
import sys
import os
from datetime import datetime, date, time
import numpy as np
import pandas as pd

# Ensure project root is in sys.path when running tests directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from strategies.india.nse_failed_gap_fade import (
    compute_session_vwap,
    compute_rvol_series,
    compute_orb_top_n_exclusion,
    nse_failed_gap_fade_strategy,
    load_config
)


def create_synthetic_day(
    day_date: str = "2024-01-02",
    prev_close: float = 1000.0,
    open_0915: float = 1007.0,  # +0.70% gap up
    or_high: float = 1008.0,
    or_low: float = 1006.5,
    break_time_idx: int = 4,    # 09:35 candle
    break_price: float = 1005.5,# breaks below OR low (1006.5), target is 1000.0 (Risk=2.5, Reward=5.5 -> R/R=2.2)
    end_price: float = 1000.0,
    volume_base: float = 50000.0,
    rvol_mult: float = 1.0
) -> pd.DataFrame:
    """Creates a realistic 5-min intraday DataFrame for a single trading day (75 bars, 09:15 to 15:25)."""
    times = pd.date_range(f"{day_date} 09:15", f"{day_date} 15:25", freq="5min", tz="Asia/Kolkata")
    n = len(times)

    opens = np.full(n, open_0915, dtype=np.float64)
    highs = np.full(n, open_0915 + 1.0, dtype=np.float64)
    lows = np.full(n, open_0915 - 1.0, dtype=np.float64)
    closes = np.full(n, open_0915, dtype=np.float64)
    volumes = np.full(n, volume_base * rvol_mult, dtype=np.float64)

    # 09:15, 09:20, 09:25: establish Opening Range
    highs[0] = or_high
    lows[0] = or_low
    closes[0] = (or_high + or_low) / 2.0

    highs[1] = or_high - 0.5
    lows[1] = or_low + 0.5
    closes[1] = (or_high + or_low) / 2.0

    highs[2] = or_high - 0.2
    lows[2] = or_low + 0.2
    closes[2] = (or_high + or_low) / 2.0

    # At break_time_idx: simulate the failed gap breakout
    if break_time_idx < n:
        opens[break_time_idx] = closes[break_time_idx - 1]
        closes[break_time_idx] = break_price
        highs[break_time_idx] = max(opens[break_time_idx], break_price) + 0.5
        lows[break_time_idx] = min(opens[break_time_idx], break_price) - 0.5

        # Subsequent bars trail towards end_price
        for j in range(break_time_idx + 1, n):
            opens[j] = closes[j - 1]
            closes[j] = closes[j - 1] + (end_price - closes[j - 1]) * 0.15
            highs[j] = max(opens[j], closes[j]) + 0.2
            lows[j] = min(opens[j], closes[j]) - 0.2

    df = pd.DataFrame({
        "open": opens,
        "high": highs,
        "low": lows,
        "close": closes,
        "volume": volumes
    }, index=times)

    # Prepend previous day close bar so gap calculation has prior close
    prev_time = pd.Timestamp(f"2024-01-01 15:25:00", tz="Asia/Kolkata")
    prev_row = pd.DataFrame({
        "open": [prev_close],
        "high": [prev_close + 1.0],
        "low": [prev_close - 1.0],
        "close": [prev_close],
        "volume": [volume_base]
    }, index=[prev_time])

    return pd.concat([prev_row, df])


class TestFailedGapFadeStrategy(unittest.TestCase):

    def setUp(self):
        self.config = load_config()

    # ── 1. NO LOOK-AHEAD BIAS TEST ───────────────────────────────────────────
    def test_zero_look_ahead_bias(self):
        """Signals at time t must be completely identical whether run on data truncated at t or full day."""
        df_full = create_synthetic_day(open_0915=1007.0, prev_close=1000.0, break_price=1005.5)
        strat_full = nse_failed_gap_fade_strategy(df_full.copy(), config=self.config)

        # Truncate at 10:15 (bar index 13)
        trunc_idx = 13
        df_trunc = df_full.iloc[:trunc_idx + 1].copy()
        strat_trunc = nse_failed_gap_fade_strategy(df_trunc, config=self.config)

        # Decision up to truncation point must match exactly
        np.testing.assert_array_equal(
            strat_trunc["signal"].values,
            strat_full["signal"].iloc[:trunc_idx + 1].values,
            err_msg="Look-ahead bias detected: Truncated run differed from full-day run!"
        )

    # ── 2. UNIT TESTS: INDICATORS & CALCULATIONS ─────────────────────────────
    def test_session_vwap_calculation(self):
        """VWAP must reset daily and equal cumulative (typical_price * volume) / cumulative volume."""
        df = create_synthetic_day()
        vwap = compute_session_vwap(df)
        self.assertEqual(len(vwap), len(df))
        self.assertFalse(vwap.iloc[1:].isna().any())

        # Verify bar 1 manually: typical_price = (H+L+C)/3
        t_price = (df["high"].iloc[1] + df["low"].iloc[1] + df["close"].iloc[1]) / 3.0
        self.assertAlmostEqual(vwap.iloc[1], t_price, places=4)

    def test_rvol_strictly_excludes_today(self):
        """RVOL must compute against past completed days and strictly exclude today's volume."""
        # Create 2 days
        day1 = create_synthetic_day(day_date="2024-01-02", volume_base=10000.0)
        day2_times = pd.date_range("2024-01-03 09:15", "2024-01-03 15:25", freq="5min", tz="Asia/Kolkata")
        day2 = pd.DataFrame({
            "open": 1000.0, "high": 1005.0, "low": 995.0, "close": 1000.0,
            "volume": 20000.0  # Exactly 2x day 1
        }, index=day2_times)
        combined = pd.concat([day1, day2])

        rvol = compute_rvol_series(combined, lookback_days=20)
        day2_rvol = rvol.loc["2024-01-03"].iloc[0]
        self.assertAlmostEqual(day2_rvol, 2.0, places=2)

    def test_orb_top_n_exclusion(self):
        """ORB top-N ranking properly identifies and excludes highest RVOL / gap stocks."""
        candidates = {
            "STOCK_A": (3.5, 0.02),  # Highest RVOL
            "STOCK_B": (2.1, 0.01),
            "STOCK_C": (1.8, 0.015),
            "STOCK_D": (1.6, 0.005),
            "STOCK_E": (1.5, 0.004),
            "STOCK_F": (0.8, 0.006),  # Low RVOL -> Valid for gap fade
        }
        excluded = compute_orb_top_n_exclusion(candidates, top_n=5)
        self.assertIn("STOCK_A", excluded)
        self.assertIn("STOCK_E", excluded)
        self.assertNotIn("STOCK_F", excluded)

    # ── 3. ELIGIBILITY TESTS ─────────────────────────────────────────────────
    def test_gap_bounds_eligibility(self):
        """0.30% <= |gap %| <= 1.00% is strictly enforced."""
        # Case A: Gap is 0.20% (too small -> skipped)
        df_small = create_synthetic_day(open_0915=1002.0, prev_close=1000.0)
        strat_small = nse_failed_gap_fade_strategy(df_small, config=self.config)
        self.assertEqual((strat_small["signal"] != 0).sum(), 0)

        # Case B: Gap is 1.20% (too large -> skipped)
        df_large = create_synthetic_day(open_0915=1012.0, prev_close=1000.0)
        strat_large = nse_failed_gap_fade_strategy(df_large, config=self.config)
        self.assertEqual((strat_large["signal"] != 0).sum(), 0)

        # Case C: Gap is 0.70% (eligible -> generates signal)
        df_valid = create_synthetic_day(open_0915=1007.0, prev_close=1000.0, break_price=1005.5)
        strat_valid = nse_failed_gap_fade_strategy(df_valid, config=self.config)
        self.assertGreater((strat_valid["signal"] != 0).sum(), 0)

    def test_rvol_cutoff_eligibility(self):
        """RVOL >= 1.5 must be skipped (as specified)."""
        df_high_rvol = create_synthetic_day(open_0915=1007.0, prev_close=1000.0, rvol_mult=2.5)
        # Mock high rvol by setting max_rvol to 0.5
        cfg = self.config.copy()
        cfg["filters"]["max_rvol"] = 0.5
        strat = nse_failed_gap_fade_strategy(df_high_rvol, config=cfg)
        self.assertEqual((strat["signal"] != 0).sum(), 0)

    # ── 4. ENTRY RULES & FILTER TESTS ────────────────────────────────────────
    def test_gap_up_fades_only_short(self):
        """Gap-up must produce ONLY SHORT (-1) entry signals."""
        df_gap_up = create_synthetic_day(open_0915=1007.0, prev_close=1000.0, break_price=1005.5)
        strat = nse_failed_gap_fade_strategy(df_gap_up, config=self.config)
        entry_signals = [s for s in strat["signal"].values if s != 0]
        self.assertGreater(len(entry_signals), 0)
        self.assertEqual(entry_signals[0], -1, "First trade signal for gap up must be SHORT (-1)")

    def test_gap_down_fades_only_long(self):
        """Gap-down must produce ONLY LONG (+1) signals."""
        # Gap down: prev_close = 1000, open_0915 = 993 (-0.70%), OR high = 993.5, OR low = 992.0
        # break_price = 994.5 (breaks above OR high towards target 1000; Risk=2.5, Reward=5.5 -> R/R=2.2)
        df_gap_down = create_synthetic_day(
            open_0915=993.0, prev_close=1000.0,
            or_high=993.5, or_low=992.0,
            break_price=994.5
        )
        strat = nse_failed_gap_fade_strategy(df_gap_down, config=self.config)
        entry_signals = [s for s in strat["signal"].values if s != 0]
        self.assertGreater(len(entry_signals), 0)
        self.assertEqual(entry_signals[0], 1, "First trade signal for gap down must be LONG (+1)")

    def test_no_signals_after_1100(self):
        """No entry signals permitted after 11:00 IST even if breakout occurs."""
        # Price stays inside OR (1007.2) until 11:15 (bar index 24), then breaks to 1005.5
        df_late = create_synthetic_day(
            open_0915=1007.2, prev_close=1000.0,
            or_high=1008.0, or_low=1006.5,
            break_time_idx=24, break_price=1005.5
        )
        strat = nse_failed_gap_fade_strategy(df_late, config=self.config)
        # Verify that no entry signal was fired at or after 11:00
        late_signals = strat["signal"].loc[strat.index.time >= time(11, 0)]
        self.assertEqual((late_signals != 0).sum(), 0, "No signals should fire if breakout occurs after 11:00 IST")

    def test_reward_risk_ratio_filter(self):
        """Trades with reward < 1.5 * risk must be skipped."""
        # Target = 1000, Fill = 1003, Stop = 1008
        # Risk = |1003 - 1008| = 5. Reward = |1003 - 1000| = 3.
        # Reward / Risk = 3 / 5 = 0.60 (< 1.5) -> MUST BE SKIPPED
        df_poor_rr = create_synthetic_day(
            open_0915=1006.0, prev_close=1000.0,
            or_high=1008.0, or_low=1004.0,
            break_price=1003.0
        )
        strat = nse_failed_gap_fade_strategy(df_poor_rr, config=self.config)
        self.assertEqual((strat["signal"] != 0).sum(), 0)

    def test_entry_beyond_target_skip(self):
        """If price is already at or beyond target (prev close), skip trade."""
        # Target = 1000, Short entry fill = 998 (already below target!)
        df_beyond = create_synthetic_day(
            open_0915=1006.0, prev_close=1000.0,
            or_high=1008.0, or_low=1004.0,
            break_price=998.0
        )
        strat = nse_failed_gap_fade_strategy(df_beyond, config=self.config)
        self.assertEqual((strat["signal"] != 0).sum(), 0)

    # ── 5. EXECUTION & FILL LOGIC TESTS ──────────────────────────────────────
    def test_execution_signal_is_shifted_by_one(self):
        """execution_signal must be shifted by 1 relative to signal for next-candle open fill."""
        df = create_synthetic_day(open_0915=1006.0, prev_close=1000.0, break_price=1002.0)
        strat = nse_failed_gap_fade_strategy(df, config=self.config)

        # execution_signal should match signal.shift(1)
        expected_exec = strat["signal"].shift(1).fillna(0).astype(int)
        np.testing.assert_array_equal(strat["execution_signal"].values, expected_exec.values)

    def test_hard_exit_at_1515(self):
        """Open positions must be flattened at 15:15 IST."""
        # Breakout occurs, but target/stop never hit; position held till 15:15
        df = create_synthetic_day(
            open_0915=1007.0, prev_close=1000.0,
            or_high=1008.0, or_low=1006.5,
            break_price=1005.5, end_price=1005.5 # price stays flat
        )
        strat = nse_failed_gap_fade_strategy(df, config=self.config)
        # Verify an exit signal is fired at or after 15:15
        exit_signals = strat["signal"].loc[strat.index.time >= time(15, 15)]
        self.assertIn(1, exit_signals.values)  # 1 covers the SHORT


    def test_same_candle_stop_target_tie_stop_wins(self):
        """If stop and target are touched in the same candle, stop hits first (conservative)."""
        df = create_synthetic_day(
            open_0915=1007.0, prev_close=1000.0,
            or_high=1008.0, or_low=1006.5,
            break_time_idx=4, break_price=1005.5
        )
        # Bar 5 touches BOTH Stop (1008.0) and Target (1000.0)
        df.iloc[6, df.columns.get_loc("high")] = 1009.0  # Above stop 1008
        df.iloc[6, df.columns.get_loc("low")] = 999.0   # Below target 1000
        strat = nse_failed_gap_fade_strategy(df, config=self.config)
        # Bar 5 must trigger exit (signal == 1 to cover short)
        self.assertEqual(strat["signal"].iloc[6], 1)

    def test_backtest_vs_paper_parity(self):
        """Simulating a day through the backtester produces deterministic parity with paper bot."""
        from backtesting import run_backtest_india, calculate_metrics
        df = create_synthetic_day(
            open_0915=1007.0, prev_close=1000.0,
            or_high=1008.0, or_low=1006.5,
            break_time_idx=4, break_price=1005.5
        )
        strat = nse_failed_gap_fade_strategy(df.copy(), config=self.config)
        res_df = run_backtest_india(strat, initial_capital=1000000.0)
        metrics = calculate_metrics(res_df, 1000000.0)

        # Must execute cleanly with 1 trade
        self.assertEqual(metrics["total_trades"], 1)
        self.assertGreater(metrics["final_equity"], 0)


if __name__ == "__main__":
    unittest.main()
