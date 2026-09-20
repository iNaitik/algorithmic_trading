"""
backtesting.py — Modular Historical Backtesting Framework
==========================================================
A high-performance, zero look-ahead-bias backtesting engine designed for
5-minute intraday strategies on US equities via the Alpaca Markets API,
with integrated support for NSE (Indian) stocks via yfinance fallback
and Indian statutory cost simulation.

Architecture:
    1. Data Ingestion    → fetch_historical_backtest_data() [US/Alpaca]
                           fetch_indian_data()               [NSE/yfinance]
    2. Strategy Layer    → strategies/  (auto-discovered plug-and-play modules)
    3. Simulation Engine → run_backtest()        [Standard US friction]
                           run_backtest_india()   [Indian statutory charges]
    4. Analytics Engine  → calculate_metrics()

Adding a new strategy:
    1. Create a new .py file in the strategies/ directory
    2. Decorate your function with @strategy(name="...", description="...")
    3. Ensure it returns a DataFrame with an 'execution_signal' column
    4. Run backtesting.py — your strategy appears automatically in the menu

Author : Algo Trading Bot Project
"""

import os
import sys
import math
from datetime import datetime, timedelta, timezone
from typing import Callable, Dict, List

import numpy as np
import pandas as pd
from dotenv import load_dotenv

from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.data.enums import DataFeed

# Import the strategy registry (auto-discovers all strategy files)
from strategies import list_strategies, get_strategy

# ──────────────────────────────────────────────────────────────────────────────
# Indian Market Configuration
# ──────────────────────────────────────────────────────────────────────────────
INDIAN_WATCHLIST: List[str] = [
    "RELIANCE.NS", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "INFY.NS",
    "TCS.NS", "AXISBANK.NS", "KOTAKBANK.NS", "LT.NS", "BAJFINANCE.NS",
    "NIFTYBEES.NS", "^NSEI"
]

# ──────────────────────────────────────────────────────────────────────────────
# Terminal Color Support
# ──────────────────────────────────────────────────────────────────────────────
sys.stdout.reconfigure(encoding='utf-8')
os.system('')  # Enable ANSI escape codes on Windows


class Colors:
    """ANSI color codes for terminal output."""
    GREEN  = '\033[92m'
    RED    = '\033[91m'
    CYAN   = '\033[96m'
    YELLOW = '\033[93m'
    BOLD   = '\033[1m'
    DIM    = '\033[2m'
    RESET  = '\033[0m'


# ──────────────────────────────────────────────────────────────────────────────
# 1. Historical Data Ingestion
# ──────────────────────────────────────────────────────────────────────────────
def fetch_historical_backtest_data(symbol: str, days_back: int = 30) -> pd.DataFrame:
    """
    Retrieves 5-minute OHLCV bar data from Alpaca's IEX feed for the
    specified symbol over the trailing `days_back` calendar days.

    The Alpaca SDK returns a MultiIndex DataFrame (symbol, timestamp).
    This function isolates the target symbol so the resulting DataFrame
    is indexed solely by timestamp.

    Parameters
    ----------
    symbol : str
        The ticker symbol to fetch (e.g. "AAPL").
    days_back : int
        Number of calendar days of history to retrieve (default 30).

    Returns
    -------
    pd.DataFrame
        Columns: open, high, low, close, volume.
        Index: DatetimeIndex (UTC timestamps).

    Raises
    ------
    ValueError
        If no data is returned for the requested symbol/period.
    """
    load_dotenv()
    api_key: str = os.getenv("ALPACA_API_KEY", "")
    secret_key: str = os.getenv("ALPACA_SECRET_KEY", "")

    if not api_key or not secret_key:
        raise ValueError(
            "Missing API keys. Set ALPACA_API_KEY and ALPACA_SECRET_KEY in .env"
        )

    client: StockHistoricalDataClient = StockHistoricalDataClient(api_key, secret_key)

    end_dt: datetime = datetime.now(timezone.utc)
    start_dt: datetime = end_dt - timedelta(days=days_back)

    request_params: StockBarsRequest = StockBarsRequest(
        symbol_or_symbols=symbol,
        timeframe=TimeFrame(15, TimeFrameUnit.Minute),  # 15 Minute bars
        start=start_dt,
        end=end_dt,
        feed=DataFeed.IEX,
    )

    print(f"{Colors.CYAN}📡 Fetching {days_back}-day 5-min bars for {symbol}...{Colors.RESET}")
    bars = client.get_stock_bars(request_params)

    if bars.df.empty:
        raise ValueError(f"No data returned for {symbol} over the last {days_back} days.")

    # Flatten the MultiIndex: drop the symbol level, keep only timestamps
    df: pd.DataFrame = bars.df.loc[symbol].copy()
    df = df[['open', 'high', 'low', 'close', 'volume']]

    print(f"{Colors.GREEN}✅ Retrieved {len(df):,} bars "
          f"({df.index.min()} → {df.index.max()}){Colors.RESET}")

    return df


# ──────────────────────────────────────────────────────────────────────────────
# 1a. Forex Market Data Ingestion (yfinance)
# ──────────────────────────────────────────────────────────────────────────────
def fetch_forex_data(symbol: str, days_back: int = 60, timeframe: str = "15m") -> pd.DataFrame:
    """
    Retrieves OHLCV bar data for Forex pairs using yfinance.
    """
    try:
        import yfinance as yf
    except ImportError:
        raise ImportError(
            "yfinance is required for Forex market data. "
            "Install it with: pip install yfinance"
        )

    effective_days: int = min(days_back, 60)
    if days_back > 60:
        print(f"{Colors.YELLOW}⚠️  yfinance limits intraday data to ~60 days. "
              f"Clamping {days_back}d → {effective_days}d.{Colors.RESET}")

    yf_symbol = symbol.replace("/", "") + "=X"
    period: str = f"{effective_days}d"

    print(f"{Colors.CYAN}📡 Fetching {effective_days}-day {timeframe} bars for "
          f"{symbol} via yfinance ({yf_symbol})...{Colors.RESET}")

    ticker = yf.Ticker(yf_symbol)
    df: pd.DataFrame = ticker.history(period=period, interval=timeframe)

    if df.empty:
        raise ValueError(f"No data returned for {symbol}.")

    df.columns = [c.lower().replace(' ', '_') for c in df.columns]
    ohlcv_cols = ['open', 'high', 'low', 'close', 'volume']
    available = [c for c in ohlcv_cols if c in df.columns]
    df = df[available].copy()

    if df.index.tz is None:
        df.index = df.index.tz_localize('UTC')
    elif str(df.index.tz) != 'UTC':
        df.index = df.index.tz_convert('UTC')

    print(f"{Colors.GREEN}✅ Retrieved {len(df):,} bars "
          f"({df.index.min()} → {df.index.max()}){Colors.RESET}")

    return df


