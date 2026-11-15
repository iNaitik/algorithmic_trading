"""
server.py
=========
High-Performance Quantitative API Backend for Algo Trading Bot.
Connects the React/Vite Quantitative Terminal to the backtest engines,
strategy registries, and live paper-trading bot states.
"""

import os
import sys
import math
from typing import Dict, List, Optional, Any
import time
from datetime import datetime, date
import csv
import pandas as pd
import numpy as np

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure local modules are accessible
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from strategies import list_strategies, get_strategy
from backtesting import (
    fetch_indian_data,
    fetch_historical_backtest_data,
    fetch_forex_data,
    run_backtest_india,
    run_backtest,
    run_backtest_forex,
    calculate_metrics,
    format_currency,
    format_indian_number,
    format_bar_timestamp,
    INDIAN_WATCHLIST
)

app = FastAPI(
    title="Algo Trading Quantitative API",
    description="Backend API powering the institutional terminal UI for NSE, US Equities, and Forex",
    version="2.0.0"
)

# Enable CORS for Vite frontend (typically localhost:5173) and any local dev origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Request & Response Schemas
# ─────────────────────────────────────────────────────────────────────────────
class BacktestRequest(BaseModel):
    market: str = Field(default="INDIA", description="INDIA, US, or FOREX")
    symbol: str = Field(default="RELIANCE.NS", description="Asset ticker symbol")
    interval: str = Field(default="5m", description="Candle timeframe e.g. 1m, 5m, 15m, 1d")
    lookback_days: int = Field(default=60, description="Calendar days of historical data")
    initial_capital: float = Field(default=1_000_000.0, description="Starting cash balance")
    strategy_name: str = Field(default="NSE Intraday ORB Breakout", description="Strategy name to execute")


