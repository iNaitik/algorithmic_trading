"""
NSE Intraday ORB + VWAP Strategy (Optimised Variant)
=====================================================
A precision-tuned 15-Minute Opening Range Breakout system filtered by
intraday VWAP and 1.5× Volume SMA(20) for high-liquidity NIFTY 50 equities.

Key Differentiators (vs. baseline ORB):
    • 0.35% minimum Opening Range width volatility filter — rejects
      narrow, choppy sessions that produce whipsaw breakouts.
    • 3:1 Reward-to-Risk target (3R) — captures larger moves by
      allowing winners to run further.
    • Institutional Time-of-Day Filter — entries are strictly limited
      to the 09:30–11:30 AM IST window, avoiding low-conviction
      afternoon chop that erodes edge.
    • 2R Volatility Trailing Stop — once price reaches 2R, the stop
      is trailed upward to entry + 1R, giving the position structural
      room to fluctuate between 1R and 3R without premature exits.
    • Hard 3:15 PM auto-liquidation gate — ensures zero overnight
      exposure regardless of position state.

Time Windows (IST):
    09:15 – 09:30   Formation — lock the Opening Range (OR high/low).
    09:30 – 11:30   Active entry window — one trade per day maximum.
    11:30 – 15:15   Position management only — no new entries.
    15:15           Hard EOD cutoff — force-liquidate any open position.

Entry (LONG only):
    • close > Opening Range High
    • close > Intraday VWAP (daily-reset)
    • volume > 1.5 × Volume SMA(20)
    • range_pct >= 0.35% (volatility gate)
    • Current time <= 11:30 AM IST (entry cutoff gate)
    • No existing position AND trades_today == 0

Risk Management:
    • Stop Loss    : Opening Range Low
    • Take Profit  : Entry + 3 × Risk  (strict 3:1 R:R)
    • Trailing     : Once high >= Entry + 2R → SL = Entry + 1R

Signal Alignment:
    Raw signals are shifted by 1 row to prevent look-ahead bias.
    The backtester executes on the candle AFTER the signal triggers.

Author : Algo Trading Bot Project
"""

import pandas as pd
import numpy as np
from strategies import strategy


# ══════════════════════════════════════════════════════════════════════════════
#  INTRADAY INDICATOR HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _compute_intraday_vwap(df: pd.DataFrame) -> pd.Series:
    """
    Computes the intraday VWAP that resets at the start of every trading day.

    VWAP = Cumulative(Close × Volume) / Cumulative(Volume)

    The cumulative accumulators reset at every unique calendar date boundary
    so the VWAP is always relative to the current day's price action.

    Parameters
    ----------
    df : pd.DataFrame
        Must have a DatetimeIndex (IST-aware) and columns: close, volume.

    Returns
    -------
    pd.Series
        VWAP values aligned with the input DataFrame's index.
    """
    dates: pd.Series = df.index.date

    price_volume: pd.Series = df['close'] * df['volume']

    cum_pv: pd.Series = price_volume.groupby(dates).cumsum()
    cum_vol: pd.Series = df['volume'].groupby(dates).cumsum()

    # Avoid division by zero
    vwap: pd.Series = cum_pv / cum_vol.replace(0, np.nan)

    return vwap


def _compute_volume_sma(df: pd.DataFrame, period: int = 20) -> pd.Series:
    """
    Computes a simple moving average of the volume column.

    Parameters
    ----------
    df : pd.DataFrame
        Must have a 'volume' column.
    period : int
        SMA lookback window (default 20).

    Returns
    -------
    pd.Series
        Volume SMA values.
    """
    return df['volume'].rolling(window=period, min_periods=period).mean()


# ══════════════════════════════════════════════════════════════════════════════
#  STRATEGY — NSE INTRADAY ORB + VWAP (OPTIMISED)
# ══════════════════════════════════════════════════════════════════════════════

