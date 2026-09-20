# Framework Limitations

## Indian Market Data (`yfinance` Fallback)

The backtesting framework uses `yfinance` to automatically pull data for Indian (NSE) stocks without requiring paid API keys. However, this comes with strict API limitations imposed by Yahoo Finance:

### 1. Intraday History Limit (60 Days Max)
You **cannot** run intraday strategies (1m, 5m, 15m, 30m, 60m intervals) over long historical periods like 1 year. 
- Yahoo Finance enforces a hard **60-day maximum limit** on all intraday data lookbacks.
- If you request `LOOKBACK_DAYS = 365` for an NSE ticker, the `fetch_indian_data()` function will automatically clamp it to 60 days to prevent the request from crashing.
- **Solution for 1+ Year Testing:** To backtest intraday strategies over multiple years in the Indian market, you must integrate a premium data broker (e.g., Zerodha Kite Connect, Upstox, Dhan, or Truedata) into the `fetch_indian_data()` function.

### 2. Timeframe Flexibility & Strategy Logic
The `fetch_indian_data()` function is currently hardcoded to pull `5m` (5-minute) bars. 

If you want to switch to a different timeframe (e.g., `15m`), you must manually edit the interval parameter in `backtesting.py`:
```python
# Inside fetch_indian_data()
df: pd.DataFrame = ticker.history(period=period, interval="15m")
```

**⚠️ CRITICAL WARNING FOR INTRADAY STRATEGIES:**
Strategies like the `india_orb_vwap` (15-Minute Opening Range Breakout) have their logic deeply hardcoded to the timeframe they were built for. 
- The ORB strategy expects exactly **three 5-minute candles** to form the 09:15–09:30 opening range. 
- If you change the data interval to `15m`, the strategy's time-window logic will break because 09:15–09:30 will only be a single candle. 
- You must rewrite the stateful time-window logic inside the strategy file itself if you alter the underlying data timeframe.