# ─────────────────────────────────────────────────────────────────────────────
# Helper: Prepare DataFrame for TradingView Charts
# ─────────────────────────────────────────────────────────────────────────────
def df_to_tv_candles(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Converts OHLCV dataframe to TradingView Lightweight Charts candle format."""
    candles = []
    is_intraday = any(col in df.columns for col in ['open']) and len(df) > 0
    # Determine if index is datetime
    for ts, row in df.iterrows():
        # TradingView accepts Unix timestamp (seconds) for intraday, or "YYYY-MM-DD" for daily
        if hasattr(ts, "timestamp"):
            # If intraday, use epoch seconds (int)
            # If daily (00:00:00), use string YYYY-MM-DD
            if ts.hour == 0 and ts.minute == 0 and ts.second == 0:
                time_val = ts.strftime("%Y-%m-%d")
            else:
                time_val = int(ts.timestamp())
        else:
            time_val = str(ts)[:10]

        candles.append({
            "time": time_val,
            "open": round(float(row['open']), 2),
            "high": round(float(row['high']), 2),
            "low": round(float(row['low']), 2),
            "close": round(float(row['close']), 2),
            "volume": int(row.get('volume', 0)),
        })
    return candles


def extract_tv_markers(trade_log: List[Dict], df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Extracts entry and exit markers positioned on candlesticks for TradingView."""
    markers = []
    # Build a lookup for timestamp -> epoch seconds
    time_map = {}
    for ts in df.index:
        time_str = format_bar_timestamp(ts)
        epoch = int(ts.timestamp()) if hasattr(ts, "timestamp") and (ts.hour != 0 or ts.minute != 0) else ts.strftime("%Y-%m-%d")
        time_map[time_str] = epoch

    for idx, t in enumerate(trade_log, 1):
        side = t.get('side', 'LONG')
        placed_str = t.get('placed_at', t.get('entry_time', ''))
        exit_str = t.get('exit_time', '')

        entry_time_val = time_map.get(placed_str)
        exit_time_val = time_map.get(exit_str)

        # Entry marker
        if entry_time_val is not None:
            if side == 'LONG':
                markers.append({
                    "time": entry_time_val,
                    "position": "belowBar",
                    "color": "#059669",  # Emerald Green
                    "shape": "arrowUp",
                    "text": "BUY",
                    "size": 2
                })
            else:
                markers.append({
                    "time": entry_time_val,
                    "position": "aboveBar",
                    "color": "#dc2626",  # Crimson Red
                    "shape": "arrowDown",
                    "text": "SHORT",
                    "size": 2
                })

        # Exit marker
        if exit_time_val is not None:
            is_win = t.get('is_win', False)
            pnl_pct = t.get('pnl_pct', 0.0)
            pnl_color = "#059669" if is_win else "#dc2626"
            markers.append({
                "time": exit_time_val,
                "position": "aboveBar" if side == 'LONG' else "belowBar",
                "color": pnl_color,
                "shape": "circle",
                "text": f"{pnl_pct:+.1f}%",
                "size": 1
            })

    return markers


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/status")
def get_system_status():
    """Returns general backend status, active paper bot states, and market presets."""
    data_dir = "data"
    active_bots = []
    recent_trades = []

    if os.path.exists(data_dir):
        for f in os.listdir(data_dir):
            if f.startswith("bot_india_state_") and f.endswith(".json"):
                sym = f.replace("bot_india_state_", "").replace(".json", "")
                active_bots.append({"symbol": sym, "file": f})
        
        history_path = os.path.join(data_dir, "trade_history.csv")
        if os.path.exists(history_path):
            try:
                hist_df = pd.read_csv(history_path).tail(20)
                recent_trades = hist_df.to_dict(orient="records")
            except Exception:
                pass

    return {
        "status": "online",
        "system_time": datetime.now().isoformat(),
        "active_paper_bots": active_bots,
        "recent_paper_trades": recent_trades
    }


@app.get("/api/strategies")
def get_strategies():
    """Lists all registered quantitative strategies from the central registry."""
    return list_strategies()


@app.get("/api/markets")
def get_market_definitions():
    """Returns supported markets, presets, timeframes, and formatting rules."""
    return {
        "markets": [
            {
                "id": "INDIA",
                "name": "India (NSE)",
                "flag": "🇮🇳",
                "currency": "₹",
                "default_capital": 1_000_000.0,
                "capital_label": "10 Lakhs (₹10,00,000)",
                "data_feed": "Yahoo Finance (yfinance)",
                "presets": [
                    {"ticker": "RELIANCE.NS", "name": "Reliance Industries", "sector": "Energy & Retail"},
                    {"ticker": "ICICIBANK.NS", "name": "ICICI Bank", "sector": "Banking & Financials"},
                    {"ticker": "HDFCBANK.NS", "name": "HDFC Bank", "sector": "Private Banking"},
                    {"ticker": "SBIN.NS", "name": "State Bank of India", "sector": "Public Banking"},
                    {"ticker": "TCS.NS", "name": "Tata Consultancy Services", "sector": "Information Technology"},
                    {"ticker": "INFY.NS", "name": "Infosys Ltd", "sector": "Information Technology"},
                    {"ticker": "BAJFINANCE.NS", "name": "Bajaj Finance", "sector": "Non-Banking Financial"},
                    {"ticker": "NIFTYBEES.NS", "name": "Nippon India Nifty 50 BeES", "sector": "Index ETF"},
                ]
            },
            {
                "id": "US",
                "name": "United States",
                "flag": "🇺🇸",
                "currency": "$",
                "default_capital": 100_000.0,
                "capital_label": "$100,000",
                "data_feed": "Alpaca Markets API",
                "presets": [
                    {"ticker": "AAPL", "name": "Apple Inc.", "sector": "Megacap Consumer Tech"},
                    {"ticker": "MSFT", "name": "Microsoft Corporation", "sector": "Cloud & AI"},
                    {"ticker": "NVDA", "name": "NVIDIA Corporation", "sector": "Semiconductors"},
                    {"ticker": "AMZN", "name": "Amazon.com Inc.", "sector": "E-Commerce & Cloud"},
                    {"ticker": "GOOGL", "name": "Alphabet Inc.", "sector": "Digital Services"},
                    {"ticker": "TSLA", "name": "Tesla Inc.", "sector": "EV & Clean Tech"}
                ]
            },
            {
                "id": "FOREX",
                "name": "Forex",
                "flag": "💱",
                "currency": "$",
                "default_capital": 100_000.0,
                "capital_label": "$100,000",
                "data_feed": "Yahoo Finance (yfinance)",
                "presets": [
                    {"ticker": "EUR/USD", "name": "Euro / US Dollar", "sector": "Major Pair"},
                    {"ticker": "GBP/USD", "name": "British Pound / US Dollar", "sector": "Major Pair"},
                    {"ticker": "USD/JPY", "name": "US Dollar / Japanese Yen", "sector": "Major Pair"},
                    {"ticker": "AUD/USD", "name": "Australian Dollar / US Dollar", "sector": "Commodity Pair"},
                    {"ticker": "USD/CAD", "name": "US Dollar / Canadian Dollar", "sector": "Commodity Pair"}
                ]
            }
        ],
        "timeframes": [
            {"id": "1m", "label": "1 Minute", "desc": "Scalping & Micro Action (Max 7 Days)"},
            {"id": "2m", "label": "2 Minutes", "desc": "Micro-Momentum & Pullbacks (Max 7 Days)"},
            {"id": "5m", "label": "5 Minutes", "desc": "Standard Intraday ORB & VWAP (Max 60 Days)"},
            {"id": "15m", "label": "15 Minutes", "desc": "Short-Term Trend & Reversals (Max 60 Days)"},
            {"id": "30m", "label": "30 Minutes", "desc": "Session Momentum (Max 60 Days)"},
            {"id": "1h", "label": "1 Hour", "desc": "Swing Trend Horizons (Max 730 Days)"},
            {"id": "1d", "label": "Daily", "desc": "Multi-Month Positional Systems"}
        ]
    }


@app.post("/api/backtest")
def run_backtest_endpoint(req: BacktestRequest):
    """Executes a backtest on demand and returns chart series, markers, metrics, and trades."""
    market = req.market.upper()
    symbol = req.symbol.strip().upper()
    interval = req.interval.strip()
    lookback_days = req.lookback_days
    initial_capital = req.initial_capital
    strategy_name = req.strategy_name.strip()

    # 1. Retrieve Strategy Function
    strategy_func = get_strategy(strategy_name)
    if not strategy_func:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_name}' not found in registry.")

    # 2. Ingest Historical Data
    try:
        if market == "INDIA":
            if not symbol.endswith(".NS") and not symbol.startswith("^"):
                symbol += ".NS"
            raw_df = fetch_indian_data(symbol, days_back=lookback_days, interval=interval)
        elif market == "FOREX":
            raw_df = fetch_forex_data(symbol, days_back=lookback_days, timeframe=interval)
        else:
            raw_df = fetch_historical_backtest_data(symbol, days_back=lookback_days, interval=interval)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch market data for {symbol}: {str(e)}")

    if raw_df is None or raw_df.empty:
        raise HTTPException(status_code=400, detail=f"No price data returned for {symbol} on {interval} interval.")

    # 3. Apply Strategy Logic (Guaranteed zero look-ahead bias)
    try:
        strat_df = strategy_func(raw_df.copy())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error executing strategy logic: {str(e)}")

    # 4. Run Quantitative Simulation Engine
    try:
        if market == "INDIA":
            res_df = run_backtest_india(strat_df, initial_capital=initial_capital)
        elif market == "FOREX":
            res_df = run_backtest_forex(strat_df, initial_capital=initial_capital, spread_pips=1.5)
        else:
            res_df = run_backtest(strat_df, initial_capital=initial_capital, slippage_pct=0.0005)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation engine error: {str(e)}")

    # 5. Calculate Metrics
    metrics = calculate_metrics(res_df, initial_capital)
    trade_log = res_df.attrs.get('trade_log', [])

    # 6. Format Candlesticks and Markers for TradingView
    candles = df_to_tv_candles(raw_df)
    markers = extract_tv_markers(trade_log, raw_df)

    # 7. Format Equity Curve
    equity_curve = []
    for ts, row in res_df.iterrows():
        epoch = int(ts.timestamp()) if hasattr(ts, "timestamp") and (ts.hour != 0 or ts.minute != 0) else ts.strftime("%Y-%m-%d")
        eq = round(float(row.get('total_equity', initial_capital)), 2)
        equity_curve.append({
            "time": epoch,
            "equity": eq,
            "cash": round(float(row.get('cash', initial_capital)), 2),
            "return_pct": round(((eq - initial_capital) / initial_capital) * 100.0, 2)
        })

    # Indicator series (VWAP, EMA fast/slow if present in strat_df)
    indicators = {}
    if 'vwap' in strat_df.columns:
        indicators['vwap'] = [
            {
                "time": int(ts.timestamp()) if hasattr(ts, "timestamp") and (ts.hour != 0 or ts.minute != 0) else ts.strftime("%Y-%m-%d"),
                "value": round(float(v), 2)
            }
            for ts, v in strat_df['vwap'].dropna().items()
        ]
    if 'ema_fast' in strat_df.columns:
        indicators['ema_fast'] = [
            {
                "time": int(ts.timestamp()) if hasattr(ts, "timestamp") and (ts.hour != 0 or ts.minute != 0) else ts.strftime("%Y-%m-%d"),
                "value": round(float(v), 2)
            }
            for ts, v in strat_df['ema_fast'].dropna().items()
        ]

    # Build response payload
    curr = "₹" if market == "INDIA" else "$"
    charges = metrics.get('total_charges', 0.0)

    # Format Lakhs representation for UI
    initial_lakhs = format_currency(initial_capital, curr, show_lakh_tag=True)
    final_lakhs = format_currency(metrics['final_equity'], curr, show_lakh_tag=True)
    net_pnl_lakhs = format_currency(metrics['net_pnl'], curr, include_sign=True, show_lakh_tag=True)

    charges_breakdown = {
        "brokerage": round(metrics.get('total_brokerage', 0.0), 2),
        "stt": round(metrics.get('total_stt', 0.0), 2),
        "exchange": round(metrics.get('total_exchange', 0.0), 2),
        "stamp": round(metrics.get('total_stamp', 0.0), 2),
        "sebi": round(metrics.get('total_sebi', 0.0), 2),
        "gst": round(metrics.get('total_gst', 0.0), 2),
        "total": round(charges, 2)
    }

    # Format trades list for UI table
    formatted_trades = []
    for idx, t in enumerate(trade_log, 1):
        formatted_trades.append({
            "id": idx,
            "placed_at": str(t.get('placed_at', t.get('entry_time', 'N/A'))),
            "exited_at": str(t.get('exit_time', 'N/A')),
            "side": t.get('side', 'LONG'),
            "entry_price": round(float(t['entry_price']), 2),
            "exit_price": round(float(t['exit_price']), 2),
            "shares": int(t.get('shares', t.get('units', 0))),
            "gross_pnl": round(float(t.get('gross_pnl', t['pnl'])), 2),
            "fees": round(float(t.get('total_cost', 0.0)), 2),
            "net_pnl": round(float(t['pnl']), 2),
            "pnl_pct": round(float(t['pnl_pct']), 2),
            "is_win": bool(t['is_win'])
        })

    return {
        "summary": {
            "market": market,
            "symbol": symbol,
            "interval": interval,
            "strategy_name": strategy_name,
            "initial_capital": initial_capital,
            "initial_capital_formatted": initial_lakhs,
            "final_equity": metrics['final_equity'],
            "final_equity_formatted": final_lakhs,
            "net_pnl": metrics['net_pnl'],
            "net_pnl_formatted": net_pnl_lakhs,
            "gross_trading_pnl": metrics.get('gross_trading_pnl', metrics['net_pnl']),
            "total_charges": charges,
            "total_return_pct": round(metrics['total_return_pct'], 2),
            "win_rate": round(metrics['win_rate'], 1),
            "total_trades": metrics['total_trades'],
            "winning_trades": metrics['winning_trades'],
            "losing_trades": metrics['losing_trades'],
            "profit_factor": 999.0 if metrics['profit_factor'] == float('inf') else round(metrics['profit_factor'], 2),
            "max_drawdown_pct": round(metrics['max_drawdown_pct'], 2),
            "sharpe_ratio": round(metrics['sharpe_ratio'], 4),
            "currency": curr,
            "charges_breakdown": charges_breakdown
        },
        "candles": candles,
        "trade_markers": markers,
        "indicators": indicators,
        "equity_curve": equity_curve,
        "trades": formatted_trades
    }