# ──────────────────────────────────────────────────────────────────────────────
# 1b. Indian Market Data Ingestion (yfinance Fallback)
# ──────────────────────────────────────────────────────────────────────────────
def fetch_indian_data(symbol: str, days_back: int = 60) -> pd.DataFrame:
    """
    Retrieves 5-minute OHLCV bar data for NSE-listed stocks using yfinance.

    yfinance enforces a hard ~60-day limit on intraday data (intervals < 1d).
    If ``days_back`` exceeds 60, it is silently clamped to 60 and a warning
    is printed.

    Parameters
    ----------
    symbol : str
        The NSE ticker symbol with `.NS` suffix (e.g. "RELIANCE.NS").
    days_back : int
        Number of calendar days of history to retrieve (max 60 for 5m data).

    Returns
    -------
    pd.DataFrame
        Columns: open, high, low, close, volume.
        Index: DatetimeIndex (IST timestamps).

    Raises
    ------
    ValueError
        If no data is returned for the requested symbol/period.
    """
    try:
        import yfinance as yf
    except ImportError:
        raise ImportError(
            "yfinance is required for Indian market data. "
            "Install it with: pip install yfinance"
        )

    # yfinance caps intraday at ~60 days
    effective_days: int = min(days_back, 60)
    if days_back > 60:
        print(f"{Colors.YELLOW}⚠️  yfinance limits 5-min data to ~60 days. "
              f"Clamping {days_back}d → {effective_days}d.{Colors.RESET}")

    # Map days to yfinance period strings
    period: str = f"{effective_days}d"

    print(f"{Colors.CYAN}📡 Fetching {effective_days}-day 5-min bars for "
          f"{symbol} via yfinance...{Colors.RESET}")

    ticker = yf.Ticker(symbol)
    df: pd.DataFrame = ticker.history(period=period, interval="5m")

    if df.empty:
        raise ValueError(
            f"No data returned for {symbol} over the last {effective_days} days. "
            f"Verify the ticker symbol is correct (e.g. RELIANCE.NS)."
        )

    # Normalise column names to lowercase (yfinance returns Title Case)
    df.columns = [c.lower().replace(' ', '_') for c in df.columns]

    # Keep only OHLCV columns
    ohlcv_cols = ['open', 'high', 'low', 'close', 'volume']
    available = [c for c in ohlcv_cols if c in df.columns]
    df = df[available].copy()

    # Ensure the index is timezone-aware IST
    if df.index.tz is None:
        df.index = df.index.tz_localize('Asia/Kolkata')
    elif str(df.index.tz) != 'Asia/Kolkata':
        df.index = df.index.tz_convert('Asia/Kolkata')

    print(f"{Colors.GREEN}✅ Retrieved {len(df):,} bars "
          f"({df.index.min()} → {df.index.max()}){Colors.RESET}")

    return df


# ──────────────────────────────────────────────────────────────────────────────
# 2. Backtest Simulation Engine
# ──────────────────────────────────────────────────────────────────────────────
def run_backtest(
    df: pd.DataFrame,
    initial_capital: float = 100_000.0,
    slippage_pct: float = 0.0005,
    commission_fixed: float = 0.0,
) -> pd.DataFrame:
    """
    Simulates trade execution over a historical DataFrame that contains
    an `execution_signal` column (1 = BUY, -1 = SELL, 0 = HOLD).

    Execution Rules
    ---------------
    • BUY  : When `execution_signal == 1` and flat (no position), buy the
             maximum whole shares affordable with current cash.  The entry
             price is the candle's `open` price PLUS slippage.
    • SELL : When `execution_signal == -1` and holding shares, liquidate
             the entire position.  The exit price is the candle's `open`
             price MINUS slippage.
    • Commission is deducted per trade (entry and exit each incur the fee).

    Tracking
    --------
    At every bar the engine records:
        cash, shares_held, market_value, total_equity

    Parameters
    ----------
    df : pd.DataFrame
        Must include columns: open, close, execution_signal.
    initial_capital : float
        Starting cash balance (default $100,000).
    slippage_pct : float
        Proportional slippage applied to trade prices (default 0.05%).
    commission_fixed : float
        Fixed dollar commission per trade (default $0.00).

    Returns
    -------
    pd.DataFrame
        The input DataFrame augmented with simulation tracking columns
        and a `trade_log` attribute containing per-trade records.
    """
    if 'execution_signal' not in df.columns:
        raise ValueError("DataFrame must contain an 'execution_signal' column. "
                         "Run a strategy function first.")

    df = df.copy()

    # Simulation state
    cash: float = initial_capital
    shares_held: int = 0
    entry_price: float = 0.0

    # Pre-allocate tracking arrays for performance
    n: int = len(df)
    cash_arr: np.ndarray = np.zeros(n, dtype=np.float64)
    shares_arr: np.ndarray = np.zeros(n, dtype=np.int64)
    market_val_arr: np.ndarray = np.zeros(n, dtype=np.float64)
    equity_arr: np.ndarray = np.zeros(n, dtype=np.float64)

    # Trade log: list of dicts for each round-trip
    trade_log: List[Dict] = []

    # Vectorised access to columns for loop speed
    open_prices: np.ndarray = df['open'].values
    close_prices: np.ndarray = df['close'].values
    signals: np.ndarray = df['execution_signal'].values

    print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * 60}")
    print(f"  BACKTEST ENGINE — Starting Simulation")
    print(f"{'═' * 60}{Colors.RESET}")
    print(f"  Initial Capital : ${initial_capital:>14,.2f}")
    print(f"  Slippage        : {slippage_pct * 100:.4f}%")
    print(f"  Commission      : ${commission_fixed:>14,.2f} per trade")
    print(f"  Bars to process : {n:>14,}")
    print(f"{Colors.CYAN}{'─' * 60}{Colors.RESET}\n")

    trade_count: int = 0

    for i in range(n):
        signal: int = int(signals[i])
        bar_open: float = float(open_prices[i])
        bar_close: float = float(close_prices[i])

        # ── BUY ENTRY ────────────────────────────────────────────────
        if signal == 1 and shares_held == 0:
            # Apply slippage: pay slightly MORE than the open
            fill_price: float = bar_open * (1.0 + slippage_pct)
            affordable_shares: int = int((cash - commission_fixed) / fill_price)

            if affordable_shares > 0:
                cost: float = affordable_shares * fill_price + commission_fixed
                cash -= cost
                shares_held = affordable_shares
                entry_price = fill_price
                trade_count += 1

                print(f"  {Colors.GREEN}▲ BUY  #{trade_count:<3}"
                      f"  {affordable_shares:>6} shares @ ${fill_price:>10,.2f}"
                      f"  │  Cash: ${cash:>12,.2f}{Colors.RESET}")

        # ── SELL EXIT ────────────────────────────────────────────────
        elif signal == -1 and shares_held > 0:
            # Apply slippage: receive slightly LESS than the open
            fill_price = bar_open * (1.0 - slippage_pct)
            proceeds: float = shares_held * fill_price - commission_fixed
            trade_pnl: float = (fill_price - entry_price) * shares_held
            trade_pnl_pct: float = ((fill_price - entry_price) / entry_price) * 100.0

            is_win: bool = trade_pnl >= 0.0
            pnl_color: str = Colors.GREEN if is_win else Colors.RED
            pnl_label: str = "Profit" if is_win else "Loss"

            trade_log.append({
                'entry_price': entry_price,
                'exit_price': fill_price,
                'shares': shares_held,
                'pnl': trade_pnl,
                'pnl_pct': trade_pnl_pct,
                'is_win': is_win,
            })

            trade_count += 1
            print(f"  {Colors.RED}▼ SELL #{trade_count:<3}"
                  f"  {shares_held:>6} shares @ ${fill_price:>10,.2f}"
                  f"  │  {pnl_color}{pnl_label}: ${trade_pnl:>+10,.2f} "
                  f"({trade_pnl_pct:>+.2f}%){Colors.RESET}")

            cash += proceeds
            shares_held = 0
            entry_price = 0.0

        # ── Record portfolio state at this bar ───────────────────────
        market_value: float = shares_held * bar_close
        cash_arr[i] = cash
        shares_arr[i] = shares_held
        market_val_arr[i] = market_value
        equity_arr[i] = cash + market_value

    # Attach tracking columns
    df['cash'] = cash_arr
    df['shares_held'] = shares_arr
    df['market_value'] = market_val_arr
    df['total_equity'] = equity_arr

    # Attach trade log as a DataFrame attribute for analytics
    df.attrs['trade_log'] = trade_log
    df.attrs['initial_capital'] = initial_capital

    # Handle open position at end of simulation
    if shares_held > 0:
        final_close: float = float(close_prices[-1])
        unrealized: float = (final_close - entry_price) * shares_held
        ur_color: str = Colors.GREEN if unrealized >= 0 else Colors.RED
        print(f"\n  {Colors.YELLOW}⚠️  Open position at simulation end: "
              f"{shares_held} shares{Colors.RESET}")
        print(f"  {ur_color}   Unrealized P&L: ${unrealized:>+,.2f}{Colors.RESET}")

    print(f"\n{Colors.CYAN}{'─' * 60}{Colors.RESET}")
    print(f"  Simulation complete. {trade_count} order(s) executed.")
    print(f"{Colors.CYAN}{'═' * 60}{Colors.RESET}\n")

    return df


