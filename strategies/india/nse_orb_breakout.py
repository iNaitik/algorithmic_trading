"""
strategies/india/nse_orb_breakout.py
====================================
Intraday Opening Range Breakout (ORB) Strategy for NSE Cash Equities (MIS).
Designed specifically to plug directly into backtesting.py and bot_india.py.

Rules:
------
1. Time Window (IST):
   - 09:15–09:30: Opening Range (OR) formation (bars 09:15, 09:20, 09:25).
   - 09:30–11:30: Active entry breakout window (signal candle must complete by 11:30).
   - 11:30–15:15: Position management only. No new entries after 11:30.
   - 15:15      : Hard EOD cutoff — force liquidation of any open position.

2. Daily Calculations:
   - OR High / Low: Highest high and lowest low of 09:15–09:30 bars. Available at 09:30.
   - Gap % = (today's 09:15 open - previous day's close) / previous day's close.
   - Range Filter: Skip day if OR width < 0.25% of OR midpoint.
   - Session VWAP: Cumulative sum(typical_price * volume) / cumulative volume from 09:15.
     typical_price = (high + low + close) / 3.0.

3. Entry (Evaluated on completed 5-min candles between 09:30 and 11:30):
   - LONG : candle close > OR high AND candle close > session VWAP AND gap % >= 0
   - SHORT: candle close < OR low  AND candle close < session VWAP AND gap % <= 0
   - Max 1 trade per day.

4. Stop, Target & Trailing:
   - Initial Stop : Opposite side of OR (LONG: OR low; SHORT: OR high). Risk R = |entry - stop|.
   - Target       : Fixed 2R limit.
   - Breakeven    : Once price reaches +1R in favor, move stop to breakeven (entry price)
                    effective from the next candle.
   - Trailing     : After breakeven is active, trail stop to the previous completed candle's
                    low (for LONG) or high (for SHORT). Stop only ratchets in favorable direction.
   - Conservative Fills: If stop and target touched in same candle, stop hits first.
     If candle gaps through stop, fill at open.

5. Look-Ahead Bias Prevention:
   - Signals are shifted by 1 bar into 'execution_signal' so orders execute at the OPEN of
     the NEXT candle.

Plugs into:
- backtesting.py (Auto-discovered via @strategy decorator)
- bot_india.py   (Import nse_orb_breakout_strategy directly)
"""

import math
from datetime import datetime, date, time
from typing import Optional
import pandas as pd
import numpy as np

from strategies import strategy


# ─────────────────────────────────────────────────────────────────────────────
# 1. Indicator Calculations
# ─────────────────────────────────────────────────────────────────────────────
def compute_session_vwap(df: pd.DataFrame) -> pd.Series:
    """
    Computes intraday VWAP that resets at every unique calendar date.
    VWAP = cumsum(typical_price * volume) / cumsum(volume)
    typical_price = (high + low + close) / 3.0
    """
    typical_price = (df["high"] + df["low"] + df["close"]) / 3.0
    price_volume = typical_price * df["volume"]
    dates = df.index.date

    cum_pv = price_volume.groupby(dates).cumsum()
    cum_vol = df["volume"].groupby(dates).cumsum()

    vwap = cum_pv / cum_vol.replace(0, np.nan)
    return vwap


