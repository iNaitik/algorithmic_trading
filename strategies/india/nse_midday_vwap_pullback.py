"""
strategies/india/nse_midday_vwap_pullback.py
============================================
Intraday Trend Continuation & Pullback Strategy for NSE Cash Equities (MIS).
Specifically designed for trading during the mid-day and European-crossover session
(11:30 AM to 14:45 PM IST), when morning ORB and Gap-Fade setups have concluded.

Features:
---------
1. Time Window (IST):
   - 11:30 to 14:45 IST: Active entry window (captures European open momentum & midday trends).
   - 14:45 to 15:15 IST: Trade management only (no new entries allowed).
   - 15:15 IST         : Mandatory MIS Hard Exit (forces complete square-off before 15:30 close).

2. Multi-Timeframe Compatibility:
   - Optimized for lower timeframes: 1m, 2m, 3m, 5m bars from yfinance.

3. Technical Setup:
   - Session VWAP: Benchmark intraday trend filter (Price > VWAP = Bullish, Price < VWAP = Bearish).
   - EMA Ribbon (9 EMA & 21 EMA): Confirms directional momentum and acts as dynamic support/resistance.
   - RSI (14): Momentum oscillator confirmation (avoids overbought/oversold traps).

4. Entry Logic:
   - LONG (BUY):
     * Session time between 11:30 and 14:45 IST.
     * Close > Session VWAP.
     * EMA(9) > EMA(21) (Bullish trend alignment).
     * Pullback: Bar Low <= EMA(9), but Bar Close > EMA(9) (Confirmed bullish rejection).
     * 50 <= RSI <= 70 (Healthy upward momentum).
   - SHORT (SELL):
     * Session time between 11:30 and 14:45 IST.
     * Close < Session VWAP.
     * EMA(9) < EMA(21) (Bearish trend alignment).
     * Pullback: Bar High >= EMA(9), but Bar Close < EMA(9) (Confirmed bearish rejection).
     * 30 <= RSI <= 50 (Healthy downward momentum).

5. Risk Management & Exits:
   - Stop Loss: Dynamic placement at EMA(21) or recent swing extreme (R = |Entry - Stop|).
   - Target: Fixed 1.5R to 2.0R limit order.
   - Time-based Exit: 15:15 IST hard square-off.
   - Zero Look-Ahead Bias: Signals on candle t execute at the Open of candle t+1.
"""

from datetime import datetime, time
from typing import Optional
import numpy as np
import pandas as pd

from strategies import strategy


# ─────────────────────────────────────────────────────────────────────────────
# 1. Technical Indicators
# ─────────────────────────────────────────────────────────────────────────────
def compute_session_vwap(df: pd.DataFrame) -> pd.Series:
    """
    Computes intraday Session VWAP resetting at each day's 09:15 session open.
    VWAP = cumsum(typical_price * volume) / cumsum(volume)
    typical_price = (high + low + close) / 3.0
    """
    typical_price = (df["high"] + df["low"] + df["close"]) / 3.0
    price_volume = typical_price * df["volume"]
    dates = df.index.date

    cum_pv = price_volume.groupby(dates).cumsum()
    cum_vol = df["volume"].groupby(dates).cumsum()

    vwap = cum_pv / cum_vol.replace(0, np.nan)
    # If volume is 0 or NaN, fallback to close
    return vwap.fillna(df["close"])