# ──────────────────────────────────────────────────────────────────────────────
# 2b. Indian Statutory Cost Backtest Engine
# ──────────────────────────────────────────────────────────────────────────────
def run_backtest_india(
    df: pd.DataFrame,
    initial_capital: float = 1_000_000.0,
) -> pd.DataFrame:
    """
    Simulates trade execution with Indian statutory transaction costs.

    This is a specialised variant of ``run_backtest()`` that applies the
    full Indian friction matrix on every trade:

    BUY Leg:
        Brokerage   : min(turnover × 0.03%, ₹20)
        Exchange Fee : turnover × 0.00297%
        SEBI Fee    : turnover × 0.0001%
        Stamp Duty  : turnover × 0.003%
        GST         : 18% × (Brokerage + Exchange + SEBI)
        Slippage    : 0.05% of entry price

    SELL Leg:
        Brokerage   : min(turnover × 0.03%, ₹20)
        STT         : turnover × 0.025%
        Exchange Fee : turnover × 0.00297%
        SEBI Fee    : turnover × 0.0001%
        GST         : 18% × (Brokerage + Exchange + SEBI)
        Slippage    : 0.05% of exit price

    Parameters
    ----------
    df : pd.DataFrame
        Must include columns: open, close, execution_signal.
    initial_capital : float
        Starting cash balance in ₹ (default ₹10,00,000).

    Returns
    -------
    pd.DataFrame
        The input DataFrame augmented with simulation tracking columns
        and a ``trade_log`` attribute containing per-trade records.
    """
    if 'execution_signal' not in df.columns:
        raise ValueError("DataFrame must contain an 'execution_signal' column. "
                         "Run a strategy function first.")

    df = df.copy()

    # ── Indian cost rates ────────────────────────────────────────────
    BROKERAGE_RATE:  float = 0.0003      # 0.03%
    BROKERAGE_CAP:   float = 20.0        # ₹20 max
    EXCHANGE_FEE:    float = 0.0000297   # 0.00297%
    SEBI_FEE:        float = 0.000001    # 0.0001%
    STAMP_DUTY:      float = 0.00003     # 0.003%
    STT_RATE:        float = 0.00025     # 0.025%
    GST_RATE:        float = 0.18        # 18%
    SLIPPAGE:        float = 0.0005      # 0.05%

    # Simulation state
    cash: float = initial_capital
    shares_held: int = 0
    entry_price: float = 0.0

    # Pre-allocate tracking arrays
    n: int = len(df)
    cash_arr:       np.ndarray = np.zeros(n, dtype=np.float64)
    shares_arr:     np.ndarray = np.zeros(n, dtype=np.int64)
    market_val_arr: np.ndarray = np.zeros(n, dtype=np.float64)
    equity_arr:     np.ndarray = np.zeros(n, dtype=np.float64)

    trade_log: List[Dict] = []

    open_prices: np.ndarray = df['open'].values
    close_prices: np.ndarray = df['close'].values
    signals: np.ndarray = df['execution_signal'].values

    print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * 60}")
    print(f"  INDIAN BACKTEST ENGINE — Starting Simulation")
    print(f"{'═' * 60}{Colors.RESET}")
    print(f"  Initial Capital : ₹{initial_capital:>14,.2f}")
    print(f"  Slippage        : {SLIPPAGE * 100:.4f}% per leg")
    print(f"  Brokerage       : {BROKERAGE_RATE * 100:.4f}% (capped ₹{BROKERAGE_CAP:.0f})")
    print(f"  STT (sell)      : {STT_RATE * 100:.4f}%")
    print(f"  Bars to process : {n:>14,}")
    print(f"{Colors.CYAN}{'─' * 60}{Colors.RESET}\n")

    trade_count: int = 0

    for i in range(n):
        signal: int = int(signals[i])
        bar_open: float = float(open_prices[i])
        bar_close: float = float(close_prices[i])

        # ── BUY ENTRY (with Indian costs) ────────────────────────────
        if signal == 1 and shares_held == 0:
            # Apply slippage: pay MORE than the open
            fill_price: float = bar_open * (1.0 + SLIPPAGE)

            # Calculate max affordable shares after costs
            # Iterative approach: estimate shares, compute costs, adjust
            est_shares: int = int(cash / fill_price)
            if est_shares > 0:
                # Compute buy-leg costs
                turnover: float = fill_price * est_shares
                brokerage: float = min(turnover * BROKERAGE_RATE, BROKERAGE_CAP)
                exchange:  float = turnover * EXCHANGE_FEE
                sebi:      float = turnover * SEBI_FEE
                stamp:     float = turnover * STAMP_DUTY
                gst:       float = GST_RATE * (brokerage + exchange + sebi)
                buy_cost:  float = brokerage + exchange + sebi + stamp + gst

                total_outflow: float = turnover + buy_cost

                # Adjust shares if total exceeds cash
                while total_outflow > cash and est_shares > 0:
                    est_shares -= 1
                    turnover = fill_price * est_shares
                    brokerage = min(turnover * BROKERAGE_RATE, BROKERAGE_CAP)
                    exchange  = turnover * EXCHANGE_FEE
                    sebi      = turnover * SEBI_FEE
                    stamp     = turnover * STAMP_DUTY
                    gst       = GST_RATE * (brokerage + exchange + sebi)
                    buy_cost  = brokerage + exchange + sebi + stamp + gst
                    total_outflow = turnover + buy_cost

                if est_shares > 0:
                    cash -= total_outflow
                    shares_held = est_shares
                    entry_price = fill_price
                    trade_count += 1

                    print(f"  {Colors.GREEN}▲ BUY  #{trade_count:<3}"
                          f"  {est_shares:>6} shares @ ₹{fill_price:>10,.2f}"
                          f"  │  Costs: ₹{buy_cost:>8,.2f}"
                          f"  │  Cash: ₹{cash:>12,.2f}{Colors.RESET}")

        # ── SELL EXIT (with Indian costs) ────────────────────────────
        elif signal == -1 and shares_held > 0:
            # Apply slippage: receive LESS than the open
            fill_price = bar_open * (1.0 - SLIPPAGE)

            # Compute sell-leg costs
            turnover: float = fill_price * shares_held
            brokerage: float = min(turnover * BROKERAGE_RATE, BROKERAGE_CAP)
            stt:       float = turnover * STT_RATE
            exchange:  float = turnover * EXCHANGE_FEE
            sebi:      float = turnover * SEBI_FEE
            gst:       float = GST_RATE * (brokerage + exchange + sebi)
            sell_cost: float = brokerage + stt + exchange + sebi + gst

            proceeds: float = turnover - sell_cost
            trade_pnl: float = (fill_price - entry_price) * shares_held - sell_cost
            # Also subtract the original buy cost from the trade log entry
            trade_pnl_pct: float = ((fill_price - entry_price) / entry_price) * 100.0

            is_win: bool = trade_pnl >= 0.0
            pnl_color: str = Colors.GREEN if is_win else Colors.RED
            pnl_label: str = "Profit" if is_win else "Loss"

            trade_log.append({
                'entry_price': entry_price,
                'exit_price': fill_price,
                'shares': shares_held,
                'pnl': trade_pnl,
                'pnl_pct': trade_pnl_pct,
                'is_win': is_win,
                'sell_cost': sell_cost,
            })

            trade_count += 1
            print(f"  {Colors.RED}▼ SELL #{trade_count:<3}"
                  f"  {shares_held:>6} shares @ ₹{fill_price:>10,.2f}"
                  f"  │  Costs: ₹{sell_cost:>8,.2f}"
                  f"  │  {pnl_color}{pnl_label}: ₹{trade_pnl:>+10,.2f} "
                  f"({trade_pnl_pct:>+.2f}%){Colors.RESET}")

            cash += proceeds
            shares_held = 0
            entry_price = 0.0

        # ── Record portfolio state at this bar ───────────────────────
        market_value: float = shares_held * bar_close
        cash_arr[i] = cash
        shares_arr[i] = shares_held
        market_val_arr[i] = market_value
        equity_arr[i] = cash + market_value

    # Attach tracking columns
    df['cash'] = cash_arr
    df['shares_held'] = shares_arr
    df['market_value'] = market_val_arr
    df['total_equity'] = equity_arr

    # Attach trade log
    df.attrs['trade_log'] = trade_log
    df.attrs['initial_capital'] = initial_capital

    # Handle open position at end of simulation
    if shares_held > 0:
        final_close: float = float(close_prices[-1])
        unrealized: float = (final_close - entry_price) * shares_held
        ur_color: str = Colors.GREEN if unrealized >= 0 else Colors.RED
        print(f"\n  {Colors.YELLOW}⚠️  Open position at simulation end: "
              f"{shares_held} shares{Colors.RESET}")
        print(f"  {ur_color}   Unrealized P&L: ₹{unrealized:>+,.2f}{Colors.RESET}")

    print(f"\n{Colors.CYAN}{'─' * 60}{Colors.RESET}")
    print(f"  Simulation complete. {trade_count} order(s) executed.")
    print(f"{Colors.CYAN}{'═' * 60}{Colors.RESET}\n")

    return df


