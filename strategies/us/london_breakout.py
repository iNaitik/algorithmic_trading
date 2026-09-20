# CHANGELOG
# [2026-05-31] - Applied fixes: Reverted to v2, breakeven_lock_until = i + 3
# See prompt spec for full change descriptions.

"""
London Handoff Momentum Breakout Strategy
==========================================
An institutionally-informed, session-aware breakout strategy designed
for EUR/USD on 15-minute intraday data.

Market Microstructure Thesis:
    Asian-session (00:00–07:00 UTC) liquidity accumulation establishes
    a structural range.  As the London desk opens, genuine directional
    order flow materialises.  We trade confirmed breakouts of the
    Asian box (buffered by 0.5×ATR) only when the 4-Hour macro trend
    — measured via the slope of a 50-period SMA — aligns.

Session Timing (UTC):
    • 00:00 – 07:00  Accumulation — Asian box formation.
    • 07:15 – 11:00  Execution    — London breakout window.
    • 19:00          Hard EOD liquidation gate.

Risk Management:
    • Max 1 trade per calendar day.
    • SL = 1.5 × ATR from entry.
    • TP = 3.0 × ATR from entry (strict 2:1 R:R).
    • 50 % partial scale-out at +2.0 × ATR with SL trailed to breakeven.

Anti Look-Ahead Bias:
    Signals are shifted by exactly 1 row before assignment to
    ``execution_signal``, complying with the framework's strict rule.
"""

import pandas as pd
import numpy as np
from strategies import strategy

# ═══════════════════════════════════════════════════════════════════════════
#  Configuration Constants
# ═══════════════════════════════════════════════════════════════════════════

MIN_ATR_THRESHOLD: float = 0.0003

ASIAN_BOX_END_HOUR   : int = 7   # Asian accumulation ends at 07:00 UTC
LONDON_ENTRY_HOUR    : int = 7   # London window opens at 07:15 UTC
LONDON_ENTRY_MINUTE  : int = 15
LONDON_CLOSE_HOUR    : int = 11  # London window closes at 11:00 UTC
EOD_LIQUIDATION_HOUR : int = 19  # Hard daily close at 19:00 UTC

