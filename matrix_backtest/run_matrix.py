"""
matrix_backtest/run_matrix.py — Asset-Timeframe Matrix Backtest
================================================================
A standalone batch execution script that stress-tests the "RSI Mean
Reversion" strategy across a multi-dimensional grid of tickers and
lookback windows, with a structural 2% stop-loss safety injection.

No existing source files are modified.  This script imports the
framework's data fetcher, simulation engine, and analytics calculator
directly, and wraps the original RSI strategy function with an
enhanced stateful version that enforces a hard protective floor.

Grid Dimensions:
    Tickers     : AAPL, MSFT, NVDA, AMZN, META, GOOGL, TSLA
    Timeframes  : 30 days (1M), 90 days (3M), 180 days (6M), 360 days (1Y)

Friction Profile:
    Slippage    : 10 bps  (0.0010)
    Commission  : $0.00 per trade

Usage:
    cd "Algo Trading Bot"
    python -m matrix_backtest.run_matrix
"""

from __future__ import annotations

import os
import sys
import math
import time
import traceback
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

# ── Ensure the project root is on sys.path ──────────────────────────────────
_PROJECT_ROOT: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# ── Framework Imports (read-only — no source files are modified) ─────────────
from backtesting import (
    fetch_historical_backtest_data,
    run_backtest,
    calculate_metrics,
    Colors,
)


# ══════════════════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

WATCHLIST: List[str] = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA"]

TIME_HORIZONS: Dict[str, int] = {
    "1M":  30,
    "3M":  90,
    "6M":  180,
    "1Y":  360,
}

INITIAL_CAPITAL: float = 100_000.0
SLIPPAGE_PCT:    float = 0.0010     # 10 basis points — hard friction
COMMISSION:      float = 0.00       # $0.00 per trade
STOP_LOSS_PCT:   float = 0.02       # 2% structural stop-loss guard


# ══════════════════════════════════════════════════════════════════════════════
#  RSI MEAN REVERSION — WITH 2% STOP-LOSS SAFETY INJECTION
# ══════════════════════════════════════════════════════════════════════════════

def _compute_rsi_wilder(series: pd.Series, period: int = 14) -> pd.Series:
    """
    Standard Wilder-smoothed RSI — identical to the original strategy's
    computation so results are numerically consistent.
    """
    delta: pd.Series = series.diff()
    gain:  pd.Series = delta.where(delta > 0, 0.0)
    loss:  pd.Series = (-delta).where(delta < 0, 0.0)

    avg_gain: pd.Series = gain.rolling(window=period, min_periods=period).mean()
    avg_loss: pd.Series = loss.rolling(window=period, min_periods=period).mean()

    # Wilder smoothing after the initial SMA seed
    for i in range(period, len(series)):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * (period - 1) + gain.iloc[i]) / period
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * (period - 1) + loss.iloc[i]) / period

    rs: pd.Series = avg_gain / avg_loss.replace(0, np.nan)
    rsi: pd.Series = 100.0 - (100.0 / (1.0 + rs))
    return rsi


def rsi_mean_reversion_with_stoploss(
    df: pd.DataFrame,
    rsi_period: int = 14,
    oversold: float = 30.0,
    overbought: float = 70.0,
    stop_loss_pct: float = STOP_LOSS_PCT,
) -> pd.DataFrame:
    """
    Enhanced RSI Mean Reversion with a path-dependent 2% stop-loss guard.

    This function replicates the original RSI Mean Reversion indicator
    calculations exactly, but replaces the vectorised signal generation
    with a stateful row-by-row loop that tracks whether a position is
    open and enforces a hard stop-loss floor at ``stop_loss_pct`` below
    entry price.

    Entry : RSI crosses below ``oversold``   → BUY
    Exit  : RSI crosses above ``overbought`` → SELL  (regular exit)
    Exit  : low ≤ entry × (1 - stop_loss_pct)→ SELL  (stop-loss exit)

    Parameters
    ----------
    df : pd.DataFrame
        OHLCV DataFrame with columns: open, high, low, close, volume.
    rsi_period : int
        RSI lookback period (default 14).
    oversold : float
        RSI BUY threshold (default 30.0).
    overbought : float
        RSI SELL threshold (default 70.0).
    stop_loss_pct : float
        Fractional stop-loss distance below entry (default 0.02 = 2%).

    Returns
    -------
    pd.DataFrame
        Augmented with: rsi, signal, execution_signal.
    """
    df = df.copy()

    # ── 1. Compute RSI (identical to the original strategy) ──────────
    df['rsi'] = _compute_rsi_wilder(df['close'], period=rsi_period)

    # Drop warm-up rows
    df.dropna(subset=['rsi'], inplace=True)
    df.reset_index(drop=True, inplace=True)

    # ── 2. Pre-extract arrays for fast iteration ─────────────────────
    n: int = len(df)
    close_arr: np.ndarray = df['close'].values.astype(np.float64)
    low_arr:   np.ndarray = df['low'].values.astype(np.float64)
    rsi_arr:   np.ndarray = df['rsi'].values.astype(np.float64)

    signal_arr: np.ndarray = np.zeros(n, dtype=np.int32)

    # ── 3. Stateful loop ─────────────────────────────────────────────
    in_position: bool  = False
    entry_price: float = 0.0
    sl_price:    float = 0.0

    for i in range(1, n):
        rsi_i:    float = float(rsi_arr[i])
        rsi_prev: float = float(rsi_arr[i - 1])
        close_i:  float = float(close_arr[i])
        low_i:    float = float(low_arr[i])

        if np.isnan(rsi_i) or np.isnan(rsi_prev):
            continue

        if not in_position:
            # ── Entry: RSI crosses below oversold ────────────────
            if rsi_i < oversold and rsi_prev >= oversold:
                signal_arr[i] = 1  # BUY
                in_position = True
                entry_price = close_i
                sl_price = entry_price * (1.0 - stop_loss_pct)
        else:
            # ── Check stop-loss FIRST (takes priority) ───────────
            if low_i <= sl_price:
                signal_arr[i] = -1  # SELL — stopped out
                in_position = False
                entry_price = 0.0
                sl_price    = 0.0

            # ── Check regular RSI overbought exit ────────────────
            elif rsi_i > overbought and rsi_prev <= overbought:
                signal_arr[i] = -1  # SELL — RSI exit
                in_position = False
                entry_price = 0.0
                sl_price    = 0.0

    # ── 4. Write signals & shift for look-ahead prevention ───────────
    df['signal'] = signal_arr
    df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)

    return df


