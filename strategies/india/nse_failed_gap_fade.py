"""
strategies/india/nse_failed_gap_fade.py
========================================
Intraday Failed-Gap Fade Strategy for NSE Cash Equities (MIS).
Designed to plug directly into backtesting.py and bot_india.py.

Strategy Rationale:
-------------------
Ordinary gaps (0.30% to 1.00%, without abnormal volume surge RVOL < 1.5) in liquid
large caps tend to retrace toward the prior session's close. We enter only AFTER the
gap move visibly fails (price breaks back through the opening range and session VWAP).
Target is the gap fill (previous close). The stop sits at the extreme of the failed move.

Rules:
------
1. Time Window (IST):
   - 09:15–09:30: Opening Range (OR) formation (bars 09:15, 09:20, 09:25).
   - 09:30–11:00: Active entry window (signal candle must complete between 09:30 and 11:00).
   - 11:00–15:15: Position management only. No new entries after 11:00.
   - 15:15      : Hard EOD cutoff — force liquidation of any open position.

2. Daily Eligibility at 09:30:
   - 0.30% <= |Gap %| <= 1.00% (inclusive)
   - RVOL < 1.5 (volume 09:15-09:30 vs 20-day historical average of same window, excluding today)
   - Stock is NOT in the ORB top-5-by-RVOL list for that day (configurable top-N)
   - Stock is not in any exclusion calendar (earnings, F&O ban, circuit limits)

3. Entry Signals:
   - GAP-UP FADE (SHORT): gap_pct > 0 AND candle close < OR low AND candle close < session VWAP
   - GAP-DOWN FADE (LONG): gap_pct < 0 AND candle close > OR high AND candle close > session VWAP
   - Evaluated at intended fill price (next candle open):
     - Stop = OR High (Short) or OR Low (Long)
     - Target = Previous Close (limit, requires 1 tick through)
     - Risk R = |entry - stop|, Reward = |entry - target|
     - SKIP if reward < 1.5 * R or if entry is already at or beyond target.
   - Max 1 trade per stock per day. No re-entries.

4. Exits & Conservative Execution:
   - Fixed Stop: OR High (Short) / OR Low (Long). Never widened, never moved.
   - Fixed Target: Previous close limit. Must trade through by at least 1 tick (default 0.05).
   - Same-candle Stop + Target tie-break: STOP hits first.
   - Gap-through Stop: Fills at candle open, not stop price.
   - Stops active immediately upon entry.
   - Hard exit at 15:15 IST.
   - NO trailing stop, NO breakeven ratchet.

5. Single Source of Truth:
   - Plugs into backtesting.py via @strategy decorator.
   - Plugs into bot_india.py via standard strategy interface.
"""

import os
import json
import logging
from datetime import datetime, date, time
from typing import Dict, List, Optional, Set, Tuple
import numpy as np
import pandas as pd

from strategies import strategy

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Configuration Loader & Defaults
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_CONFIG: Dict = {
    "strategy_name": "NSE Failed-Gap Fade",
    "version": "1.0.0",
    "market": "INDIA",
    "session": {
        "market_open": "09:15",
        "market_close": "15:30",
        "or_start": "09:15",
        "or_end": "09:30",
        "entry_start": "09:30",
        "entry_end": "11:00",
        "hard_exit": "15:15",
        "broker_auto_square_off": "15:20",
        "timezone": "Asia/Kolkata",
    },
    "filters": {
        "min_gap_pct": 0.0030,
        "max_gap_pct": 0.0100,
        "max_rvol": 1.5,
        "rvol_lookback_days": 20,
        "orb_top_n_exclusion": 5,
        "min_reward_risk_ratio": 1.5,
        "tick_size": 0.05,
        "tick_through_required": True,
    },
    "risk_management": {
        "risk_per_trade_pct": 0.0025,
        "max_leverage": 3.0,
        "max_concurrent_positions": 3,
        "daily_loss_limit_pct": 0.015,
        "max_trades_per_stock_per_day": 1,
    },
    "cost_model": {
        # TODO: VERIFY against your broker's charge calculator
        "slippage_bps": 3.0,
        "brokerage_rate": 0.0003,
        "brokerage_cap": 20.0,
        "stt_rate": 0.00025,
        "exchange_fee": 0.0000297,
        "sebi_fee": 0.000001,
        "stamp_duty": 0.00003,
        "gst_rate": 0.18,
    },
    "calendar_files": {
        "results_calendar": "data/calendars/results_calendar.csv",
        "fno_ban_calendar": "data/calendars/fno_ban_calendar.csv",
        "circuit_limit_calendar": "data/calendars/circuit_limit_calendar.csv",
        "nifty50_pit_constituents": "data/calendars/nifty50_pit.csv",
    },
}


