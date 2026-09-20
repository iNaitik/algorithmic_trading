# CHANGELOG
# [2026-05-31] - FIX 1: Strict greater-than for breakeven_lock_until
# [2026-05-31] - FIX 2: Correct debug assertion logic for breakeven exits
# See prompt spec for full change descriptions.

"""
matrix_backtest/run_forex_matrix.py
Multi-Asset Forex Validation Matrix for London Breakout Strategy
"""

import sys
import os
import math
from typing import Dict, List, Tuple
from datetime import datetime

import pandas as pd
import numpy as np
import yfinance as yf

# Add root directory to sys.path to import strategies
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from strategies.us.london_breakout import london_breakout_strategy

# ──────────────────────────────────────────────────────────────────────────────
# Terminal Color Support
# ──────────────────────────────────────────────────────────────────────────────
sys.stdout.reconfigure(encoding='utf-8')
os.system('')  # Enable ANSI escape codes on Windows

class Colors:
    GREEN  = '\033[92m'
    RED    = '\033[91m'
    CYAN   = '\033[96m'
    YELLOW = '\033[93m'
    BOLD   = '\033[1m'
    RESET  = '\033[0m'

FOREX_WATCHLIST = ["EURUSD=X", "GBPUSD=X", "USDJPY=X"]
LOOKBACK_DAYS = 60
INTERVAL = "15m"
INITIAL_CAPITAL = 100000.0

def get_spread_adjustment(symbol: str) -> float:
    """Returns the half-spread pip adjustment based on the currency pair."""
    if symbol == "EURUSD=X":
        return 0.000075  # 1.5 pips round-trip (4th decimal)
    elif symbol == "GBPUSD=X":
        return 0.000100  # 2.0 pips round-trip (4th decimal)
    elif symbol == "USDJPY=X":
        return 0.0075    # 1.5 pips round-trip (2nd decimal)
    else:
        return 0.000100  # Default 2 pips

def fetch_data(symbol: str) -> pd.DataFrame:
    print(f"{Colors.CYAN}📡 Downloading {LOOKBACK_DAYS} days of {INTERVAL} data for {symbol}...{Colors.RESET}")
    df = yf.download(tickers=symbol, period=f"{LOOKBACK_DAYS}d", interval=INTERVAL, progress=False)
    
    if df.empty:
        raise ValueError(f"No data for {symbol}")
        
    # Handle yfinance >=0.2.x returning MultiIndex columns
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
        
    df.columns = [c.lower().replace(' ', '_') for c in df.columns]
    
    if df.index.tz is None:
        df.index = df.index.tz_localize('UTC')
    elif str(df.index.tz) != 'UTC':
        df.index = df.index.tz_convert('UTC')
        
    return df