# ══════════════════════════════════════════════════════════════════════════════
#  SILENT BACKTEST RUNNER (suppresses per-trade console spam)
# ══════════════════════════════════════════════════════════════════════════════

def _run_backtest_silent(
    df: pd.DataFrame,
    initial_capital: float,
    slippage_pct: float,
    commission_fixed: float,
) -> pd.DataFrame:
    """
    Runs the core backtest simulation engine with all stdout suppressed.
    This prevents 28 iterations from flooding the terminal with thousands
    of per-trade lines while still producing identical numeric results.
    """
    import io
    import contextlib

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        result_df = run_backtest(
            df,
            initial_capital=initial_capital,
            slippage_pct=slippage_pct,
            commission_fixed=commission_fixed,
        )
    return result_df


def _calculate_metrics_silent(
    backtest_df: pd.DataFrame,
    initial_capital: float,
) -> Dict:
    """
    Computes performance metrics with all stdout suppressed.
    """
    import io
    import contextlib

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        metrics = calculate_metrics(backtest_df, initial_capital)
    return metrics


# ══════════════════════════════════════════════════════════════════════════════
#  MATRIX BACKTEST ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def run_matrix_backtest() -> Tuple[
    Dict[str, Dict[str, Dict]],   # full results grid
    List[Dict],                    # flat list of all metrics
]:
    """
    Sequentially iterates through every (ticker, timeframe) pair in the
    configured watchlist/horizon grid.

    For each cell:
        1. Fetch historical 5-min bar data.
        2. Apply the RSI Mean Reversion strategy (with 2% SL guard).
        3. Run through the simulation engine with hard friction.
        4. Capture Total Return (%) and Total Executed Trades.

    Returns
    -------
    results : Dict[str, Dict[str, Dict]]
        Nested dict → results[ticker][timeframe_label] = metrics dict
    all_metrics : List[Dict]
        Flat list of every individual run's metrics (for global aggregation).
    """
    results: Dict[str, Dict[str, Dict]] = {}
    all_metrics: List[Dict] = []
    total_runs: int = len(WATCHLIST) * len(TIME_HORIZONS)
    run_counter: int = 0

    print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * 72}")
    print(f"  📐  ASSET-TIMEFRAME MATRIX BACKTEST")
    print(f"{'═' * 72}{Colors.RESET}")
    print(f"  Strategy      : RSI Mean Reversion (+ 2% Stop-Loss Guard)")
    print(f"  Watchlist     : {', '.join(WATCHLIST)}")
    print(f"  Timeframes    : {', '.join(TIME_HORIZONS.keys())}")
    print(f"  Slippage      : {SLIPPAGE_PCT * 100:.2f}% ({int(SLIPPAGE_PCT * 10_000)} bps)")
    print(f"  Commission    : ${COMMISSION:.2f}")
    print(f"  Capital       : ${INITIAL_CAPITAL:,.2f}")
    print(f"  Total Runs    : {total_runs}")
    print(f"{Colors.CYAN}{'─' * 72}{Colors.RESET}\n")

    for ticker in WATCHLIST:
        results[ticker] = {}

        for tf_label, days_back in TIME_HORIZONS.items():
            run_counter += 1
            cell_id: str = f"{ticker}/{tf_label}"

            print(
                f"  [{run_counter:>2}/{total_runs}]  "
                f"{Colors.YELLOW}{cell_id:<12}{Colors.RESET}  ",
                end="", flush=True,
            )

            try:
                # ── Step 1: Fetch Data (stdout suppressed) ───────────
                import io, contextlib
                buf = io.StringIO()
                with contextlib.redirect_stdout(buf):
                    raw_df: pd.DataFrame = fetch_historical_backtest_data(
                        symbol=ticker, days_back=days_back,
                    )

                bars_count: int = len(raw_df)

                # ── Step 2: Apply Strategy ───────────────────────────
                strategy_df: pd.DataFrame = rsi_mean_reversion_with_stoploss(raw_df)

                buy_signals:  int = int((strategy_df['signal'] == 1).sum())
                sell_signals: int = int((strategy_df['signal'] == -1).sum())

                # ── Step 3: Run Simulation ───────────────────────────
                result_df: pd.DataFrame = _run_backtest_silent(
                    strategy_df,
                    initial_capital=INITIAL_CAPITAL,
                    slippage_pct=SLIPPAGE_PCT,
                    commission_fixed=COMMISSION,
                )

                # ── Step 4: Compute Metrics ──────────────────────────
                metrics: Dict = _calculate_metrics_silent(result_df, INITIAL_CAPITAL)
                metrics['ticker']     = ticker
                metrics['timeframe']  = tf_label
                metrics['days_back']  = days_back
                metrics['bars_count'] = bars_count

                results[ticker][tf_label] = metrics
                all_metrics.append(metrics)

                # Inline progress
                ret: float    = metrics['total_return_pct']
                trades: int   = metrics['total_trades']
                ret_color: str = Colors.GREEN if ret >= 0 else Colors.RED
                print(
                    f"{bars_count:>6,} bars  →  "
                    f"{ret_color}{ret:>+8.2f}%{Colors.RESET}  "
                    f"({trades} trades)  "
                    f"{Colors.GREEN}✓{Colors.RESET}"
                )

            except Exception as exc:
                # Record failure gracefully — don't abort the full grid
                print(f"{Colors.RED}✗  FAILED: {exc}{Colors.RESET}")
                results[ticker][tf_label] = {
                    'total_return_pct': float('nan'),
                    'total_trades': 0,
                    'win_rate': 0.0,
                    'profit_factor': 0.0,
                    'error': str(exc),
                }

    print(f"\n{Colors.CYAN}{'─' * 72}{Colors.RESET}")
    print(f"  Matrix complete. {run_counter} runs executed.")
    print(f"{Colors.CYAN}{'═' * 72}{Colors.RESET}\n")

    return results, all_metrics