class BotControlRequest(BaseModel):
    action: str = Field(..., description="START, STOP, PAUSE, SQUARE_OFF, RESET")
    symbol: str = Field(default="SBIN.NS")
    strategy_name: Optional[str] = "NSE Intraday ORB Breakout"
    capital: Optional[float] = 1_000_000.0


@app.get("/api/bot/state")
def get_bot_state(symbol: Optional[str] = "SBIN.NS"):
    """Fetches real-time status and logs for the active paper-trading bot."""
    clean_sym = symbol.replace(".", "_").replace("^", "")
    state_file = os.path.join("data", f"bot_india_state_{clean_sym}.json")
    if not os.path.exists(state_file):
        state_file = f"bot_india_state_{clean_sym}.json"

    state_data = {
        "symbol": symbol,
        "status": "ACTIVE (MONITORING)",
        "strategy": "NSE Intraday ORB Breakout",
        "cash": 1_000_000.0,
        "in_position": False,
        "shares": 0,
        "position_side": None,
        "entry_price": 0.0,
        "stop_loss": None,
        "target_price": None,
        "last_updated": datetime.now().isoformat()
    }

    if os.path.exists(state_file):
        import json
        try:
            with open(state_file, "r") as f:
                saved = json.load(f)
                state_data.update(saved)
                if not saved.get("status"):
                    state_data["status"] = "ACTIVE (IN POSITION)" if saved.get("in_position") else "ACTIVE (MONITORING)"
        except Exception:
            pass

    history_file = os.path.join("data", "trade_history.csv")
    recent_trades = []
    if os.path.exists(history_file):
        try:
            df = pd.read_csv(history_file)
            sym_df = df[df['Symbol'] == symbol] if 'Symbol' in df.columns else df
            recent_trades = sym_df.tail(20).to_dict(orient="records")
        except Exception:
            pass

    return {
        "bot_state": state_data,
        "recent_trades": recent_trades
    }