# ─────────────────────────────────────────────────────────────────────────────
# 2. Main Strategy Function (Plug-and-play)
# ─────────────────────────────────────────────────────────────────────────────
@strategy(
    name="NSE Intraday ORB Breakout",
    description="15-min Opening Range Breakout (09:15-09:30) with VWAP & Gap confirmation, "
                "2R fixed target, +1R breakeven ratchet, trailing stop, and 15:15 hard exit for NSE MIS cash equities.",
    market="INDIA"
)
def nse_orb_breakout_strategy(
    df: pd.DataFrame,
    or_min_width_pct: float = 0.0025,
    target_r_multiple: float = 2.0,
    breakeven_r_multiple: float = 1.0,
    **kwargs
) -> pd.DataFrame:
    """
    Generates deterministic BUY/SELL signals for the Opening Range Breakout strategy.
    Accepts 5-minute OHLCV DataFrame with IST DatetimeIndex.
    Returns DataFrame augmented with 'vwap', 'signal', and 'execution_signal'.
    """
    df = df.copy()

    # Ensure IST timezone
    if df.index.tz is None:
        df.index = df.index.tz_localize("Asia/Kolkata")
    elif str(df.index.tz) != "Asia/Kolkata":
        df.index = df.index.tz_convert("Asia/Kolkata")

    # Compute Session VWAP
    df["vwap"] = compute_session_vwap(df)

    n = len(df)
    signal_arr = np.zeros(n, dtype=np.int32)
    stop_arr = np.zeros(n, dtype=np.float64)
    target_arr = np.zeros(n, dtype=np.float64)

    opens = df["open"].values.astype(np.float64)
    highs = df["high"].values.astype(np.float64)
    lows = df["low"].values.astype(np.float64)
    closes = df["close"].values.astype(np.float64)
    vwaps = df["vwap"].values.astype(np.float64)
    timestamps = df.index

    dates_arr = np.array([t.date() for t in timestamps])
    times_arr = np.array([t.time() for t in timestamps])

    # Time boundaries (IST)
    t_0915 = time(9, 15)
    t_0930 = time(9, 30)
    t_1130 = time(11, 30)
    t_1515 = time(15, 15)

    # State variables
    current_date = None
    prev_day_close = None
    opening_high = None
    opening_low = None
    gap_pct = 0.0
    day_eligible = True
    trades_today = 0

    in_pos = False
    side = ""             # "LONG" or "SHORT"
    entry_fill = 0.0
    active_stop = 0.0
    next_stop = 0.0
    target = 0.0
    r_per_share = 0.0
    breakeven_active = False

    for i in range(n):
        bar_date = dates_arr[i]
        bar_time = times_arr[i]
        bar_open = opens[i]
        bar_high = highs[i]
        bar_low = lows[i]
        bar_close = closes[i]
        bar_vwap = vwaps[i]

        # ── Day Boundary Reset ───────────────────────────────────────────
        if bar_date != current_date:
            # Force exit any leftover position carried overnight
            if in_pos:
                signal_arr[i] = -1 if side == "LONG" else 1
                in_pos = False

            # Update previous day's close for gap calculation
            if current_date is not None:
                prev_mask = (dates_arr == current_date)
                if np.any(prev_mask):
                    prev_day_close = closes[np.where(prev_mask)[0][-1]]

            current_date = bar_date
            opening_high = None
            opening_low = None
            gap_pct = 0.0
            day_eligible = True
            trades_today = 0

            in_pos = False
            side = ""
            entry_fill = 0.0
            active_stop = 0.0
            next_stop = 0.0
            target = 0.0
            r_per_share = 0.0
            breakeven_active = False

        if not day_eligible:
            continue

        # ── Opening Range Formation (09:15 to 09:30) ─────────────────────
        # Bars starting at 09:15, 09:20, 09:25
        if t_0915 <= bar_time < t_0930:
            if opening_high is None or bar_high > opening_high:
                opening_high = bar_high
            if opening_low is None or bar_low < opening_low:
                opening_low = bar_low

            # Compute Gap % at the first bar of the day (09:15 open)
            if bar_time == t_0915 and prev_day_close is not None and prev_day_close > 0:
                gap_pct = (bar_open - prev_day_close) / prev_day_close
            continue

        # At 09:30 bar, validate the Opening Range width filter
        if bar_time == t_0930:
            if opening_high is None or opening_low is None or opening_low <= 0:
                day_eligible = False
                continue
            or_width = opening_high - opening_low
            or_midpoint = (opening_high + opening_low) / 2.0
            if or_midpoint > 0 and (or_width / or_midpoint) < or_min_width_pct:
                day_eligible = False
                continue

        # ── In-Position Exit Evaluation ──────────────────────────────────
        if in_pos:
            # 1. Hard Exit at 15:15 IST
            if bar_time >= t_1515:
                signal_arr[i] = -1 if side == "LONG" else 1
                in_pos = False
                continue

            # 2. Check Stop and Target Fills
            if side == "LONG":
                gap_through_stop = (bar_open < active_stop)
                stop_touched = (bar_low <= active_stop) or gap_through_stop
                target_touched = (bar_high >= target)

                # Conservative rule: if both stop and target touched in same candle -> STOP WINS
                if stop_touched or (stop_touched and target_touched):
                    signal_arr[i] = -1
                    in_pos = False
                    continue
                elif target_touched:
                    signal_arr[i] = -1
                    in_pos = False
                    continue

                # Trailing Stop & Breakeven updates (takes effect on NEXT candle)
                new_stop = active_stop
                new_be = breakeven_active

                # Move stop to breakeven once price reaches +1R in favor
                if not new_be and bar_high >= (entry_fill + breakeven_r_multiple * r_per_share):
                    new_be = True
                    new_stop = max(new_stop, entry_fill)

                # Trail with previous completed candle's low once breakeven is reached
                if new_be:
                    new_stop = max(new_stop, bar_low, entry_fill)

                breakeven_active = new_be
                active_stop = new_stop
                next_stop = new_stop

            elif side == "SHORT":
                gap_through_stop = (bar_open > active_stop)
                stop_touched = (bar_high >= active_stop) or gap_through_stop
                target_touched = (bar_low <= target)

                # Conservative rule: if both touched -> STOP WINS
                if stop_touched or (stop_touched and target_touched):
                    signal_arr[i] = 1
                    in_pos = False
                    continue
                elif target_touched:
                    signal_arr[i] = 1
                    in_pos = False
                    continue

                # Trailing Stop & Breakeven updates (takes effect on NEXT candle)
                new_stop = active_stop
                new_be = breakeven_active

                if not new_be and bar_low <= (entry_fill - breakeven_r_multiple * r_per_share):
                    new_be = True
                    new_stop = min(new_stop, entry_fill)

                if new_be:
                    new_stop = min(new_stop, bar_high, entry_fill)

                breakeven_active = new_be
                active_stop = new_stop
                next_stop = new_stop

        # ── Entry Signal Generation (09:30 to 11:30) ────────────────────
        if not in_pos and trades_today == 0:
            # Signal candle must complete by 11:30 (candles starting 09:30 to 11:25)
            if t_0930 <= bar_time < t_1130 and opening_high is not None and not np.isnan(bar_vwap):
                # LONG: close > OR high AND close > VWAP AND gap % >= 0
                if bar_close > opening_high and bar_close > bar_vwap and gap_pct >= 0:
                    signal_arr[i] = 1
                    in_pos = True
                    trades_today = 1
                    side = "LONG"
                    entry_fill = bar_close
                    active_stop = opening_low
                    next_stop = opening_low
                    r_per_share = abs(entry_fill - active_stop)
                    target = entry_fill + (target_r_multiple * r_per_share)
                    breakeven_active = False

                # SHORT: close < OR low AND close < VWAP AND gap % <= 0
                elif bar_close < opening_low and bar_close < bar_vwap and gap_pct <= 0:
                    signal_arr[i] = -1
                    in_pos = True
                    trades_today = 1
                    side = "SHORT"
                    entry_fill = bar_close
                    active_stop = opening_high
                    next_stop = opening_high
                    r_per_share = abs(entry_fill - active_stop)
                    target = entry_fill - (target_r_multiple * r_per_share)
                    breakeven_active = False

        if in_pos:
            stop_arr[i] = active_stop
            target_arr[i] = target

    df["signal"] = signal_arr
    df["stop_loss"] = pd.Series(stop_arr, index=df.index).shift(1).fillna(0.0)
    df["target_price"] = pd.Series(target_arr, index=df.index).shift(1).fillna(0.0)
    # Shift by 1 row to execute at the OPEN of the NEXT candle (prevent look-ahead bias)
    df["execution_signal"] = df["signal"].shift(1).fillna(0).astype(int)

    return df

