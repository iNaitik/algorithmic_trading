"""
EMA Crossover Strategy
======================
Exponential Moving Average crossover — reacts faster to price changes
than the SMA variant. Uses a fast and slow EMA to detect trend shifts.
BUY when fast EMA crosses above slow EMA.
SELL when fast EMA crosses below slow EMA.
"""

import pandas as pd
from strategies import strategy


@strategy(
    name="EMA Crossover",
    description="12/26 Exponential Moving Average crossover — faster trend detection"
)
def ema_crossover_strategy(
    df: pd.DataFrame,
    fast_window: int = 12,
    slow_window: int = 26,
) -> pd.DataFrame:
    """
    Generates BUY/SELL signals based on EMA crossovers.

    Parameters
    ----------
    df : pd.DataFrame
        OHLCV DataFrame with a 'close' column.
    fast_window : int
        Fast EMA period (default 12).
    slow_window : int
        Slow EMA period (default 26).

    Returns
    -------
    pd.DataFrame
        Augmented with: fast_ema, slow_ema, signal, execution_signal.
    """
    df = df.copy()

    # Compute EMAs
    df['fast_ema'] = df['close'].ewm(span=fast_window, adjust=False).mean()
    df['slow_ema'] = df['close'].ewm(span=slow_window, adjust=False).mean()

    # Drop initial warm-up rows where EMAs haven't stabilized
    df = df.iloc[slow_window:].copy()

    # Previous-period EMAs for crossover detection
    prev_fast: pd.Series = df['fast_ema'].shift(1)
    prev_slow: pd.Series = df['slow_ema'].shift(1)

    # Initialize all signals to HOLD (0)
    df['signal'] = 0

    # BUY crossover: fast crosses above slow
    buy_mask: pd.Series = (df['fast_ema'] > df['slow_ema']) & (prev_fast <= prev_slow)
    df.loc[buy_mask, 'signal'] = 1

    # SELL crossover: fast crosses below slow
    sell_mask: pd.Series = (df['fast_ema'] < df['slow_ema']) & (prev_fast >= prev_slow)
    df.loc[sell_mask, 'signal'] = -1

    # CRITICAL: shift signal by 1 to execute on the NEXT candle (zero look-ahead)
    df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)

    return df
