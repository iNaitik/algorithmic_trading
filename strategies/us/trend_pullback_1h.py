"""
1-Hour Trend Pullback Strategy
===============================
A stateful, path-dependent strategy that combines structural trend
alignment with mean-reversion pullback entries and disciplined risk
management.

Entry Logic:
    1. Trend Filter  : EMA(50) > EMA(200) AND close > EMA(200).
    2. Pullback Setup : RSI(14) dips below 40 while the trend filter holds.
    3. Entry Trigger  : RSI crosses back ABOVE 40, and the current close is
                        strictly greater than the previous bar's high.

Exit Logic (managed internally via a stateful loop):
    • Hard Stop Loss  : The LOWER of (entry - 1.5×ATR) or the 10-bar Swing Low.
    • Hard Take Profit: 2R target → entry + 2 × (entry − stop_loss).
    • Early Exit      : EMA(50) < EMA(200) OR close < EMA(200) OR RSI < 35.

Because the backtesting engine executes blindly on signal columns, the
entire position life-cycle (entry, stop, target, early exit) must be
simulated internally within a sequential row-by-row loop.

Risk Note:
    Signals are shifted by 1 bar (`execution_signal`) to eliminate
    look-ahead bias — the framework executes on the NEXT bar's open.
"""

import pandas as pd
import numpy as np
from strategies import strategy


# ── Indicator Helpers ────────────────────────────────────────────────────────

def _compute_ema(series: pd.Series, span: int) -> pd.Series:
    """Exponential Moving Average with no look-ahead (adjust=False)."""
    return series.ewm(span=span, adjust=False).mean()


def _compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """
    Standard Wilder-style RSI.

    Uses exponential moving average of gains/losses with adjust=False
    to match the classical smoothing method.
    """
    delta: pd.Series = series.diff()
    gain: pd.Series = delta.clip(lower=0.0)
    loss: pd.Series = (-delta).clip(lower=0.0)

    avg_gain: pd.Series = gain.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    avg_loss: pd.Series = loss.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()

    rs: pd.Series = avg_gain / avg_loss.replace(0.0, np.nan)
    rsi: pd.Series = 100.0 - (100.0 / (1.0 + rs))

    return rsi


