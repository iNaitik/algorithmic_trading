"""
matrix_backtest/run_india_matrix.py
===================================
Multi-Factor Matrix Backtester for Indian NSE Equities (MIS).
Evaluates intraday strategies across multiple cross-sectional dimensions:
  1. Asset / Stock Universe (Multiple liquid sectors: Banks, IT, Auto, Energy)
  2. Candle Timeframes (1m Scalp, 2m Micro, 5m Intraday, 15m Momentum)
  3. Intraday Strategies (Midday VWAP Pullback, ORB Breakout, Failed-Gap Fade)
  4. Friction Stress Profiles (Statutory Indian Fees + Slippage: 3bps, 5bps, 10bps)
  5. Multi-Horizon Regimes (7d, 30d, 60d)

Usage:
------
    python -m matrix_backtest.run_india_matrix
    python matrix_backtest/run_india_matrix.py
"""

from __future__ import annotations

import os
import io
import sys
import math
import time
import csv
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import pandas as pd

# Add project root to sys.path
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn
    from rich import box
    console = Console()
    HAS_RICH = True
except ImportError:
    HAS_RICH = False
    console = None

from backtesting import (
    fetch_indian_data,
    run_backtest_india,
    calculate_metrics,
    Colors
)
from strategies import get_strategy, list_strategies


# ─────────────────────────────────────────────────────────────────────────────
# 1. Preset Matrix Configurations
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_WATCHLIST: List[Tuple[str, str, str]] = [
    ("SBIN.NS", "State Bank of India", "PSU Banking"),
    ("RELIANCE.NS", "Reliance Industries", "Energy / Conglomerate"),
    ("HDFCBANK.NS", "HDFC Bank Ltd.", "Private Banking"),
    ("ICICIBANK.NS", "ICICI Bank Ltd.", "Private Banking"),
    ("TCS.NS", "Tata Consultancy Services", "Information Technology"),
    ("INFY.NS", "Infosys Ltd.", "Information Technology"),
    ("AXISBANK.NS", "Axis Bank Ltd.", "Private Banking"),
    ("LT.NS", "Larsen & Toubro Ltd.", "Infrastructure / Industrials"),
]

DEFAULT_TIMEFRAMES: List[Tuple[str, str, int]] = [
    ("1m", "1-Minute Scalping", 7),       # yfinance limits 1m to 7 days
    ("2m", "2-Minute Micro-Momentum", 30), # 30 days
    ("5m", "5-Minute Standard MIS", 60),  # 60 days
    ("15m", "15-Minute Short Trend", 60), # 60 days
]

AVAILABLE_STRATEGIES: List[Tuple[str, str]] = [
    ("NSE Midday VWAP Pullback", "11:30-14:45 IST Midday VWAP + 9/21 EMA + RSI"),
    ("NSE Intraday ORB Breakout", "09:15-09:30 Opening Range Breakout with VWAP & 2R"),
    ("NSE Failed-Gap Fade", "Fading 0.3%-1.0% Gaps toward Prior Close"),
]

INITIAL_CAPITAL = 1_000_000.0  # ₹10,00,000 (10 Lakhs)
RESULTS_CSV_FILE = os.path.join(os.path.dirname(__file__), "india_matrix_results.csv")
REPORT_MD_FILE = os.path.join(os.path.dirname(__file__), "india_matrix_summary.md")


# ─────────────────────────────────────────────────────────────────────────────
# 2. In-Memory Data Caching Engine (Prevents Yahoo API Rate-Limits)
# ─────────────────────────────────────────────────────────────────────────────
_DATA_CACHE: Dict[Tuple[str, str, int], pd.DataFrame] = {}

def get_cached_indian_data(symbol: str, interval: str, lookback_days: int) -> pd.DataFrame:
    """Retrieves data from in-memory cache or downloads it once via yfinance."""
    cache_key = (symbol, interval.lower(), lookback_days)
    if cache_key in _DATA_CACHE:
        return _DATA_CACHE[cache_key].copy()

    try:
        # 1m is capped at 7 days by Yahoo Finance
        effective_days = min(lookback_days, 7) if interval.lower() == "1m" else min(lookback_days, 60)
        df = fetch_indian_data(symbol, days_back=effective_days, interval=interval)
        _DATA_CACHE[cache_key] = df.copy()
        return df.copy()
    except Exception as e:
        if HAS_RICH and console:
            console.print(f"[yellow]⚠️  Failed to fetch {symbol} ({interval}): {e}[/yellow]")
        else:
            print(f"[WARNING] Failed to fetch {symbol} ({interval}): {e}")
        return pd.DataFrame()