def compute_ema(series: pd.Series, span: int) -> pd.Series:
    """Computes Exponential Moving Average."""
    return series.ewm(span=span, adjust=False).mean()


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Computes Relative Strength Index (RSI)."""
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)

    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi.fillna(50.0)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Main Strategy Implementation (Plug-and-play)
# ─────────────────────────────────────────────────────────────────────────────
@strategy(
    name="NSE Midday VWAP Pullback",
    description="Intraday Trend Continuation & Pullback strategy for the 11:30-14:45 IST session. "
                "Trades VWAP + 9/21 EMA pullbacks with RSI confirmation, 1.5R target, and 15:15 hard exit. "
                "Supports 1m, 2m, and 5m timeframes.",
    market="INDIA"
)
def nse_midday_vwap_pullback_strategy(
    df: pd.DataFrame,
    ema_fast_span: int = 9,
    ema_slow_span: int = 21,
    rsi_period: int = 14,
    target_r_multiple: float = 1.5,
    min_stop_distance_pct: float = 0.002,  # 0.20% minimum stop distance
    **kwargs
) -> pd.DataFrame:
    """
    Evaluates intraday data and generates execution signals.
    Accepts 1m, 2m, or 5m OHLCV DataFrame with DatetimeIndex.
    Returns DataFrame augmented with 'signal', 'stop_loss', 'target_price', and 'execution_signal'.
    """
    df = df.copy()

    # Timezone normalization to IST
    if df.index.tz is None:
        df.index = df.index.tz_localize("Asia/Kolkata")
    elif str(df.index.tz) != "Asia/Kolkata":
        df.index = df.index.tz_convert("Asia/Kolkata")

    # Indicator Calculations
    df["vwap"] = compute_session_vwap(df)
    df["ema_fast"] = compute_ema(df["close"], span=ema_fast_span)
    df["ema_slow"] = compute_ema(df["close"], span=ema_slow_span)
    df["rsi"] = compute_rsi(df["close"], period=rsi_period)

    n = len(df)
    signal_arr = np.zeros(n, dtype=np.int32)
    stop_arr = np.zeros(n, dtype=np.float64)
    target_arr = np.zeros(n, dtype=np.float64)

    opens = df["open"].values.astype(np.float64)
    highs = df["high"].values.astype(np.float64)
    lows = df["low"].values.astype(np.float64)
    closes = df["close"].values.astype(np.float64)
    vwaps = df["vwap"].values.astype(np.float64)
    ema_f = df["ema_fast"].values.astype(np.float64)
    ema_s = df["ema_slow"].values.astype(np.float64)
    rsis = df["rsi"].values.astype(np.float64)

    timestamps = df.index
    dates_arr = np.array([t.date() for t in timestamps])
    times_arr = np.array([t.time() for t in timestamps])

    t_1130 = time(11, 30)
    t_1445 = time(14, 45)
    t_1515 = time(15, 15)

    current_date = None
    in_pos = False
    side = ""
    active_stop = 0.0
    active_target = 0.0
    trades_today = 0

    for i in range(n):
        bar_date = dates_arr[i]
        bar_time = times_arr[i]
        bar_open = opens[i]
        bar_high = highs[i]
        bar_low = lows[i]
        bar_close = closes[i]
        bar_vwap = vwaps[i]
        bar_ef = ema_f[i]
        bar_es = ema_s[i]
        bar_rsi = rsis[i]

        # Day Boundary Reset
        if bar_date != current_date:
            if in_pos:
                signal_arr[i] = -1 if side == "LONG" else 1
                in_pos = False
            current_date = bar_date
            in_pos = False
            side = ""
            active_stop = 0.0
            active_target = 0.0
            trades_today = 0

        # In-Position Exit Checks
        if in_pos:
            # 1. Hard Exit at 15:15 IST
            if bar_time >= t_1515:
                signal_arr[i] = -1 if side == "LONG" else 1
                in_pos = False
                continue

            # 2. Stop and Target Hit Evaluations
            if side == "LONG":
                stop_hit = (bar_low <= active_stop) or (bar_open < active_stop)
                target_hit = (bar_high >= active_target)
                if stop_hit or (stop_hit and target_hit):
                    signal_arr[i] = -1
                    in_pos = False
                    continue
                elif target_hit:
                    signal_arr[i] = -1
                    in_pos = False
                    continue

            elif side == "SHORT":
                stop_hit = (bar_high >= active_stop) or (bar_open > active_stop)
                target_hit = (bar_low <= active_target)
                if stop_hit or (stop_hit and target_hit):
                    signal_arr[i] = 1
                    in_pos = False
                    continue
                elif target_hit:
                    signal_arr[i] = 1
                    in_pos = False
                    continue

        # Active Entry Signal Generation (11:30 to 14:45 IST)
        if not in_pos and (t_1130 <= bar_time < t_1445):
            # Check LONG Setup:
            # 1. Price > VWAP
            # 2. 9 EMA > 21 EMA (Uptrend)
            # 3. Pullback to 9 EMA: bar_low <= 9 EMA, but bar_close > 9 EMA
            # 4. RSI between 50 and 72
            if bar_close > bar_vwap and bar_ef > bar_es and (bar_low <= bar_ef and bar_close > bar_ef) and (50.0 <= bar_rsi <= 72.0):
                # Calculate Stop: Below 21 EMA with minimum buffer
                stop_candidate = min(bar_es, bar_low)
                min_stop = bar_close * (1.0 - min_stop_distance_pct)
                stop_candidate = min(stop_candidate, min_stop)
                
                risk_r = bar_close - stop_candidate
                if risk_r > 0:
                    signal_arr[i] = 1  # BUY (LONG)
                    in_pos = True
                    side = "LONG"
                    active_stop = stop_candidate
                    active_target = bar_close + (target_r_multiple * risk_r)
                    trades_today += 1

            # Check SHORT Setup:
            # 1. Price < VWAP
            # 2. 9 EMA < 21 EMA (Downtrend)
            # 3. Pullback to 9 EMA: bar_high >= 9 EMA, but bar_close < 9 EMA
            # 4. RSI between 28 and 50
            elif bar_close < bar_vwap and bar_ef < bar_es and (bar_high >= bar_ef and bar_close < bar_ef) and (28.0 <= bar_rsi <= 50.0):
                # Calculate Stop: Above 21 EMA with minimum buffer
                stop_candidate = max(bar_es, bar_high)
                min_stop = bar_close * (1.0 + min_stop_distance_pct)
                stop_candidate = max(stop_candidate, min_stop)

                risk_r = stop_candidate - bar_close
                if risk_r > 0:
                    signal_arr[i] = -1  # SELL (SHORT)
                    in_pos = True
                    side = "SHORT"
                    active_stop = stop_candidate
                    active_target = bar_close - (target_r_multiple * risk_r)
                    trades_today += 1

        if in_pos:
            stop_arr[i] = active_stop
            target_arr[i] = active_target

    df["signal"] = signal_arr
    df["stop_loss"] = pd.Series(stop_arr, index=df.index).shift(1).fillna(0.0)
    df["target_price"] = pd.Series(target_arr, index=df.index).shift(1).fillna(0.0)
    # Shift by 1 row to execute at the OPEN of the NEXT candle (prevent look-ahead bias)
    df["execution_signal"] = df["signal"].shift(1).fillna(0).astype(int)

    return df

