"""
RSI Mean Reversion Strategy
============================
Uses the Relative Strength Index to detect overbought/oversold conditions.
BUY when RSI drops below the oversold threshold (mean-reversion entry).
SELL when RSI rises above the overbought threshold (take profit exit).
"""

import pandas as pd
import numpy as np
from strategies import strategy


@strategy(
    name="RSI Mean Reversion",
    description="RSI(14) oversold/overbought mean-reversion system"
)
def rsi_mean_reversion_strategy(
    df: pd.DataFrame,
    rsi_period: int = 14,
    oversold: float = 30.0,
    overbought: float = 70.0,
) -> pd.DataFrame:
    """
    Generates BUY/SELL signals using RSI thresholds.

    Parameters
    ----------
    df : pd.DataFrame
        OHLCV DataFrame with a 'close' column.
    rsi_period : int
        RSI lookback period (default 14).
    oversold : float
        RSI level below which a BUY signal is generated (default 30).
    overbought : float
        RSI level above which a SELL signal is generated (default 70).

    Returns
    -------
    pd.DataFrame
        Augmented with: rsi, signal, execution_signal.
    """
    df = df.copy()

    # ── Compute RSI ──────────────────────────────────────────────────
    delta: pd.Series = df['close'].diff()
    gain: pd.Series = delta.where(delta > 0, 0.0)
    loss: pd.Series = (-delta).where(delta < 0, 0.0)

    avg_gain: pd.Series = gain.rolling(window=rsi_period, min_periods=rsi_period).mean()
    avg_loss: pd.Series = loss.rolling(window=rsi_period, min_periods=rsi_period).mean()

    # Use Wilder's smoothing after the initial SMA seed
    for i in range(rsi_period, len(df)):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * (rsi_period - 1) + gain.iloc[i]) / rsi_period
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * (rsi_period - 1) + loss.iloc[i]) / rsi_period

    rs: pd.Series = avg_gain / avg_loss.replace(0, np.nan)
    df['rsi'] = 100.0 - (100.0 / (1.0 + rs))

    # Drop warm-up period
    df.dropna(subset=['rsi'], inplace=True)

    # ── Signal generation ────────────────────────────────────────────
    df['signal'] = 0

    # Previous RSI for threshold crossover (not just level)
    prev_rsi: pd.Series = df['rsi'].shift(1)

    # BUY: RSI crosses below oversold
    buy_mask: pd.Series = (df['rsi'] < oversold) & (prev_rsi >= oversold)
    df.loc[buy_mask, 'signal'] = 1

    # SELL: RSI crosses above overbought
    sell_mask: pd.Series = (df['rsi'] > overbought) & (prev_rsi <= overbought)
    df.loc[sell_mask, 'signal'] = -1

    # CRITICAL: shift by 1 to prevent look-ahead bias
    df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)

    return df