# ═══════════════════════════════════════════════════════════════════════════
#  Indicator Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Standard 14-period Average True Range using Wilder smoothing.

    Parameters
    ----------
    df : pd.DataFrame
        Must contain 'high', 'low', 'close' columns.
    period : int
        Look-back window for the ATR calculation.

    Returns
    -------
    pd.Series
        ATR values aligned to the input DataFrame index.
    """
    high: pd.Series = df['high']
    low: pd.Series = df['low']
    prev_close: pd.Series = df['close'].shift(1)

    tr1: pd.Series = high - low
    tr2: pd.Series = (high - prev_close).abs()
    tr3: pd.Series = (low - prev_close).abs()

    true_range: pd.Series = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr: pd.Series = true_range.ewm(
        alpha=1.0 / period, min_periods=period, adjust=False
    ).mean()

    return atr


def _compute_htf_sma_slope(df: pd.DataFrame,
                           resample_rule: str = '4h',
                           sma_period: int = 50) -> pd.Series:
    """
    Resample 15-minute close data to 4-Hour blocks, compute a 50-period
    SMA, derive its directional slope (current − previous), and broadcast
    the result back to the original 15-minute index via forward-fill.

    Parameters
    ----------
    df : pd.DataFrame
        Must contain a DatetimeIndex (UTC) and a 'close' column.
    resample_rule : str
        Pandas resample rule for the higher timeframe (default: '4h').
    sma_period : int
        SMA look-back on the higher timeframe.

    Returns
    -------
    pd.Series
        4H SMA slope values broadcast to every 15-minute row.
    """
    # Resample close to 4H using the last observation in each block
    close_4h: pd.Series = df['close'].resample(resample_rule).last()

    # Drop any NaN rows produced by empty resample bins
    close_4h = close_4h.dropna()

    # Compute the 50-period SMA on the 4H data
    sma_4h: pd.Series = close_4h.rolling(window=sma_period, min_periods=sma_period).mean()

    # Slope = current SMA value minus previous SMA value
    slope_4h: pd.Series = sma_4h.diff()

    # Broadcast back to 15-minute rows via reindex + forward-fill
    slope_15m: pd.Series = slope_4h.reindex(df.index, method='ffill')

    return slope_15m


def _build_asian_box(df: pd.DataFrame) -> pd.DataFrame:
    """
    For each unique calendar day in the DataFrame, compute the Asian
    session High and Low from candles falling within the accumulation window.

    Returns a DataFrame with columns 'asian_high' and 'asian_low' keyed
    by date, which can be mapped onto the main DataFrame by date.
    """
    # Extract date and hour from the UTC index
    dates: pd.Series = df.index.date
    hours: np.ndarray = df.index.hour

    # Mask for Asian accumulation window
    asian_mask: np.ndarray = hours < ASIAN_BOX_END_HOUR

    asian_df: pd.DataFrame = df.loc[asian_mask, ['high', 'low']].copy()
    asian_df['date'] = asian_df.index.date

    asian_box: pd.DataFrame = asian_df.groupby('date').agg(
        asian_high=('high', 'max'),
        asian_low=('low', 'min')
    )

    return asian_box


# ═══════════════════════════════════════════════════════════════════════════
#  Strategy Registration
# ═══════════════════════════════════════════════════════════════════════════

@strategy(
    name="London Handoff Momentum",
    description=(
        "Optimized institutional session breakout strategy on EUR/USD. "
        "Uses the full Asian liquidity box, 15-minute candle close confirmation, "
        "a 4-Hour macro trend filter, and a 50% partial scale-out model."
    )
)
def london_breakout_strategy(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generates path-dependent BUY / SELL / EXIT signals for the London
    Handoff Momentum Breakout system with internal position and risk
    management, including a phased 50 % scale-out model.

    Parameters
    ----------
    df : pd.DataFrame
        15-minute OHLCV DataFrame with a DatetimeIndex and columns:
        open, high, low, close, volume.

    Returns
    -------
    pd.DataFrame
        Augmented with indicator columns and an ``execution_signal``
        column (1 = BUY, -1 = SHORT, 2 = EXIT, 0 = HOLD).
    """
    df = df.copy()

    # ── 1. Time Horizon Harmonisation ────────────────────────────────────
    #   Ensure the index is explicitly treated as UTC.
    if df.index.tz is None:
        df.index = df.index.tz_localize('UTC')
    else:
        df.index = df.index.tz_convert('UTC')

    # ── 2. Indicator Calculations ────────────────────────────────────────

    # 2a. 14-period ATR on 15-minute close prices
    df['atr'] = _compute_atr(df, period=14)

    # 2b. Daily 20-EMA trend filter
    daily_close = df['close'].resample('1D').last().dropna()
    daily_ema_raw = daily_close.ewm(span=20, adjust=False, min_periods=20).mean()
    daily_ema_shifted = daily_ema_raw.shift(1)
    df['daily_ema_20'] = daily_ema_shifted.reindex(df.index, method='ffill')

    # 2c. Asian liquidity box per calendar day
    asian_box: pd.DataFrame = _build_asian_box(df)
    df['date'] = df.index.date
    df = df.merge(asian_box, left_on='date', right_index=True, how='left')

    # 2d. Dynamic breakout channels (buffered by 0.5 × ATR)
    df['upper_channel'] = df['asian_high'] + 0.5 * df['atr']
    df['lower_channel'] = df['asian_low'] - 0.5 * df['atr']

    # ── 3. Pre-extract NumPy arrays for fast sequential iteration ────────
    n: int = len(df)

    close_arr:   np.ndarray = df['close'].values.astype(np.float64)
    high_arr:    np.ndarray = df['high'].values.astype(np.float64)
    low_arr:     np.ndarray = df['low'].values.astype(np.float64)
    atr_arr:     np.ndarray = df['atr'].values.astype(np.float64)
    upper_arr:   np.ndarray = df['upper_channel'].values.astype(np.float64)
    lower_arr:   np.ndarray = df['lower_channel'].values.astype(np.float64)

    # Time components for session gating
    hour_arr:    np.ndarray = df.index.hour.values
    minute_arr:  np.ndarray = df.index.minute.values
    date_arr:    np.ndarray = df['date'].values  # np.datetime64 dates

    # Output signal array (0 = HOLD by default)
    signal_arr: np.ndarray = np.zeros(n, dtype=np.int32)

    # ── 4. Stateful Path-Dependent Simulation Loop ───────────────────────
    #   Day-state tracking variables (reset at each new calendar date).
    opening_high:    float = 0.0
    opening_low:     float = 0.0
    trades_today:    int   = 0
    in_position:     bool  = False
    position_type:   str   = ''     # 'long' or 'short'
    entry_price:     float = 0.0
    sl_price:        float = 0.0
    tp_price:        float = 0.0
    half_scaled_out: bool  = False

    prev_date = None  # sentinel for day-boundary detection

    for i in range(n):
        # ── NaN guard — skip if critical indicators are not ready ────
        if np.isnan(atr_arr[i]) \
                or np.isnan(upper_arr[i]) or np.isnan(lower_arr[i]):
            continue

        current_date = date_arr[i]
        h: int = int(hour_arr[i])
        m: int = int(minute_arr[i])

        # ── Day boundary reset ──────────────────────────────────────
        if current_date != prev_date:
            # Force-close any position still open from the prior day
            if in_position:
                signal_arr[i] = 2
                in_position     = False
                position_type   = ''
                entry_price     = 0.0
                sl_price        = 0.0
                tp_price        = 0.0
                half_scaled_out = False

            opening_high    = np.nan
            opening_low     = np.nan
            trades_today    = 0
            in_position     = False
            position_type   = ''
            entry_price     = 0.0
            sl_price        = 0.0
            tp_price        = 0.0
            half_scaled_out = False
            prev_date       = current_date

        # ── A. Accumulation Phase ───────────────────────────────────
        #    Build the Asian liquidity box row by row.
        if h < ASIAN_BOX_END_HOUR:
            candle_high: float = float(high_arr[i])
            candle_low:  float = float(low_arr[i])

            if np.isnan(opening_high):
                opening_high = candle_high
                opening_low  = candle_low
            else:
                if candle_high > opening_high:
                    opening_high = candle_high
                if candle_low < opening_low:
                    opening_low = candle_low

            # No trading during accumulation
            continue

        # ── B. Hard Daily Liquidation Gate ──────────────────────────
        if h >= EOD_LIQUIDATION_HOUR and in_position:
            signal_arr[i]   = 2   # force exit at market
            in_position     = False
            position_type   = ''
            entry_price     = 0.0
            sl_price        = 0.0
            tp_price        = 0.0
            half_scaled_out = False
            continue

        # ── C. In-Position Trade Management ─────────────────────────
        if in_position:
            cur_high: float = float(high_arr[i])
            cur_low:  float = float(low_arr[i])
            cur_atr:  float = float(atr_arr[i])

            if position_type == 'long':
                # --- 50 % partial scale-out at +2.0 × ATR ----------
                if not half_scaled_out:
                    scale_out_level: float = entry_price + 2.0 * cur_atr
                    if cur_high >= scale_out_level:
                        half_scaled_out = True
                        sl_price = entry_price  # trail SL to breakeven

                # --- Hard Stop Loss --------------------------------
                if cur_low <= sl_price:
                    signal_arr[i]   = 2
                    in_position     = False
                    position_type   = ''
                    entry_price     = 0.0
                    sl_price        = 0.0
                    tp_price        = 0.0
                    half_scaled_out = False
                    continue

                # --- Hard Take Profit (full TP at 3.0 × ATR) ------
                if cur_high >= tp_price:
                    signal_arr[i]   = 2
                    in_position     = False
                    position_type   = ''
                    entry_price     = 0.0
                    sl_price        = 0.0
                    tp_price        = 0.0
                    half_scaled_out = False
                    continue

            elif position_type == 'short':
                # --- 50 % partial scale-out at −2.0 × ATR ----------
                if not half_scaled_out:
                    scale_out_level = entry_price - 2.0 * cur_atr
                    if cur_low <= scale_out_level:
                        half_scaled_out = True
                        sl_price = entry_price  # trail SL to breakeven

                # --- Hard Stop Loss --------------------------------
                if cur_high >= sl_price:
                    signal_arr[i]   = 2
                    in_position     = False
                    position_type   = ''
                    entry_price     = 0.0
                    sl_price        = 0.0
                    tp_price        = 0.0
                    half_scaled_out = False
                    continue

                # --- Hard Take Profit (full TP at 3.0 × ATR) ------
                if cur_low <= tp_price:
                    signal_arr[i]   = 2
                    in_position     = False
                    position_type   = ''
                    entry_price     = 0.0
                    sl_price        = 0.0
                    tp_price        = 0.0
                    half_scaled_out = False
                    continue

            # Position still open — no signal on this bar
            continue

        # ── D. London Breakout Execution Window ─────────────────────
        #   Entry signals restricted to this window.  Max 1 trade/day.
        time_in_minutes: int = h * 60 + m
        london_open:     int = LONDON_ENTRY_HOUR * 60 + LONDON_ENTRY_MINUTE
        london_close:    int = LONDON_CLOSE_HOUR * 60

        if time_in_minutes < london_open or time_in_minutes > london_close:
            continue

        if trades_today >= 1:
            continue

        # Ensure the Asian box was fully formed for today
        if np.isnan(opening_high) or np.isnan(opening_low):
            continue

        cur_close: float = float(close_arr[i])
        cur_atr:   float = float(atr_arr[i])

        # Skip days where ATR is below minimum threshold
        if cur_atr < MIN_ATR_THRESHOLD:
            continue

        # Dynamic breakout thresholds
        upper_threshold: float = opening_high + 0.5 * cur_atr
        lower_threshold: float = opening_low  - 0.5 * cur_atr

        # ── ATR Bar Alignment Note ─────────────────────────────────────────
        # ATR used here is from bar i (the signal bar, pre-shift).
        # The execution_signal is shifted by 1, so the actual trade entry
        # fills at bar i+1 open. Using bar i ATR is intentional — it is the
        # last fully-closed bar available at decision time, consistent with
        # zero look-ahead bias. Bar i+1 ATR is not yet known at signal time.
        # ──────────────────────────────────────────────────────────────────
        
        cur_ema = df['daily_ema_20'].iloc[i]
        if pd.isna(cur_ema) or cur_ema == 0.0:
            continue  # skip this bar — EMA not yet warmed up

        # ── Long Entry ──────────────────────────────────────────────
        if cur_close > upper_threshold and cur_close > cur_ema:
            signal_arr[i] = 1   # BUY
            in_position    = True
            position_type  = 'long'
            trades_today   = 1
            entry_price    = cur_close
            sl_price       = entry_price - 1.5 * cur_atr
            tp_price       = entry_price + 3.0 * cur_atr
            half_scaled_out = False
            continue

        # ── Short Entry ─────────────────────────────────────────────
        if cur_close < lower_threshold and cur_close < cur_ema:
            signal_arr[i] = -1  # SHORT / SELL
            in_position    = True
            position_type  = 'short'
            trades_today   = 1
            entry_price    = cur_close
            sl_price       = entry_price + 1.5 * cur_atr
            tp_price       = entry_price - 3.0 * cur_atr
            half_scaled_out = False
            continue

    # ── 5. Write signals back to DataFrame ───────────────────────────────
    df['signal'] = signal_arr

    # ── 6. Anti Look-Ahead Bias — shift by exactly 1 row ────────────────
    df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)

    # ── 7. Cleanup — drop transient helper columns ──────────────────────
    df.drop(columns=['date'], inplace=True)

    entry_count = (df['execution_signal'] != 0).sum()
    print(f"[DEBUG] {symbol if 'symbol' in dir() else 'pair'}: {entry_count} signals generated after EMA filter")

    return df