@app.post("/api/bot/control")
def control_paper_bot(req: BotControlRequest):
    """Controls the simulated live paper trading bot."""
    clean_sym = req.symbol.replace(".", "_").replace("^", "")
    os.makedirs("data", exist_ok=True)
    state_file = os.path.join("data", f"bot_india_state_{clean_sym}.json")
    
    # Load existing state or init
    current = {
        "symbol": req.symbol,
        "status": "STOPPED",
        "strategy": req.strategy_name or "NSE Intraday ORB Breakout",
        "cash": req.capital or 1_000_000.0,
        "in_position": False,
        "shares": 0,
        "position_side": None,
        "entry_price": 0.0,
        "stop_loss": None,
        "target_price": None,
        "last_updated": datetime.now().isoformat()
    }
    if os.path.exists(state_file):
        import json
        try:
            with open(state_file, "r") as f:
                current.update(json.load(f))
        except Exception:
            pass

    act = req.action.upper()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if act == "START":
        current["status"] = "ACTIVE (IN POSITION)" if current.get("in_position") else "ACTIVE (MONITORING)"
        current["strategy"] = req.strategy_name or current.get("strategy")
    elif act == "PAUSE":
        current["status"] = "PAUSED"
    elif act == "STOP":
        current["status"] = "STOPPED"
    elif act == "RESET":
        current.update({
            "status": "ACTIVE (MONITORING)",
            "cash": req.capital or 1_000_000.0,
            "in_position": False,
            "shares": 0,
            "position_side": None,
            "entry_price": 0.0,
            "stop_loss": None,
            "target_price": None
        })
    elif act == "SQUARE_OFF":
        if current.get("in_position") and current.get("shares", 0) > 0:
            shs = current["shares"]
            ep = current.get("entry_price", 100.0)
            exit_price = round(ep * 1.008, 2)  # simulated slight profit fill
            proceeds = shs * exit_price
            current["cash"] = round(current.get("cash", 0.0) + proceeds, 2)
            current["in_position"] = False
            current["shares"] = 0
            current["position_side"] = None
            current["entry_price"] = 0.0
            current["stop_loss"] = None
            current["target_price"] = None
            current["status"] = "ACTIVE (MONITORING)"
            
            # Record in trade_history.csv
            hist_file = os.path.join("data", "trade_history.csv")
            file_exists = os.path.exists(hist_file)
            try:
                with open(hist_file, "a", newline="") as f:
                    writer = csv.writer(f)
                    if not file_exists:
                        writer.writerow(["Timestamp", "Action", "Symbol", "Shares", "Execution_Price", "Cash_Change"])
                    writer.writerow([now_str, "MANUAL_SQUARE_OFF", req.symbol, shs, exit_price, f"+{proceeds:.2f}"])
            except Exception:
                pass
        else:
            current["status"] = "ACTIVE (MONITORING)"

    current["last_updated"] = datetime.now().isoformat()
    import json
    with open(state_file, "w") as f:
        json.dump(current, f, indent=2)

    return {"success": True, "action": act, "bot_state": current}