# ──────────────────────────────────────────────────────────────────────────────
# 3. Analytics Engine
# ──────────────────────────────────────────────────────────────────────────────
def calculate_metrics(backtest_df: pd.DataFrame, initial_capital: float) -> Dict:
    """
    Computes and prints a comprehensive performance report from the
    completed backtest DataFrame.

    Metrics
    -------
    • Initial Capital vs Final Equity
    • Total Return (%)
    • Total Executed Trades (round-trips)
    • Win Rate (% of profitable round-trip trades)
    • Maximum Drawdown (peak-to-trough, %)
    • Sharpe Ratio (annualized for 5-min bars)

    Parameters
    ----------
    backtest_df : pd.DataFrame
        Must contain a 'total_equity' column from the simulation engine.
    initial_capital : float
        The starting capital used in the backtest.

    Returns
    -------
    dict
        Dictionary of all computed metrics.
    """
    trade_log: List[Dict] = backtest_df.attrs.get('trade_log', [])
    equity: pd.Series = backtest_df['total_equity']

    # ── Core Returns ─────────────────────────────────────────────────
    final_equity: float = float(equity.iloc[-1])
    total_return_pct: float = ((final_equity - initial_capital) / initial_capital) * 100.0
    net_pnl: float = final_equity - initial_capital

    # ── Trade Statistics ─────────────────────────────────────────────
    total_trades: int = len(trade_log)
    winning_trades: int = sum(1 for t in trade_log if t['is_win'])
    losing_trades: int = total_trades - winning_trades
    win_rate: float = (winning_trades / total_trades * 100.0) if total_trades > 0 else 0.0

    avg_win: float = 0.0
    avg_loss: float = 0.0
    if winning_trades > 0:
        avg_win = sum(t['pnl'] for t in trade_log if t['is_win']) / winning_trades
    if losing_trades > 0:
        avg_loss = sum(t['pnl'] for t in trade_log if not t['is_win']) / losing_trades

    # ── Maximum Drawdown ─────────────────────────────────────────────
    running_max: pd.Series = equity.cummax()
    drawdown: pd.Series = (equity - running_max) / running_max * 100.0
    max_drawdown_pct: float = float(drawdown.min())

    # ── Sharpe Ratio (annualized for 5-min bars) ─────────────────────
    # Trading day = 6.5 hours = 78 five-minute bars
    # Annualisation factor = sqrt(78 bars/day × 252 trading days/year)
    returns: pd.Series = equity.pct_change().dropna()
    bars_per_day: int = 78
    trading_days_per_year: int = 252
    annualisation_factor: float = math.sqrt(bars_per_day * trading_days_per_year)

    if returns.std() != 0 and len(returns) > 1:
        sharpe_ratio: float = (returns.mean() / returns.std()) * annualisation_factor
    else:
        sharpe_ratio = 0.0

    # ── Profit Factor ────────────────────────────────────────────────
    gross_profit: float = sum(t['pnl'] for t in trade_log if t['is_win'])
    gross_loss: float = abs(sum(t['pnl'] for t in trade_log if not t['is_win']))
    profit_factor: float = (gross_profit / gross_loss) if gross_loss > 0 else float('inf')

    # ── Assemble metrics dict ────────────────────────────────────────
    metrics: Dict = {
        'initial_capital': initial_capital,
        'final_equity': final_equity,
        'net_pnl': net_pnl,
        'total_return_pct': total_return_pct,
        'total_trades': total_trades,
        'winning_trades': winning_trades,
        'losing_trades': losing_trades,
        'win_rate': win_rate,
        'avg_win': avg_win,
        'avg_loss': avg_loss,
        'max_drawdown_pct': max_drawdown_pct,
        'sharpe_ratio': sharpe_ratio,
        'profit_factor': profit_factor,
        'gross_profit': gross_profit,
        'gross_loss': gross_loss,
    }

    # ── Pretty Print Report ──────────────────────────────────────────
    _print_report(metrics)

    return metrics


