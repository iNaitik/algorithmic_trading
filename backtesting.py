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

try:
    from alpaca.data.historical import StockHistoricalDataClient
    from alpaca.data.requests import StockBarsRequest
    from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
    from alpaca.data.enums import DataFeed
    HAS_ALPACA = True
except ImportError:
    HAS_ALPACA = False
    StockHistoricalDataClient = None
    StockBarsRequest = None
    TimeFrame = None
    TimeFrameUnit = None
    DataFeed = None

# Import the strategy registry (auto-discovers all strategy files)
from strategies import list_strategies, get_strategy

# Rich Terminal UI Components
try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.text import Text
    from rich import box
    console = Console()
    HAS_RICH = True
except ImportError:
    HAS_RICH = False
    console = None

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
# Currency & Timestamp Formatting Utilities
# ──────────────────────────────────────────────────────────────────────────────
def format_indian_number(amount: float, decimals: int = 2) -> str:
    """
    Formats a numeric value using the Indian numbering system:
    - Digits grouped in 2s after the first 3 digits (e.g. 10,00,000.00).
    """
    sign_str = "-" if amount < 0 else ""
    abs_amt = round(abs(amount), decimals)
    int_part = int(abs_amt)
    dec_part = f"{abs_amt - int_part:.{decimals}f}"[1:]
    s = str(int_part)
    if len(s) <= 3:
        return sign_str + s + dec_part
    last_three = s[-3:]
    remaining = s[:-3]
    parts = []
    while remaining:
        parts.append(remaining[-2:])
        remaining = remaining[:-2]
    parts.reverse()
    return sign_str + ",".join(parts) + "," + last_three + dec_part


def format_currency(
    amount: float,
    currency: str = "₹",
    include_sign: bool = False,
    show_lakh_tag: bool = False,
) -> str:
    """
    Formats currency amounts with market-specific standards:
    - If currency is '₹': formats in Indian numbering system (Lakhs/Crores, e.g. ₹10,00,000.00).
      Optionally appends descriptive Lakhs/Crores tag (e.g. ₹10,00,000.00 (10.00 Lakhs)).
    - If currency is '$': formats in standard Western thousand/million system (e.g. $100,000.00).
    """
    prefix = ""
    if include_sign:
        prefix = "+" if amount >= 0 else "-"
        abs_amount = abs(amount)
    elif amount < 0:
        prefix = "-"
        abs_amount = abs(amount)
    else:
        abs_amount = amount

    if currency == "₹":
        formatted = format_indian_number(abs_amount, 2)
        res = f"{prefix}₹{formatted}"
        if show_lakh_tag and abs_amount >= 100_000:
            if abs_amount >= 10_000_000:
                res += f" ({abs_amount / 10_000_000:.2f} Cr)"
            else:
                res += f" ({abs_amount / 100_000:.2f} Lakhs)"
        return res
    else:
        # Western thousand/million system with $
        formatted = f"{abs_amount:,.2f}"
        return f"{prefix}{currency}{formatted}"


def format_bar_timestamp(ts) -> str:
    """Formats a pandas/datetime index timestamp cleanly for live logs and tables."""
    if hasattr(ts, "strftime"):
        # If time is non-zero (intraday), format as YYYY-MM-DD HH:MM
        if getattr(ts, "hour", 0) != 0 or getattr(ts, "minute", 0) != 0 or getattr(ts, "second", 0) != 0:
            return ts.strftime("%Y-%m-%d %H:%M")
        return ts.strftime("%Y-%m-%d")
    return str(ts)[:16]


def parse_capital_input(user_input: str, default_capital: float, is_indian: bool = True) -> float:
    """
    Parses flexible starting capital input supporting suffixes (L, Lakhs, Cr, k, m)
    and commas (e.g. '10L', '10 Lakhs', '10,00,000', '50k', '500000').
    """
    raw = user_input.strip().lower().replace(",", "").replace("₹", "").replace("$", "")
    if not raw:
        return default_capital
    try:
        if raw.endswith("cr") or raw.endswith("crore") or raw.endswith("crores"):
            val_str = raw.replace("crores", "").replace("crore", "").replace("cr", "").strip()
            return float(val_str) * 10_000_000.0
        elif raw.endswith("l") or raw.endswith("lakh") or raw.endswith("lakhs") or raw.endswith("lac") or raw.endswith("lacs"):
            val_str = raw.replace("lakhs", "").replace("lakh", "").replace("lacs", "").replace("lac", "").replace("l", "").strip()
            return float(val_str) * 100_000.0
        elif raw.endswith("k"):
            val_str = raw.replace("k", "").strip()
            return float(val_str) * 1_000.0
        elif raw.endswith("m") or raw.endswith("million"):
            val_str = raw.replace("million", "").replace("m", "").strip()
            return float(val_str) * 1_000_000.0
        else:
            val = float(raw)
            return val if val > 0 else default_capital
    except Exception:
        return default_capital



