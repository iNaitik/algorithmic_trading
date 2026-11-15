# 📊 Quantitative Backtesting & Strategy Developer Manual

> **High-Fidelity Multi-Asset Quantitative Simulation Engine**  
> Dynamic Timeframes • Statutory Friction & Slippage Modeling • Zero Look-Ahead Bias • Multi-Factor Matrix Testing

---

## 📑 Table of Contents

- [🚀 Quick Start: Running the Backtester](#-quick-start-running-the-backtester)
- [🛡️ Zero Look-Ahead Bias Engine](#️-zero-look-ahead-bias-engine)
- [🧩 Strategy Developer Guide](#-strategy-developer-guide)
- [📝 Strategy Implementation Templates](#-strategy-implementation-templates)
  - [Template A: Technical Indicator System (EMA / SMA)](#template-a-technical-indicator-system)
  - [Template B: Intraday Timestamp-Gated System (ORB / VWAP)](#template-b-intraday-timestamp-gated-system)
- [🧾 Statutory Cost & Tax Modeling (NSE India)](#-statutory-cost--tax-modeling-nse-india)
- [📈 Performance Metrics & Audit Reporting](#-performance-metrics--audit-reporting)
- [🗺️ Multi-Factor Matrix Backtesting](#️-multi-factor-matrix-backtesting)
- [🤖 Paper Trading Parity](#-paper-trading-parity)

---

## 🚀 Quick Start: Running the Backtester

The framework features an interactive CLI terminal wizard built with `rich`. **No code modifications or configuration files are required** to test any strategy.

```powershell
# From your active virtual environment
python backtesting.py
```

### The 6-Step Interactive Terminal Wizard

```
╔═════════════════════════════════════════════════════════════════════════════════════════════════════╗
║  Algo Backtesting & Quantitative Research Terminal                                                  ║
║  Multi-Asset Engine • Dynamic Timeframes • Statutory Friction & Slippage Model                      ║
╚═════════════════════════════════════════════════════════════════════════════════════════════════════╝
```

1. **Step 1: Select Trading Market**
   - `1` 🇮🇳 **India (NSE)**: Cash equities with comprehensive statutory tax & friction modeling.
   - `2` 🇺🇸 **United States**: US equities via Alpaca Markets API.
   - `3` 💱 **Forex**: Major G10 currency pairs with realistic pip-spread friction.
   *(Press `Enter` to select default: 1)*

2. **Step 2: Select Asset / Ticker Symbol**
   - Pick from curated benchmark lists (e.g., `RELIANCE.NS`, `ICICIBANK.NS`, `HDFCBANK.NS`, `AAPL`, `MSFT`, `EUR/USD`).
   - Or choose **Custom Ticker** to evaluate any ticker worldwide.

3. **Step 3: Select Candle Timeframe**
   - `1` **1m** / `2` **2m**: Micro-intraday & scalping (7-day lookback window).
   - `3` **5m**: Standard intraday *(Default / Recommended for ORB & VWAP)*.
   - `4` **15m** / `5` **30m**: Trend continuation & session swings.
   - `6` **1h** / `7` **1d**: Swing trading & multi-month positional horizons.

4. **Step 4: Historical Lookback Period**
   - Enter historical calendar days (e.g., `60` days for intraday, `365` for daily).
   - The engine automatically clamps the request to Yahoo Finance's server limits to prevent API errors.

5. **Step 5: Dynamic Starting Capital (Flexible & Market-Formatted)**
   - 🇮🇳 **India (NSE)**: Enter amounts in Rupees or shorthand Lakhs/Crores (e.g., `5L`, `10L`, `25L`, `1Cr`, or `500000`). Formatted in authentic Indian numbering system (`₹10,00,000.00 (10.00 Lakhs)`). Default: `₹10,00,000.00` (10 Lakhs).
   - 🇺🇸 **US & Forex**: Enter amounts in Dollars or shorthand thousands/millions (e.g., `50k`, `100k`, `250000`). Formatted in standard Western style (`$100,000.00`). Default: `$100,000.00`.

6. **Step 6: Select Trading Strategy**
   - Automatically displays all strategies registered for your target market.
   - Enter a single number (e.g., `1`), comma-separated numbers (e.g., `1, 3`), or `0` to run **ALL** strategies and view a ranked **Performance Leaderboard**.

---

## 🛡️ Zero Look-Ahead Bias Engine

In live trading, a candle's **Close** price is impossible to know until the candle has fully completed. Any backtest that buys at the Close of the same bar where the signal triggered is mathematically invalid.

```
       CANDLE t (Bar Under Analysis)              CANDLE t+1 (Execution Bar)
  ┌─────────────────────────────────────┐    ┌─────────────────────────────────┐
  │ • Open, High, Low, Close form       │    │ • Open price is established     │
  │ • Strategy evaluates conditions     │───▶│ • Order executes at OPEN        │
  │ • Raw signal generated at bar close │    │   (adjusted for 5 bps slippage) │
  └─────────────────────────────────────┘    └─────────────────────────────────┘
```

> [!IMPORTANT]
> **The 1-Bar Shift Enforcement:**  
> All strategies must shift their raw signals by 1 bar before assigning to `execution_signal`:
> ```python
> df['signal'] = 0
> # ... strategy logic generates raw signals (1, -1, 0) ...
> df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)
> ```
> The execution engine strictly checks `execution_signal` and fills trades at the **Open of candle $t+1$**.

---

## 🧩 Strategy Developer Guide

Adding a new strategy is **100% modular and plug-and-play**.

1. Create a Python file in `strategies/india/` (for NSE) or `strategies/us/` (for US/Forex).
2. Decorate your function with `@strategy(...)` imported from `strategies`.
3. Accept an OHLCV DataFrame (`df`) and return a DataFrame with `execution_signal`.

```python
from strategies import strategy
import pandas as pd

@strategy(
    name="My High-Alpha Strategy",
    description="Captures trend breakouts with dynamic volatility bands",
    market="INDIA"  # "INDIA", "US", or "ALL"
)
def my_high_alpha_strategy(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    # 1. Compute quantitative indicators
    # 2. Generate raw signals (1 = BUY, -1 = SELL, 0 = HOLD)
    # 3. Shift by 1 bar to eliminate look-ahead bias:
    df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)
    return df
```

Save the file and run `python backtesting.py` — your strategy is automatically discovered, indexed, and available in the CLI wizard!

---

## 📝 Strategy Implementation Templates

### Template A: Technical Indicator System
*File: `strategies/us/ema_crossover.py`*

```python
import pandas as pd
from strategies import strategy

@strategy(
    name="Fast EMA Crossover",
    description="9-period EMA crosses 21-period EMA with trend confirmation",
    market="ALL"
)
def fast_ema_crossover(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # 1. Indicator Calculations
    df['ema_fast'] = df['close'].ewm(span=9, adjust=False).mean()
    df['ema_slow'] = df['close'].ewm(span=21, adjust=False).mean()

    # 2. Raw Signal Generation
    df['signal'] = 0
    df.loc[df['ema_fast'] > df['ema_slow'], 'signal'] = 1   # Long Entry
    df.loc[df['ema_fast'] < df['ema_slow'], 'signal'] = -1  # Long Exit / Short

    # 3. Shift by 1 bar for zero look-ahead bias
    df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)
    return df
```

---

### Template B: Intraday Timestamp-Gated System
*File: `strategies/india/nse_orb_breakout.py`*

```python
import pandas as pd
import numpy as np
from datetime import time
from strategies import strategy

@strategy(
    name="NSE Dynamic ORB",
    description="09:15-09:30 Opening Range Breakout with 15:15 IST mandatory square-off",
    market="INDIA"
)
def nse_dynamic_orb(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    
    # Standardize timezone to IST
    if df.index.tz is None:
        df.index = df.index.tz_localize("Asia/Kolkata")
    else:
        df.index = df.index.tz_convert("Asia/Kolkata")

    df['signal'] = 0
    unique_dates = np.unique(df.index.date)

    for d in unique_dates:
        day_mask = (df.index.date == d)
        day_df = df.loc[day_mask]
        if len(day_df) < 5:
            continue

        # 1. Define Opening Range (09:15 to 09:30 IST)
        or_mask = (day_df.index.time >= time(9, 15)) & (day_df.index.time < time(9, 30))
        or_bars = day_df.loc[or_mask]
        if or_bars.empty:
            continue

        or_high = or_bars['high'].max()
        or_low  = or_bars['low'].min()

        in_pos = False
        for ts, row in day_df.iterrows():
            bar_time = ts.time()

            # Hard intraday square-off at 15:15 IST
            if bar_time >= time(15, 15):
                if in_pos:
                    df.loc[ts, 'signal'] = -1
                    in_pos = False
                continue

            # Trade entry window (09:30 to 11:30 IST)
            if time(9, 30) <= bar_time <= time(11, 30):
                if not in_pos and row['close'] > or_high:
                    df.loc[ts, 'signal'] = 1
                    in_pos = True
                elif in_pos and row['close'] < or_low:
                    df.loc[ts, 'signal'] = -1
                    in_pos = False

    # Shift by 1 bar: execute at candle t+1 open
    df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)
    return df
```

---

## 🧾 Statutory Cost & Tax Modeling (NSE India)

In Indian markets, taxes and statutory fees are charged on **gross turnover**, not profits. A profitable gross trading system can become net negative after friction.

The simulation engine models the complete regulatory fee schedule:

| Regulatory Component | Statutory Rate | Charge Basis | Real-World Impact |
| :--- | :--- | :--- | :--- |
| **Brokerage** | `min(0.03%, ₹20)` | Per order leg (Buy & Sell) | Capped at ₹20 for large order sizes |
| **STT (Securities Transaction Tax)** | `0.025%` | Sell turnover (Intraday MIS) | Deducted only on trade liquidation |
| **NSE Exchange Charges** | `0.00297%` | Both Buy & Sell turnover | ₹2.97 per ₹1,00,000 turnover |
| **Stamp Duty** | `0.003%` | Buy turnover only | State duty collected on entry |
| **SEBI Turnover Charges** | `0.0001%` | Both Buy & Sell turnover | ₹10 per ₹1,00,00,000 turnover |
| **GST** | `18%` | On (Brokerage + Exchange + SEBI) | Indirect tax on financial services |
| **Slippage** | `0.05%` (5 bps) | Both Buy & Sell execution prices | Realistic bid-ask spread friction |

---

## 📈 Performance Metrics & Audit Reporting

Every backtest produces three high-transparency reporting tables:

### 1. Performance Summary Card
- **Gross Trading P&L**: Profit/Loss generated strictly from price changes.
- **Total Charges & Taxes**: Full itemized statutory deductions.
- **Net In-Hand P&L**: Realized capital added to your balance.
- **Final Equity (In Hand)**: Starting capital + Net In-Hand P&L.
- **Win Rate, Profit Factor, Sharpe Ratio, Max Drawdown**.

### 2. Statutory Deductions Breakdown
Itemizes exact rupee deductions for Brokerage, STT, Exchange fees, Stamp Duty, SEBI fees, and GST.

### 3. Trade Execution Journal
Chronological audit of every order execution displaying the exact date & time when the bet was placed and closed:
```
# │ Placed At (Entry) │ Exited At │ Side │ Entry Price │ Exit Price │ Qty │ Gross P&L │ Taxes & Fees │ Net In-Hand │ Return % │ Status
```

---

## 🗺️ Multi-Factor Matrix Backtesting

To avoid overfitting to a single stock or timeframe, the matrix backtesting engine runs multi-dimensional batch simulations:

```powershell
python -m matrix_backtest.run_india_matrix
```

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║  🇮🇳  NSE Strategy Matrix Backtester                                                ║
║  Cross-Sectional Factor Evaluation • Multi-Asset × Multi-Timeframe ×               ║
║  Multi-Strategy                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

### Execution Modes:
1. **Fast Core Matrix**: 4 Key Benchmark Stocks (`RELIANCE.NS`, `ICICIBANK.NS`, `HDFCBANK.NS`, `SBIN.NS`) × 3 Timeframes (`1m`, `5m`, `15m`) × 3 Strategies = **36 Iterations**.
2. **Full Extensive Matrix**: 8 Stocks across sectors × 4 Timeframes (`1m`, `2m`, `5m`, `15m`) × 3 Strategies = **96 Iterations**.
3. **Custom Selection**: Interactively select your own assets, intervals, and strategies.

### Key Matrix Features:
- **Smart In-Memory Bar Caching**: Fetches data for each ticker/interval once, completely preventing Yahoo Finance rate limits.
- **Cross-Sectional Heatmaps**: Displays performance matrices grouped by Asset and Timeframe.
- **Interactive Export Choice**: On-demand option to export full audit logs to CSV and Markdown.

---

## 🤖 Paper Trading Parity

Strategies run identically in backtesting and live paper trading without rewriting code:

- **NSE Live Paper Bot (`bot_india.py`)**:
  - Synchronizes with live market clocks (09:15 to 15:30 IST).
  - Evaluates completed bars dynamically from Yahoo Finance.
  - Active position intra-candle polling (15s checks) to trigger exact Stop-Loss or Take-Profit exits.
  - Persistent per-symbol state saved in `data/bot_india_state_<SYMBOL>.json`.
  - Continuous trade ledger recorded in `data/trade_history.csv`.
- **US Paper Bot (`bot.py`)**:
  - Live bracket order execution via Alpaca Markets API.
  - Automatic portfolio rebalancing and risk-budget allocation.