def _print_report(metrics: Dict, strategy_name: str = "") -> None:
    """
    Renders a formatted, color-coded performance report to the terminal.
    """
    ret_color: str = Colors.GREEN if metrics['total_return_pct'] >= 0 else Colors.RED
    dd_color: str = Colors.RED  # Drawdown is always a negative metric
    sharpe_color: str = Colors.GREEN if metrics['sharpe_ratio'] > 0 else Colors.RED

    header: str = f"  📈  BACKTEST REPORT — {strategy_name}" if strategy_name else "  📈  BACKTEST PERFORMANCE REPORT"

    print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * 60}")
    print(header)
    print(f"{'═' * 60}{Colors.RESET}")

    # Capital summary
    print(f"\n  {Colors.BOLD}Capital Summary{Colors.RESET}")
    print(f"  {'─' * 40}")
    print(f"  Initial Capital   : ${metrics['initial_capital']:>14,.2f}")
    print(f"  Final Equity      : {ret_color}${metrics['final_equity']:>14,.2f}{Colors.RESET}")
    print(f"  Net P&L           : {ret_color}${metrics['net_pnl']:>+14,.2f}{Colors.RESET}")
    print(f"  Total Return      : {ret_color}{metrics['total_return_pct']:>+14.2f}%{Colors.RESET}")

    # Trade statistics
    print(f"\n  {Colors.BOLD}Trade Statistics{Colors.RESET}")
    print(f"  {'─' * 40}")
    print(f"  Total Round-Trips : {metrics['total_trades']:>14}")
    print(f"  Winning Trades    : {Colors.GREEN}{metrics['winning_trades']:>14}{Colors.RESET}")
    print(f"  Losing Trades     : {Colors.RED}{metrics['losing_trades']:>14}{Colors.RESET}")
    wr_color: str = Colors.GREEN if metrics['win_rate'] >= 50 else Colors.RED
    print(f"  Win Rate          : {wr_color}{metrics['win_rate']:>13.1f}%{Colors.RESET}")
    print(f"  Avg Winning Trade : {Colors.GREEN}${metrics['avg_win']:>+13,.2f}{Colors.RESET}")
    print(f"  Avg Losing Trade  : {Colors.RED}${metrics['avg_loss']:>+13,.2f}{Colors.RESET}")

    # Risk metrics
    print(f"\n  {Colors.BOLD}Risk Metrics{Colors.RESET}")
    print(f"  {'─' * 40}")
    print(f"  Max Drawdown      : {dd_color}{metrics['max_drawdown_pct']:>13.2f}%{Colors.RESET}")
    print(f"  Sharpe Ratio      : {sharpe_color}{metrics['sharpe_ratio']:>14.4f}{Colors.RESET}")

    pf_val: float = metrics['profit_factor']
    pf_display: str = f"{pf_val:>14.2f}" if pf_val != float('inf') else "             ∞"
    pf_color: str = Colors.GREEN if pf_val >= 1.0 else Colors.RED
    print(f"  Profit Factor     : {pf_color}{pf_display}{Colors.RESET}")

    print(f"\n{Colors.CYAN}{'═' * 60}{Colors.RESET}\n")