# ─────────────────────────────────────────────────────────────────────────────
# 3. Matrix Runner Engine
# ─────────────────────────────────────────────────────────────────────────────
def run_matrix_factor_evaluation(
    symbols: List[str],
    timeframes: List[Tuple[str, int]],
    strategies: List[str],
    initial_capital: float = INITIAL_CAPITAL
) -> List[Dict[str, Any]]:
    """
    Executes cross-sectional grid backtests across:
      Assets × Timeframes × Strategies.
    Returns list of comprehensive performance records.
    """
    total_runs = len(symbols) * len(timeframes) * len(strategies)
    results: List[Dict[str, Any]] = []
    run_idx = 0

    if HAS_RICH and console:
        console.print()
        console.print(Panel(
            f"[bold cyan]⚡ Running Multi-Factor Matrix Engine[/bold cyan]\n"
            f"[white]Grid Size: [bold yellow]{len(symbols)} Stocks[/bold yellow] × "
            f"[bold yellow]{len(timeframes)} Timeframes[/bold yellow] × "
            f"[bold yellow]{len(strategies)} Strategies[/bold yellow] = "
            f"[bold green]{total_runs} Total Iterations[/bold green][/white]",
            box=box.ROUNDED,
            border_style="bright_blue"
        ))

    for sym in symbols:
        for tf, lookback in timeframes:
            # Fetch/cache data once per (symbol, timeframe)
            df_raw = get_cached_indian_data(sym, tf, lookback)
            if df_raw.empty:
                continue

            for strat_name in strategies:
                run_idx += 1
                strat_func = get_strategy(strat_name)
                if not strat_func:
                    continue

                status_msg = f"[{run_idx}/{total_runs}] Testing {sym:<12} │ {tf:<4} │ {strat_name}"
                if HAS_RICH and console:
                    console.print(f"[dim]{status_msg}[/dim]")
                else:
                    print(status_msg)

                try:
                    # Generate strategy signals
                    strat_df = strat_func(df_raw.copy())
                    
                    # Redirect stdout into an in-memory string buffer to suppress per-trade verbose logs safely
                    original_stdout = sys.stdout
                    sys.stdout = io.StringIO()
                    
                    try:
                        backtest_df = run_backtest_india(strat_df, initial_capital=initial_capital)
                        metrics = calculate_metrics(backtest_df, initial_capital=initial_capital)
                    finally:
                        sys.stdout = original_stdout

                    # Compile metrics record
                    record = {
                        "symbol": sym,
                        "timeframe": tf,
                        "lookback_days": lookback,
                        "strategy": strat_name,
                        "total_trades": metrics.get("total_trades", 0),
                        "winning_trades": metrics.get("winning_trades", 0),
                        "losing_trades": metrics.get("losing_trades", 0),
                        "win_rate_pct": metrics.get("win_rate", 0.0),
                        "net_pnl": metrics.get("net_pnl", 0.0),
                        "total_return_pct": metrics.get("total_return_pct", 0.0),
                        "gross_trading_pnl": metrics.get("gross_trading_pnl", 0.0),
                        "total_charges": metrics.get("total_charges", 0.0),
                        "profit_factor": metrics.get("profit_factor", 0.0),
                        "max_drawdown_pct": metrics.get("max_drawdown_pct", 0.0),
                        "sharpe_ratio": metrics.get("sharpe_ratio", 0.0),
                        "final_equity": metrics.get("final_equity", initial_capital),
                    }
                    results.append(record)

                except Exception as e:
                    if HAS_RICH and console:
                        console.print(f"[bold red]❌ Error on {sym} ({tf}) with {strat_name}: {e}[/bold red]")
                    else:
                        print(f"[ERROR] {sym} ({tf}) {strat_name}: {e}")

    return results


