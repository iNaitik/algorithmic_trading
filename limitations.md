# ⚠️ Framework Limitations & Data Feed Guidelines

> **Essential Reference for Quantitative Researchers & Algorithmic Traders**  
> Operational constraints, Yahoo Finance API boundaries, lookback thresholds, and production considerations across the backtesting and paper trading framework.

---

## 📌 At a Glance: Timeframe vs Lookback Limits

The framework utilizes `yfinance` to fetch live and historical OHLCV candles for Indian (NSE) equities without requiring paid broker API keys. Yahoo Finance enforces hard server-side lookback boundaries depending on the candle interval:

| Candle Interval | Yahoo Finance Hard Limit | Auto-Clamped Lookback | Ideal Strategy Horizon | Supported Engine |
| :---: | :---: | :---: | :---: | :---: |
| **`1m`** (1-minute) | 7 Calendar Days | `min(LOOKBACK, 7d)` | Scalping, Failed-Gap Fade, Micro ORB | Backtester & Matrix |
| **`2m`** (2-minute) | 60 Days (often 7d stable) | `min(LOOKBACK, 7d)` | VWAP Pullback, Momentum Scalp | Backtester & Matrix |
| **`5m`** (5-minute) | 60 Calendar Days | `min(LOOKBACK, 60d)` | Standard Intraday ORB, VWAP Reversion | Backtester, Bot & Matrix |
| **`15m`** (15-minute) | 60 Calendar Days | `min(LOOKBACK, 60d)` | Swing Intraday, Multi-bar Breakouts | Backtester, Bot & Matrix |
| **`30m` / `60m`** | 730 Calendar Days | `min(LOOKBACK, 60d)` | Session Trend Following | Backtester & Bot |
| **`1d`** (Daily) | Multi-Decade (Full History) | Unrestricted (e.g. 1-10 Years) | Positional & Multi-Month Systems | Backtester |

> [!NOTE]
> The engine automatically detects intervals and clamps lookback periods exceeding these API ceilings. You will never encounter an unhandled crash from requesting 365 days on a 1-minute chart; the engine issues an informative warning and loads the maximum available window.

---

## ⚡ Free `yfinance` Feed vs. Broker APIs

Understanding the architectural differences between the built-in free feed and dedicated production market feeds:

```
┌────────────────────────────────────────────────────────────────────────┐
│  DATA FEED ARCHITECTURE COMPARISON                                     │
├────────────────────────────────┬───────────────────────────────────────┤
│  Free yfinance Feed (Built-In) │  Institutional / Broker API (Zerodha) │
├────────────────────────────────┼───────────────────────────────────────┤
│  • Cost: ₹0 (Zero subscription) │  • Cost: ₹2,000 – ₹4,000 / month      │
│  • Setup: Instant, no API keys │  • Setup: Requires KYC, Auth token    │
│  • Intraday depth: Max 60 days │  • Intraday depth: 5+ years historical│
│  • Latency: ~1 to 5 seconds    │  • Latency: Millisecond WebSocket feed │
│  • Rate Limits: IP-level caps  │  • Rate Limits: High transactional TPS│
│  • Ideal for: Backtesting, R&D,│  • Ideal for: Real capital deployment,│
│    paper bot validation        │    tick-level HFT, multi-year research│
└────────────────────────────────┴───────────────────────────────────────┘
```

### Upgrading to Multi-Year Intraday Research
If your quant strategy requires backtesting across 1 to 5+ full calendar years of 1-minute or 5-minute ticks, integrate a dedicated historical market data adapter into `fetch_indian_data()` in `backtesting.py`:
- **Zerodha Kite Connect Historical API** (`kiteconnect`)
- **Upstox Historical Data API v2**
- **DhanHQ Historical Data API**
- **TrueData / GlobalDataFeeds NSE Real-Time Feed**

---

## ⏱️ Timeframe Flexibility & Timestamp Awareness

Early intraday models historically counted fixed bars (e.g., assuming candle #3 was always 09:30 AM). Modern strategies in this repository use **clock-aware timestamp logic**:

```python
# ✅ MODERN APPROACH (Timestamp-Gated):
is_opening_range = (bar_time >= time(9, 15)) and (bar_time < time(9, 30))
is_entry_window  = (bar_time >= time(9, 30)) and (bar_time <= time(11, 00))
is_eod_squareoff = (bar_time >= time(15, 15))
```

### Why This Matters:
1. **Dynamic Interval Support:** Strategies like `NSE Intraday ORB Breakout`, `NSE Midday VWAP Pullback`, and `NSE Failed-Gap Fade` run seamlessly across `1m`, `2m`, `5m`, or `15m` charts.
2. **True Session Anchoring:** The Opening Range accurately spans from `09:15` to `09:30` regardless of whether that window contains fifteen 1-minute bars, three 5-minute bars, or one 15-minute bar.
3. **Mandatory EOD Square-Off:** Positions are guaranteed to exit at or before `15:15 IST` to eliminate overnight gap risk.

---

## 🏢 Ticker Changes, Demergers & Delisting Notices

The Indian stock market frequently undergoes corporate restructuring, index rebalancing, and corporate actions:
- **Demergers & Splits:** For example, demerged corporate entities or newly created share classes may temporarily return HTTP `404 Not Found` or `possibly delisted` errors on Yahoo Finance.
- **Symbol Fallbacks:** If a ticker encounters Yahoo Finance feed interruptions, simply switch to high-volume liquid peers in the same sector:
  - **Banking:** `ICICIBANK.NS`, `HDFCBANK.NS`, `SBIN.NS`, `KOTAKBANK.NS`
  - **IT / Tech:** `TCS.NS`, `INFY.NS`, `WIPRO.NS`
  - **Energy & Conglomerate:** `RELIANCE.NS`, `NTPC.NS`
  - **Auto:** `MARUTI.NS`, `M&M.NS`

---

## 🛡️ Best Practices for Production Safety

> [!IMPORTANT]
> 1. **Always Account for Slippage:** Never assume execution at the exact candle close. The engine models 5 bps (`0.05%`) execution penalty per leg.
> 2. **Check Statutory Drag:** Even when gross returns are positive, high-turnover scalping strategies on small gains can be eroded by STT and exchange fees. Always evaluate **Net In-Hand P&L**.
> 3. **Run Paper Trading First:** Validate order routing, network reconnects, and state persistence via `bot_india.py` during live market hours before committing real funds.