# ──────────────────────────────────────────────────────────────────────────────
# 2c. Forex Pip-Based Backtest Engine
# ──────────────────────────────────────────────────────────────────────────────
def run_backtest_forex(
    df: pd.DataFrame,
    initial_capital: float = 100_000.0,
    spread_pips: float = 1.5,
) -> pd.DataFrame:
    """
    Simulates trade execution for Forex currency pairs using absolute
    pip-based spread friction instead of percentage-based slippage.

    Execution Rules
    ---------------
    • BUY  : Entry Price = Open + (0.0001 × spread_pips / 2)
    • SELL : Exit  Price = Open - (0.0001 × spread_pips / 2)
    • No percentage slippage is applied.
    • No commission is applied (spread absorbs all friction).

    Parameters
    ----------
    df : pd.DataFrame
        Must include columns: open, close, execution_signal.
    initial_capital : float
        Starting cash balance (default $100,000).
    spread_pips : float
        Round-trip spread in pips (default 1.5 for EUR/USD majors).

    Returns
    -------
    pd.DataFrame
        The input DataFrame augmented with simulation tracking columns
        and a ``trade_log`` attribute containing per-trade records.
    """
    if 'execution_signal' not in df.columns:
        raise ValueError("DataFrame must contain an 'execution_signal' column. "
                         "Run a strategy function first.")

    df = df.copy()

    # ── Forex friction constants ─────────────────────────────────────
    PIP_VALUE: float = 0.0001  # Standard pip for EUR/USD (4th decimal)
    HALF_SPREAD: float = PIP_VALUE * (spread_pips / 2.0)

    # Simulation state
    cash: float = initial_capital
    units_held: int = 0
    entry_price: float = 0.0

    # Pre-allocate tracking arrays
    n: int = len(df)
    cash_arr: np.ndarray = np.zeros(n, dtype=np.float64)
    units_arr: np.ndarray = np.zeros(n, dtype=np.int64)
    market_val_arr: np.ndarray = np.zeros(n, dtype=np.float64)
    equity_arr: np.ndarray = np.zeros(n, dtype=np.float64)

    # Trade log
    trade_log: List[Dict] = []

    # Vectorised access
    open_prices: np.ndarray = df['open'].values
    close_prices: np.ndarray = df['close'].values
    signals: np.ndarray = df['execution_signal'].values

    print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * 60}")
    print(f"  💱  FOREX SIMULATION ENGINE ACTIVE")
    print(f"{'═' * 60}{Colors.RESET}")
    print(f"  Initial Capital : ${initial_capital:>14,.2f}")
    print(f"  Spread          : {spread_pips:.1f} pips (fixed)")
    print(f"  Half-Spread     : {HALF_SPREAD:.5f} per leg")
    print(f"  Slippage (pct)  : {'DISABLED — pip-based friction active':>30}")
    print(f"  Bars to process : {n:>14,}")
    print(f"{Colors.CYAN}{'─' * 60}{Colors.RESET}\n")

    trade_count: int = 0

    for i in range(n):
        signal: int = int(signals[i])
        bar_open: float = float(open_prices[i])
        bar_close: float = float(close_prices[i])

        # ── BUY ENTRY (pip-spread friction) ───────────────────────────
        if signal == 1 and units_held == 0:
            fill_price: float = bar_open + HALF_SPREAD
            affordable_units: int = int(cash / fill_price)

            if affordable_units > 0:
                cost: float = affordable_units * fill_price
                cash -= cost
                units_held = affordable_units
                entry_price = fill_price
                trade_count += 1

                spread_cost: float = affordable_units * HALF_SPREAD
                print(f"  {Colors.GREEN}▲ BUY  #{trade_count:<3}"
                      f"  {affordable_units:>6} units @ ${fill_price:.5f}"
                      f"  │  Spread: ${spread_cost:>8,.4f}"
                      f"  │  Cash: ${cash:>12,.2f}{Colors.RESET}")

        # ── SELL EXIT (pip-spread friction) ────────────────────────────
        elif signal == -1 and units_held > 0:
            fill_price = bar_open - HALF_SPREAD
            proceeds: float = units_held * fill_price
            trade_pnl: float = (fill_price - entry_price) * units_held
            trade_pnl_pct: float = ((fill_price - entry_price) / entry_price) * 100.0
            spread_cost: float = units_held * HALF_SPREAD

            is_win: bool = trade_pnl >= 0.0
            pnl_color: str = Colors.GREEN if is_win else Colors.RED
            pnl_label: str = "Profit" if is_win else "Loss"

            trade_log.append({
                'entry_price': entry_price,
                'exit_price': fill_price,
                'shares': units_held,
                'pnl': trade_pnl,
                'pnl_pct': trade_pnl_pct,
                'is_win': is_win,
                'spread_cost': spread_cost,
            })

            trade_count += 1
            print(f"  {Colors.RED}▼ SELL #{trade_count:<3}"
                  f"  {units_held:>6} units @ ${fill_price:.5f}"
                  f"  │  Spread: ${spread_cost:>8,.4f}"
                  f"  │  {pnl_color}{pnl_label}: ${trade_pnl:>+10,.2f} "
                  f"({trade_pnl_pct:>+.2f}%){Colors.RESET}")

            cash += proceeds
            units_held = 0
            entry_price = 0.0

        # ── Record portfolio state ────────────────────────────────────
        market_value: float = units_held * bar_close
        cash_arr[i] = cash
        units_arr[i] = units_held
        market_val_arr[i] = market_value
        equity_arr[i] = cash + market_value

    # Attach tracking columns
    df['cash'] = cash_arr
    df['shares_held'] = units_arr
    df['market_value'] = market_val_arr
    df['total_equity'] = equity_arr

    # Attach trade log
    df.attrs['trade_log'] = trade_log
    df.attrs['initial_capital'] = initial_capital

    # Handle open position at end of simulation
    if units_held > 0:
        final_close: float = float(close_prices[-1])
        unrealized: float = (final_close - entry_price) * units_held
        ur_color: str = Colors.GREEN if unrealized >= 0 else Colors.RED
        print(f"\n  {Colors.YELLOW}⚠️  Open position at simulation end: "
              f"{units_held} units{Colors.RESET}")
        print(f"  {ur_color}   Unrealized P&L: ${unrealized:>+,.2f}{Colors.RESET}")

    # Summary
    total_spread_paid: float = sum(t.get('spread_cost', 0.0) for t in trade_log)
    print(f"\n{Colors.CYAN}{'─' * 60}{Colors.RESET}")
    print(f"  Simulation complete. {trade_count} order(s) executed.")
    print(f"  Total spread friction paid: ${total_spread_paid:>,.4f}")
    print(f"{Colors.CYAN}{'═' * 60}{Colors.RESET}\n")

    return df


# ──────────────────────────────────────────────────────────────────────────────
# 4. Multi-Strategy Runner
# ──────────────────────────────────────────────────────────────────────────────
def run_single_strategy(
    strategy_name: str,
    raw_df: pd.DataFrame,
    initial_capital: float = 100_000.0,
    slippage_pct: float = 0.0005,
    commission_fixed: float = 0.0,
) -> Dict:
    """
    Runs a single named strategy through the full backtest pipeline.

    Parameters
    ----------
    strategy_name : str
        The registered name of the strategy.
    raw_df : pd.DataFrame
        Raw OHLCV data (will be copied, not mutated).
    initial_capital : float
        Starting cash balance.
    slippage_pct : float
        Slippage per trade.
    commission_fixed : float
        Fixed commission per trade.

    Returns
    -------
    Dict
        Performance metrics for this strategy.
    """
    strategy_func: Callable = get_strategy(strategy_name)

    print(f"\n{Colors.BOLD}{Colors.YELLOW}{'━' * 60}")
    print(f"  🎯  Strategy: {strategy_name}")
    print(f"{'━' * 60}{Colors.RESET}")

    # Apply strategy
    strategy_df: pd.DataFrame = strategy_func(raw_df.copy())

    buy_count: int = int((strategy_df['signal'] == 1).sum())
    sell_count: int = int((strategy_df['signal'] == -1).sum())
    print(f"{Colors.CYAN}📊 Signals: "
          f"{Colors.GREEN}{buy_count} BUY{Colors.CYAN} | "
          f"{Colors.RED}{sell_count} SELL{Colors.RESET}")

    # Run backtest
    result_df: pd.DataFrame = run_backtest(
        strategy_df,
        initial_capital=initial_capital,
        slippage_pct=slippage_pct,
        commission_fixed=commission_fixed,
    )

    # Compute analytics
    metrics: Dict = calculate_metrics(result_df, initial_capital)
    metrics['strategy_name'] = strategy_name

    return metrics


