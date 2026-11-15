# 📈 Algo Trading Bot

<p align="center">
  <b>High-Performance Quantitative Research, Backtesting & Paper Trading Platform in Python</b><br>
  <i>Supporting Indian Equities (NSE), US Equities (Alpaca), and Forex (G10 Pairs)</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white" alt="Python 3.10+">
  <img src="https://img.shields.io/badge/Markets-NSE%20%7C%20US%20%7C%20Forex-orange" alt="Markets">
  <img src="https://img.shields.io/badge/Lookahead%20Bias-Zero%20(Guaranteed)-success" alt="Zero Lookahead">
  <img src="https://img.shields.io/badge/Cost%20Modeling-Full%20Statutory%20Taxes-purple" alt="Statutory Cost Model">
  <img src="https://img.shields.io/badge/UI-Interactive%20Terminal%20(Rich)-cyan" alt="Rich Terminal UI">
</p>

---

## 📑 Table of Contents

- [🌟 System Highlights](#-system-highlights)
- [🏛️ System Architecture](#️-system-architecture)
- [📁 Project Organization](#-project-organization)
- [⚡ Quick Start & Installation](#-quick-start--installation)
- [🎮 Running the Platform](#-running-the-platform)
  - [1. Interactive Quantitative Backtester](#1-interactive-quantitative-backtester)
  - [2. Multi-Factor Matrix Engine](#2-multi-factor-matrix-engine)
  - [3. Real-Time NSE Paper-Trading Bot](#3-real-time-nse-paper-trading-bot)
  - [4. US Alpaca Paper-Trading Bot](#4-us-alpaca-paper-trading-bot)
- [🧠 Built-In Strategy Catalog](#-built-in-strategy-catalog)
- [💰 Statutory Tax & Friction Matrix (NSE India)](#-statutory-tax--friction-matrix-nse-india)
- [🧪 Automated Unit & Parity Tests](#-automated-unit--parity-tests)
- [📚 Documentation Index](#-documentation-index)
- [🛡️ Pre-Flight Trading Checklist](#️-pre-flight-trading-checklist)

---

## 🌟 System Highlights

- **Dynamic Interactive Terminal UI**: Select markets, benchmark tickers, candle timeframes (`1m` to `1d`), lookbacks, and strategies interactively with formatted tables and panels. **Zero manual code editing required**.
- **Accurate Indian Statutory Friction Model**: Simulates the exact Indian tax matrix (Brokerage with ₹20 cap, STT on sell turnover, Stamp Duty on buy turnover, NSE transaction charges, SEBI fees, 18% GST, and 5 bps slippage).
- **Guaranteed Zero Look-Ahead Bias**: Signals computed at the close of candle $t$ execute strictly at the Open of candle $t+1$ with slippage penalties.
- **Single Source of Truth Strategy Design**: Strategies are written once using `@strategy` and auto-discovered across the backtester, batch matrix tester, and live paper-trading bots.
- **High-Fidelity P&L Reporting**: Complete audit transparency distinguishing **Gross Trading P&L**, **Itemized Statutory Deductions**, **Net In-Hand P&L**, and **Final Equity In Hand**.
- **Real-Time Intra-Candle Exit Polling**: `bot_india.py` synchronizes with live market clocks and polls prices every 15 seconds to trigger intra-candle Stop-Loss or Take-Profit exits.

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                       DATA INGESTION LAYER                             │
│      yfinance (NSE & FX)       │       Alpaca Markets API (US)         │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      CENTRAL STRATEGY REGISTRY                         │
│   @strategy Auto-Discovery • Zero Look-Ahead Shift • Standardized OHLCV│
└───────┬───────────────────────────────┬────────────────────────┬───────┘
        │                               │                        │
        ▼                               ▼                        ▼
┌───────────────────┐       ┌───────────────────────┐   ┌────────────────┐
│   BACKTESTING     │       │  MULTI-FACTOR MATRIX  │   │  PAPER BOTS    │
│  Interactive CLI  │       │  Batch Grid Analysis  │   │ bot_india.py   │
│  Statutory Models │       │  Assets × Timeframes  │   │ bot.py         │
└───────┬───────────┘       └───────────┬───────────┘   └────────┬───────┘
        │                               │                        │
        ▼                               ▼                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      REPORTING & AUDIT LAYER                           │
│  Rich Performance Cards • Trade Execution Journal • data/trade_history │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Organization

```text
Algo Trading Bot/
├── server.py                      # FastAPI quantitative backend & static web server
├── frontend/                      # Modern React + Vite + TradingView Web Terminal
│   ├── src/                       # Components: CandleChart, EquityChart, TradeJournal, BotTelemetry
│   ├── dist/                      # Pre-compiled high-performance production assets
│   └── package.json
├── backtesting.py                 # Multi-asset interactive backtesting terminal
├── bot_india.py                   # Real-time NSE paper-trading bot (intra-candle SL/TP)
├── bot.py                         # US Alpaca paper-trading bot (bracket orders)
├── configs/                       # Strategy parameters & configuration profiles
│   └── config_failed_gap_fade.json
├── data/                          # Persistent runtime logs, state & trade histories
│   ├── trade_history.csv          # Continuous trade execution journal
│   └── bot_india_state_*.json     # Idempotent per-symbol bot state
├── tests/                         # Automated unit, boundary & regression test suite
│   ├── __init__.py
│   └── test_failed_gap_fade.py    # Zero look-ahead & execution parity tests
├── strategies/                    # Single-source quantitative strategy registry
│   ├── __init__.py                # Strategy registry decorator & loader
│   ├── india/                     # Indian market strategies (ORB, VWAP, Gap Fade)
│   │   ├── nse_failed_gap_fade.py # Failed-Gap Fade with 1:1.5 R/R & VWAP
│   │   ├── nse_midday_vwap_pullback.py # Midday VWAP Pullback trend system
│   │   ├── nse_orb_breakout.py    # 15-min ORB with VWAP & 2R trailing ratchet
│   │   └── nse_orb_vwap.py        # ORB with Volume SMA filter & 11:30 cutoff
│   └── us/                        # US Equities & Forex strategies
│       ├── sma_crossover.py       # 9/21 SMA crossover system
│       ├── ema_crossover.py       # 12/26 EMA crossover system
│       ├── rsi_mean_reversion.py  # RSI(14) oversold/overbought system
│       ├── london_breakout.py     # London session Asian range breakout
│       └── trend_pullback_1h.py   # Trend pullback with EMA, ATR & stops
├── matrix_backtest/               # Multi-factor matrix backtesting suite
│   ├── run_india_matrix.py        # Stocks × Timeframes × Strategies NSE matrix
│   ├── run_matrix.py              # US stocks RSI parameter matrix
│   └── run_forex_matrix.py        # Forex London breakout parameter matrix
├── BACKTESTING_README.md          # Strategy developer & backtest guide
├── limitations.md                 # Market data feed, interval & lookback rules
├── README.md                      # Main project documentation
├── .env                           # Environment variables (Alpaca API keys)
└── .gitignore                     # Git ignore rules for data, cache & logs
```

---

## ⚡ Quick Start & Installation

### 1. Prerequisites
- **Python 3.10+** (Fully compatible with Python 3.11, 3.12, and 3.14)
- Internet connection for data feeds (`yfinance` and `alpaca-py`)

### 2. Virtual Environment Setup
In PowerShell:

```powershell
# Navigate to the workspace
cd "c:\Users\Naitik\Desktop\CODING\Algo Trading Bot"

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Upgrade pip and install core quantitative libraries
python -m pip install --upgrade pip
pip install numpy pandas yfinance alpaca-py python-dotenv rich
```

### 3. API Credentials (Optional for US Trading)
For US Alpaca Paper Trading, create a `.env` file in the project root:
```env
ALPACA_API_KEY=your_alpaca_paper_api_key
ALPACA_SECRET_KEY=your_alpaca_paper_secret_key
```
*(Indian NSE testing via `yfinance` requires no API keys or subscription).*

---

## 🎮 Running the Platform

### 0. Modern Web Quantitative Terminal (TradingView Charts + Full UI)

Launch the unified quantitative terminal with high-performance TradingView charting:

```powershell
python server.py
```

Then open **[http://localhost:8000](http://localhost:8000)** in your browser:
- **Interactive Candlestick Chart**: Powered by TradingView Lightweight Charts with zoom/pan and trade markers (`▲ BUY`, `▼ SELL`) pinned directly to candles.
- **Interactive Strategy Controls**: Select markets (NSE / US / Forex), presets or custom tickers, timeframes (`1m` to `1d`), starting capital in Lakhs or Dollars, and strategies.
- **Portfolio Equity Curve**: Visualizes cumulative net equity vs baseline capital.
- **Statutory Taxes & Charges Card**: Itemized rupee deductions for Brokerage, STT, Exchange fees, Stamp Duty, SEBI fees, and GST.
- **Trade Execution Journal**: Filterable audit table with exact entry/exit timestamps, execution prices, quantities, and net in-hand returns.
- **Live Paper Bot Telemetry**: Real-time polling of active paper trading bot positions and continuous trade journals.

*(For developers editing UI code with live hot-reloading, run `cd frontend; npm run dev` on `http://localhost:5173`).*

---

### 1. Interactive Quantitative Backtester

Run the interactive terminal wizard:

```powershell
python backtesting.py
```

The terminal prompts you through 6 clear steps:
1. **Market**: 🇮🇳 India (NSE), 🇺🇸 United States, or 💱 Forex.
2. **Symbol**: Pick from presets (`RELIANCE.NS`, `ICICIBANK.NS`, `AAPL`, `EUR/USD`) or enter a custom ticker.
3. **Timeframe**: Choose `1m`, `2m`, `5m`, `15m`, `30m`, `1h`, or `1d`.
4. **Lookback**: Enter history in days (auto-clamped to Yahoo limits).
5. **Starting Capital**: Flexible initial cash. Input in Lakhs/Crores for India (e.g. `5L`, `10L`, `1Cr`, formatted as `₹10,00,000.00 (10.00 Lakhs)`), or Dollars for US/Forex (e.g. `50k`, `100k`, formatted as `$100,000.00`).
6. **Strategy**: Select one, several, or enter `0` to run **ALL** strategies and view a ranked **Performance Leaderboard**.

---

### 2. Multi-Factor Matrix Engine

Test strategies across multiple assets, timeframes, and strategies simultaneously:

```powershell
python -m matrix_backtest.run_india_matrix
```

- **Execution Modes**:
  - `1` **Fast Core Matrix**: 4 Key Stocks × 3 Timeframes × 3 Strategies = **36 Combinations** *(Recommended)*.
  - `2` **Full Extensive Matrix**: 8 Stocks × 4 Timeframes × 3 Strategies = **96 Combinations**.
  - `3` **Custom Selection**: Choose specific assets, intervals, and strategies.
- **Smart In-Memory Caching**: Pulls data for each asset/interval once to eliminate rate limits.
- **Optional CSV Export**: Prompts interactively whether to save results to CSV.

---

### 3. Real-Time NSE Paper-Trading Bot

Run the live simulated trading bot for Indian equities:

```powershell
python bot_india.py
```

- Interactively select symbol, strategy, and candle interval.
- Synchronizes with market clock (09:15 to 15:30 IST).
- Displays a live **Terminal Status Card** with active position and cash balance.
- Performs **intra-candle exit monitoring** every 15 seconds to catch Stop-Loss or Take-Profit hits before the candle closes.
- Writes state to `data/bot_india_state_<SYMBOL>.json` and trades to `data/trade_history.csv`.

---

### 4. US Alpaca Paper-Trading Bot

Run the US equity paper bot:

```powershell
python bot.py
```

- Connects to Alpaca's paper trading environment.
- Watches megacap equities (`AAPL`, `MSFT`, `NVDA`, `GOOGL`, `AMZN`).
- Dynamically allocates 5% equity per trade with automated bracket order legs (2% TP, 1% SL).

---

## 🧠 Built-In Strategy Catalog

| Strategy Name | Target Market | Style | Native Timeframe | Core Indicators & Rules |
| :--- | :---: | :---: | :---: | :--- |
| **NSE Failed-Gap Fade** | 🇮🇳 India | Mean Reversion | `1m`, `5m` | Gaps $\ge$ 0.75%, RVOL $\ge$ 1.25, breaks back inside OR, targets prev close with 1:1.5 R/R. |
| **NSE Midday VWAP Pullback** | 🇮🇳 India | Trend Following | `1m`, `2m`, `5m` | Midday (11:00-14:00), EMA(20) trend alignment, enters on VWAP touch with trailing stop. |
| **NSE Intraday ORB Breakout** | 🇮🇳 India | Momentum Breakout | `5m`, `15m` | 09:15-09:30 range breakout, VWAP filter, volume spike confirmation, 15:15 IST square-off. |
| **NSE Intraday ORB VWAP** | 🇮🇳 India | Breakout / Filter | `5m` | Opening range breakout with Volume SMA filter and 11:30 AM entry cutoff. |
| **EMA Crossover** | 🌍 Multi-Asset | Trend Following | `5m`, `15m`, `1h` | 9-period EMA crosses 21-period EMA with 1-bar execution lag. |
| **SMA Crossover** | 🌍 Multi-Asset | Trend Following | `15m`, `1h`, `1d` | 9-period SMA crosses 21-period SMA for medium-horizon trend tracking. |
| **RSI Mean Reversion** | 🇺🇸 US / Forex | Counter-Trend | `15m`, `1h` | RSI(14) oversold (<30) entry with overbought (>70) profit take. |
| **London Handoff Momentum** | 💱 Forex | Breakout | `15m`, `1h` | Exploits liquidity breakout of Asian session range during London open. |
| **1-Hour Trend Pullback** | 🇺🇸 US Equities | Trend Pullback | `1h` | 50 EMA trend filter with ATR-based volatility stops. |

---

## 💰 Statutory Tax & Friction Matrix (NSE India)

In live Indian markets, statutory friction is levied on **turnover**, not profits. Both `backtesting.py` and `bot_india.py` calculate the exact fee schedule:

| Statutory Charge | Regulatory Formula | Applicability |
| :--- | :--- | :--- |
| **Brokerage** | `min(0.03%, ₹20)` per order | Both Buy & Sell legs |
| **STT (Securities Transaction Tax)** | `0.025%` of turnover | Sell leg only (Intraday MIS) |
| **NSE Exchange Charges** | `0.00297%` (₹2.97 per lakh) | Both Buy & Sell legs |
| **Stamp Duty** | `0.003%` (₹300 per crore) | Buy leg only |
| **SEBI Turnover Charges** | `0.0001%` (₹10 per crore) | Both Buy & Sell legs |
| **GST** | `18%` on `(Brokerage + Exchange + SEBI)` | Both Buy & Sell legs |
| **Slippage** | `0.05%` (5 bps) | Entry & Exit price fills |

---

## 🧪 Automated Unit & Parity Tests

The framework includes a comprehensive test suite in `tests/` covering look-ahead bias verification, synthetic edge cases, and backtester-to-bot parity:

```powershell
# Run all automated tests
python -m unittest discover tests
```

Tests verify:
- **Zero Look-Ahead Bias**: Truncated at time $t$ vs full day data parity.
- **Statutory Cost Deductions**: Exact rupee verification against official SEBI/NSE formulas.
- **Intraday Boundary Rules**: Opening Range formation, entry cutoff hours, and mandatory 15:15 square-off.
- **Execution Tie-Breakers**: Same-candle stop and target ties (Stop Loss strictly takes priority).

---

## 📚 Documentation Index

- [BACKTESTING_README.md](file:///c:/Users/Naitik/Desktop/CODING/Algo%20Trading%20Bot/BACKTESTING_README.md): In-depth strategy developer guide, indicator templates, and performance reporting manual.
- [limitations.md](file:///c:/Users/Naitik/Desktop/CODING/Algo%20Trading%20Bot/limitations.md): Data lookback clamping thresholds (`1m` to `1d`), Yahoo Finance API guidelines, and corporate action notes.

---

## 🛡️ Pre-Flight Trading Checklist

> [!TIP]
> 1. **Activate Virtual Environment**: Always verify `(.venv)` is active before running commands.
> 2. **Run Backtests First**: Test target strategies across multiple timeframes (`1m`, `5m`, `15m`) and market regimes.
> 3. **Verify Net In-Hand P&L**: Ensure strategy alpha comfortably exceeds statutory friction and 5 bps slippage.
> 4. **Paper Trade During Live Hours**: Run `bot_india.py` during market hours (09:15 to 15:30 IST) to verify real-time fills and state persistence in `data/`.