def _compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Standard 14-period Average True Range using Wilder smoothing.
    """
    high: pd.Series = df['high']
    low: pd.Series = df['low']
    prev_close: pd.Series = df['close'].shift(1)

    tr1: pd.Series = high - low
    tr2: pd.Series = (high - prev_close).abs()
    tr3: pd.Series = (low - prev_close).abs()

    true_range: pd.Series = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr: pd.Series = true_range.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()

    return atr


# ── Strategy ─────────────────────────────────────────────────────────────────

@strategy(
    name="1-Hour Trend Pullback",
    description="EMA trend filter, RSI pullback discovery, and internal path-dependent ATR/Swing-Low risk management"
)
def trend_pullback_strategy(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generates path-dependent BUY/SELL signals for a 1-Hour Trend Pullback
    system with internal position and risk management.

    Parameters
    ----------
    df : pd.DataFrame
        OHLCV DataFrame with columns: open, high, low, close, volume.

    Returns
    -------
    pd.DataFrame
        Augmented with indicator columns and an ``execution_signal`` column
        (1 = BUY, -1 = SELL, 0 = HOLD).
    """
    df = df.copy()

    # ── 1. Indicator Calculations ────────────────────────────────────────
    df['ema_50']    = _compute_ema(df['close'], span=50)
    df['ema_200']   = _compute_ema(df['close'], span=200)
    df['rsi']       = _compute_rsi(df['close'], period=14)
    df['atr']       = _compute_atr(df, period=14)
    df['swing_low'] = df['low'].rolling(window=10).min()

    # Drop warm-up rows where the slowest indicator (EMA-200) hasn't
    # stabilised.  We use 200 to be safe; ATR/RSI need only ~14.
    df = df.iloc[200:].copy()
    df.reset_index(drop=True, inplace=True)

    # ── 2. Pre-extract NumPy arrays for fast iteration ───────────────────
    n: int = len(df)

    close_arr:     np.ndarray = df['close'].values.astype(np.float64)
    high_arr:      np.ndarray = df['high'].values.astype(np.float64)
    low_arr:       np.ndarray = df['low'].values.astype(np.float64)
    ema50_arr:     np.ndarray = df['ema_50'].values.astype(np.float64)
    ema200_arr:    np.ndarray = df['ema_200'].values.astype(np.float64)
    rsi_arr:       np.ndarray = df['rsi'].values.astype(np.float64)
    atr_arr:       np.ndarray = df['atr'].values.astype(np.float64)
    swing_low_arr: np.ndarray = df['swing_low'].values.astype(np.float64)

    # Output signal array (0 = HOLD by default)
    signal_arr: np.ndarray = np.zeros(n, dtype=np.int32)

    # ── 3. Stateful Position Life-Cycle Loop ─────────────────────────────
    pullback_triggered: bool = False
    in_position:        bool = False
    entry_price:      float = 0.0
    sl_price:         float = 0.0
    tp_price:         float = 0.0

    for i in range(1, n):  # start at 1 — we reference i-1 for prev bar
        close_i:  float = float(close_arr[i])
        high_i:   float = float(high_arr[i])
        low_i:    float = float(low_arr[i])
        ema50_i:  float = float(ema50_arr[i])
        ema200_i: float = float(ema200_arr[i])
        rsi_i:    float = float(rsi_arr[i])
        atr_i:    float = float(atr_arr[i])
        sw_low_i: float = float(swing_low_arr[i])

        prev_high: float = float(high_arr[i - 1])
        prev_rsi:  float = float(rsi_arr[i - 1])

        # Skip row if any required indicator is NaN (shouldn't happen
        # post warm-up, but guard defensively).
        if np.isnan(ema50_i) or np.isnan(ema200_i) or np.isnan(rsi_i) \
                or np.isnan(atr_i) or np.isnan(sw_low_i) or np.isnan(prev_rsi):
            continue

        if not in_position:
            # ── Setup Detection ──────────────────────────────────────
            # Bullish structure: EMA(50) > EMA(200) AND close above
            # the 200-EMA.  RSI dipping below 40 flags a pullback.
            if ema50_i > ema200_i and close_i > ema200_i and rsi_i < 40.0:
                pullback_triggered = True

            # ── Setup Invalidation ───────────────────────────────────
            if close_i < ema200_i or ema50_i < ema200_i:
                pullback_triggered = False

            # ── Entry Trigger ────────────────────────────────────────
            # Pullback was flagged, RSI has now crossed back above 40,
            # and price confirms strength by exceeding previous high.
            if pullback_triggered and rsi_i > 40.0 and prev_rsi <= 40.0 and close_i > prev_high:
                signal_arr[i] = 1  # BUY

                in_position = True
                entry_price = close_i

                # Stop Loss: the MORE conservative (lower) of the two
                atr_stop:  float = entry_price - 1.5 * atr_i
                swing_stop: float = sw_low_i
                sl_price = min(atr_stop, swing_stop)

                # Take Profit: strict 2R target
                risk: float = entry_price - sl_price
                tp_price = entry_price + 2.0 * risk

                pullback_triggered = False

        else:
            # ── In Position — Check Exit Conditions ──────────────────

            # 1) Hard Stop Loss
            if low_i <= sl_price:
                signal_arr[i] = -1  # SELL (stopped out)
                in_position = False
                entry_price = 0.0
                sl_price    = 0.0
                tp_price    = 0.0

            # 2) Hard Take Profit
            elif high_i >= tp_price:
                signal_arr[i] = -1  # SELL (target hit)
                in_position = False
                entry_price = 0.0
                sl_price    = 0.0
                tp_price    = 0.0

            # 3) Early Exit — trend breakdown or deep RSI weakness
            elif ema50_i < ema200_i or close_i < ema200_i or rsi_i < 35.0:
                signal_arr[i] = -1  # SELL (early exit)
                in_position = False
                entry_price = 0.0
                sl_price    = 0.0
                tp_price    = 0.0

    # ── 4. Write signals back to DataFrame ───────────────────────────────
    df['signal'] = signal_arr

    # Shift by 1 to prevent look-ahead bias — execution happens on the
    # NEXT bar's open, exactly as the framework expects.
    df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)

    # ── 5. Clean up temporary columns (keep indicators for inspection) ───
    # The framework only requires 'execution_signal'.  We retain the EMAs,
    # RSI, ATR, and swing_low for transparency/debugging, but drop nothing
    # extra since no helper state columns were added to the DataFrame.

    return df