def split_data(df: pd.DataFrame, train_ratio: float = 0.70) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Splits the DataFrame into train and test segments by index position.
    """
    split_idx = int(len(df) * train_ratio)
    return df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()

def run_isolated_simulation(df: pd.DataFrame, half_spread: float) -> Tuple[Dict, List[Dict]]:
    cash = INITIAL_CAPITAL
    units = 0
    entry_price = 0.0
    sl_price = 0.0
    tp_price = 0.0
    tp1_price = 0.0
    scaled_out = False
    position_direction = None
    
    n = len(df)
    equity_arr = np.zeros(n, dtype=np.float64)
    trade_log = []
    
    # Cast to float64 immediately to prevent pandas inference issues
    open_prices = df['open'].values.astype(np.float64)
    high_prices = df['high'].values.astype(np.float64)
    low_prices = df['low'].values.astype(np.float64)
    close_prices = df['close'].values.astype(np.float64)
    signals = df['execution_signal'].values.astype(np.int32)
    
    if 'atr' not in df.columns:
        raise ValueError("ATR column missing from strategy output DataFrame")
    atr_values = df['atr'].values.astype(np.float64)
    
    breakeven_lock_until = -1
    
    for i in range(n):
        signal = signals[i]
        bar_open = open_prices[i]
        bar_high = high_prices[i]
        bar_low = low_prices[i]
        bar_close = close_prices[i]
        current_atr = atr_values[i]
        
        # 1. Process Open-based Signal Exits (signal == 2)
        if signal == 2 and position_direction == 'long':
            fill_price = bar_open - half_spread
            proceeds = units * fill_price
            trade_pnl = (fill_price - entry_price) * units
            trade_log.append({'bar_index': i, 'direction': 'long', 'pnl': round(trade_pnl, 4), 'is_win': trade_pnl >= 0.0, 'type': 'exit'})
            cash += proceeds
            units = 0
            position_direction = None
            scaled_out = False
            
        elif signal == 2 and position_direction == 'short':
            fill_price = bar_open + half_spread
            cost = units * fill_price
            trade_pnl = (entry_price - fill_price) * units
            trade_log.append({'bar_index': i, 'direction': 'short', 'pnl': round(trade_pnl, 4), 'is_win': trade_pnl >= 0.0, 'type': 'exit'})
            cash -= cost
            units = 0
            position_direction = None
            scaled_out = False

        # 2. Process Open-based Signal Entries
        if signal == 1 and position_direction is None:
            fill_price = bar_open + half_spread
            affordable_units = int(cash / fill_price)
            if affordable_units > 0:
                cost = affordable_units * fill_price
                cash -= cost
                units = affordable_units
                entry_price = fill_price
                position_direction = 'long'
                scaled_out = False
                
                # ── ATR Bar Alignment Note ─────────────────────────────────────────
                # current_atr here is from the execution bar (bar i in this loop),
                # which corresponds to bar i-1 in the strategy (pre-shift signal).
                # SL/TP levels are therefore set using the ATR of the last closed
                # bar before entry, which is correct and look-ahead clean.
                # ──────────────────────────────────────────────────────────────────
                sl_price = entry_price - (1.5 * current_atr)
                tp1_price = entry_price + (2.0 * current_atr)
                tp_price = entry_price + (3.0 * current_atr)
                
        elif signal == -1 and position_direction is None:
            fill_price = bar_open - half_spread
            affordable_units = int(cash / fill_price)
            if affordable_units > 0:
                proceeds = affordable_units * fill_price
                cash += proceeds
                units = affordable_units
                entry_price = fill_price
                position_direction = 'short'
                scaled_out = False
                
                # ── ATR Bar Alignment Note ─────────────────────────────────────────
                # current_atr here is from the execution bar (bar i in this loop),
                # which corresponds to bar i-1 in the strategy (pre-shift signal).
                # SL/TP levels are therefore set using the ATR of the last closed
                # bar before entry, which is correct and look-ahead clean.
                # ──────────────────────────────────────────────────────────────────
                sl_price = entry_price + (1.5 * current_atr)
                tp1_price = entry_price - (2.0 * current_atr)
                tp_price = entry_price - (3.0 * current_atr)

        # 3. Process Intrabar SL/TP Exits for active positions
        exit_triggered = False
        fill_price = 0.0
        
        if position_direction == 'long':
            # Check Scale-Out (TP1)
            if not scaled_out and bar_high >= tp1_price:
                scale_units = units // 2
                if scale_units > 0:
                    scale_fill = tp1_price
                    proceeds = scale_units * scale_fill
                    trade_pnl = (scale_fill - entry_price) * scale_units
                    trade_log.append({'bar_index': i, 'direction': 'long', 'pnl': round(trade_pnl, 4), 'is_win': trade_pnl >= 0.0, 'type': 'partial'})
                    cash += proceeds
                    units -= scale_units
                    scaled_out = True
                    sl_price = entry_price  # Trail SL to breakeven
                    breakeven_lock_until = i + 1
                    
            # Check SL/TP
            if units > 0:
                if i > breakeven_lock_until and bar_low <= sl_price:
                    fill_price = sl_price
                    exit_triggered = True
                elif bar_high >= tp_price:
                    fill_price = tp_price
                    exit_triggered = True
                    
        elif position_direction == 'short':
            # Check Scale-Out (TP1)
            if not scaled_out and bar_low <= tp1_price:
                scale_units = units // 2
                if scale_units > 0:
                    scale_fill = tp1_price
                    cost = scale_units * scale_fill
                    trade_pnl = (entry_price - scale_fill) * scale_units
                    trade_log.append({'bar_index': i, 'direction': 'short', 'pnl': round(trade_pnl, 4), 'is_win': trade_pnl >= 0.0, 'type': 'partial'})
                    cash -= cost
                    units -= scale_units
                    scaled_out = True
                    sl_price = entry_price  # Trail SL to breakeven
                    breakeven_lock_until = i + 1
                    
            # Check SL/TP
            if units > 0:
                if i > breakeven_lock_until and bar_high >= sl_price:
                    fill_price = sl_price
                    exit_triggered = True
                elif bar_low <= tp_price:
                    fill_price = tp_price
                    exit_triggered = True

        # 4. Process Intrabar Exit Fill
        if exit_triggered:
            if position_direction == 'long':
                proceeds = units * fill_price
                trade_pnl = (fill_price - entry_price) * units
                trade_log.append({'bar_index': i, 'direction': 'long', 'pnl': round(trade_pnl, 4), 'is_win': trade_pnl >= 0.0, 'type': 'exit'})
                cash += proceeds
            else: # short
                cost = units * fill_price
                trade_pnl = (entry_price - fill_price) * units
                trade_log.append({'bar_index': i, 'direction': 'short', 'pnl': round(trade_pnl, 4), 'is_win': trade_pnl >= 0.0, 'type': 'exit'})
                cash -= cost
                
            units = 0
            position_direction = None
            scaled_out = False

        # 5. Record Equity
        if position_direction == 'long':
            equity_arr[i] = cash + (units * bar_close)
        elif position_direction == 'short':
            equity_arr[i] = cash - (units * bar_close)
        else:
            equity_arr[i] = cash
            
    # Handle open position at end of sim
    if units > 0:
        final_close = float(close_prices[-1])
        if position_direction == 'long':
            equity_arr[-1] = cash + (units * final_close)
        else: # short
            equity_arr[-1] = cash - (units * final_close)
            
    # Debug assertion
    zero_exit_count = 0
    for idx, trade in enumerate(trade_log):
        if trade['type'] == 'exit' and trade['pnl'] == 0.0:
            if idx > 0 and trade_log[idx-1]['type'] == 'partial':
                bars_apart = trade['bar_index'] - trade_log[idx-1]['bar_index']
                if bars_apart == 0:
                    zero_exit_count += 1
                
    if zero_exit_count > 0:
        print(f"{Colors.YELLOW}WARNING: {zero_exit_count} zero-exit(s) after partial detected — breakeven lock may still be insufficient{Colors.RESET}")
            
    return calculate_metrics(equity_arr, trade_log), trade_log

def calculate_metrics(equity_arr: np.ndarray, trade_log: List[Dict]) -> Dict:
    final_equity = float(equity_arr[-1])
    net_pnl = final_equity - INITIAL_CAPITAL
    total_return_pct = (net_pnl / INITIAL_CAPITAL) * 100.0
    
    total_trades = len(trade_log)
    winning_trades = sum(1 for t in trade_log if t['is_win'])
    losing_trades = total_trades - winning_trades
    win_rate = (winning_trades / total_trades * 100.0) if total_trades > 0 else 0.0
    
    long_trades = sum(1 for t in trade_log if t['direction'] == 'long')
    short_trades = sum(1 for t in trade_log if t['direction'] == 'short')
    
    long_wins = sum(1 for t in trade_log if t['direction'] == 'long' and t['is_win'])
    short_wins = sum(1 for t in trade_log if t['direction'] == 'short' and t['is_win'])
    
    long_win_rate = (long_wins / long_trades * 100.0) if long_trades > 0 else 0.0
    short_win_rate = (short_wins / short_trades * 100.0) if short_trades > 0 else 0.0
    
    avg_win = sum(t['pnl'] for t in trade_log if t['is_win']) / winning_trades if winning_trades > 0 else 0.0
    avg_loss = sum(t['pnl'] for t in trade_log if not t['is_win']) / losing_trades if losing_trades > 0 else 0.0
    
    gross_profit = sum(t['pnl'] for t in trade_log if t['is_win'])
    gross_loss = abs(sum(t['pnl'] for t in trade_log if not t['is_win']))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else float('inf')
    
    # Max Drawdown
    equity_series = pd.Series(equity_arr)
    running_max = equity_series.cummax()
    drawdown = (equity_series - running_max) / running_max * 100.0
    max_dd = float(drawdown.min())
    
    # Sharpe Ratio (annualized for 15-min bars, approx 96 bars/day * 252 days)
    returns = equity_series.pct_change().dropna()
    bars_per_day = 96
    trading_days_per_year = 252
    annualisation_factor = math.sqrt(bars_per_day * trading_days_per_year)
    
    if returns.std() != 0 and len(returns) > 1:
        sharpe_ratio = (returns.mean() / returns.std()) * annualisation_factor
    else:
        sharpe_ratio = 0.0
        
    return {
        'net_pnl': net_pnl,
        'total_return_pct': total_return_pct,
        'total_trades': total_trades,
        'win_rate': win_rate,
        'long_trades': long_trades,
        'short_trades': short_trades,
        'long_win_rate': long_win_rate,
        'short_win_rate': short_win_rate,
        'avg_win': avg_win,
        'avg_loss': avg_loss,
        'max_dd': max_dd,
        'sharpe_ratio': sharpe_ratio,
        'profit_factor': profit_factor
    }

def main():
    print(f"\n{Colors.BOLD}{Colors.YELLOW}{'═' * 95}")
    print(f"  💱 FOREX MULTI-ASSET VALIDATION LEADERBOARD")
    print(f"{'═' * 95}{Colors.RESET}")
    
    results = []
    split_results = []
    all_trades_log = []
    
    for symbol in FOREX_WATCHLIST:
        try:
            df = fetch_data(symbol)
            # Run strategy
            strategy_df = london_breakout_strategy(df)
            
            # Split data
            train_df, test_df = split_data(strategy_df, train_ratio=0.70)
            
            # Run simulation
            half_spread = get_spread_adjustment(symbol)
            
            # Full dataset run
            metrics_full, logs_full = run_isolated_simulation(strategy_df, half_spread)
            metrics_full['asset'] = symbol
            results.append(metrics_full)
            
            for t in logs_full:
                t['symbol'] = symbol
                all_trades_log.append(t)
            
            # Split dataset runs
            metrics_train, _ = run_isolated_simulation(train_df, half_spread)
            metrics_test, _ = run_isolated_simulation(test_df, half_spread)
            
            split_results.append({
                'asset': symbol,
                'train_return': metrics_train['total_return_pct'],
                'test_return': metrics_test['total_return_pct']
            })
            
        except Exception as e:
            print(f"{Colors.RED}Error processing {symbol}: {e}{Colors.RESET}")

    if not results:
        return

    # Sort results by net P&L
    results = sorted(results, key=lambda x: x['net_pnl'], reverse=True)
    
    # Consolidated Leaderboard Render
    print(f"\n  {'Asset':<12} | {'Net P&L':>14} | {'Win Rate':>10} | {'PF':>8} | {'Max DD':>10} | {'Sharpe':>10}")
    print(f"  {'-' * 12}-+-{'-' * 14}-+-{'-' * 10}-+-{'-' * 8}-+-{'-' * 10}-+-{'-' * 10}")
    
    for r in results:
        asset = r['asset'].replace('=X', '')
        pnl = r['net_pnl']
        wr = r['win_rate']
        pf = r['profit_factor']
        dd = r['max_dd']
        sharpe = r['sharpe_ratio']
        
        pnl_color = Colors.GREEN if pnl >= 0 else Colors.RED
        wr_color = Colors.GREEN if wr >= 50 else Colors.RED
        pf_str = f"{pf:>8.2f}" if pf != float('inf') else "       ∞"
        pf_color = Colors.GREEN if pf >= 1.0 else Colors.RED
        sharpe_color = Colors.GREEN if sharpe > 0 else Colors.RED
        
        print(f"  {asset:<12} | "
              f"{pnl_color}${pnl:>13,.2f}{Colors.RESET} | "
              f"{wr_color}{wr:>9.1f}%{Colors.RESET} | "
              f"{pf_color}{pf_str}{Colors.RESET} | "
              f"{Colors.RED}{dd:>9.2f}%{Colors.RESET} | "
              f"{sharpe_color}{sharpe:>10.4f}{Colors.RESET}")
              
    print(f"\n{Colors.YELLOW}{'═' * 95}{Colors.RESET}")

    # Train/Test Split Degradation Table
    print(f"\n  WALK-FORWARD VALIDATION (42-day train / 18-day test)")
    print(f"  {'Asset':<12} | {'Train Return%':>14} | {'Test Return%':>13} | {'Degradation%':>13}")
    print(f"  {'-' * 12}-+-{'-' * 14}-+-{'-' * 13}-+-{'-' * 13}")
    
    for sr in split_results:
        asset = sr['asset'].replace('=X', '')
        train_ret = sr['train_return']
        test_ret = sr['test_return']
        degradation = train_ret - test_ret
        
        train_color = Colors.GREEN if train_ret >= 0 else Colors.RED
        test_color = Colors.GREEN if test_ret >= 0 else Colors.RED
        
        if degradation > 50.0:
            deg_color = Colors.RED
        elif degradation >= 20.0:
            deg_color = Colors.YELLOW
        else:
            deg_color = Colors.GREEN
            
        print(f"  {asset:<12} | "
              f"{train_color}{train_ret:>13.2f}%{Colors.RESET} | "
              f"{test_color}{test_ret:>12.2f}%{Colors.RESET} | "
              f"{deg_color}{degradation:>12.2f}%{Colors.RESET}")

    print(f"\n{Colors.YELLOW}{'═' * 95}{Colors.RESET}\n")

    # Export Trade Log
    if all_trades_log:
        trade_log_df = pd.DataFrame(all_trades_log)
        # Reorder columns as requested
        cols = ['symbol', 'direction', 'type', 'pnl', 'is_win', 'bar_index']
        trade_log_df = trade_log_df[cols]
        
        today_str = datetime.now().strftime("%Y%m%d")
        export_filename = f"trade_log_{today_str}.csv"
        trade_log_df.to_csv(export_filename, index=False)
        print(f"{Colors.GREEN}✅ Exported {len(trade_log_df)} trades to {export_filename}{Colors.RESET}\n")

if __name__ == "__main__":
    main()