@strategy(
    name="NSE Intraday ORB VWAP",
    description="15-min Opening Range Breakout filtered by daily VWAP and 1.5x Volume SMA. "
                "Includes a 0.35% range volatility filter, 11:30 AM entry cutoff, "
                "2R volatility trailing stop, and a hard 3:15 PM auto-liquidation gate.",
    market="INDIA"
)
def nse_orb_vwap_strategy(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generates path-dependent BUY/SELL signals for an optimised 15-Minute
    Opening Range Breakout system on NSE intraday data, filtered by VWAP
    confirmation, volume expansion, and a 0.35% minimum range volatility gate.

    This is a fully stateful, row-by-row strategy where all tracking
    variables reset at the start of every unique trading day.

    Parameters
    ----------
    df : pd.DataFrame
        5-minute OHLCV DataFrame with a DatetimeIndex.
        Columns required: open, high, low, close, volume.

    Returns
    -------
    pd.DataFrame
        Augmented with: vwap, volume_sma_20, signal, execution_signal.
    """
    df = df.copy()

    # ── 1. Ensure IST-aware DatetimeIndex ────────────────────────────────
    if df.index.tz is None:
        df.index = df.index.tz_localize('UTC').tz_convert('Asia/Kolkata')
    elif str(df.index.tz) != 'Asia/Kolkata':
        df.index = df.index.tz_convert('Asia/Kolkata')

    # ── 2. Compute Intraday Indicators ───────────────────────────────────
    df['vwap'] = _compute_intraday_vwap(df)
    df['volume_sma_20'] = _compute_volume_sma(df, period=20)

    # ── 3. Pre-extract arrays for fast iteration ─────────────────────────
    n: int = len(df)

    high_arr:    np.ndarray = df['high'].values.astype(np.float64)
    low_arr:     np.ndarray = df['low'].values.astype(np.float64)
    close_arr:   np.ndarray = df['close'].values.astype(np.float64)
    volume_arr:  np.ndarray = df['volume'].values.astype(np.float64)
    vwap_arr:    np.ndarray = df['vwap'].values.astype(np.float64)
    vol_sma_arr: np.ndarray = df['volume_sma_20'].values.astype(np.float64)

    # Extract time components for IST time-window checks
    timestamps = df.index
    times_hour:   np.ndarray = np.array([t.hour for t in timestamps], dtype=np.int32)
    times_minute: np.ndarray = np.array([t.minute for t in timestamps], dtype=np.int32)
    dates_arr = np.array([t.date() for t in timestamps])

    # Output signal array (0 = HOLD by default)
    signal_arr: np.ndarray = np.zeros(n, dtype=np.int32)

    # ── 4. Stateful Intraday Loop ────────────────────────────────────────
    # All variables reset at the start of every unique calendar date.

    # ── Strategy Constants ───────────────────────────────────────────────
    MIN_RANGE_PCT: float = 0.0035          # 0.35% minimum OR width
    VOLUME_MULT:   float = 1.5             # Volume must exceed 1.5× SMA
    RR_RATIO:      float = 3.0             # 3:1 Reward-to-Risk
    TRAIL_R_MULT:  float = 2.0             # Trailing stop triggers at 2R

    # IST time constants (in minutes since midnight)
    MARKET_OPEN:    int = 9 * 60 + 15      # 09:15
    OR_END:         int = 9 * 60 + 30      # 09:30
    TRADE_START:    int = 9 * 60 + 30      # 09:30 — entries allowed from OR close
    ENTRY_CUTOFF:   int = 11 * 60 + 30     # 11:30 — hard entry deadline
    EOD_CUTOFF:     int = 15 * 60 + 15     # 15:15

    # Day-level state variables
    current_date     = None
    opening_high:    float = 0.0
    opening_low:     float = 0.0
    day_invalid:     bool  = False
    trades_today:    int   = 0
    in_position:     bool  = False
    entry_price:     float = 0.0
    sl_price:        float = 0.0
    tp_price:        float = 0.0
    risk:            float = 0.0
    hit_2r:          bool  = False

    for i in range(n):
        bar_date  = dates_arr[i]
        bar_hour: int = int(times_hour[i])
        bar_min:  int = int(times_minute[i])

        # Convert to total minutes since midnight for easy comparison
        bar_time_mins: int = bar_hour * 60 + bar_min

        # ── Day Reset ────────────────────────────────────────────────
        if bar_date != current_date:
            # Force-close any position carried across days (safety net —
            # should have been closed at EOD cutoff)
            if in_position:
                signal_arr[i] = -1
                in_position = False

            current_date  = bar_date
            opening_high  = None
            opening_low   = None
            day_invalid   = False
            trades_today  = 0
            in_position   = False
            entry_price   = 0.0
            sl_price      = 0.0
            tp_price      = 0.0
            risk          = 0.0
            hit_2r        = False

        # Skip bars outside market hours
        if bar_time_mins < MARKET_OPEN:
            continue

        # Skip the entire day if marked invalid (low volatility)
        if day_invalid:
            continue

        # ── Opening Range Formation (09:15 – 09:30) ─────────────────
        if MARKET_OPEN <= bar_time_mins <= OR_END:
            bar_high: float = float(high_arr[i])
            bar_low:  float = float(low_arr[i])

            if opening_high is None or bar_high > opening_high:
                opening_high = bar_high
            if opening_low is None or bar_low < opening_low:
                opening_low = bar_low

            # At the 09:30 candle, validate the range width
            if bar_time_mins == OR_END:
                # Guard against missing formation data
                if opening_high is None or opening_low is None:
                    day_invalid = True
                    continue

                # Volatility filter — reject narrow, choppy ranges
                range_pct: float = (opening_high - opening_low) / opening_low
                if range_pct < MIN_RANGE_PCT:
                    day_invalid = True

            continue  # Do NOT trade during formation period

        # ── EOD Hard Cutoff (>= 15:15) ──────────────────────────────
        if bar_time_mins >= EOD_CUTOFF:
            if in_position:
                signal_arr[i] = -1  # Force liquidation
                in_position = False
                entry_price = 0.0
                sl_price    = 0.0
                tp_price    = 0.0
                risk        = 0.0
                hit_2r      = False
            continue  # No further processing after cutoff

        # ── Active Trading Window (09:35 – 15:10) ───────────────────
        # Validate that the opening range was captured before trading
        if opening_high is None or opening_low is None:
            continue

        bar_close:  float = float(close_arr[i])
        bar_high_i: float = float(high_arr[i])
        bar_low_i:  float = float(low_arr[i])
        bar_vol:    float = float(volume_arr[i])
        bar_vwap:   float = float(vwap_arr[i])
        bar_vsma:   float = float(vol_sma_arr[i])

        if not in_position:
            # ── Entry Logic ──────────────────────────────────────────
            # Institutional Time-of-Day Filter: entries ONLY between
            # 09:30 AM and 11:30 AM IST.  After 11:30, no new entries.
            if (trades_today == 0
                    and TRADE_START <= bar_time_mins <= ENTRY_CUTOFF
                    and not np.isnan(bar_vwap)
                    and not np.isnan(bar_vsma)
                    and bar_vsma > 0):

                # All three gates must pass simultaneously
                breakout_gate: bool = bar_close > opening_high
                vwap_gate:     bool = bar_close > bar_vwap
                volume_gate:   bool = bar_vol > VOLUME_MULT * bar_vsma

                if breakout_gate and vwap_gate and volume_gate:
                    signal_arr[i] = 1   # BUY signal

                    in_position  = True
                    trades_today = 1
                    entry_price  = bar_close
                    sl_price     = opening_low
                    risk         = entry_price - sl_price
                    tp_price     = entry_price + (RR_RATIO * risk)
                    hit_2r       = False

        else:
            # ── In Position — Check Exit Conditions ──────────────────

            # 1) 2R Volatility Trailing Step
            #    Once price has moved 2R in our favour, trail the stop
            #    upward to entry + 1R.  This gives the position structural
            #    room to fluctuate between 1R and 3R without premature exits.
            if not hit_2r and bar_high_i >= entry_price + (TRAIL_R_MULT * risk):
                sl_price = entry_price + risk
                hit_2r   = True

            # 2) Take Profit Target (3R)
            if bar_high_i >= tp_price:
                signal_arr[i] = -1   # EXIT — target hit
                in_position = False
                entry_price = 0.0
                sl_price    = 0.0
                tp_price    = 0.0
                risk        = 0.0
                hit_2r      = False

            # 3) Hard Stop Loss
            elif bar_low_i <= sl_price:
                signal_arr[i] = -1   # EXIT — stopped out
                in_position = False
                entry_price = 0.0
                sl_price    = 0.0
                tp_price    = 0.0
                risk        = 0.0
                hit_2r      = False

    # ── 5. Write signals & shift for look-ahead prevention ───────────────
    df['signal'] = signal_arr

    # Shift by 1 bar to prevent look-ahead bias — the framework executes
    # trades on the NEXT bar's open price.
    df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)

    return df