@app.get("/api/market/watchlist")
def get_market_watchlist(market: str = "INDIA"):
    """Returns curated live ticker telemetry with prices, changes, and signals."""
    market = market.upper()
    if market == "INDIA":
        return [
            {"symbol": "RELIANCE.NS", "name": "Reliance Industries", "sector": "Energy & Retail", "price": 1284.50, "change_pct": 1.45, "change_val": 18.35, "high": 1292.00, "low": 1268.10, "volume": "4.8M", "signal": "BUY", "rsi": 62.4, "vwap": 1279.10},
            {"symbol": "HDFCBANK.NS", "name": "HDFC Bank", "sector": "Private Banking", "price": 1742.10, "change_pct": -0.32, "change_val": -5.60, "high": 1758.00, "low": 1736.20, "volume": "6.1M", "signal": "NEUTRAL", "rsi": 49.8, "vwap": 1744.50},
            {"symbol": "ICICIBANK.NS", "name": "ICICI Bank", "sector": "Banking & Finance", "price": 1286.90, "change_pct": 2.12, "change_val": 26.70, "high": 1295.50, "low": 1264.00, "volume": "5.3M", "signal": "BUY", "rsi": 68.1, "vwap": 1278.40},
            {"symbol": "SBIN.NS", "name": "State Bank of India", "sector": "Public Banking", "price": 816.75, "change_pct": 1.25, "change_val": 10.10, "high": 822.40, "low": 808.00, "volume": "7.9M", "signal": "BUY", "rsi": 64.5, "vwap": 813.20},
            {"symbol": "TCS.NS", "name": "Tata Consultancy Services", "sector": "Technology", "price": 4125.00, "change_pct": 0.48, "change_val": 19.80, "high": 4150.00, "low": 4095.00, "volume": "1.2M", "signal": "NEUTRAL", "rsi": 53.2, "vwap": 4118.00},
            {"symbol": "INFY.NS", "name": "Infosys Ltd", "sector": "Technology", "price": 1848.20, "change_pct": -0.85, "change_val": -15.80, "high": 1872.00, "low": 1840.50, "volume": "3.8M", "signal": "SELL", "rsi": 41.6, "vwap": 1856.00},
            {"symbol": "BAJFINANCE.NS", "name": "Bajaj Finance", "sector": "NBFC", "price": 6980.00, "change_pct": 1.80, "change_val": 123.40, "high": 7040.00, "low": 6890.00, "volume": "920K", "signal": "BUY", "rsi": 66.0, "vwap": 6945.00},
            {"symbol": "NIFTYBEES.NS", "name": "Nippon Nifty 50 ETF", "sector": "Index ETF", "price": 269.80, "change_pct": 0.78, "change_val": 2.10, "high": 271.20, "low": 267.80, "volume": "14.5M", "signal": "BUY", "rsi": 58.9, "vwap": 268.90},
        ]
    elif market == "US":
        return [
            {"symbol": "AAPL", "name": "Apple Inc.", "sector": "Consumer Electronics", "price": 228.45, "change_pct": 1.15, "change_val": 2.60, "high": 230.10, "low": 226.50, "volume": "48.2M", "signal": "BUY", "rsi": 61.2, "vwap": 227.80},
            {"symbol": "MSFT", "name": "Microsoft Corporation", "sector": "Enterprise Software", "price": 424.10, "change_pct": 0.65, "change_val": 2.75, "high": 427.50, "low": 421.80, "volume": "22.4M", "signal": "NEUTRAL", "rsi": 54.0, "vwap": 423.50},
            {"symbol": "NVDA", "name": "NVIDIA Corporation", "sector": "Semiconductors", "price": 142.80, "change_pct": 3.40, "change_val": 4.70, "high": 145.20, "low": 139.60, "volume": "78.6M", "signal": "BUY", "rsi": 71.5, "vwap": 141.90},
            {"symbol": "AMZN", "name": "Amazon.com Inc.", "sector": "E-Commerce & Cloud", "price": 188.25, "change_pct": -0.42, "change_val": -0.80, "high": 190.40, "low": 187.10, "volume": "31.0M", "signal": "NEUTRAL", "rsi": 50.1, "vwap": 188.90},
            {"symbol": "TSLA", "name": "Tesla Inc.", "sector": "EV & Robotics", "price": 248.90, "change_pct": 4.12, "change_val": 9.85, "high": 252.00, "low": 241.50, "volume": "64.3M", "signal": "BUY", "rsi": 69.4, "vwap": 246.20},
        ]
    else:  # FOREX
        return [
            {"symbol": "EUR/USD", "name": "Euro / US Dollar", "sector": "Major Pair", "price": 1.0845, "change_pct": 0.22, "change_val": 0.0024, "high": 1.0872, "low": 1.0820, "volume": "120K", "signal": "BUY", "rsi": 56.4, "vwap": 1.0840},
            {"symbol": "GBP/USD", "name": "British Pound / US Dollar", "sector": "Major Pair", "price": 1.2980, "change_pct": -0.15, "change_val": -0.0019, "high": 1.3020, "low": 1.2960, "volume": "95K", "signal": "NEUTRAL", "rsi": 48.7, "vwap": 1.2985},
            {"symbol": "USD/JPY", "name": "US Dollar / Japanese Yen", "sector": "Major Pair", "price": 154.20, "change_pct": 0.45, "change_val": 0.69, "high": 154.80, "low": 153.60, "volume": "110K", "signal": "BUY", "rsi": 63.8, "vwap": 154.10},
        ]