# ──────────────────────────────────────────────────────────────────────────────
# 1. Historical Data Ingestion
# ──────────────────────────────────────────────────────────────────────────────
def fetch_historical_backtest_data(symbol: str, days_back: int = 30, interval: str = "5m") -> pd.DataFrame:
    """
    Retrieves OHLCV bar data from Alpaca's IEX feed for the
    specified symbol over the trailing `days_back` calendar days.

    Parameters
    ----------
    symbol : str
        The ticker symbol to fetch (e.g. "AAPL").
    days_back : int
        Number of calendar days of history to retrieve (default 30).
    interval : str
        Bar interval timeframe ("1m", "5m", "15m", "30m", "1h", "1d"). Default "5m".

    Returns
    -------
    pd.DataFrame
        Columns: open, high, low, close, volume.
        Index: DatetimeIndex (UTC timestamps).
    """
    load_dotenv()
    api_key: str = os.getenv("ALPACA_API_KEY", "")
    secret_key: str = os.getenv("ALPACA_SECRET_KEY", "")

    if not HAS_ALPACA:
        raise ImportError(
            "alpaca-py is not installed. Run 'pip install alpaca-py' or use yfinance for US market data."
        )

    if not api_key or not secret_key:
        raise ValueError(
            "Missing API keys. Set ALPACA_API_KEY and ALPACA_SECRET_KEY in .env"
        )

    client: StockHistoricalDataClient = StockHistoricalDataClient(api_key, secret_key)

    end_dt: datetime = datetime.now(timezone.utc)
    start_dt: datetime = end_dt - timedelta(days=days_back)

    tf_unit_map = {
        "1m": TimeFrame(1, TimeFrameUnit.Minute),
        "5m": TimeFrame(5, TimeFrameUnit.Minute),
        "15m": TimeFrame(15, TimeFrameUnit.Minute),
        "30m": TimeFrame(30, TimeFrameUnit.Minute),
        "1h": TimeFrame(1, TimeFrameUnit.Hour),
        "60m": TimeFrame(1, TimeFrameUnit.Hour),
        "1d": TimeFrame(1, TimeFrameUnit.Day),
    }
    alpaca_tf = tf_unit_map.get(interval.lower(), TimeFrame(5, TimeFrameUnit.Minute))

    print(f"{Colors.CYAN}📡 Fetching {days_back}-day {interval} bars for {symbol} via Alpaca...{Colors.RESET}")
    request_params: StockBarsRequest = StockBarsRequest(
        symbol_or_symbols=symbol,
        timeframe=alpaca_tf,
        start=start_dt,
        end=end_dt,
        feed=DataFeed.IEX,
    )
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
def fetch_indian_data(symbol: str, days_back: int = 60, interval: str = "5m") -> pd.DataFrame:
    """
    Retrieves OHLCV bar data for NSE-listed stocks using yfinance.

    yfinance enforces a hard ~60-day limit on intraday data (< 1d),
    and a ~7-day limit on 1m data. Daily data has no 60-day cap.

    Parameters
    ----------
    symbol : str
        The NSE ticker symbol with `.NS` suffix (e.g. "RELIANCE.NS").
    days_back : int
        Number of calendar days of history to retrieve.
    interval : str
        Candle interval ("1m", "5m", "15m", "30m", "60m", "1h", "1d"). Default "5m".

    Returns
    -------
    pd.DataFrame
        Columns: open, high, low, close, volume.
        Index: DatetimeIndex (IST timestamps).
    """
    try:
        import yfinance as yf
    except ImportError:
        raise ImportError(
            "yfinance is required for Indian market data. "
            "Install it with: pip install yfinance"
        )

    is_intraday: bool = interval.lower() in ("1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h")
    if is_intraday and interval.lower() == "1m":
        effective_days: int = min(days_back, 7)
        if days_back > 7:
            print(f"{Colors.YELLOW}⚠️  yfinance limits 1-min data to ~7 days. "
                  f"Clamping {days_back}d → {effective_days}d.{Colors.RESET}")
    elif is_intraday:
        effective_days: int = min(days_back, 60)
        if days_back > 60:
            print(f"{Colors.YELLOW}⚠️  yfinance limits intraday data to ~60 days. "
                  f"Clamping {days_back}d → {effective_days}d.{Colors.RESET}")
    else:
        effective_days: int = days_back

    period: str = f"{effective_days}d" if effective_days <= 730 else "max"

    print(f"{Colors.CYAN}📡 Fetching {effective_days}-day {interval} bars for "
          f"{symbol} via yfinance...{Colors.RESET}")

    ticker = yf.Ticker(symbol)
    df: pd.DataFrame = ticker.history(period=period, interval=interval)

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
    position_side: str = ""  # "LONG" or "SHORT"
    entry_price: float = 0.0
    entry_time: str = ""
    entry_fee: float = 0.0
    entry_brokerage: float = 0.0
    entry_exchange: float = 0.0
    entry_sebi: float = 0.0
    entry_stamp: float = 0.0
    entry_gst: float = 0.0
    entry_stt: float = 0.0

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
                entry_time = format_bar_timestamp(df.index[i])
                trade_count += 1

                print(f"  {Colors.GREEN}▲ BUY  #{trade_count:<3}"
                      f"  [{entry_time}]"
                      f"  {affordable_shares:>6} shares @ ${fill_price:>10,.2f}"
                      f"  │  Cash: ${cash:>12,.2f}{Colors.RESET}")

        # ── SELL EXIT ────────────────────────────────────────────────
        elif signal == -1 and shares_held > 0:
            # Apply slippage: receive slightly LESS than the open
            fill_price = bar_open * (1.0 - slippage_pct)
            exit_time: str = format_bar_timestamp(df.index[i])
            proceeds: float = shares_held * fill_price - commission_fixed
            trade_pnl: float = (fill_price - entry_price) * shares_held
            trade_pnl_pct: float = ((fill_price - entry_price) / entry_price) * 100.0

            is_win: bool = trade_pnl >= 0.0
            pnl_color: str = Colors.GREEN if is_win else Colors.RED
            pnl_label: str = "Profit" if is_win else "Loss"

            trade_log.append({
                'entry_time': entry_time,
                'exit_time': exit_time,
                'placed_at': entry_time,
                'side': 'LONG',
                'entry_price': entry_price,
                'exit_price': fill_price,
                'shares': shares_held,
                'pnl': trade_pnl,
                'pnl_pct': trade_pnl_pct,
                'is_win': is_win,
            })

            trade_count += 1
            print(f"  {Colors.RED}▼ SELL #{trade_count:<3}"
                  f"  [{exit_time}]"
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
    df.attrs['market'] = 'US'
    df.attrs['currency'] = '$'

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
    position_side: str = ""  # "LONG" or "SHORT"
    entry_price: float = 0.0
    entry_time: str = ""
    entry_fee: float = 0.0
    entry_brokerage: float = 0.0
    entry_exchange: float = 0.0
    entry_sebi: float = 0.0
    entry_stamp: float = 0.0
    entry_gst: float = 0.0
    entry_stt: float = 0.0

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
    print(f"  Initial Capital : {format_currency(initial_capital, '₹', show_lakh_tag=True):>14}")
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

        # ── BUY ENTRY (LONG) ─────────────────────────────────────────
        if signal == 1 and shares_held == 0:
            # Apply slippage: pay MORE than the open
            fill_price: float = bar_open * (1.0 + SLIPPAGE)

            # Calculate max affordable shares after costs
            est_shares: int = int(cash / fill_price)
            if est_shares > 0:
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
                    position_side = "LONG"
                    entry_price = fill_price
                    entry_time = format_bar_timestamp(df.index[i])
                    entry_fee = buy_cost
                    entry_brokerage = brokerage
                    entry_exchange = exchange
                    entry_sebi = sebi
                    entry_stamp = stamp
                    entry_gst = gst
                    entry_stt = 0.0
                    trade_count += 1

                    print(f"  {Colors.GREEN}▲ BUY (LONG) #{trade_count:<3}"
                          f"  [{entry_time}]"
                          f"  {est_shares:>6} shares @ {format_currency(fill_price, '₹')}"
                          f"  │  Costs: {format_currency(buy_cost, '₹')}"
                          f"  │  Cash: {format_currency(cash, '₹')}{Colors.RESET}")

        # ── SELL EXIT (CLOSE LONG) ───────────────────────────────────
        elif signal == -1 and shares_held > 0 and position_side == "LONG":
            fill_price = bar_open * (1.0 - SLIPPAGE)
            exit_time: str = format_bar_timestamp(df.index[i])
            turnover: float = fill_price * shares_held
            brokerage: float = min(turnover * BROKERAGE_RATE, BROKERAGE_CAP)
            stt:       float = turnover * STT_RATE
            exchange:  float = turnover * EXCHANGE_FEE
            sebi:      float = turnover * SEBI_FEE
            gst:       float = GST_RATE * (brokerage + exchange + sebi)
            sell_cost: float = brokerage + stt + exchange + sebi + gst

            proceeds: float = turnover - sell_cost
            total_trade_costs: float = entry_fee + sell_cost
            gross_pnl: float = (fill_price - entry_price) * shares_held
            trade_pnl: float = gross_pnl - total_trade_costs
            trade_pnl_pct: float = (trade_pnl / (entry_price * shares_held + entry_fee)) * 100.0

            is_win: bool = trade_pnl >= 0.0
            pnl_color: str = Colors.GREEN if is_win else Colors.RED
            pnl_label: str = "Profit" if is_win else "Loss"

            trade_log.append({
                'entry_time': entry_time,
                'exit_time': exit_time,
                'placed_at': entry_time,
                'side': 'LONG',
                'entry_price': entry_price,
                'exit_price': fill_price,
                'shares': shares_held,
                'gross_pnl': gross_pnl,
                'pnl': trade_pnl,
                'pnl_pct': trade_pnl_pct,
                'is_win': is_win,
                'buy_cost': entry_fee,
                'sell_cost': sell_cost,
                'total_cost': total_trade_costs,
                'brokerage': entry_brokerage + brokerage,
                'stt': stt,
                'exchange': entry_exchange + exchange,
                'sebi': entry_sebi + sebi,
                'stamp': entry_stamp,
                'gst': entry_gst + gst,
            })

            trade_count += 1
            print(f"  {Colors.RED}▼ SELL (CLOSE LONG) #{trade_count:<3}"
                  f"  [{exit_time}]"
                  f"  {shares_held:>6} shares @ {format_currency(fill_price, '₹')}"
                  f"  │  Costs: {format_currency(sell_cost, '₹')}"
                  f"  │  {pnl_color}{pnl_label}: {format_currency(trade_pnl, '₹', include_sign=True)} "
                  f"({trade_pnl_pct:>+.2f}%){Colors.RESET}")

            cash += proceeds
            shares_held = 0
            position_side = ""
            entry_price = 0.0

        # ── SHORT ENTRY (SELL TO OPEN SHORT) ─────────────────────────
        elif signal == -1 and shares_held == 0:
            fill_price = bar_open * (1.0 - SLIPPAGE)
            est_shares = int(cash / fill_price)
            if est_shares > 0:
                turnover = fill_price * est_shares
                brokerage = min(turnover * BROKERAGE_RATE, BROKERAGE_CAP)
                stt = turnover * STT_RATE
                exchange = turnover * EXCHANGE_FEE
                sebi = turnover * SEBI_FEE
                gst = GST_RATE * (brokerage + exchange + sebi)
                sell_cost = brokerage + stt + exchange + sebi + gst
                total_outflow = turnover + sell_cost

                while total_outflow > cash and est_shares > 0:
                    est_shares -= 1
                    turnover = fill_price * est_shares
                    brokerage = min(turnover * BROKERAGE_RATE, BROKERAGE_CAP)
                    stt = turnover * STT_RATE
                    exchange = turnover * EXCHANGE_FEE
                    sebi = turnover * SEBI_FEE
                    gst = GST_RATE * (brokerage + exchange + sebi)
                    sell_cost = brokerage + stt + exchange + sebi + gst
                    total_outflow = turnover + sell_cost

                if est_shares > 0:
                    cash -= total_outflow
                    shares_held = est_shares
                    position_side = "SHORT"
                    entry_price = fill_price
                    entry_time = format_bar_timestamp(df.index[i])
                    entry_fee = sell_cost
                    entry_brokerage = brokerage
                    entry_stt = stt
                    entry_exchange = exchange
                    entry_sebi = sebi
                    entry_stamp = 0.0
                    entry_gst = gst
                    trade_count += 1

                    print(f"  {Colors.RED}▼ SELL (SHORT) #{trade_count:<3}"
                          f"  [{entry_time}]"
                          f"  {est_shares:>6} shares @ {format_currency(fill_price, '₹')}"
                          f"  │  Costs: {format_currency(sell_cost, '₹')}"
                          f"  │  Cash: {format_currency(cash, '₹')}{Colors.RESET}")

        # ── COVER SHORT (BUY TO CLOSE SHORT) ─────────────────────────
        elif signal == 1 and shares_held > 0 and position_side == "SHORT":
            fill_price = bar_open * (1.0 + SLIPPAGE)
            exit_time = format_bar_timestamp(df.index[i])
            turnover = fill_price * shares_held
            brokerage = min(turnover * BROKERAGE_RATE, BROKERAGE_CAP)
            exchange = turnover * EXCHANGE_FEE
            sebi = turnover * SEBI_FEE
            stamp = turnover * STAMP_DUTY
            gst = GST_RATE * (brokerage + exchange + sebi)
            buy_cost = brokerage + exchange + sebi + stamp + gst

            gross_pnl = (entry_price - fill_price) * shares_held
            total_trade_costs = entry_fee + buy_cost
            trade_pnl = gross_pnl - total_trade_costs
            trade_pnl_pct = (trade_pnl / (entry_price * shares_held + entry_fee)) * 100.0

            is_win = trade_pnl >= 0.0
            pnl_color = Colors.GREEN if is_win else Colors.RED
            pnl_label = "Profit" if is_win else "Loss"

            trade_log.append({
                'entry_time': entry_time,
                'exit_time': exit_time,
                'placed_at': entry_time,
                'side': 'SHORT',
                'entry_price': entry_price,
                'exit_price': fill_price,
                'shares': shares_held,
                'gross_pnl': gross_pnl,
                'pnl': trade_pnl,
                'pnl_pct': trade_pnl_pct,
                'is_win': is_win,
                'buy_cost': buy_cost,
                'sell_cost': entry_fee,
                'total_cost': total_trade_costs,
                'brokerage': entry_brokerage + brokerage,
                'stt': entry_stt,
                'exchange': entry_exchange + exchange,
                'sebi': entry_sebi + sebi,
                'stamp': stamp,
                'gst': entry_gst + gst,
            })

            trade_count += 1
            print(f"  {Colors.GREEN}▲ BUY (COVER SHORT) #{trade_count:<3}"
                  f"  [{exit_time}]"
                  f"  {shares_held:>6} shares @ {format_currency(fill_price, '₹')}"
                  f"  │  Costs: {format_currency(buy_cost, '₹')}"
                  f"  │  {pnl_color}{pnl_label}: {format_currency(trade_pnl, '₹', include_sign=True)} "
                  f"({trade_pnl_pct:>+.2f}%){Colors.RESET}")

            # Return reserved principal plus gross PnL minus cover fees
            cash += (entry_price * shares_held) + gross_pnl - buy_cost
            shares_held = 0
            position_side = ""
            entry_price = 0.0

        # ── Record portfolio state at this bar ───────────────────────
        if position_side == "LONG":
            market_value: float = shares_held * bar_close
            equity: float = cash + market_value
        elif position_side == "SHORT":
            unrealized: float = (entry_price - bar_close) * shares_held
            market_value: float = -(shares_held * bar_close)
            equity: float = cash + (entry_price * shares_held) + unrealized
        else:
            market_value = 0.0
            equity = cash

        cash_arr[i] = cash
        shares_arr[i] = shares_held
        market_val_arr[i] = market_value
        equity_arr[i] = equity

    # Attach tracking columns
    df['cash'] = cash_arr
    df['shares_held'] = shares_arr
    df['market_value'] = market_val_arr
    df['total_equity'] = equity_arr

    # Attach trade log
    df.attrs['trade_log'] = trade_log
    df.attrs['initial_capital'] = initial_capital
    df.attrs['market'] = 'FOREX'
    df.attrs['currency'] = '$'
    df.attrs['market'] = 'INDIA'
    df.attrs['currency'] = '₹'

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

    # ── Statutory Charges & Cost Aggregation ─────────────────────────
    total_charges: float = sum(t.get('total_cost', 0.0) for t in trade_log)
    gross_trading_pnl: float = sum(t.get('gross_pnl', t['pnl']) for t in trade_log)
    total_brokerage: float = sum(t.get('brokerage', 0.0) for t in trade_log)
    total_stt: float = sum(t.get('stt', 0.0) for t in trade_log)
    total_exchange: float = sum(t.get('exchange', 0.0) for t in trade_log)
    total_stamp: float = sum(t.get('stamp', 0.0) for t in trade_log)
    total_sebi: float = sum(t.get('sebi', 0.0) for t in trade_log)
    total_gst: float = sum(t.get('gst', 0.0) for t in trade_log)

    market: str = backtest_df.attrs.get('market', 'INDIA' if initial_capital >= 500_000 else 'US')
    currency: str = backtest_df.attrs.get('currency', '₹' if market == 'INDIA' else '$')

    # ── Assemble metrics dict ────────────────────────────────────────
    metrics: Dict = {
        'initial_capital': initial_capital,
        'final_equity': final_equity,
        'net_pnl': net_pnl,
        'gross_trading_pnl': gross_trading_pnl,
        'total_charges': total_charges,
        'total_brokerage': total_brokerage,
        'total_stt': total_stt,
        'total_exchange': total_exchange,
        'total_stamp': total_stamp,
        'total_sebi': total_sebi,
        'total_gst': total_gst,
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
        'trade_log': trade_log,
        'market': market,
        'currency': currency,
    }

    # ── Pretty Print Report ──────────────────────────────────────────
    _print_report(metrics)

    return metrics


def _print_report(metrics: Dict, strategy_name: str = "") -> None:
    """
    Renders a formatted, color-coded performance report to the terminal.
    Uses Rich library if available for high-clarity cards, otherwise falls back to ANSI.
    """
    currency = metrics.get('currency', "₹" if metrics.get('initial_capital', 0) >= 500_000 else "$")

    gross_pnl = metrics.get('gross_trading_pnl', metrics['net_pnl'])
    gross_style = "bold green" if gross_pnl >= 0 else "bold red"
    charges = metrics.get('total_charges', 0.0)

    if HAS_RICH and console:
        title_str = f"📈 Backtest Performance Report — {strategy_name}" if strategy_name else "📈 Backtest Performance Report"
        ret = metrics['total_return_pct']
        ret_style = "bold green" if ret >= 0 else "bold red"
        wr = metrics['win_rate']
        wr_style = "green" if wr >= 50 else "red"
        sharpe = metrics['sharpe_ratio']
        sharpe_style = "cyan" if sharpe > 0 else "red"
        pf = metrics['profit_factor']
        pf_str = f"{pf:.2f}" if pf != float('inf') else "∞"
        pf_style = "green" if pf >= 1.0 else "red"

        grid = Table(box=box.SIMPLE, show_header=False, padding=(0, 2), expand=False)
        grid.add_column("Category 1", style="dim", justify="left")
        grid.add_column("Value 1", justify="right", no_wrap=True)
        grid.add_column("Category 2", style="dim", justify="left")
        grid.add_column("Value 2", justify="right", no_wrap=True)

        grid.add_row("Initial Capital", format_currency(metrics['initial_capital'], currency, show_lakh_tag=True),
                     "Total Trades", f"{metrics['total_trades']}")
        grid.add_row("Gross Trading P&L", f"[{gross_style}]{format_currency(gross_pnl, currency, include_sign=True)}[/{gross_style}]",
                     "Winning / Losing", f"[green]{metrics['winning_trades']}[/green] / [red]{metrics['losing_trades']}[/red]")
        grid.add_row("Total Charges & Taxes", f"[bold yellow]-{format_currency(charges, currency)}[/bold yellow]" if charges > 0 else f"{currency}0.00",
                     "Win Rate", f"[{wr_style}]{wr:.1f}%[/{wr_style}]")
        grid.add_row("Net P&L (In Hand)", f"[{ret_style}]{format_currency(metrics['net_pnl'], currency, include_sign=True)}[/{ret_style}]",
                     "Avg Win / Loss", f"[green]{format_currency(metrics['avg_win'], currency, include_sign=True)}[/green] / [red]{format_currency(metrics['avg_loss'], currency, include_sign=True)}[/red]")
        grid.add_row("Final Equity (In Hand)", f"[{ret_style}]{format_currency(metrics['final_equity'], currency, show_lakh_tag=True)}[/{ret_style}]",
                     "Profit Factor", f"[{pf_style}]{pf_str}[/{pf_style}]")
        grid.add_row("Net Total Return", f"[{ret_style}]{ret:+,.2f}%[/{ret_style}]",
                     "Max Drawdown", f"[red]{metrics['max_drawdown_pct']:.2f}%[/red]")
        grid.add_row("Sharpe Ratio", f"[{sharpe_style}]{sharpe:.4f}[/{sharpe_style}]",
                     "", "")

        panel = Panel(grid, title=f"[bold cyan]{title_str}[/bold cyan]", border_style="cyan", box=box.ROUNDED)
        console.print()
        console.print(panel)

        # ── Statutory Charges Breakdown Card (if applicable) ────────────────
        if charges > 0:
            fee_table = Table(title="🧾 Statutory Charges & Tax Deductions", box=box.ROUNDED, header_style="bold cyan")
            fee_table.add_column("Charge Component", style="bold white")
            fee_table.add_column("Regulatory Basis", style="dim cyan")
            fee_table.add_column("Total Deducted", justify="right", style="bold yellow")

            if metrics.get('total_brokerage', 0.0) > 0:
                fee_table.add_row("Brokerage", "min(0.03%, ₹20) per order leg", format_currency(metrics['total_brokerage'], "₹"))
            if metrics.get('total_stt', 0.0) > 0:
                fee_table.add_row("STT (Securities Transaction Tax)", "0.025% on Sell Turnover", format_currency(metrics['total_stt'], "₹"))
            if metrics.get('total_exchange', 0.0) > 0:
                fee_table.add_row("NSE Exchange Transaction Charges", "0.00297% on Turnover", format_currency(metrics['total_exchange'], "₹"))
            if metrics.get('total_stamp', 0.0) > 0:
                fee_table.add_row("Stamp Duty", "0.003% on Buy Turnover", format_currency(metrics['total_stamp'], "₹"))
            if metrics.get('total_sebi', 0.0) > 0:
                fee_table.add_row("SEBI Turnover Charges", "₹10 per crore (0.0001%)", format_currency(metrics['total_sebi'], "₹"))
            if metrics.get('total_gst', 0.0) > 0:
                fee_table.add_row("GST (18%)", "18% on (Brokerage + Exchange + SEBI)", format_currency(metrics['total_gst'], "₹"))
            fee_table.add_row("Total Charges & Taxes", "Combined Statutory Friction", f"[bold red]{format_currency(charges, currency)}[/bold red]")
            console.print(fee_table)

        # ── Itemized Trade Journal Table (if trades occurred) ───────────────
        trade_log = metrics.get('trade_log', [])
        if trade_log:
            tl_table = Table(title="📜 Trade Execution & Net In-Hand Journal", box=box.ROUNDED, header_style="bold cyan", expand=False)
            tl_table.add_column("#", justify="center", width=3, style="bold yellow")
            tl_table.add_column("Placed At (Entry)", justify="center", style="cyan", no_wrap=True)
            tl_table.add_column("Exited At", justify="center", style="dim cyan", no_wrap=True)
            tl_table.add_column("Side", justify="center", style="bold white")
            tl_table.add_column("Entry Price", justify="right", style="white")
            tl_table.add_column("Exit Price", justify="right", style="white")
            tl_table.add_column("Qty", justify="right", style="magenta")
            tl_table.add_column("Gross P&L", justify="right")
            tl_table.add_column("Taxes & Fees", justify="right", style="yellow")
            tl_table.add_column("Net In-Hand", justify="right")
            tl_table.add_column("Return %", justify="right")
            tl_table.add_column("Status", justify="center")

            for idx, t in enumerate(trade_log, 1):
                t_gross = t.get('gross_pnl', t['pnl'])
                t_net = t['pnl']
                t_fees = t.get('total_cost', 0.0)
                t_gross_style = "green" if t_gross >= 0 else "red"
                t_net_style = "bold green" if t_net >= 0 else "bold red"
                status = "[green]🟢 WIN[/green]" if t['is_win'] else "[red]🔴 LOSS[/red]"

                tl_table.add_row(
                    str(idx),
                    str(t.get('placed_at', t.get('entry_time', 'N/A'))),
                    str(t.get('exit_time', 'N/A')),
                    str(t.get('side', 'LONG')),
                    format_currency(t['entry_price'], currency),
                    format_currency(t['exit_price'], currency),
                    f"{t.get('shares', t.get('units', 0)):,}",
                    f"[{t_gross_style}]{format_currency(t_gross, currency, include_sign=True)}[/{t_gross_style}]",
                    f"-{format_currency(t_fees, currency)}" if t_fees > 0 else f"{currency}0.00",
                    f"[{t_net_style}]{format_currency(t_net, currency, include_sign=True)}[/{t_net_style}]",
                    f"[{t_net_style}]{t['pnl_pct']:+.2f}%[/{t_net_style}]",
                    status
                )
            console.print(tl_table)

        console.print()
        return

    ret_color: str = Colors.GREEN if metrics['total_return_pct'] >= 0 else Colors.RED
    dd_color: str = Colors.RED  # Drawdown is always a negative metric
    sharpe_color: str = Colors.GREEN if metrics['sharpe_ratio'] > 0 else Colors.RED

    header: str = f"  📈  BACKTEST REPORT — {strategy_name}" if strategy_name else "  📈  BACKTEST PERFORMANCE REPORT"

    print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * 60}")
    print(header)
    print(f"{'═' * 60}{Colors.RESET}")

    # Capital summary
    print(f"\n  {Colors.BOLD}Capital & P&L Summary{Colors.RESET}")
    print(f"  {'─' * 40}")
    print(f"  Initial Capital        : {format_currency(metrics['initial_capital'], currency, show_lakh_tag=True):>14}")
    gross_col = Colors.GREEN if gross_pnl >= 0 else Colors.RED
    print(f"  Gross Trading P&L      : {gross_col}{format_currency(gross_pnl, currency, include_sign=True):>14}{Colors.RESET}")
    print(f"  Total Charges & Taxes  : {Colors.YELLOW}-{format_currency(charges, currency):>14}{Colors.RESET}")
    print(f"  Final Equity (In Hand) : {ret_color}{format_currency(metrics['final_equity'], currency, show_lakh_tag=True):>14}{Colors.RESET}")
    print(f"  Net P&L (In Hand)      : {ret_color}{format_currency(metrics['net_pnl'], currency, include_sign=True):>14}{Colors.RESET}")
    print(f"  Total Return (Net)     : {ret_color}{metrics['total_return_pct']:>+14.2f}%{Colors.RESET}")

    # Trade statistics
    print(f"\n  {Colors.BOLD}Trade Statistics{Colors.RESET}")
    print(f"  {'─' * 40}")
    print(f"  Total Round-Trips : {metrics['total_trades']:>14}")
    print(f"  Winning Trades    : {Colors.GREEN}{metrics['winning_trades']:>14}{Colors.RESET}")
    print(f"  Losing Trades     : {Colors.RED}{metrics['losing_trades']:>14}{Colors.RESET}")
    wr_color: str = Colors.GREEN if metrics['win_rate'] >= 50 else Colors.RED
    print(f"  Win Rate          : {wr_color}{metrics['win_rate']:>13.1f}%{Colors.RESET}")
    print(f"  Avg Winning Trade : {Colors.GREEN}{format_currency(metrics['avg_win'], currency, include_sign=True):>13}{Colors.RESET}")
    print(f"  Avg Losing Trade  : {Colors.RED}{format_currency(metrics['avg_loss'], currency, include_sign=True):>13}{Colors.RESET}")

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
    entry_time: str = ""

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
                entry_time = format_bar_timestamp(df.index[i])
                trade_count += 1

                spread_cost: float = affordable_units * HALF_SPREAD
                print(f"  {Colors.GREEN}▲ BUY  #{trade_count:<3}"
                      f"  [{entry_time}]"
                      f"  {affordable_units:>6} units @ ${fill_price:.5f}"
                      f"  │  Spread: ${spread_cost:>8,.4f}"
                      f"  │  Cash: ${cash:>12,.2f}{Colors.RESET}")

        # ── SELL EXIT (pip-spread friction) ────────────────────────────
        elif signal == -1 and units_held > 0:
            fill_price = bar_open - HALF_SPREAD
            exit_time = format_bar_timestamp(df.index[i])
            proceeds: float = units_held * fill_price
            trade_pnl: float = (fill_price - entry_price) * units_held
            trade_pnl_pct: float = ((fill_price - entry_price) / entry_price) * 100.0
            spread_cost: float = units_held * HALF_SPREAD

            is_win: bool = trade_pnl >= 0.0
            pnl_color: str = Colors.GREEN if is_win else Colors.RED
            pnl_label: str = "Profit" if is_win else "Loss"

            trade_log.append({
                'entry_time': entry_time,
                'exit_time': exit_time,
                'placed_at': entry_time,
                'side': 'LONG',
                'entry_price': entry_price,
                'exit_price': fill_price,
                'shares': units_held,
                'units': units_held,
                'pnl': trade_pnl,
                'pnl_pct': trade_pnl_pct,
                'is_win': is_win,
                'spread_cost': spread_cost,
            })

            trade_count += 1
            print(f"  {Colors.RED}▼ SELL #{trade_count:<3}"
                  f"  [{exit_time}]"
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
    df.attrs['market'] = 'FOREX'
    df.attrs['currency'] = '$'
    df.attrs['market'] = 'INDIA'
    df.attrs['currency'] = '₹'

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
    Uses Rich Table if available, otherwise falls back to ANSI.
    """
    if not all_metrics:
        if HAS_RICH and console:
            console.print("[yellow]⚠️  No strategies were run.[/yellow]")
        else:
            print(f"{Colors.YELLOW}No strategies were run.{Colors.RESET}")
        return

    # Sort by total return (best first)
    sorted_metrics: List[Dict] = sorted(all_metrics, key=lambda m: m['total_return_pct'], reverse=True)

    if HAS_RICH and console:
        table = Table(title="🏆 Strategy Performance Leaderboard", box=box.ROUNDED, header_style="bold cyan")
        table.add_column("Rank", justify="center", no_wrap=True)
        table.add_column("Strategy Name", style="bold white")
        table.add_column("Net P&L (In Hand)", justify="right", no_wrap=True)
        table.add_column("Charges", justify="right", no_wrap=True)
        table.add_column("Return %", justify="right", no_wrap=True)
        table.add_column("Win Rate", justify="right", no_wrap=True)
        table.add_column("Trades", justify="right", no_wrap=True)
        table.add_column("Max DD", justify="right", no_wrap=True)
        table.add_column("Sharpe", justify="right", no_wrap=True)
        table.add_column("PF", justify="right", no_wrap=True)

        for i, m in enumerate(sorted_metrics):
            name: str = m.get('strategy_name', 'Unknown')
            ret: float = m['total_return_pct']
            wr: float = m['win_rate']
            trades: int = m['total_trades']
            dd: float = m['max_drawdown_pct']
            sharpe: float = m['sharpe_ratio']
            pf: float = m['profit_factor']
            charges = m.get('total_charges', 0.0)
            curr = m.get('currency', "₹" if m.get('initial_capital', 0) >= 500_000 else "$")

            charges_str = f"[yellow]-{format_currency(charges, curr)}[/yellow]" if charges > 0 else f"{curr}0.00"
            net_str = f"[{'bold green' if m['net_pnl'] >= 0 else 'bold red'}]{format_currency(m['net_pnl'], curr, include_sign=True)}[/]"
            ret_str = f"[bold green]{ret:>+7.2f}%[/bold green]" if ret >= 0 else f"[bold red]{ret:>+7.2f}%[/bold red]"
            wr_str = f"[green]{wr:>5.1f}%[/green]" if wr >= 50 else f"[red]{wr:>5.1f}%[/red]"
            dd_str = f"[red]{dd:>5.2f}%[/red]"
            sharpe_str = f"[cyan]{sharpe:>6.2f}[/cyan]" if sharpe > 0 else f"[red]{sharpe:>6.2f}[/red]"
            pf_str = f"[green]{pf:>5.2f}[/green]" if pf >= 1.0 else f"[red]{pf:>5.2f}[/red]"
            if pf == float('inf'):
                pf_str = "[green]∞[/green]"

            rank_badge = "🥇 1" if i == 0 else ("🥈 2" if i == 1 else ("🥉 3" if i == 2 else f"   {i+1}"))
            table.add_row(rank_badge, name, net_str, charges_str, ret_str, wr_str, str(trades), dd_str, sharpe_str, pf_str)

        console.print()
        console.print(table)
        console.print()
        return

    print(f"\n{Colors.BOLD}{Colors.CYAN}{'═' * 90}")
    print(f"  📊  STRATEGY COMPARISON TABLE")
    print(f"{'═' * 90}{Colors.RESET}")

    # Header
    print(f"\n  {'Strategy':<22} {'Return':>10} {'Win Rate':>10} {'Trades':>8} "
          f"{'Max DD':>10} {'Sharpe':>10} {'PF':>8}")
    print(f"  {'─' * 22} {'─' * 10} {'─' * 10} {'─' * 8} {'─' * 10} {'─' * 10} {'─' * 8}")

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
# 5. Main Block — Dynamic Interactive Setup & Strategy Execution
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":

    if HAS_RICH and console:
        console.print()
        console.print(Panel(
            "[bold cyan]Algo Backtesting & Quantitative Research Terminal[/bold cyan]\n"
            "[dim white]Multi-Asset Engine • Dynamic Timeframes • Statutory Friction & Slippage Model[/dim white]",
            box=box.DOUBLE,
            border_style="bright_cyan",
            padding=(0, 2)
        ))
        console.print()
    else:
        print(f"\n{Colors.BOLD}{'🚀' * 3}  Algo Backtesting Framework  {'🚀' * 3}{Colors.RESET}\n")

    # ── Step 1: Dynamic Market Selection ─────────────────────────────────────
    if HAS_RICH and console:
        market_table = Table(title="🌍 Step 1: Select Trading Market", box=box.ROUNDED, header_style="bold cyan")
        market_table.add_column("#", justify="center", min_width=3, no_wrap=True, style="bold yellow")
        market_table.add_column("Market", style="bold white")
        market_table.add_column("Asset Class", style="green")
        market_table.add_column("Data Feed", style="cyan")
        market_table.add_column("Default", justify="center", no_wrap=True, style="bold green")

        market_table.add_row("1", "🇮🇳 India (NSE)", "Equities (Intraday MIS / Cash)", "Yahoo Finance (yfinance)", "[Default]")
        market_table.add_row("2", "🇺🇸 United States", "Equities (US Stocks)", "Alpaca Markets API", "")
        market_table.add_row("3", "💱 Forex", "Currency Pairs (G10 FX)", "Yahoo Finance (yfinance)", "")
        console.print(market_table)
    else:
        print(f"{Colors.BOLD}1. Select Market:{Colors.RESET}")
        print(f"  {Colors.CYAN}1.{Colors.RESET} 🇮🇳  Indian Equities (NSE via yfinance) {Colors.GREEN}[Default]{Colors.RESET}")
        print(f"  {Colors.CYAN}2.{Colors.RESET} 🇺🇸  US Equities (Alpaca Markets API)")
        print(f"  {Colors.CYAN}3.{Colors.RESET} 💱  Forex Pairs (via yfinance)")

    try:
        if HAS_RICH and console:
            market_input: str = console.input("[bold yellow]Enter choice [1-3, default 1]: [/bold yellow]").strip()
        else:
            market_input: str = input(f"{Colors.YELLOW}Enter choice [1-3, default 1]: {Colors.RESET}").strip()
    except (EOFError, KeyboardInterrupt):
        market_input = "1"

    if market_input == "2":
        SELECTED_MARKET = "US"
        IS_INDIAN = False
        IS_FOREX = False
    elif market_input == "3":
        SELECTED_MARKET = "FOREX"
        IS_INDIAN = False
        IS_FOREX = True
    else:
        SELECTED_MARKET = "INDIA"
        IS_INDIAN = True
        IS_FOREX = False

    FOREX_MODE = IS_FOREX
    CURRENT_MARKET = "INDIA" if IS_INDIAN else "US"
    print()

    # ── Step 2: Dynamic Stock / Symbol Selection ─────────────────────────────
    if IS_INDIAN:
        INDIAN_PRESETS = [
            ("RELIANCE.NS", "Reliance Industries Ltd.", "Energy & Conglomerate", "[Default]"),
            ("HDFCBANK.NS", "HDFC Bank Ltd.", "Private Banking", ""),
            ("TCS.NS", "Tata Consultancy Services Ltd.", "Information Technology", ""),
            ("INFY.NS", "Infosys Ltd.", "Information Technology", ""),
            ("SBIN.NS", "State Bank of India", "PSU Banking", ""),
            ("ICICIBANK.NS", "ICICI Bank Ltd.", "Private Banking", ""),
            ("TATAMOTORS.NS", "Tata Motors Ltd.", "Automotive", ""),
            ("^NSEI", "Nifty 50 Index", "Benchmark Index", ""),
        ]

        if HAS_RICH and console:
            sym_table = Table(title="📈 Step 2: Select NSE Equity Symbol", box=box.ROUNDED, header_style="bold cyan")
            sym_table.add_column("#", justify="center", min_width=3, no_wrap=True, style="bold yellow")
            sym_table.add_column("Ticker", style="bold green", no_wrap=True)
            sym_table.add_column("Company / Asset", style="bold white")
            sym_table.add_column("Sector", style="dim cyan")
            sym_table.add_column("Default", justify="center", no_wrap=True, style="bold green")

            for idx, (sym, name, sector, is_def) in enumerate(INDIAN_PRESETS, 1):
                sym_table.add_row(str(idx), sym, name, sector, is_def)
            sym_table.add_row("9", "Custom Ticker", "Enter any custom NSE ticker", "User Defined", "")
            console.print(sym_table)
            sym_input = console.input("[bold yellow]Enter choice [1-9 or type ticker, default 1]: [/bold yellow]").strip()
        else:
            print(f"{Colors.BOLD}2. Select Stock (Indian NSE):{Colors.RESET}")
            for idx, (sym, name, sector, is_def) in enumerate(INDIAN_PRESETS, 1):
                print(f"  {Colors.CYAN}{idx}.{Colors.RESET} {sym:<16} {Colors.DIM}— {name}{Colors.RESET}")
            print(f"  {Colors.CYAN}9.{Colors.RESET} Enter custom ticker...")
            sym_input = input(f"{Colors.YELLOW}Enter choice [1-9 or type ticker, default 1]: {Colors.RESET}").strip()

        if not sym_input or sym_input == "1":
            SYMBOL = "RELIANCE.NS"
        elif sym_input.isdigit() and 1 <= int(sym_input) <= len(INDIAN_PRESETS):
            SYMBOL = INDIAN_PRESETS[int(sym_input) - 1][0]
        elif sym_input == "9":
            prompt = "[bold yellow]Enter custom NSE ticker (e.g. BAJFINANCE.NS): [/bold yellow]" if HAS_RICH and console else f"{Colors.YELLOW}Enter custom NSE ticker (e.g. BAJFINANCE.NS): {Colors.RESET}"
            try:
                custom_sym = (console.input(prompt) if HAS_RICH and console else input(prompt)).strip().upper()
            except (EOFError, KeyboardInterrupt):
                custom_sym = "RELIANCE.NS"
            if custom_sym and not custom_sym.endswith(".NS") and not custom_sym.startswith("^"):
                custom_sym += ".NS"
            SYMBOL = custom_sym or "RELIANCE.NS"
        else:
            custom_sym = sym_input.upper()
            if not custom_sym.endswith(".NS") and not custom_sym.startswith("^"):
                custom_sym += ".NS"
            SYMBOL = custom_sym

        INITIAL_CAPITAL = 1_000_000.0  # ₹10,00,000

    elif IS_FOREX:
        FOREX_PRESETS = [
            ("EUR/USD", "Euro / US Dollar", "Major Pair", "[Default]"),
            ("GBP/USD", "British Pound / US Dollar", "Major Pair", ""),
            ("USD/JPY", "US Dollar / Japanese Yen", "Major Pair", ""),
            ("AUD/USD", "Australian Dollar / US Dollar", "Commodity Pair", ""),
            ("USD/CAD", "US Dollar / Canadian Dollar", "Commodity Pair", ""),
        ]

        if HAS_RICH and console:
            fx_table = Table(title="💱 Step 2: Select Forex Currency Pair", box=box.ROUNDED, header_style="bold cyan")
            fx_table.add_column("#", justify="center", min_width=3, no_wrap=True, style="bold yellow")
            fx_table.add_column("Pair", style="bold green", no_wrap=True)
            fx_table.add_column("Currency Pair", style="bold white")
            fx_table.add_column("Category", style="dim cyan")
            fx_table.add_column("Default", justify="center", no_wrap=True, style="bold green")

            for idx, (sym, name, cat, is_def) in enumerate(FOREX_PRESETS, 1):
                fx_table.add_row(str(idx), sym, name, cat, is_def)
            fx_table.add_row("6", "Custom Pair", "Enter any currency pair", "User Defined", "")
            console.print(fx_table)
            sym_input = console.input("[bold yellow]Enter choice [1-6 or type pair, default 1]: [/bold yellow]").strip()
        else:
            print(f"{Colors.BOLD}2. Select Forex Pair:{Colors.RESET}")
            for idx, (sym, name, cat, is_def) in enumerate(FOREX_PRESETS, 1):
                print(f"  {Colors.CYAN}{idx}.{Colors.RESET} {sym:<16} {Colors.DIM}— {name}{Colors.RESET}")
            print(f"  {Colors.CYAN}6.{Colors.RESET} Enter custom pair...")
            sym_input = input(f"{Colors.YELLOW}Enter choice [1-6 or type pair, default 1]: {Colors.RESET}").strip()

        if not sym_input or sym_input == "1":
            SYMBOL = "EUR/USD"
        elif sym_input.isdigit() and 1 <= int(sym_input) <= len(FOREX_PRESETS):
            SYMBOL = FOREX_PRESETS[int(sym_input) - 1][0]
        elif sym_input == "6":
            prompt = "[bold yellow]Enter currency pair (e.g. EUR/JPY): [/bold yellow]" if HAS_RICH and console else f"{Colors.YELLOW}Enter currency pair (e.g. EUR/JPY): {Colors.RESET}"
            try:
                custom_pair = (console.input(prompt) if HAS_RICH and console else input(prompt)).strip().upper()
            except (EOFError, KeyboardInterrupt):
                custom_pair = "EUR/USD"
            SYMBOL = custom_pair or "EUR/USD"
        else:
            SYMBOL = sym_input.upper()

        INITIAL_CAPITAL = 100_000.0

    else:  # US Equities
        US_PRESETS = [
            ("AAPL", "Apple Inc.", "Megacap Consumer Electronics", "[Default]"),
            ("MSFT", "Microsoft Corporation", "Enterprise Cloud & Software", ""),
            ("NVDA", "NVIDIA Corporation", "Semiconductors & AI", ""),
            ("AMZN", "Amazon.com Inc.", "E-Commerce & Cloud Computing", ""),
            ("GOOGL", "Alphabet Inc.", "Digital Search & AI", ""),
            ("TSLA", "Tesla Inc.", "Electric Vehicles & Clean Energy", ""),
        ]

        if HAS_RICH and console:
            us_table = Table(title="🇺🇸 Step 2: Select US Equity Symbol", box=box.ROUNDED, header_style="bold cyan")
            us_table.add_column("#", justify="center", min_width=3, no_wrap=True, style="bold yellow")
            us_table.add_column("Ticker", style="bold green", no_wrap=True)
            us_table.add_column("Company Name", style="bold white")
            us_table.add_column("Sector", style="dim cyan")
            us_table.add_column("Default", justify="center", no_wrap=True, style="bold green")

            for idx, (sym, name, sec, is_def) in enumerate(US_PRESETS, 1):
                us_table.add_row(str(idx), sym, name, sec, is_def)
            us_table.add_row("7", "Custom Ticker", "Enter any US ticker (e.g. AMD)", "User Defined", "")
            console.print(us_table)
            sym_input = console.input("[bold yellow]Enter choice [1-7 or type ticker, default 1]: [/bold yellow]").strip()
        else:
            print(f"{Colors.BOLD}2. Select US Stock (Alpaca):{Colors.RESET}")
            for idx, (sym, name, sec, is_def) in enumerate(US_PRESETS, 1):
                print(f"  {Colors.CYAN}{idx}.{Colors.RESET} {sym:<16} {Colors.DIM}— {name}{Colors.RESET}")
            print(f"  {Colors.CYAN}7.{Colors.RESET} Enter custom ticker...")
            sym_input = input(f"{Colors.YELLOW}Enter choice [1-7 or type ticker, default 1]: {Colors.RESET}").strip()

        if not sym_input or sym_input == "1":
            SYMBOL = "AAPL"
        elif sym_input.isdigit() and 1 <= int(sym_input) <= len(US_PRESETS):
            SYMBOL = US_PRESETS[int(sym_input) - 1][0]
        elif sym_input == "7":
            prompt = "[bold yellow]Enter US ticker (e.g. AMD): [/bold yellow]" if HAS_RICH and console else f"{Colors.YELLOW}Enter US ticker (e.g. AMD): {Colors.RESET}"
            try:
                custom_sym = (console.input(prompt) if HAS_RICH and console else input(prompt)).strip().upper()
            except (EOFError, KeyboardInterrupt):
                custom_sym = "AAPL"
            SYMBOL = custom_sym or "AAPL"
        else:
            SYMBOL = sym_input.upper()

        INITIAL_CAPITAL = 100_000.0

    print()

    # ── Step 3: Dynamic Candle / Timeframe Interval Selection ────────────────
    CANDLE_OPTIONS = [
        ("1m", "1-Minute Bars", "Scalping & High-Frequency Price Action", ""),
        ("2m", "2-Minute Bars", "Micro-Momentum & Clean Pullbacks", ""),
        ("5m", "5-Minute Bars", "Intraday ORB & VWAP Breakouts", "[Default]"),
        ("15m", "15-Minute Bars", "Short-term Momentum & Reversals", ""),
        ("30m", "30-Minute Bars", "Multi-hour Trend Following", ""),
        ("1h", "1-Hour Bars", "Swing Trading & Trend Structure", ""),
        ("1d", "Daily Bars", "Positional & Long-term Swings", ""),
    ]

    if HAS_RICH and console:
        tf_table = Table(title="⏱️  Step 3: Select Candle Timeframe", box=box.ROUNDED, header_style="bold cyan")
        tf_table.add_column("#", justify="center", min_width=3, no_wrap=True, style="bold yellow")
        tf_table.add_column("Timeframe", style="bold green", no_wrap=True)
        tf_table.add_column("Description", style="bold white")
        tf_table.add_column("Recommended Strategy Context", style="dim cyan")
        tf_table.add_column("Default", justify="center", no_wrap=True, style="bold green")

        for idx, (tf, desc, context, is_def) in enumerate(CANDLE_OPTIONS, 1):
            tf_table.add_row(str(idx), tf, desc, context, is_def)
        tf_table.add_row(str(len(CANDLE_OPTIONS) + 1), "Custom", "Enter custom interval (e.g. 10m)", "User Defined", "")
        console.print(tf_table)
        tf_input = console.input(f"[bold yellow]Enter choice [1-{len(CANDLE_OPTIONS) + 1}, default 3 for 5m]: [/bold yellow]").strip()
    else:
        print(f"{Colors.BOLD}3. Select Candle Interval (Timeframe):{Colors.RESET}")
        for idx, (tf, desc, context, is_def) in enumerate(CANDLE_OPTIONS, 1):
            print(f"  {Colors.CYAN}{idx}.{Colors.RESET} {tf:<8} {Colors.DIM}— {desc}{Colors.RESET}")
        print(f"  {Colors.CYAN}{len(CANDLE_OPTIONS) + 1}.{Colors.RESET} Enter custom interval...")
        tf_input = input(f"{Colors.YELLOW}Choose timeframe [1-{len(CANDLE_OPTIONS) + 1}, default 3 for 5m]: {Colors.RESET}").strip()

    custom_idx = str(len(CANDLE_OPTIONS) + 1)
    if not tf_input or tf_input == "3":
        INTERVAL = "5m"
    elif tf_input.isdigit() and 1 <= int(tf_input) <= len(CANDLE_OPTIONS):
        INTERVAL = CANDLE_OPTIONS[int(tf_input) - 1][0]
    elif tf_input == custom_idx:
        prompt = "[bold yellow]Enter custom timeframe (e.g. 10m): [/bold yellow]" if HAS_RICH and console else f"{Colors.YELLOW}Enter custom timeframe (e.g. 10m): {Colors.RESET}"
        try:
            INTERVAL = (console.input(prompt) if HAS_RICH and console else input(prompt)).strip() or "5m"
        except (EOFError, KeyboardInterrupt):
            INTERVAL = "5m"
    else:
        INTERVAL = tf_input

    print()

    # ── Step 4: Dynamic Lookback Selection ───────────────────────────────────
    is_intraday = INTERVAL.lower() in ("1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h")
    default_days = 7 if INTERVAL.lower() == "1m" else (60 if is_intraday else 365)

    try:
        if HAS_RICH and console:
            lookback_prompt = f"[bold yellow]📅 Step 4: Enter historical lookback in calendar days [dim](default {default_days}d)[/dim]: [/bold yellow]"
            lookback_input = console.input(lookback_prompt).strip()
        else:
            lookback_input = input(f"{Colors.YELLOW}4. Enter lookback in calendar days [default {default_days}]: {Colors.RESET}").strip()
        LOOKBACK_DAYS = int(lookback_input) if lookback_input else default_days
    except (ValueError, EOFError, KeyboardInterrupt):
        LOOKBACK_DAYS = default_days

    # ── Step 5: Dynamic Starting Capital (Initial Balance) ───────────────────
    default_capital = 1_000_000.0 if IS_INDIAN else 100_000.0
    if IS_INDIAN:
        cap_hint = "e.g. 1000000, 10L, 5L, default ₹10,00,000 (10 Lakhs)"
        cap_prompt = f"[bold yellow]💰 Step 5: Enter Starting Capital in ₹ [dim]({cap_hint})[/dim]: [/bold yellow]" if HAS_RICH and console else f"{Colors.YELLOW}5. Enter Starting Capital in ₹ ({cap_hint}): {Colors.RESET}"
    else:
        cap_hint = "e.g. 100000 or 100k, default $100,000"
        cap_prompt = f"[bold yellow]💰 Step 5: Enter Starting Capital in $ [dim]({cap_hint})[/dim]: [/bold yellow]" if HAS_RICH and console else f"{Colors.YELLOW}5. Enter Starting Capital in $ ({cap_hint}): {Colors.RESET}"

    try:
        cap_input = (console.input(cap_prompt) if HAS_RICH and console else input(cap_prompt)).strip()
        INITIAL_CAPITAL = parse_capital_input(cap_input, default_capital, is_indian=IS_INDIAN)
    except (ValueError, EOFError, KeyboardInterrupt):
        INITIAL_CAPITAL = default_capital

    SLIPPAGE_PCT = 0.0005        # 0.05%
    FOREX_SPREAD_PIPS = 1.5      # 1.5 pips for forex

    # ── Configuration Summary Panel ──────────────────────────────────────────
    curr_symbol = "₹" if IS_INDIAN else "$"
    start_cash_str = format_currency(INITIAL_CAPITAL, curr_symbol, show_lakh_tag=True)
    if HAS_RICH and console:
        console.print()
        config_summary = (
            f"[bold white]Target Market:[/bold white]   [bold cyan]{SELECTED_MARKET}[/bold cyan]    "
            f"[bold white]Symbol:[/bold white]        [bold green]{SYMBOL}[/bold green]\n"
            f"[bold white]Timeframe:[/bold white]       [bold yellow]{INTERVAL}[/bold yellow]           "
            f"[bold white]Lookback:[/bold white]      [bold magenta]{LOOKBACK_DAYS} calendar days[/bold magenta]\n"
            f"[bold white]Starting Cash:[/bold white]   [bold white]{start_cash_str}[/bold white]     "
            f"[bold white]Friction Model:[/bold white] [dim green]{'NSE Statutory + 5bps' if IS_INDIAN else ('1.5 pips spread' if IS_FOREX else '0.05% slippage')}[/dim green]"
        )
        console.print(Panel(
            config_summary,
            title="⚙️  Active Backtest Parameters",
            box=box.ROUNDED,
            border_style="bright_blue",
            padding=(0, 2)
        ))
        console.print()

    # ── Step 6: Strategy Discovery & Selection ───────────────────────────────
    all_strategies = list_strategies()
    strategies = [s for s in all_strategies if s.get('market', 'US') in (CURRENT_MARKET, 'ALL')]

    if not strategies:
        if HAS_RICH and console:
            console.print(f"[bold red]❌ No strategies found for {CURRENT_MARKET} market.[/bold red]")
        else:
            print(f"  {Colors.RED}No strategies found for {CURRENT_MARKET} market.{Colors.RESET}")
        sys.exit(0)

    if HAS_RICH and console:
        strat_table = Table(title=f"🎯 Step 6: Select Strategy ({CURRENT_MARKET} Market)", box=box.ROUNDED, header_style="bold cyan")
        strat_table.add_column("#", justify="center", min_width=3, no_wrap=True, style="bold yellow")
        strat_table.add_column("Strategy Name", style="bold white", no_wrap=True)
        strat_table.add_column("Market", style="cyan", justify="center", no_wrap=True)
        strat_table.add_column("Description", style="dim white")

        for i, s in enumerate(strategies, 1):
            strat_table.add_row(str(i), s['name'], s.get('market', 'ALL'), s.get('description', ''))
        strat_table.add_row("0", "⚡ Run ALL Strategies", "ALL", "Execute every available strategy and compare side-by-side")
        console.print(strat_table)

        user_input = console.input("[bold yellow]Select strategies [e.g. 1 or 1,2 or 0 for all, default 1]: [/bold yellow]").strip()
    else:
        print(f"{Colors.BOLD}6. Available Strategies for {CURRENT_MARKET} Market:{Colors.RESET}")
        for i, s in enumerate(strategies, 1):
            print(f"  {Colors.CYAN}{i}.{Colors.RESET} {s['name']:<28} {Colors.DIM}— {s['description']}{Colors.RESET}")
        print(f"  {Colors.CYAN}0.{Colors.RESET} {'Run ALL strategies':<28} {Colors.DIM}— Compare all side-by-side{Colors.RESET}")
        user_input: str = input(f"\n{Colors.YELLOW}Select strategies (e.g., 1 or 1,2 or 0 for all) [default 1]: {Colors.RESET}").strip()

    try:
        if not user_input:
            choices = [1]
        else:
            choices = [int(x.strip()) for x in user_input.split(',')]
    except (ValueError, EOFError, KeyboardInterrupt):
        choices = [1]

    print()

    # ── Step 6: Fetch Data with User's Dynamic Interval ───────────────────────
    if IS_INDIAN:
        raw_df: pd.DataFrame = fetch_indian_data(SYMBOL, days_back=LOOKBACK_DAYS, interval=INTERVAL)
    elif IS_FOREX:
        raw_df: pd.DataFrame = fetch_forex_data(SYMBOL, days_back=LOOKBACK_DAYS, timeframe=INTERVAL)
    else:
        raw_df: pd.DataFrame = fetch_historical_backtest_data(SYMBOL, days_back=LOOKBACK_DAYS, interval=INTERVAL)

    if 0 in choices:
        # Run ALL strategies with comparison
        if IS_INDIAN:
            # For Indian mode, run each strategy through the Indian backtest engine
            all_metrics_list: List[Dict] = []
            for entry in strategies:
                name: str = entry['name']
                strategy_func: Callable = get_strategy(name)

                strategy_df: pd.DataFrame = strategy_func(raw_df.copy())
                buy_count: int = int((strategy_df['signal'] == 1).sum())
                sell_count: int = int((strategy_df['signal'] == -1).sum())

                if HAS_RICH and console:
                    console.print(Panel(
                        f"[bold white]Strategy Simulation:[/bold white] [bold cyan]{name}[/bold cyan]\n"
                        f"[dim]Generated Signals:[/dim] [bold green]{buy_count} BUY[/bold green] [dim]|[/dim] [bold red]{sell_count} SELL[/bold red]",
                        box=box.ROUNDED,
                        border_style="yellow",
                        padding=(0, 2)
                    ))
                else:
                    print(f"\n{Colors.BOLD}{Colors.YELLOW}{'━' * 60}")
                    print(f"  🎯  Strategy: {name}")
                    print(f"{'━' * 60}{Colors.RESET}")
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
                    strategy_df: pd.DataFrame = strategy_func(raw_df.copy())
                    buy_count: int = int((strategy_df['signal'] == 1).sum())
                    sell_count: int = int((strategy_df['signal'] == -1).sum())

                    if HAS_RICH and console:
                        console.print(Panel(
                            f"[bold white]Strategy Simulation:[/bold white] [bold cyan]{selected_name}[/bold cyan]\n"
                            f"[dim]Generated Signals:[/dim] [bold green]{buy_count} BUY[/bold green] [dim]|[/dim] [bold red]{sell_count} SELL[/bold red]",
                            box=box.ROUNDED,
                            border_style="yellow",
                            padding=(0, 2)
                        ))
                    else:
                        print(f"\n{Colors.BOLD}{Colors.YELLOW}{'━' * 60}")
                        print(f"  🎯  Strategy: {selected_name}")
                        print(f"{'━' * 60}{Colors.RESET}")
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