# ─────────────────────────────────────────────────────────────────────────────
# 4. Formatted Display & Analytics Reporting
# ─────────────────────────────────────────────────────────────────────────────
def display_matrix_reports(results: List[Dict[str, Any]]):
    """Generates structured visual tables and analytical leaderboards."""
    if not results:
        print("\n[!] No matrix results to display.")
        return

    results_df = pd.DataFrame(results)

    # ── Table 1: Consolidated Performance Leaderboard ───────────────────────
    sorted_df = results_df.sort_values(by="total_return_pct", ascending=False)

    if HAS_RICH and console:
        table = Table(
            title="🏆 Consolidated Multi-Factor Strategy Leaderboard (Ranked by In-Hand Return)",
            box=box.ROUNDED,
            header_style="bold cyan"
        )
        table.add_column("#", justify="center", style="bold yellow", no_wrap=True)
        table.add_column("Symbol", style="bold white", no_wrap=True)
        table.add_column("TF", justify="center", style="cyan", no_wrap=True)
        table.add_column("Strategy", style="bold green")
        table.add_column("Trades", justify="right")
        table.add_column("Win Rate", justify="right")
        table.add_column("Gross P&L", justify="right")
        table.add_column("Taxes & Fees", justify="right", style="red")
        table.add_column("Net In-Hand P&L", justify="right", style="bold")
        table.add_column("Return %", justify="right", style="bold")
        table.add_column("Profit Factor", justify="right")
        table.add_column("Max DD", justify="right", style="magenta")
        table.add_column("Sharpe", justify="right")

        for idx, row in enumerate(sorted_df.to_dict(orient="records"), 1):
            ret = row["total_return_pct"]
            ret_style = "bold green" if ret > 0 else ("bold red" if ret < 0 else "dim")
            pnl_style = "green" if row["net_pnl"] > 0 else ("red" if row["net_pnl"] < 0 else "dim")
            pf_str = f"{row['profit_factor']:.2f}" if row['profit_factor'] != float('inf') else "∞"

            table.add_row(
                str(idx),
                row["symbol"],
                row["timeframe"],
                row["strategy"],
                str(row["total_trades"]),
                f"{row['win_rate_pct']:.1f}%",
                f"₹{row['gross_trading_pnl']:+,.2f}",
                f"₹{row['total_charges']:,.2f}",
                f"[{pnl_style}]₹{row['net_pnl']:+,.2f}[/{pnl_style}]",
                f"[{ret_style}]{ret:+.2f}%[/{ret_style}]",
                pf_str,
                f"{row['max_drawdown_pct']:.2f}%",
                f"{row['sharpe_ratio']:.2f}"
            )
        console.print(table)
    else:
        print("\n" + "=" * 110)
        print("  CONSOLIDATED STRATEGY LEADERBOARD")
        print("=" * 110)
        for idx, r in enumerate(sorted_df.to_dict(orient="records"), 1):
            print(f"{idx:<2}. {r['symbol']:<12} {r['timeframe']:<4} {r['strategy']:<26} │ "
                  f"Trades: {r['total_trades']:<3} │ Win: {r['win_rate_pct']:>5.1f}% │ "
                  f"Net: ₹{r['net_pnl']:>+10,.2f} ({r['total_return_pct']:>+6.2f}%) │ DD: {r['max_drawdown_pct']:>5.2f}%")

    # ── Table 2: Cross-Sectional Heatmap (Assets vs Timeframes) ──────────────
    if HAS_RICH and console:
        console.print()
        heat_table = Table(
            title="🗺️ Cross-Sectional Return Matrix (Asset × Timeframe Breakdown)",
            box=box.ROUNDED,
            header_style="bold magenta"
        )
        heat_table.add_column("Symbol / Asset", style="bold white", no_wrap=True)

        unique_tfs = sorted(list(set(results_df["timeframe"].values)), key=lambda x: int(x.replace("m", "")))
        for tf in unique_tfs:
            heat_table.add_column(f"{tf} Return", justify="center")

        unique_syms = sorted(list(set(results_df["symbol"].values)))
        for sym in unique_syms:
            row_vals = [sym]
            for tf in unique_tfs:
                sub = results_df[(results_df["symbol"] == sym) & (results_df["timeframe"] == tf)]
                if not sub.empty:
                    # Average return across tested strategies for this (symbol, tf)
                    avg_ret = sub["total_return_pct"].mean()
                    total_t = sub["total_trades"].sum()
                    color = "bold green" if avg_ret > 0 else ("bold red" if avg_ret < 0 else "dim")
                    row_vals.append(f"[{color}]{avg_ret:+.2f}% ({total_t}t)[/{color}]")
                else:
                    row_vals.append("[dim]N/A[/dim]")
            heat_table.add_row(*row_vals)

        console.print(heat_table)

    # ── Table 3: Strategy Comparison Summary ─────────────────────────────────
    strat_summary = results_df.groupby("strategy").agg({
        "total_trades": "sum",
        "winning_trades": "sum",
        "net_pnl": ["sum", "mean"],
        "total_charges": "sum",
        "total_return_pct": "mean",
        "sharpe_ratio": "mean"
    }).reset_index()

    if HAS_RICH and console:
        console.print()
        strat_table = Table(title="📊 Strategy Performance Comparison", box=box.ROUNDED, header_style="bold yellow")
        strat_table.add_column("Strategy Name", style="bold white")
        strat_table.add_column("Total Trades", justify="right")
        strat_table.add_column("Overall Win Rate", justify="right")
        strat_table.add_column("Cumulative Net P&L", justify="right")
        strat_table.add_column("Avg Return %", justify="right")
        strat_table.add_column("Total Taxes & Costs", justify="right", style="red")
        strat_table.add_column("Mean Sharpe", justify="right")

        for s in results_df["strategy"].unique():
            sub = results_df[results_df["strategy"] == s]
            trades = sub["total_trades"].sum()
            wins = sub["winning_trades"].sum()
            wr = (wins / trades * 100.0) if trades > 0 else 0.0
            cum_pnl = sub["net_pnl"].sum()
            avg_ret = sub["total_return_pct"].mean()
            costs = sub["total_charges"].sum()
            sharpe = sub["sharpe_ratio"].mean()

            pnl_style = "bold green" if cum_pnl >= 0 else "bold red"
            strat_table.add_row(
                s,
                str(trades),
                f"{wr:.1f}%",
                f"[{pnl_style}]₹{cum_pnl:+,.2f}[/{pnl_style}]",
                f"[{pnl_style}]{avg_ret:+.2f}%[/{pnl_style}]",
                f"₹{costs:,.2f}",
                f"{sharpe:.2f}"
            )
        console.print(strat_table)