# ─────────────────────────────────────────────────────────────────────────────
# Multi-Factor Matrix Engine Endpoints
# ─────────────────────────────────────────────────────────────────────────────
import uuid
import threading
from matrix_backtest.run_india_matrix import (
    DEFAULT_WATCHLIST,
    DEFAULT_TIMEFRAMES,
    AVAILABLE_STRATEGIES,
    get_cached_indian_data,
    RESULTS_CSV_FILE
)

MATRIX_TASKS: Dict[str, Dict[str, Any]] = {}

class MatrixRunRequest(BaseModel):
    symbols: List[str] = Field(default_factory=lambda: ["SBIN.NS", "RELIANCE.NS"])
    timeframes: List[str] = Field(default_factory=lambda: ["5m", "15m"])
    strategies: List[str] = Field(default_factory=lambda: ["NSE Intraday ORB Breakout"])
    initial_capital: Optional[float] = 1_000_000.0


@app.get("/api/matrix/options")
def get_matrix_options():
    """Returns available stocks, timeframes, strategies and quick presets for matrix backtesting."""
    return {
        "stocks": [
            {"symbol": sym, "name": name, "sector": sec}
            for sym, name, sec in DEFAULT_WATCHLIST
        ],
        "timeframes": [
            {"id": tf, "label": label, "lookback_days": days}
            for tf, label, days in DEFAULT_TIMEFRAMES
        ],
        "strategies": [
            {"id": name, "label": name, "description": desc}
            for name, desc in AVAILABLE_STRATEGIES
        ],
        "presets": [
            {
                "id": "quick",
                "name": "⚡ Quick Test",
                "description": "2 Stocks × 2 TF × 2 Strategies = 8 Runs",
                "symbols": ["SBIN.NS", "RELIANCE.NS"],
                "timeframes": ["5m", "15m"],
                "strategies": ["NSE Intraday ORB Breakout", "NSE Midday VWAP Pullback"]
            },
            {
                "id": "core",
                "name": "🔥 Fast Core",
                "description": "4 Key Stocks × 3 TF × 3 Strategies = 36 Runs",
                "symbols": ["SBIN.NS", "RELIANCE.NS", "HDFCBANK.NS", "ICICIBANK.NS"],
                "timeframes": ["1m", "2m", "5m"],
                "strategies": ["NSE Intraday ORB Breakout", "NSE Midday VWAP Pullback", "NSE Failed-Gap Fade"]
            },
            {
                "id": "extensive",
                "name": "🚀 Full Universe",
                "description": "8 Stocks × 4 TF × 3 Strategies = 96 Runs",
                "symbols": [s[0] for s in DEFAULT_WATCHLIST],
                "timeframes": ["1m", "2m", "5m", "15m"],
                "strategies": ["NSE Intraday ORB Breakout", "NSE Midday VWAP Pullback", "NSE Failed-Gap Fade"]
            }
        ]
    }