def run_all_strategies(
    raw_df: pd.DataFrame,
    initial_capital: float = 100_000.0,
    slippage_pct: float = 0.0005,
    commission_fixed: float = 0.0,
) -> List[Dict]:
    """
    Runs EVERY registered strategy and prints a comparative summary table.

    Parameters
    ----------
    raw_df : pd.DataFrame
        Raw OHLCV data.
    initial_capital : float
        Starting cash balance.
    slippage_pct : float
        Slippage per trade.
    commission_fixed : float
        Fixed commission per trade.

    Returns
    -------
    List[Dict]
        List of performance metrics for each strategy.
    """
    strategies = list_strategies()
    all_metrics: List[Dict] = []

    for entry in strategies:
        name: str = entry['name']
        metrics: Dict = run_single_strategy(
            name, raw_df, initial_capital, slippage_pct, commission_fixed
        )
        all_metrics.append(metrics)

    # Print comparative summary
    _print_comparison_table(all_metrics)

    return all_metrics


def run_single_strategy_forex(
    strategy_name: str,
    raw_df: pd.DataFrame,
    initial_capital: float = 100_000.0,
    spread_pips: float = 1.5,
) -> Dict:
    """
    Runs a single named strategy through the Forex pip-based backtest pipeline.
    """
    strategy_func: Callable = get_strategy(strategy_name)

    print(f"\n{Colors.BOLD}{Colors.YELLOW}{'━' * 60}")
    print(f"  🎯  Strategy: {strategy_name}")
    print(f"{'━' * 60}{Colors.RESET}")

    # Apply strategy
    strategy_df: pd.DataFrame = strategy_func(raw_df.copy())

    buy_count: int = int((strategy_df['signal'] == 1).sum())
    sell_count: int = int((strategy_df['signal'] == -1).sum())
    print(f"{Colors.CYAN}📊 Signals: "
          f"{Colors.GREEN}{buy_count} BUY{Colors.CYAN} | "
          f"{Colors.RED}{sell_count} SELL{Colors.RESET}")

    # Run forex backtest
    result_df: pd.DataFrame = run_backtest_forex(
        strategy_df,
        initial_capital=initial_capital,
        spread_pips=spread_pips,
    )

    # Compute analytics
    metrics: Dict = calculate_metrics(result_df, initial_capital)
    metrics['strategy_name'] = strategy_name

    return metrics


def run_all_strategies_forex(
    raw_df: pd.DataFrame,
    strategies: List[Dict],
    initial_capital: float = 100_000.0,
    spread_pips: float = 1.5,
) -> List[Dict]:
    """
    Runs EVERY registered strategy through the Forex pip-based backtest
    pipeline and prints a comparative summary table.
    """
    all_metrics: List[Dict] = []

    for entry in strategies:
        name: str = entry['name']
        metrics: Dict = run_single_strategy_forex(
            name, raw_df, initial_capital, spread_pips
        )
        all_metrics.append(metrics)

    _print_comparison_table(all_metrics)

    return all_metrics


def _print_comparison_table(all_metrics: List[Dict]) -> None:
    """
    Prints a side-by-side comparison table of all strategy results.
    """
    if not all_metrics:
        print(f"{Colors.YELLOW}No strategies were run.{Colors.RESET}")
        return

    print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * 90}")
    print(f"  📊  STRATEGY COMPARISON TABLE")
    print(f"{'═' * 90}{Colors.RESET}")

    # Header
    print(f"\n  {'Strategy':<22} {'Return':>10} {'Win Rate':>10} {'Trades':>8} "
          f"{'Max DD':>10} {'Sharpe':>10} {'PF':>8}")
    print(f"  {'─' * 22} {'─' * 10} {'─' * 10} {'─' * 8} {'─' * 10} {'─' * 10} {'─' * 8}")

    # Sort by total return (best first)
    sorted_metrics: List[Dict] = sorted(all_metrics, key=lambda m: m['total_return_pct'], reverse=True)

    for i, m in enumerate(sorted_metrics):
        name: str = m.get('strategy_name', 'Unknown')[:22]
        ret: float = m['total_return_pct']
        wr: float = m['win_rate']
        trades: int = m['total_trades']
        dd: float = m['max_drawdown_pct']
        sharpe: float = m['sharpe_ratio']
        pf: float = m['profit_factor']

        ret_color: str = Colors.GREEN if ret >= 0 else Colors.RED
        wr_color: str = Colors.GREEN if wr >= 50 else Colors.RED
        sharpe_color: str = Colors.GREEN if sharpe > 0 else Colors.RED

        pf_str: str = f"{pf:>7.2f}" if pf != float('inf') else "      ∞"
        pf_color: str = Colors.GREEN if pf >= 1.0 else Colors.RED

        medal: str = "🥇" if i == 0 else ("🥈" if i == 1 else ("🥉" if i == 2 else "  "))

        print(f"  {medal}{name:<20} "
              f"{ret_color}{ret:>+9.2f}%{Colors.RESET} "
              f"{wr_color}{wr:>9.1f}%{Colors.RESET} "
              f"{trades:>8} "
              f"{Colors.RED}{dd:>9.2f}%{Colors.RESET} "
              f"{sharpe_color}{sharpe:>10.4f}{Colors.RESET} "
              f"{pf_color}{pf_str}{Colors.RESET}")

    print(f"\n{Colors.CYAN}{'═' * 90}{Colors.RESET}\n")


