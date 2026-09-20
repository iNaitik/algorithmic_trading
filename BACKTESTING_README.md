# Algo Trading Backtesting Framework

Welcome to the modular, zero look-ahead bias backtesting framework. This engine allows you to easily simulate, evaluate, and compare quantitative trading strategies using historical data from Alpaca.

## ⚙️ 1. Setup & Requirements

Before running the backtester, ensure your API keys are set. The framework requires Alpaca API credentials to fetch historical data.

1. Open (or create) the `.env` file in the root directory.
2. Add your Alpaca API credentials:
   ```env
   ALPACA_API_KEY=your_api_key_here
   ALPACA_SECRET_KEY=your_secret_key_here
   ```

## 🚀 2. How to Run a Backtest

Running the backtester is simple. Open your terminal and execute:

```bash
python backtesting.py
```

Upon running, you will be greeted by an interactive menu displaying all loaded strategies:
```
🚀🚀🚀  Algo Backtesting Framework  🚀🚀🚀

Available Strategies:
  1. SMA Crossover             — 9/21 Simple Moving Average crossover
  2. RSI Mean Reversion        — RSI(14) oversold/overbought system
  3. EMA Crossover             — 12/26 Exponential Moving Average crossover
  0. Run ALL strategies        — Compare all side-by-side

Select strategies (e.g., 1 or 1,3 or 0 for all): 
```

**Selection Options:**
- **Single Strategy**: Enter a single number (e.g., `1`).
- **Multiple Strategies**: Enter a comma-separated list (e.g., `1, 3`). The engine will run both and provide a side-by-side comparison table.
- **All Strategies**: Enter `0` to run every registered strategy and view a ranked performance leaderboard.

## 🔧 3. Configuring Backtest Parameters

To change the parameters of the simulation (like the asset traded, capital, or timeframe), you need to modify variables directly inside `backtesting.py`.

### A. Core Settings (Main Block)
Scroll to the very bottom of `backtesting.py` (around line 593). Here you can change the global settings for the backtest:

```python
if __name__ == "__main__":
    SYMBOL: str = "MSFT"              # The stock ticker to backtest
    LOOKBACK_DAYS: int = 30           # Number of calendar days of history to pull
    INITIAL_CAPITAL: float = 100000.0 # Starting cash balance ($100,000)
    SLIPPAGE_PCT: float = 0.0005      # 0.05% slippage applied to every trade
```

### B. Indian Market Mode 🇮🇳
The framework natively supports Indian (NSE) stocks with accurate statutory costs (Brokerage, STT, Exchange, SEBI, GST) and yfinance intraday data routing.

To run Indian strategies:
1. Change `SYMBOL` in the core settings block to an NSE ticker from the supported watchlist (e.g., `RELIANCE.NS`, `HDFCBANK.NS`, `INFY.NS`).
2. Run `python backtesting.py`.

The framework will automatically:
- Detect the `.NS` suffix.
- Fetch 5-minute data via yfinance (capped at 60 days).
- Set starting capital to ₹10,00,000.
- Route trades through the Indian statutory cost simulator instead of standard US friction.

### C. Timeframe Settings
Currently, the backtester is optimized for **5-Minute Bars**. If you wish to change the candle interval (e.g., to 15-Minute or 1-Hour), update the `fetch_historical_backtest_data` function (around line 92 in `backtesting.py`):

```python
    request_params: StockBarsRequest = StockBarsRequest(
        symbol_or_symbols=symbol,
        timeframe=TimeFrame(5, TimeFrameUnit.Minute), # <--- Change timeframe here
        start=start_dt,
        end=end_dt,
        feed=DataFeed.IEX,
    )
```

## 🧩 4. Creating New Strategies (Plug-and-Play)

The backtesting framework is built with a modular architecture. You **do not** need to edit `backtesting.py` to add new strategies. 

To add a new strategy, simply create a new Python file inside the `strategies/` folder. The framework will automatically discover it.

### Example Strategy Template
Create a file named `my_custom_strategy.py` inside the `strategies/` folder:

```python
import pandas as pd
from strategies import strategy

# 1. Use the @strategy decorator to register your system
@strategy(
    name="My Custom Strategy",
    description="A brief description of what this strategy does"
)
def custom_strategy(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # 2. Add your indicator math here...
    df['fast_sma'] = df['close'].rolling(9).mean()
    df['slow_sma'] = df['close'].rolling(21).mean()

    # 3. Generate raw signals (1 = BUY, -1 = SELL, 0 = HOLD)
    df['signal'] = 0
    # ... your crossover logic ...

    # 4. CRITICAL STEP: Shift signals by 1 to prevent look-ahead bias!
    # This ensures the trade executes on the candle AFTER the signal triggers.
    df['execution_signal'] = df['signal'].shift(1).fillna(0).astype(int)

    return df
```

As soon as you save this file, it will instantly appear as an option the next time you run `python backtesting.py`!