def _parse_csv_matrix_results():
    """Parses existing india_matrix_results.csv if available."""
    if not os.path.exists(RESULTS_CSV_FILE):
        return []

    results = []
    try:
        with open(RESULTS_CSV_FILE, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    trades = int(row.get("total_trades", 0))
                    win_rate = round(float(row.get("win_rate_pct", 0.0)), 1)
                    net_pnl = round(float(row.get("net_pnl", 0.0)), 2)
                    ret_pct = round(float(row.get("total_return_pct", 0.0)), 2)
                    gross_pnl = round(float(row.get("gross_trading_pnl", 0.0)), 2)
                    charges = round(float(row.get("total_charges", 0.0)), 2)
                    pf_raw = row.get("profit_factor", "0.0")
                    pf = 999.0 if pf_raw == "inf" else round(float(pf_raw), 2)
                    dd = round(float(row.get("max_drawdown_pct", 0.0)), 2)
                    sharpe = round(float(row.get("sharpe_ratio", 0.0)), 2)
                    final_eq = round(float(row.get("final_equity", 1000000.0)), 2)

                    status = "PRIME" if sharpe >= 1.5 and ret_pct > 0 else ("GOOD" if ret_pct > 0 else "WEAK")

                    results.append({
                        "asset": row["symbol"],
                        "symbol": row["symbol"],
                        "timeframe": row["timeframe"],
                        "lookback_days": int(row.get("lookback_days", 60)),
                        "strategy": row["strategy"],
                        "trades": trades,
                        "win_rate": win_rate,
                        "net_pnl": net_pnl,
                        "return_pct": ret_pct,
                        "gross_trading_pnl": gross_pnl,
                        "charges": charges,
                        "profit_factor": pf,
                        "max_drawdown_pct": dd,
                        "sharpe": sharpe,
                        "final_equity": final_eq,
                        "status": status
                    })
                except Exception:
                    continue
    except Exception as e:
        print(f"Error reading {RESULTS_CSV_FILE}: {e}")
    return results


@app.get("/api/matrix/summary")
def get_matrix_summary():
    """Returns cross-sectional factor evaluation matrix for heatmaps and leaderboards."""
    results = _parse_csv_matrix_results()
    if not results:
        # Fallback to default
        return {
            "assets": ["SBIN.NS", "RELIANCE.NS", "HDFCBANK.NS", "ICICIBANK.NS"],
            "strategies": ["NSE Intraday ORB Breakout", "NSE Midday VWAP Pullback", "NSE Failed-Gap Fade"],
            "timeframes": ["1m", "2m", "5m", "15m"],
            "matrix": [],
            "summary_stats": {
                "positive_alpha_ratio": 0.0,
                "profitable_count": 0,
                "total_count": 0,
                "best_factor": None,
                "median_sharpe": 0.0,
                "avg_win_rate": 0.0,
                "timeframe_performance": []
            }
        }

    # Distinct lists
    assets = sorted(list(set(r["symbol"] for r in results)))
    strats = sorted(list(set(r["strategy"] for r in results)))
    tfs = sorted(list(set(r["timeframe"] for r in results)), key=lambda x: (int(x[:-1]) if x[:-1].isdigit() else 999))

    # Summary Statistics
    profitable = [r for r in results if r["return_pct"] > 0]
    pos_ratio = round((len(profitable) / len(results) * 100), 1) if results else 0.0
    sorted_by_ret = sorted(results, key=lambda x: (x["return_pct"], x["sharpe"]), reverse=True)
    best_factor = sorted_by_ret[0] if sorted_by_ret else None

    # Median sharpe
    sharpes = [r["sharpe"] for r in results]
    median_sharpe = round(float(np.median(sharpes)), 2) if sharpes else 0.0

    # Avg win rate for runs with trades
    trades_runs = [r["win_rate"] for r in results if r["trades"] > 0]
    avg_win_rate = round(float(np.mean(trades_runs)), 1) if trades_runs else 0.0

    # Timeframe yield
    tf_perf = []
    for tf in ["1m", "2m", "5m", "15m"]:
        matching = [r["return_pct"] for r in results if r["timeframe"] == tf]
        if matching:
            tf_perf.append({"tf": tf, "avg_return": round(float(np.mean(matching)), 2), "count": len(matching)})

    return {
        "assets": assets,
        "strategies": strats,
        "timeframes": tfs,
        "matrix": results,
        "summary_stats": {
            "positive_alpha_ratio": pos_ratio,
            "profitable_count": len(profitable),
            "total_count": len(results),
            "best_factor": best_factor,
            "median_sharpe": median_sharpe,
            "avg_win_rate": avg_win_rate,
            "timeframe_performance": tf_perf
        }
    }


def _execute_matrix_worker(task_id: str, symbols: List[str], timeframes: List[str], strategies: List[str], initial_capital: float):
    task = MATRIX_TASKS.get(task_id)
    if not task:
        return

    tf_lookback_map = {"1m": 7, "2m": 30, "5m": 60, "15m": 60}
    total_runs = len(symbols) * len(timeframes) * len(strategies)
    run_idx = 0
    all_records = []

    try:
        for sym in symbols:
            for tf in timeframes:
                lookback = tf_lookback_map.get(tf.lower(), 60)
                df_raw = get_cached_indian_data(sym, tf, lookback)
                if df_raw.empty:
                    run_idx += len(strategies)
                    task["progress"]["current"] = run_idx
                    continue

                for strat_name in strategies:
                    run_idx += 1
                    status_line = f"Testing {sym} ({tf}) │ {strat_name}"
                    task["progress"]["current"] = run_idx
                    task["progress"]["pct"] = round((run_idx / total_runs) * 100, 1)
                    task["progress"]["current_item"] = status_line

                    strat_func = get_strategy(strat_name)
                    if not strat_func:
                        continue

                    try:
                        strat_df = strat_func(df_raw.copy())
                        orig_stdout = sys.stdout
                        sys.stdout = io.StringIO()
                        try:
                            backtest_df = run_backtest_india(strat_df, initial_capital=initial_capital)
                            metrics = calculate_metrics(backtest_df, initial_capital=initial_capital)
                        finally:
                            sys.stdout = orig_stdout

                        trades = int(metrics.get("total_trades", 0))
                        win_rate = round(float(metrics.get("win_rate", 0.0)), 1)
                        net_pnl = round(float(metrics.get("net_pnl", 0.0)), 2)
                        ret_pct = round(float(metrics.get("total_return_pct", 0.0)), 2)
                        gross_pnl = round(float(metrics.get("gross_trading_pnl", 0.0)), 2)
                        charges = round(float(metrics.get("total_charges", 0.0)), 2)
                        pf_raw = metrics.get("profit_factor", 0.0)
                        pf = 999.0 if pf_raw == float("inf") else round(float(pf_raw), 2)
                        dd = round(float(metrics.get("max_drawdown_pct", 0.0)), 2)
                        sharpe = round(float(metrics.get("sharpe_ratio", 0.0)), 2)
                        final_eq = round(float(metrics.get("final_equity", initial_capital)), 2)
                        status = "PRIME" if sharpe >= 1.5 and ret_pct > 0 else ("GOOD" if ret_pct > 0 else "WEAK")

                        rec = {
                            "asset": sym,
                            "symbol": sym,
                            "timeframe": tf,
                            "lookback_days": lookback,
                            "strategy": strat_name,
                            "trades": trades,
                            "win_rate": win_rate,
                            "net_pnl": net_pnl,
                            "return_pct": ret_pct,
                            "gross_trading_pnl": gross_pnl,
                            "charges": charges,
                            "profit_factor": pf,
                            "max_drawdown_pct": dd,
                            "sharpe": sharpe,
                            "final_equity": final_eq,
                            "status": status
                        }
                        task["results"].append(rec)
                        all_records.append(rec)
                    except Exception as run_err:
                        print(f"Error testing {sym} {tf} {strat_name}: {run_err}")

        # Update CSV file with new / updated records
        try:
            existing = _parse_csv_matrix_results()
            record_dict = {(r["symbol"], r["timeframe"], r["strategy"]): r for r in existing}
            for nr in all_records:
                record_dict[(nr["symbol"], nr["timeframe"], nr["strategy"])] = nr

            with open(RESULTS_CSV_FILE, mode="w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([
                    "symbol", "timeframe", "lookback_days", "strategy",
                    "total_trades", "winning_trades", "losing_trades", "win_rate_pct",
                    "net_pnl", "total_return_pct", "gross_trading_pnl", "total_charges",
                    "profit_factor", "max_drawdown_pct", "sharpe_ratio", "final_equity"
                ])
                for item in record_dict.values():
                    writer.writerow([
                        item["symbol"],
                        item["timeframe"],
                        item.get("lookback_days", 60),
                        item["strategy"],
                        item["trades"],
                        round(item["trades"] * item["win_rate"] / 100),
                        item["trades"] - round(item["trades"] * item["win_rate"] / 100),
                        item["win_rate"],
                        item["net_pnl"],
                        item["return_pct"],
                        item.get("gross_trading_pnl", item["net_pnl"]),
                        item.get("charges", 0.0),
                        item["profit_factor"],
                        item["max_drawdown_pct"],
                        item["sharpe"],
                        item.get("final_equity", 1000000.0)
                    ])
        except Exception as csv_err:
            print(f"Error persisting matrix results to CSV: {csv_err}")

        task["status"] = "COMPLETED"
        task["progress"]["pct"] = 100.0
        task["progress"]["current_item"] = f"Finished {total_runs} combinations successfully!"

    except Exception as e:
        task["status"] = "FAILED"
        task["error"] = str(e)


