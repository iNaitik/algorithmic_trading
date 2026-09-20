# Algo Trading Bot

A Python algorithmic-trading research project for US equities, Indian equities, and forex. It includes Alpaca paper trading, a local Indian-market simulator, reusable strategies, historical backtesting, and matrix experiments.

> This project is for research and paper/simulated trading. Review and test all behavior before using real money.

## Features

- US equity paper trading through the modern `alpaca-py` SDK.
- Indian NSE simulation using Yahoo Finance data and Indian statutory costs.
- Historical backtesting with slippage, transaction costs, and performance metrics.
- Automatically discovered plug-and-play strategies.
- US, Indian, and forex data pipelines.
- Matrix backtests for comparing symbols and lookback periods.
- CSV trade and experiment logs.

## Project Structure

```text
.
├── bot.py                         # US Alpaca paper-trading bot
├── bot_india.py                   # Local NSE trading simulator
├── backtesting.py                 # Interactive backtesting engine
├── matrix_backtest/
│   ├── run_matrix.py              # US RSI matrix backtest
│   └── run_forex_matrix.py        # Forex London-breakout matrix
├── strategies/
│   ├── us/                        # US and forex strategies
│   └── india/                     # Indian-market strategies
├── trade_history.csv              # Trade audit output
├── trade_log_*.csv                # Forex matrix output files
├── BACKTESTING_README.md          # Backtesting-specific notes
├── limitations.md                 # Data and timeframe limitations
└── instruction.md                 # Coding and SDK requirements
```

## Requirements

- Python 3.10 or newer
- An Alpaca account for US data and paper trading
- Alpaca API credentials for Alpaca-backed scripts
- Internet access for Alpaca and Yahoo Finance data

## Installation

From PowerShell, open the project directory and create a virtual environment:

```powershell
cd "C:\Users\Naitik\Desktop\CODING\Algo Trading Bot"
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install numpy pandas yfinance alpaca-py python-dotenv
```

If PowerShell blocks activation for the current session:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
```

## Configuration

Create a `.env` file in the project root for scripts that use Alpaca:

```env
ALPACA_API_KEY=your_api_key
ALPACA_SECRET_KEY=your_secret_key
```

`bot.py` is explicitly configured for Alpaca paper trading. Never place live credentials in source files or commit the `.env` file.

## Running the Project

### US Alpaca paper-trading bot

```powershell
python bot.py
```

This bot watches `AAPL`, `MSFT`, `NVDA`, `GOOGL`, and `AMZN`. It downloads 5-minute bars, uses a 9/21 SMA crossover, allocates 5% of available cash per entry, and submits bracket orders with a 2% take-profit and 1% stop-loss.

The process is continuous and should be stopped with `Ctrl+C`.

### Indian NSE simulator

```powershell
python bot_india.py
```

This is a local simulation, not a broker-connected NSE trading bot. It defaults to `RELIANCE.NS`, uses the NSE opening-range/VWAP strategy, applies simulated Indian charges and slippage, and stores portfolio state in `bot_india_state.json`.

### Interactive backtester

```powershell
python backtesting.py
```

The program displays the registered strategies and lets you run one, several, or all strategies. Change the symbol, lookback, capital, and slippage settings in the `__main__` block of `backtesting.py`.

Market routing is based on the symbol:

- US symbols such as `AAPL`: Alpaca historical data
- NSE symbols ending in `.NS`: Yahoo Finance Indian data
- Forex symbols such as `EUR/USD`: Yahoo Finance forex data

### US matrix backtest

```powershell
python -m matrix_backtest.run_matrix
```

Runs RSI mean-reversion tests across multiple US symbols and lookback periods with an injected 2% stop-loss.

### Forex matrix backtest

```powershell
python -m matrix_backtest.run_forex_matrix
```

Tests the London breakout strategy on EUR/USD, GBP/USD, and USD/JPY with train/test results and exports a dated `trade_log_YYYYMMDD.csv` file.

## Strategies

Strategies are registered with the decorator in `strategies/__init__.py`:

```python
@strategy(
    name="My Strategy",
    description="Strategy description",
    market="US",
)
def my_strategy(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    result["signal"] = 0
    result["execution_signal"] = result["signal"].shift(1).fillna(0).astype(int)
    return result
```

A strategy receives OHLCV data and should return an `execution_signal` column:

- `1`: buy
- `-1`: sell
- `0`: hold

Signals should be shifted by one bar so that a signal generated from a completed candle executes on a later candle.

Current strategies include:

- 9/21 SMA crossover
- 12/26 EMA crossover
- RSI mean reversion
- Trend pullback with EMA, RSI, ATR, stops, and targets
- London-session forex breakout
- NSE opening-range breakout with VWAP and volume confirmation

To add a strategy, create a Python file under `strategies/`, use the `@strategy` decorator, and return the required signal column. The registry automatically discovers strategy modules when imported.

## Backtesting Model

The backtesting engine follows this general pipeline:

1. Fetch historical OHLCV data.
2. Apply a selected strategy.
3. Delay signals to reduce look-ahead bias.
4. Execute entries and exits on later bars.
5. Apply market-specific slippage and costs.
6. Track cash, holdings, market value, and total equity.
7. Calculate return, P&L, trade count, win rate, drawdown, Sharpe ratio, and profit factor.

Indian simulations include brokerage, STT, exchange fees, SEBI fees, stamp duty, GST, and slippage. Forex simulations include spread adjustments.

## Output Files

- `trade_history.csv`: audit log used by the US paper bot and Indian simulator.
- `bot_india_state.json`: persistent Indian simulator state, created after state is saved.
- `trade_log_YYYYMMDD.csv`: dated forex matrix trade events.

Do not treat CSV results as broker-confirmed fills. The US bot currently records estimated candle prices rather than guaranteed execution prices.

## Important Limitations

- Yahoo Finance generally limits intraday history to about 60 days.
- The Indian ORB strategy depends on its expected intraday candle size and session timestamps.
- Some strategy stop-losses are represented as delayed signals rather than exact stop-price fills.
- The trend-pullback strategy name references one-hour trading, but it operates on the timeframe supplied by the caller.
- Forex pip and short-position modeling is simplified in parts of the generic backtester.
- The generic backtester may not interpret every special exit signal emitted by the London breakout strategy; the specialized forex matrix runner handles its own exits.
- Indian bot time handling relies on local clock assumptions and should be reviewed before deployment.
- The US bot cancels open orders broadly when handling a sell signal, which may affect other symbols.

See [limitations.md](limitations.md) and [BACKTESTING_README.md](BACKTESTING_README.md) for additional details.

## Safety Checklist

Before running any trading script:

1. Confirm the correct virtual environment is active.
2. Verify that Alpaca credentials are present and intended for paper trading.
3. Run a backtest first.
4. Inspect generated signals and logs.
5. Start with a small, controlled paper account.
6. Do not assume backtest performance predicts live performance.