# ─────────────────────────────────────────────────────────────────────────────
# 5. File Export Engine (CSV & Markdown)
# ─────────────────────────────────────────────────────────────────────────────
def export_matrix_data(results: List[Dict[str, Any]], export_mode: str = "none"):
    """
    Exports structured results based on user selection:
      - 'none' : Does not write any file to disk (Display only).
      - 'csv'  : Exports india_matrix_results.csv (Excel compatible).
      - 'excel': Exports india_matrix_results.xlsx (or .csv fallback if openpyxl missing).
      - 'both' : Exports both CSV and Markdown summary report.
    """
    if not results or export_mode == "none":
        if HAS_RICH and console:
            console.print("[dim]ℹ️  Export skipped. Results kept in-memory display only (No disk files created).[/dim]\n")
        else:
            print("[INFO] Export skipped. Results kept in-memory display only (No disk files created).\n")
        return

    results_df = pd.DataFrame(results)
    exported_files = []

    # CSV Export
    if export_mode in ("csv", "both"):
        results_df.to_csv(RESULTS_CSV_FILE, index=False)
        exported_files.append(("CSV Dataset", RESULTS_CSV_FILE))

    # Excel (.xlsx) Export
    if export_mode == "excel":
        xlsx_file = os.path.join(os.path.dirname(__file__), "india_matrix_results.xlsx")
        try:
            results_df.to_excel(xlsx_file, index=False, engine="openpyxl")
            exported_files.append(("Excel Spreadsheet", xlsx_file))
        except Exception:
            # Graceful fallback to CSV if openpyxl is not installed
            results_df.to_csv(RESULTS_CSV_FILE, index=False)
            exported_files.append(("Excel-Compatible CSV", RESULTS_CSV_FILE))

    # Markdown Summary Report
    if export_mode in ("both",):
        with open(REPORT_MD_FILE, "w", encoding="utf-8") as f:
            f.write("# 🇮🇳 Indian Equities Strategy Matrix Backtest Report\n\n")
            f.write(f"**Execution Timestamp:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S IST')}  \n")
            f.write(f"**Starting Capital:** ₹{INITIAL_CAPITAL:,.2f} per run  \n")
            f.write(f"**Total Tested Combinations:** {len(results)}  \n\n")

            f.write("## 1. Top Performing Strategy Configurations\n\n")
            f.write("| # | Symbol | TF | Strategy | Trades | Win Rate | Gross P&L | Taxes & Fees | Net In-Hand P&L | Return % | Sharpe |\n")
            f.write("| - | - | - | - | - | - | - | - | - | - | - |\n")

            sorted_df = results_df.sort_values(by="total_return_pct", ascending=False)
            for idx, r in enumerate(sorted_df.to_dict(orient="records")[:15], 1):
                f.write(f"| {idx} | `{r['symbol']}` | `{r['timeframe']}` | {r['strategy']} | {r['total_trades']} | {r['win_rate_pct']:.1f}% | ₹{r['gross_trading_pnl']:+,.2f} | ₹{r['total_charges']:,.2f} | **₹{r['net_pnl']:+,.2f}** | **{r['total_return_pct']:+.2f}%** | {r['sharpe_ratio']:.2f} |\n")

            f.write("\n## 2. Strategy Aggregate Summary\n\n")
            f.write("| Strategy | Total Trades | Win Rate | Cumulative Net P&L | Total Costs & Taxes |\n")
            f.write("| - | - | - | - | - |\n")
            for s in results_df["strategy"].unique():
                sub = results_df[results_df["strategy"] == s]
                trades = sub["total_trades"].sum()
                wins = sub["winning_trades"].sum()
                wr = (wins / trades * 100.0) if trades > 0 else 0.0
                cum_pnl = sub["net_pnl"].sum()
                costs = sub["total_charges"].sum()
                f.write(f"| **{s}** | {trades} | {wr:.1f}% | ₹{cum_pnl:+,.2f} | ₹{costs:,.2f} |\n")
        exported_files.append(("Markdown Summary", REPORT_MD_FILE))

    if HAS_RICH and console:
        console.print(f"\n[green]✅ Export completed:[/green]")
        for desc, path in exported_files:
            console.print(f"   • {desc:<22} : [dim]{path}[/dim]")
        console.print()
    else:
        print("\n[OK] Export completed:")
        for desc, path in exported_files:
            print(f"   - {desc}: {path}")
        print()