# ══════════════════════════════════════════════════════════════════════════════
#  FORMATTED GRID OUTPUT
# ══════════════════════════════════════════════════════════════════════════════

def print_results_grid(
    results: Dict[str, Dict[str, Dict]],
    all_metrics: List[Dict],
) -> None:
    """
    Prints a formatted ASCII grid with tickers as rows and timeframes as
    columns.  Each cell shows ``Return% (Trades)`` in colour.

    Then prints global aggregate metrics below the grid.
    """
    tf_labels: List[str] = list(TIME_HORIZONS.keys())

    # ── Column widths ────────────────────────────────────────────────
    ticker_col_w: int = 8
    cell_w: int = 18  # enough for "+12.34% (123)"

    header_line: str = f"  {'Ticker':<{ticker_col_w}}"
    for tf in tf_labels:
        header_line += f"  {tf:^{cell_w}}"

    separator: str = f"  {'─' * ticker_col_w}" + f"  {'─' * cell_w}" * len(tf_labels)
    total_w: int = ticker_col_w + 2 + (cell_w + 2) * len(tf_labels)

    print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * total_w}")
    print(f"  📊  RESULTS MATRIX — RSI Mean Reversion (2% SL Guard)")
    print(f"{'═' * total_w}{Colors.RESET}")
    print(f"\n{Colors.BOLD}{header_line}{Colors.RESET}")
    print(separator)

    for ticker in WATCHLIST:
        row: str = f"  {Colors.BOLD}{ticker:<{ticker_col_w}}{Colors.RESET}"

        for tf in tf_labels:
            cell_data: Dict = results.get(ticker, {}).get(tf, {})
            ret: float  = cell_data.get('total_return_pct', float('nan'))
            trades: int = cell_data.get('total_trades', 0)

            if math.isnan(ret):
                cell_str: str = f"{'ERR':^{cell_w}}"
                row += f"  {Colors.RED}{cell_str}{Colors.RESET}"
            else:
                ret_color: str = Colors.GREEN if ret >= 0 else Colors.RED
                # Format: "+4.20% (12)" — right-aligned in cell
                cell_text: str = f"{ret:>+.2f}% ({trades})"
                cell_str = f"{cell_text:^{cell_w}}"
                row += f"  {ret_color}{cell_str}{Colors.RESET}"

        print(row)

    print(separator)

    # ── Global Aggregates ────────────────────────────────────────────
    if not all_metrics:
        print(f"\n  {Colors.YELLOW}No successful runs to aggregate.{Colors.RESET}")
        return

    total_combined_trades: int = sum(m.get('total_trades', 0) for m in all_metrics)
    total_wins:  int = sum(m.get('winning_trades', 0) for m in all_metrics)
    total_losses: int = sum(m.get('losing_trades', 0) for m in all_metrics)

    global_win_rate: float = 0.0
    if total_combined_trades > 0:
        global_win_rate = (total_wins / total_combined_trades) * 100.0

    # Aggregate profit factor: sum of gross profits / sum of gross losses
    total_gross_profit: float = sum(m.get('gross_profit', 0.0) for m in all_metrics)
    total_gross_loss:   float = sum(abs(m.get('gross_loss', 0.0)) for m in all_metrics)
    global_profit_factor: float = (
        (total_gross_profit / total_gross_loss) if total_gross_loss > 0 else float('inf')
    )

    # Average return across all cells
    returns: List[float] = [
        m['total_return_pct'] for m in all_metrics
        if not math.isnan(m.get('total_return_pct', float('nan')))
    ]
    avg_return: float = np.mean(returns) if returns else 0.0

    # Best and worst cells
    best_cell:  Optional[Dict] = max(all_metrics, key=lambda m: m.get('total_return_pct', -999))
    worst_cell: Optional[Dict] = min(all_metrics, key=lambda m: m.get('total_return_pct', 999))

    pf_display: str = (
        f"{global_profit_factor:.4f}" if global_profit_factor != float('inf') else "∞"
    )

    print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * total_w}")
    print(f"  📈  GLOBAL AGGREGATE METRICS")
    print(f"{'═' * total_w}{Colors.RESET}")

    print(f"\n  {'Total Combined Trades':<28}: {total_combined_trades:>10}")
    wr_color: str = Colors.GREEN if global_win_rate >= 50 else Colors.RED
    print(f"  {'Global Win Rate':<28}: {wr_color}{global_win_rate:>9.1f}%{Colors.RESET}")
    print(f"  {'Winning Trades':<28}: {Colors.GREEN}{total_wins:>10}{Colors.RESET}")
    print(f"  {'Losing Trades':<28}: {Colors.RED}{total_losses:>10}{Colors.RESET}")

    pf_color: str = Colors.GREEN if global_profit_factor >= 1.0 else Colors.RED
    print(f"  {'Avg Profit Factor':<28}: {pf_color}{pf_display:>10}{Colors.RESET}")

    avg_color: str = Colors.GREEN if avg_return >= 0 else Colors.RED
    print(f"  {'Average Return (per cell)':<28}: {avg_color}{avg_return:>+9.2f}%{Colors.RESET}")

    print(f"\n  {Colors.GREEN}🏆 Best Cell  : {best_cell['ticker']}/{best_cell['timeframe']}"
          f"  →  {best_cell['total_return_pct']:>+.2f}%{Colors.RESET}")
    print(f"  {Colors.RED}📉 Worst Cell : {worst_cell['ticker']}/{worst_cell['timeframe']}"
          f"  →  {worst_cell['total_return_pct']:>+.2f}%{Colors.RESET}")

    print(f"\n{Colors.CYAN}{'═' * total_w}{Colors.RESET}\n")


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding='utf-8')
    os.system('')  # Enable ANSI escape codes on Windows

    print(f"\n{Colors.BOLD}{'🚀' * 3}  Matrix Backtest Runner  {'🚀' * 3}{Colors.RESET}")
    print(f"{Colors.DIM}  Strategy: RSI Mean Reversion + 2% Stop-Loss Guard")
    print(f"  Friction: {SLIPPAGE_PCT*100:.2f}% slippage, ${COMMISSION:.2f} commission")
    print(f"  Watchlist: {len(WATCHLIST)} tickers × {len(TIME_HORIZONS)} horizons"
          f" = {len(WATCHLIST) * len(TIME_HORIZONS)} runs{Colors.RESET}\n")

    start_time: float = time.time()

    results, all_metrics = run_matrix_backtest()
    print_results_grid(results, all_metrics)

    elapsed: float = time.time() - start_time
    minutes: int = int(elapsed // 60)
    seconds: float = elapsed % 60.0

    print(f"  {Colors.DIM}⏱  Total elapsed: {minutes}m {seconds:.1f}s{Colors.RESET}\n")