# ──────────────────────────────────────────────────────────────────────────────
# 5. Main Block — Interactive Strategy Selection
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":

    SYMBOL: str = "EUR/USD"
    LOOKBACK_DAYS: int = 360
    INITIAL_CAPITAL: float = 100_000.0
    SLIPPAGE_PCT: float = 0.0005  # 0.05%
    FOREX_SPREAD_PIPS: float = 1.5  # 1.5 pip round-trip spread for majors

    # Detect if the symbol belongs to the Indian market (either in watchlist or ends with .NS)
    IS_INDIAN: bool = (SYMBOL in INDIAN_WATCHLIST) or SYMBOL.endswith(".NS") or SYMBOL == "^NSEI"
    IS_FOREX: bool = "/" in SYMBOL or SYMBOL.endswith("=X")
    FOREX_MODE: bool = IS_FOREX

    if IS_INDIAN:
        # Indian market defaults
        INITIAL_CAPITAL = 1_000_000.0  # ₹10,00,000
        LOOKBACK_DAYS = 60  # yfinance 5m limit
    elif FOREX_MODE:
        LOOKBACK_DAYS = 60  # yfinance intraday limit

    print(f"\n{Colors.BOLD}{'🚀' * 3}  Algo Backtesting Framework  {'🚀' * 3}{Colors.RESET}")
    if IS_INDIAN:
        print(f"{Colors.YELLOW}  🇮🇳  Indian Market Mode — NSE via yfinance{Colors.RESET}")
        CURRENT_MARKET = "INDIA"
    elif IS_FOREX:
        print(f"{Colors.YELLOW}  💱  Forex Market Mode — via yfinance{Colors.RESET}")
        CURRENT_MARKET = "US"  # Treat as US for strategies
    else:
        CURRENT_MARKET = "US"
    print()

    # Show available strategies for the current market
    all_strategies = list_strategies()
    strategies = [s for s in all_strategies if s.get('market', 'US') in (CURRENT_MARKET, 'ALL')]
    
    print(f"{Colors.BOLD}Available Strategies for {CURRENT_MARKET} Market:{Colors.RESET}")
    if not strategies:
        print(f"  {Colors.RED}No strategies found for {CURRENT_MARKET} market.{Colors.RESET}")
        sys.exit(0)
        
    for i, s in enumerate(strategies, 1):
        print(f"  {Colors.CYAN}{i}.{Colors.RESET} {s['name']:<25} {Colors.DIM}— {s['description']}{Colors.RESET}")
    print(f"  {Colors.CYAN}0.{Colors.RESET} {'Run ALL strategies':<25} {Colors.DIM}— Compare all side-by-side{Colors.RESET}")

    # Interactive selection
    print(f"\n{Colors.YELLOW}Select strategies (e.g., 1 or 1,3 or 0 for all): {Colors.RESET}", end="")
    try:
        user_input: str = input().strip()
        if not user_input:
            choices = [0]
        else:
            choices = [int(x.strip()) for x in user_input.split(',')]
    except (ValueError, EOFError):
        choices = [0]

    print()

    # Step 1 — Ingest historical data (route by market)
    if IS_INDIAN:
        raw_df: pd.DataFrame = fetch_indian_data(SYMBOL, days_back=LOOKBACK_DAYS)
    elif IS_FOREX:
        raw_df: pd.DataFrame = fetch_forex_data(SYMBOL, days_back=LOOKBACK_DAYS, timeframe="15m")
    else:
        raw_df: pd.DataFrame = fetch_historical_backtest_data(SYMBOL, days_back=LOOKBACK_DAYS)

    if 0 in choices:
        # Run ALL strategies with comparison
        if IS_INDIAN:
            # For Indian mode, run each strategy through the Indian backtest engine
            all_metrics_list: List[Dict] = []
            for entry in strategies:
                name: str = entry['name']
                strategy_func: Callable = get_strategy(name)

                print(f"\n{Colors.BOLD}{Colors.YELLOW}{'━' * 60}")
                print(f"  🎯  Strategy: {name}")
                print(f"{'━' * 60}{Colors.RESET}")

                strategy_df: pd.DataFrame = strategy_func(raw_df.copy())

                buy_count: int = int((strategy_df['signal'] == 1).sum())
                sell_count: int = int((strategy_df['signal'] == -1).sum())
                print(f"{Colors.CYAN}📊 Signals: "
                      f"{Colors.GREEN}{buy_count} BUY{Colors.CYAN} | "
                      f"{Colors.RED}{sell_count} SELL{Colors.RESET}")

                result_df: pd.DataFrame = run_backtest_india(
                    strategy_df, initial_capital=INITIAL_CAPITAL,
                )
                metrics: Dict = calculate_metrics(result_df, INITIAL_CAPITAL)
                metrics['strategy_name'] = name
                all_metrics_list.append(metrics)

            _print_comparison_table(all_metrics_list)
        elif FOREX_MODE:
            run_all_strategies_forex(
                raw_df,
                strategies=strategies,
                initial_capital=INITIAL_CAPITAL,
                spread_pips=FOREX_SPREAD_PIPS,
            )
        else:
            run_all_strategies(
                raw_df,
                initial_capital=INITIAL_CAPITAL,
                slippage_pct=SLIPPAGE_PCT,
                commission_fixed=0.0,
            )
    else:
        # Run selected strategies
        all_metrics = []
        for choice in choices:
            if 1 <= choice <= len(strategies):
                selected_name: str = strategies[choice - 1]['name']

                if IS_INDIAN:
                    strategy_func: Callable = get_strategy(selected_name)

                    print(f"\n{Colors.BOLD}{Colors.YELLOW}{'━' * 60}")
                    print(f"  🎯  Strategy: {selected_name}")
                    print(f"{'━' * 60}{Colors.RESET}")

                    strategy_df: pd.DataFrame = strategy_func(raw_df.copy())

                    buy_count: int = int((strategy_df['signal'] == 1).sum())
                    sell_count: int = int((strategy_df['signal'] == -1).sum())
                    print(f"{Colors.CYAN}📊 Signals: "
                          f"{Colors.GREEN}{buy_count} BUY{Colors.CYAN} | "
                          f"{Colors.RED}{sell_count} SELL{Colors.RESET}")

                    result_df: pd.DataFrame = run_backtest_india(
                        strategy_df, initial_capital=INITIAL_CAPITAL,
                    )
                    metrics: Dict = calculate_metrics(result_df, INITIAL_CAPITAL)
                    metrics['strategy_name'] = selected_name
                    all_metrics.append(metrics)
                elif FOREX_MODE:
                    metrics = run_single_strategy_forex(
                        selected_name,
                        raw_df,
                        initial_capital=INITIAL_CAPITAL,
                        spread_pips=FOREX_SPREAD_PIPS,
                    )
                    all_metrics.append(metrics)
                else:
                    metrics = run_single_strategy(
                        selected_name,
                        raw_df,
                        initial_capital=INITIAL_CAPITAL,
                        slippage_pct=SLIPPAGE_PCT,
                        commission_fixed=0.0,
                    )
                    all_metrics.append(metrics)
            else:
                print(f"{Colors.RED}Invalid choice: {choice}. Skipping.{Colors.RESET}")
        
        # If multiple strategies were selected, print the comparison table at the end
        if len(all_metrics) > 1:
            _print_comparison_table(all_metrics)