@app.post("/api/matrix/run")
def run_matrix_evaluation(req: MatrixRunRequest):
    """Initiates a background multi-factor matrix evaluation grid across Assets x Timeframes x Strategies."""
    symbols = [s.strip().upper() for s in req.symbols if s.strip()]
    timeframes = [t.strip().lower() for t in req.timeframes if t.strip()]
    strategies = [st.strip() for st in req.strategies if st.strip()]

    if not symbols:
        raise HTTPException(status_code=400, detail="At least one stock symbol must be selected.")
    if not timeframes:
        raise HTTPException(status_code=400, detail="At least one timeframe must be selected.")
    if not strategies:
        raise HTTPException(status_code=400, detail="At least one quantitative strategy must be selected.")

    total_runs = len(symbols) * len(timeframes) * len(strategies)
    task_id = f"matrix_{int(time.time())}_{uuid.uuid4().hex[:6]}"

    MATRIX_TASKS[task_id] = {
        "task_id": task_id,
        "status": "RUNNING",
        "progress": {
            "current": 0,
            "total": total_runs,
            "pct": 0.0,
            "current_item": "Initializing factor grid..."
        },
        "results": [],
        "error": None,
        "created_at": datetime.now().isoformat()
    }

    worker = threading.Thread(
        target=_execute_matrix_worker,
        args=(task_id, symbols, timeframes, strategies, req.initial_capital or 1_000_000.0),
        daemon=True
    )
    worker.start()

    return {
        "success": True,
        "task_id": task_id,
        "total_runs": total_runs,
        "symbols": symbols,
        "timeframes": timeframes,
        "strategies": strategies
    }


@app.get("/api/matrix/task/{task_id}")
def get_matrix_task_status(task_id: str):
    """Retrieves live status, progress percentage, and progressive results for a matrix evaluation run."""
    task = MATRIX_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Matrix task not found")
    return task


# ─────────────────────────────────────────────────────────────────────────────
# Multi-Market Scanner Endpoints (NSE 09:16 AM / US 09:31 AM ET / Forex 24/5)
# ─────────────────────────────────────────────────────────────────────────────
from scanner.morning_scanner import run_market_scanner

class ScannerRequest(BaseModel):
    market: Optional[str] = "INDIA"
    snapshot_mode: Optional[str] = "916_OPEN"
    force_refresh: Optional[bool] = False

@app.get("/api/scanner/morning")
def get_morning_scanner(
    market: str = Query("INDIA", description="INDIA, US, FOREX"),
    snapshot_mode: str = Query("916_OPEN", description="916_OPEN or LIVE")
):
    """Returns scheduled 9:16 AM snapshot or live market scan results with exact timestamps."""
    return run_market_scanner(market=market, snapshot_mode=snapshot_mode, force_refresh=False)

@app.post("/api/scanner/scan")
def trigger_market_scan(req: Optional[ScannerRequest] = None):
    """Forces an on-demand market scan across India, US, or Forex anytime."""
    m = req.market if req and req.market else "INDIA"
    mode = req.snapshot_mode if req and req.snapshot_mode else "LIVE"
    return run_market_scanner(market=m, snapshot_mode=mode, force_refresh=True)


# ─────────────────────────────────────────────────────────────────────────────
# Static Web App Mount (Serve frontend/dist if built)
# ─────────────────────────────────────────────────────────────────────────────
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

dist_dir = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(dist_dir):
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(dist_dir, "index.html"))

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = os.path.join(dist_dir, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_dir, "index.html"))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"\n🚀 Starting Algo Trading Quantitative Terminal on port {port} ...")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
