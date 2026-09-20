"""
SMA Crossover Strategy
======================
Classic dual Simple Moving Average crossover system.
BUY when fast SMA crosses above slow SMA.
SELL when fast SMA crosses below slow SMA.
"""

import pandas as pd
from strategies import strategy


@strategy(
    name="SMA Crossover",
    description="9/21 Simple Moving Average crossover — trend-following system"
)
def sma_crossover_strategy(
    df: pd.DataFrame,
    fast_window: int = 9,
    slow_window: int = 21,
) -> pd.DataFrame:
    """
    Generates BUY/SELL signals based on SMA crossovers.

    Parameters
    ----------
    df : pd.DataFrame
        OHLCV DataFrame with a 'close' column.
    fast_window : int
        Fast SMA period (default 9).
    slow_window : int
        Slow SMA period (default 21).

    Returns
    -------
    pd.DataFrame
        Augmented with: fast_sma, slow_sma, signal, execution_signal.
    """
    df = df.copy()

    # Compute rolling SMAs
    df['fast_sma'] = df['close'].rolling(window=fast_window).mean()
    df['slow_sma'] = df['close'].rolling(window=slow_window).mean()

    # Drop warm-up NaN rows
    df.dropna(subset=['fast_sma', 'slow_sma'], inplace=True)

    # Previous-period SMAs for crossover detection
    prev_fast: pd.Series = df['fast_sma'].shift(1)
    prev_slow: pd.Series = df['slow_sma'].shift(1)

    # Initialize all signals to HOLD (0)
    df['signal'] = 0

    # BUY crossover: fast crosses above slow
    buy_mask: pd.Series = (df['fast_sma'] > df['slow_sma']) & (prev_fast <= prev_slow)
    df.loc[buy_mask, 'signal'] = 1

    # SELL crossover: fast crosses below slow
    sell_mask: pd.Series = (df['fast_sma'] < df['slow_sma']) & (prev_fast >= prev_slow)
    df.loc[sell_mask, 'signal'] = -1

    # CRITICAL: shift signal by 1 to execute on the NEXT candle (zero look-ahead)
    df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)

    return df