# ─────────────────────────────────────────────────────────────────────────────
# 6. Interactive Terminal Wizard
# ─────────────────────────────────────────────────────────────────────────────
def main():
    if HAS_RICH and console:
        console.print()
        console.print(Panel(
            "[bold cyan]🇮🇳  NSE Strategy Matrix Backtester[/bold cyan]\n"
            "[dim white]Cross-Sectional Factor Evaluation • Multi-Asset × Multi-Timeframe × Multi-Strategy[/dim white]",
            box=box.DOUBLE,
            border_style="bright_blue",
            padding=(0, 2)
        ))
        console.print()
    else:
        print("==================================================================")
        print("  NSE Strategy Matrix Backtester (Multi-Factor Quantitative Grid)")
        print("==================================================================")

    # Mode Selection
    print("Choose Execution Mode:")
    print("  1. Fast Core Matrix (4 Key Stocks × 3 Timeframes × 3 Strategies = 36 Combinations) [Recommended]")
    print("  2. Full Extensive Matrix (8 Stocks × 4 Timeframes × 3 Strategies = 96 Combinations)")
    print("  3. Custom Selection (Choose your own stocks and timeframes)")

    prompt = "\nEnter mode [1-3, default 1]: "
    try:
        mode = (console.input(f"[bold yellow]{prompt}[/bold yellow]") if HAS_RICH and console else input(prompt)).strip()
    except (EOFError, KeyboardInterrupt):
        mode = "1"

    if mode == "2":
        # Full Matrix
        selected_symbols = [s[0] for s in DEFAULT_WATCHLIST]
        selected_timeframes = [(tf[0], tf[2]) for tf in DEFAULT_TIMEFRAMES]
    elif mode == "3":
        # Custom Selection
        print("\nSelect Stocks (comma-separated numbers or press Enter for Top 4):")
        for idx, (sym, name, sec) in enumerate(DEFAULT_WATCHLIST, 1):
            print(f"  {idx}. {sym:<14} ({name} - {sec})")
        try:
            sym_in = (console.input("[bold yellow]Enter numbers [e.g. 1, 2, 5]: [/bold yellow]") if HAS_RICH and console else input("Enter numbers: ")).strip()
        except (EOFError, KeyboardInterrupt):
            sym_in = ""
        
        if sym_in:
            indices = [int(x.strip()) - 1 for x in sym_in.split(",") if x.strip().isdigit()]
            selected_symbols = [DEFAULT_WATCHLIST[i][0] for i in indices if 0 <= i < len(DEFAULT_WATCHLIST)]
        else:
            selected_symbols = ["SBIN.NS", "RELIANCE.NS", "HDFCBANK.NS", "ICICIBANK.NS"]

        print("\nSelect Timeframes:")
        print("  1. 1m, 2m, 5m (High-frequency & Intraday)")
        print("  2. 5m, 15m (Standard Intraday)")
        print("  3. All (1m, 2m, 5m, 15m)")
        try:
            tf_choice = (console.input("[bold yellow]Enter choice [1-3, default 1]: [/bold yellow]") if HAS_RICH and console else input("Enter choice: ")).strip()
        except (EOFError, KeyboardInterrupt):
            tf_choice = "1"

        if tf_choice == "2":
            selected_timeframes = [("5m", 60), ("15m", 60)]
        elif tf_choice == "3":
            selected_timeframes = [(tf[0], tf[2]) for tf in DEFAULT_TIMEFRAMES]
        else:
            selected_timeframes = [("1m", 7), ("2m", 30), ("5m", 60)]
    else:
        # Default: Fast Core Matrix (Top 4 liquid stocks across sectors)
        selected_symbols = ["SBIN.NS", "RELIANCE.NS", "HDFCBANK.NS", "ICICIBANK.NS"]
        selected_timeframes = [("1m", 7), ("2m", 30), ("5m", 60)]

    selected_strategies = [s[0] for s in AVAILABLE_STRATEGIES]

    start_time = time.time()
    results = run_matrix_factor_evaluation(
        symbols=selected_symbols,
        timeframes=selected_timeframes,
        strategies=selected_strategies,
        initial_capital=INITIAL_CAPITAL
    )

    elapsed = time.time() - start_time
    display_matrix_reports(results)

    # Interactive Export Selection
    if HAS_RICH and console:
        console.print()
        exp_table = Table(title="💾 Export Matrix Results to Disk?", box=box.ROUNDED, header_style="bold yellow")
        exp_table.add_column("#", justify="center", style="bold yellow", no_wrap=True)
        exp_table.add_column("Option", style="bold white", no_wrap=True)
        exp_table.add_column("Description", style="dim white")
        exp_table.add_column("Default", justify="center", style="bold green", no_wrap=True)

        exp_table.add_row("1", "Do NOT Export", "Keep results in-memory display only (No disk clutter)", "[Default]")
        exp_table.add_row("2", "CSV Dataset", "Export results to india_matrix_results.csv", "")
        exp_table.add_row("3", "Excel Spreadsheet", "Export to india_matrix_results.xlsx / .csv", "")
        exp_table.add_row("4", "Both (CSV + Markdown)", "Export full CSV dataset and Markdown summary report", "")
        console.print(exp_table)
        exp_choice = console.input("[bold yellow]Enter choice [1-4, default 1 to skip]: [/bold yellow]").strip()
    else:
        print("\nExport Matrix Results to Disk?")
        print("  1. Do NOT Export (Display only) [Default]")
        print("  2. Export to CSV file")
        print("  3. Export to Excel Spreadsheet")
        print("  4. Export Both (CSV + Markdown Summary)")
        try:
            exp_choice = input("Enter choice [1-4, default 1]: ").strip()
        except (EOFError, KeyboardInterrupt):
            exp_choice = "1"

    if exp_choice == "2":
        mode_str = "csv"
    elif exp_choice == "3":
        mode_str = "excel"
    elif exp_choice == "4":
        mode_str = "both"
    else:
        mode_str = "none"

    export_matrix_data(results, export_mode=mode_str)

    mins = int(elapsed // 60)
    secs = elapsed % 60.0
    if HAS_RICH and console:
        console.print(f"[dim]⏱️ Matrix execution completed in {mins}m {secs:.1f}s[/dim]\n")
    else:
        print(f"Total execution time: {mins}m {secs:.1f}s\n")


if __name__ == "__main__":
    main()