def load_config(config_path: str = "config_failed_gap_fade.json") -> Dict:
    """Loads configuration from JSON file or falls back to default dictionary."""
    candidates = [
        config_path,
        os.path.join("configs", os.path.basename(config_path)),
        os.path.join(os.path.dirname(__file__), "..", "..", config_path),
        os.path.join(os.path.dirname(__file__), "..", "..", "configs", os.path.basename(config_path)),
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning("Failed to parse config file '%s': %s. Using defaults.", p, e)
    return DEFAULT_CONFIG.copy()


# ─────────────────────────────────────────────────────────────────────────────
# 2. Exclusion Calendars & Point-in-Time Universe
# ─────────────────────────────────────────────────────────────────────────────
_WARNED_FILES = set()

def check_calendar_exclusions(
    trade_date: date,
    symbol: str,
    config: Optional[Dict] = None
) -> Tuple[bool, str]:
    """
    Checks if a stock is on any exclusion calendar on trade_date.
    Returns (is_excluded, reason_string).
    Logs a loud warning once per session if calendar files are missing.
    """
    global _WARNED_FILES
    if config is None:
        config = DEFAULT_CONFIG

    calendar_files = config.get("calendar_files", {})
    categories = [
        ("results_calendar", "Earnings / Results Announcement"),
        ("fno_ban_calendar", "F&O Ban List"),
        ("circuit_limit_calendar", "Circuit Limit Hit"),
    ]

    clean_sym = symbol.replace(".NS", "").upper()

    for key, desc in categories:
        file_path = calendar_files.get(key, "")
        if not file_path or not os.path.exists(file_path):
            if file_path not in _WARNED_FILES:
                logger.warning("[WARNING: MISSING CALENDAR] %s file '%s' not found. Continuing without filter.", desc, file_path)
                _WARNED_FILES.add(file_path)
            continue

        try:
            cal_df = pd.read_csv(file_path)
            cal_df.columns = [c.strip().lower() for c in cal_df.columns]
            if "date" in cal_df.columns and "symbol" in cal_df.columns:
                cal_df["symbol"] = cal_df["symbol"].str.replace(".NS", "").str.upper()
                cal_df["date"] = pd.to_datetime(cal_df["date"]).dt.date
                match = cal_df[(cal_df["date"] == trade_date) & (cal_df["symbol"] == clean_sym)]
                if not match.empty:
                    return True, desc
        except Exception as e:
            logger.warning("Error reading calendar file '%s': %s", file_path, e)

    return False, ""


def check_pit_universe(
    trade_date: date,
    symbol: str,
    config: Optional[Dict] = None
) -> bool:
    """
    Checks if symbol was a constituent of Nifty 50 on trade_date.
    Logs a loud survivorship-bias warning once per session if point-in-time CSV is missing.
    """
    global _WARNED_FILES
    if config is None:
        config = DEFAULT_CONFIG

    file_path = config.get("calendar_files", {}).get("nifty50_pit_constituents", "")
    if not file_path or not os.path.exists(file_path):
        if file_path not in _WARNED_FILES:
            logger.warning(
                "[WARNING: SURVIVORSHIP BIAS] Point-in-time constituent CSV '%s' not found. "
                "Using static constituent list; results may exhibit survivorship bias.", file_path
            )
            _WARNED_FILES.add(file_path)
        return True

    try:
        pit_df = pd.read_csv(file_path)
        pit_df.columns = [c.strip().lower() for c in pit_df.columns]
        clean_sym = symbol.replace(".NS", "").upper()
        pit_df["symbol"] = pit_df["symbol"].str.replace(".NS", "").str.upper()
        pit_df["date"] = pd.to_datetime(pit_df["date"]).dt.date
        match = pit_df[(pit_df["date"] == trade_date) & (pit_df["symbol"] == clean_sym)]
        return not match.empty
    except Exception as e:
        logger.warning("Failed to check PIT constituents: %s", e)
        return True


# ─────────────────────────────────────────────────────────────────────────────
# 3. Indicator & Metric Calculations
# ─────────────────────────────────────────────────────────────────────────────
def compute_session_vwap(df: pd.DataFrame) -> pd.Series:
    """
    Computes intraday Session VWAP resetting at each day's 09:15 start.
    VWAP = cumsum(typical_price * volume) / cumsum(volume)
    typical_price = (high + low + close) / 3.0
    Uses only data available up to each bar's close.
    """
    typical_price = (df["high"] + df["low"] + df["close"]) / 3.0
    pv = typical_price * df["volume"]
    dates = df.index.date

    cum_pv = pv.groupby(dates).cumsum()
    cum_vol = df["volume"].groupby(dates).cumsum()

    vwap = cum_pv / cum_vol.replace(0, np.nan)
    return vwap


def compute_rvol_series(
    df: pd.DataFrame,
    lookback_days: int = 20,
    or_start: time = time(9, 15),
    or_end: time = time(9, 30)
) -> pd.Series:
    """
    Computes RVOL = (today's 09:15-09:30 volume) / (avg of 09:15-09:30 volume over previous 20 trading days).
    Strictly EXCLUDES today's volume from the historical 20-day baseline average.
    Returns a Series aligned with df index where each bar of day t has that day's RVOL.
    """
    times = df.index.time
    dates = df.index.date
    unique_dates = sorted(list(set(dates)))

    or_mask = (times >= or_start) & (times < or_end)
    daily_or_vols: Dict[date, float] = {}

    for d in unique_dates:
        mask = (dates == d) & or_mask
        vol = float(df.loc[mask, "volume"].sum())
        daily_or_vols[d] = vol

    rvol_per_day: Dict[date, float] = {}
    for idx, d in enumerate(unique_dates):
        if idx == 0:
            rvol_per_day[d] = 1.0  # Baseline fallback for first day
            continue
        # Take up to lookback_days completed trading days EXCLUDING today
        start_idx = max(0, idx - lookback_days)
        past_dates = unique_dates[start_idx:idx]
        past_vols = [daily_or_vols[pd_date] for pd_date in past_dates if daily_or_vols[pd_date] > 0]
        if past_vols:
            avg_past = sum(past_vols) / len(past_vols)
            rvol_per_day[d] = daily_or_vols[d] / avg_past if avg_past > 0 else 1.0
        else:
            rvol_per_day[d] = 1.0

    return pd.Series([rvol_per_day.get(d, 1.0) for d in dates], index=df.index)


def compute_orb_top_n_exclusion(
    candidate_metrics: Dict[str, Tuple[float, float]],
    top_n: int = 5
) -> Set[str]:
    """
    Identifies the top-N stocks by RVOL (descending), tie-breaking by |gap %| (descending).
    candidate_metrics maps symbol -> (rvol, abs_gap_pct).
    Returns a set of excluded symbols.
    """
    sorted_stocks = sorted(
        candidate_metrics.keys(),
        key=lambda s: (candidate_metrics[s][0], candidate_metrics[s][1]),
        reverse=True
    )
    return set(sorted_stocks[:top_n])


# ─────────────────────────────────────────────────────────────────────────────
# 4. Pure Deterministic Strategy Engine (Plug-and-play)
# ─────────────────────────────────────────────────────────────────────────────
@strategy(
    name="NSE Failed-Gap Fade",
    description="Intraday Failed-Gap Fade strategy for NSE MIS cash equities. Fades 0.30%-1.00% gaps "
                "with RVOL < 1.5 breaking OR and VWAP toward prior close, with 1.5R minimum reward/risk, "
                "fixed stop, and 15:15 hard exit.",
    market="INDIA"
)
def nse_failed_gap_fade_strategy(
    df: pd.DataFrame,
    config: Optional[Dict] = None,
    orb_excluded_symbols: Optional[Set[str]] = None,
    symbol: str = "RELIANCE.NS",
    **kwargs
) -> pd.DataFrame:
    """
    Pure deterministic signal engine for the Failed-Gap Fade strategy.
    Called identically by both the backtester and paper bot.

    Parameters
    ----------
    df : pd.DataFrame
        5-minute OHLCV bars with Asia/Kolkata timezone DatetimeIndex.
    config : dict, optional
        Loaded configuration dictionary. If None, loads from config file/defaults.
    orb_excluded_symbols : set, optional
        Set of symbols excluded due to being in the ORB top-5 list for the day.
    symbol : str, optional
        Current stock symbol being evaluated (for calendar exclusions).

    Returns
    -------
    pd.DataFrame
        Augmented DataFrame with 'vwap', 'rvol', 'signal', and 'execution_signal'.
    """
    if config is None:
        config = load_config()

    df = df.copy()

    # Timezone normalization to IST (Asia/Kolkata)
    if df.index.tz is None:
        df.index = df.index.tz_localize("Asia/Kolkata")
    elif str(df.index.tz) != "Asia/Kolkata":
        df.index = df.index.tz_convert("Asia/Kolkata")

    # Filter & configuration parameters
    filters = config.get("filters", {})
    min_gap_pct = float(filters.get("min_gap_pct", 0.0030))
    max_gap_pct = float(filters.get("max_gap_pct", 0.0100))
    max_rvol = float(filters.get("max_rvol", 1.5))
    min_rr = float(filters.get("min_reward_risk_ratio", 1.5))
    tick_size = float(filters.get("tick_size", 0.05))
    rvol_lookback = int(filters.get("rvol_lookback_days", 20))

    # Compute VWAP and RVOL
    df["vwap"] = compute_session_vwap(df)
    df["rvol"] = compute_rvol_series(df, lookback_days=rvol_lookback)

    n = len(df)
    signal_arr = np.zeros(n, dtype=np.int32)
    stop_arr = np.zeros(n, dtype=np.float64)
    target_arr = np.zeros(n, dtype=np.float64)

    opens = df["open"].values.astype(np.float64)
    highs = df["high"].values.astype(np.float64)
    lows = df["low"].values.astype(np.float64)
    closes = df["close"].values.astype(np.float64)
    vwaps = df["vwap"].values.astype(np.float64)
    rvols = df["rvol"].values.astype(np.float64)
    timestamps = df.index

    dates_arr = np.array([t.date() for t in timestamps])
    times_arr = np.array([t.time() for t in timestamps])

    t_0915 = time(9, 15)
    t_0930 = time(9, 30)
    t_1100 = time(11, 0)
    t_1515 = time(15, 15)

    current_date = None
    prev_day_close = None
    opening_high = None
    opening_low = None
    gap_pct = 0.0
    day_eligible = False
    trades_today = 0

    in_pos = False
    side = ""             # "SHORT" (fade gap up) or "LONG" (fade gap down)
    entry_fill = 0.0
    fixed_stop = 0.0
    target_price = 0.0
    entry_candle_idx = -1

    for i in range(n):
        bar_date = dates_arr[i]
        bar_time = times_arr[i]
        bar_open = opens[i]
        bar_high = highs[i]
        bar_low = lows[i]
        bar_close = closes[i]
        bar_vwap = vwaps[i]
        bar_rvol = rvols[i]

        # ── Day Boundary Reset ───────────────────────────────────────────
        if bar_date != current_date:
            # Flatten any leftover position at day boundary
            if in_pos:
                signal_arr[i] = -1 if side == "LONG" else 1
                in_pos = False

            if current_date is not None:
                prev_mask = (dates_arr == current_date)
                if np.any(prev_mask):
                    prev_day_close = closes[np.where(prev_mask)[0][-1]]

            current_date = bar_date
            opening_high = None
            opening_low = None
            gap_pct = 0.0
            day_eligible = False
            trades_today = 0

            in_pos = False
            side = ""
            entry_fill = 0.0
            fixed_stop = 0.0
            target_price = 0.0
            entry_candle_idx = -1

        # ── Opening Range Formation (09:15 up to 09:30) ──────────────────
        if t_0915 <= bar_time < t_0930:
            if opening_high is None or bar_high > opening_high:
                opening_high = bar_high
            if opening_low is None or bar_low < opening_low:
                opening_low = bar_low

            if bar_time == t_0915 and prev_day_close is not None and prev_day_close > 0:
                gap_pct = (bar_open - prev_day_close) / prev_day_close
            continue

        # ── 09:30 Eligibility Gate ───────────────────────────────────────
        if bar_time == t_0930 and not day_eligible and trades_today == 0:
            abs_gap = abs(gap_pct)

            # Rule 1: 0.30% <= |gap %| <= 1.00%
            gap_ok = (min_gap_pct <= abs_gap <= max_gap_pct)

            # Rule 2: RVOL < 1.5
            rvol_ok = (bar_rvol < max_rvol)

            # Rule 3: NOT in ORB top-5 exclusion list
            orb_excluded = (orb_excluded_symbols is not None and symbol in orb_excluded_symbols)

            # Rule 4: NOT in exclusion calendar
            is_excluded_cal, _ = check_calendar_exclusions(bar_date, symbol, config)

            # Rule 5: PIT universe constituent validation
            pit_ok = check_pit_universe(bar_date, symbol, config)

            if gap_ok and rvol_ok and (not orb_excluded) and (not is_excluded_cal) and pit_ok and (opening_high is not None) and (opening_low is not None):
                day_eligible = True
            else:
                day_eligible = False

        # ── In-Position Exit Evaluation ──────────────────────────────────
        if in_pos:
            # 1. Hard Exit at 15:15 IST
            if bar_time >= t_1515:
                signal_arr[i] = -1 if side == "LONG" else 1
                in_pos = False
                continue

            # 2. Stop and Target Exit Evaluation
            # Stops and targets active from candle after entry; if entry candle itself breaches stop, exit at stop
            if side == "LONG":
                gap_through_stop = (bar_open < fixed_stop)
                stop_touched = (bar_low <= fixed_stop) or gap_through_stop
                # Target: previous close limit, must trade through by at least 1 tick
                target_touched = (bar_high >= target_price + tick_size)

                # Conservative tie-break: if both touched in same candle -> STOP WINS
                if stop_touched or (stop_touched and target_touched):
                    signal_arr[i] = -1
                    in_pos = False
                    continue
                elif target_touched:
                    signal_arr[i] = -1
                    in_pos = False
                    continue

            elif side == "SHORT":
                gap_through_stop = (bar_open > fixed_stop)
                stop_touched = (bar_high >= fixed_stop) or gap_through_stop
                # Target: previous close limit, must trade through by at least 1 tick
                target_touched = (bar_low <= target_price - tick_size)

                # Conservative tie-break: if both touched -> STOP WINS
                if stop_touched or (stop_touched and target_touched):
                    signal_arr[i] = 1
                    in_pos = False
                    continue
                elif target_touched:
                    signal_arr[i] = 1
                    in_pos = False
                    continue

        # ── Entry Evaluation (Completed 5-min candles between 09:30 and 11:00) ──
        if not in_pos and day_eligible and trades_today == 0:
            # Signal candle must complete by 11:00 (bars starting 09:30 through 10:55)
            if t_0930 <= bar_time < t_1100 and opening_high is not None and opening_low is not None and prev_day_close is not None:
                # Intended fill is at the next candle's open; we evaluate planned entry at bar_close
                fill_est = bar_close

                # GAP-UP FADE (SHORT): gap > 0, close < OR low, close < session VWAP
                if gap_pct > 0 and bar_close < opening_low and bar_close < bar_vwap:
                    stop_candidate = opening_high
                    target_candidate = prev_day_close

                    risk_r = abs(fill_est - stop_candidate)
                    reward_r = abs(fill_est - target_candidate)

                    # Filters: reward >= 1.5 * R AND fill has not already reached/passed target
                    if fill_est > target_candidate and risk_r > 0 and (reward_r >= min_rr * risk_r):
                        signal_arr[i] = -1  # SELL signal (short entry)
                        in_pos = True
                        trades_today = 1
                        side = "SHORT"
                        entry_fill = fill_est
                        fixed_stop = stop_candidate
                        target_price = target_candidate
                        entry_candle_idx = i

                # GAP-DOWN FADE (LONG): gap < 0, close > OR high, close > session VWAP
                elif gap_pct < 0 and bar_close > opening_high and bar_close > bar_vwap:
                    stop_candidate = opening_low
                    target_candidate = prev_day_close

                    risk_r = abs(fill_est - stop_candidate)
                    reward_r = abs(fill_est - target_candidate)

                    # Filters: reward >= 1.5 * R AND fill has not already reached/passed target
                    if fill_est < target_candidate and risk_r > 0 and (reward_r >= min_rr * risk_r):
                        signal_arr[i] = 1   # BUY signal (long entry)
                        in_pos = True
                        trades_today = 1
                        side = "LONG"
                        entry_fill = fill_est
                        fixed_stop = stop_candidate
                        target_price = target_candidate
                        entry_candle_idx = i

        if in_pos:
            stop_arr[i] = fixed_stop
            target_arr[i] = target_price

    df["signal"] = signal_arr
    df["stop_loss"] = pd.Series(stop_arr, index=df.index).shift(1).fillna(0.0)
    df["target_price"] = pd.Series(target_arr, index=df.index).shift(1).fillna(0.0)
    # Shift by 1 row so orders execute at the OPEN of the NEXT candle (Zero Look-Ahead Bias)
    df["execution_signal"] = df["signal"].shift(1).fillna(0).astype(int)

    return df

