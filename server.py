"""
server.py
=========
High-Performance Quantitative API Backend for Algo Trading Bot.
Connects the React/Vite Quantitative Terminal to the backtest engines,
strategy registries, and live paper-trading bot states.
"""

import os
import sys
import io
import math
from typing import Dict, List, Optional, Any, Union
import time
from datetime import datetime, date
from zoneinfo import ZoneInfo
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
# Helper: Prepare DataFrame for TradingView Charts with Timezone Alignment
# ─────────────────────────────────────────────────────────────────────────────
def to_chart_time(ts, market: str = "INDIA") -> Union[int, str]:
    """Converts a timestamp to TradingView Lightweight Charts format,
    adjusting intraday epoch by the exchange timezone offset so the candle clock time
    matches the exact market session hours (e.g. 09:15 AM IST for NSE India)."""
    if not hasattr(ts, "timestamp"):
        return str(ts)[:10]
    if ts.hour == 0 and ts.minute == 0 and ts.second == 0:
        return ts.strftime("%Y-%m-%d")

    epoch = int(ts.timestamp())
    # If tz-aware, add its utcoffset seconds so UTC display in Lightweight Charts matches exchange local time
    if hasattr(ts, "utcoffset") and ts.utcoffset() is not None:
        epoch += int(ts.utcoffset().total_seconds())
    elif market == "INDIA":
        epoch += 19800  # Fallback: 5 hours 30 mins for naive Indian timestamps
    elif market == "US":
        epoch -= 4 * 3600  # Fallback for naive US Eastern timestamps
    return epoch


def df_to_tv_candles(df: pd.DataFrame, market: str = "INDIA") -> List[Dict[str, Any]]:
    """Converts OHLCV dataframe to TradingView Lightweight Charts candle format."""
    candles = []
    for ts, row in df.iterrows():
        time_val = to_chart_time(ts, market)
        candles.append({
            "time": time_val,
            "open": round(float(row['open']), 2),
            "high": round(float(row['high']), 2),
            "low": round(float(row['low']), 2),
            "close": round(float(row['close']), 2),
            "volume": int(row.get('volume', 0)),
        })
    return candles


def extract_tv_markers(trade_log: List[Dict], df: pd.DataFrame, market: str = "INDIA") -> List[Dict[str, Any]]:
    """Extracts entry and exit markers positioned on candlesticks for TradingView."""
    markers = []
    # Build a lookup for timestamp -> chart epoch
    time_map = {}
    for ts in df.index:
        time_str = format_bar_timestamp(ts)
        epoch = to_chart_time(ts, market)
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

    # 6. Format Candlesticks and Markers for TradingView (Timezone Aligned)
    candles = df_to_tv_candles(raw_df, market=market)
    markers = extract_tv_markers(trade_log, raw_df, market=market)

    # 7. Format Equity Curve
    equity_curve = []
    for ts, row in res_df.iterrows():
        epoch = to_chart_time(ts, market)
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
                "time": to_chart_time(ts, market),
                "value": round(float(v), 2)
            }
            for ts, v in strat_df['vwap'].dropna().items()
        ]
    if 'ema_fast' in strat_df.columns:
        indicators['ema_fast'] = [
            {
                "time": to_chart_time(ts, market),
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


# ─────────────────────────────────────────────────────────────────────────────
# In-Memory Real-Time Bot Terminal Logging Engine
# ─────────────────────────────────────────────────────────────────────────────
_BOT_LOGS: List[Dict[str, Any]] = []

def add_bot_log(level: str, message: str, symbol: Optional[str] = None):
    """Appends a timestamped log to the in-memory terminal buffer and disk log (Zone: Asia/Kolkata)."""
    now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
    log_entry = {
        "timestamp": now_ist.strftime("%H:%M:%S"),
        "date": now_ist.strftime("%Y-%m-%d"),
        "level": level.upper(),
        "message": message,
        "symbol": symbol or "SYSTEM"
    }
    _BOT_LOGS.append(log_entry)
    if len(_BOT_LOGS) > 300:
        _BOT_LOGS.pop(0)

    try:
        os.makedirs("data", exist_ok=True)
        with open(os.path.join("data", "bot_terminal.log"), "a", encoding="utf-8") as f:
            f.write(f"[{log_entry['date']} {log_entry['timestamp']}] [{log_entry['level']}] [{log_entry['symbol']}] {message}\n")
    except Exception:
        pass


def _init_default_logs():
    if not _BOT_LOGS:
        now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
        is_market_open = (now_ist.weekday() < 5 and (
            (now_ist.hour == 9 and now_ist.minute >= 15) or
            (9 < now_ist.hour < 15) or
            (now_ist.hour == 15 and now_ist.minute <= 30)
        ))
        add_bot_log("SYSTEM", "Algorithmic Trading Core v2.0 initialized (Zone: Asia/Kolkata).")
        add_bot_log("SCHEDULE", "Market Lifecycle: 09:15 Open | 09:16 Morning Scan | 15:15 MIS Square-Off | 15:30 Close.")
        add_bot_log("RISK", "Max daily drawdown guard armed at 2.0% (₹20,000). Pre-trade leverage cap 5x.")
        add_bot_log("TELEGRAM", "Two-way Telegram interactive push notifications active.")
        if is_market_open:
            add_bot_log("INFO", "🟢 NSE Market is LIVE. Gateway connected. Ready for intraday execution.")
        else:
            add_bot_log("STANDBY", "⏸️ NSE Market is currently CLOSED (Hours: Mon-Fri 09:15 - 15:30 IST). Next session opens at 09:15 AM IST.")

_init_default_logs()


from engine.live_trader import get_live_state, command_bot_control, start_live_execution_engine, get_risk_metrics

class BotControlRequest(BaseModel):
    action: str = Field(..., description="START, STOP, PAUSE, SQUARE_OFF, RESET, CONFIG")
    symbol: Optional[str] = None
    strategy_name: Optional[str] = None
    capital: Optional[float] = None
    timeframe: Optional[str] = None
    max_trades_per_symbol: Optional[int] = None
    stop_loss_pct: Optional[float] = None
    take_profit_multiple: Optional[float] = None
    max_drawdown_pct: Optional[float] = None


@app.on_event("startup")
def startup_event():
    """Starts background execution engines, lifecycle schedulers, and Telegram callback listeners."""
    print("🚀 [SERVER STARTUP] Initializing background engines...")
    try:
        from engine.live_trader import start_live_execution_engine
        start_live_execution_engine()
    except Exception as e:
        print(f"[STARTUP ERROR] Live Execution Engine: {e}")

    try:
        from scanner.morning_scanner import start_scanner_scheduler
        start_scanner_scheduler()
    except Exception as e:
        print(f"[STARTUP ERROR] Scanner Scheduler: {e}")

    try:
        from notifications.telegram_bot import start_telegram_listener
        start_telegram_listener()
    except Exception as e:
        print(f"[STARTUP ERROR] Telegram Listener: {e}")


@app.get("/api/bot/state")
@app.get("/api/bot/status")
def get_bot_state(symbol: Optional[str] = None):
    """Fetches real-time status and logs directly from the active live execution engine."""
    live_state = get_live_state()
    active_sym = live_state.get("symbol", "SBIN.NS")
    # If no symbol specified or requested symbol is empty, default to active live engine symbol
    target_sym = symbol.strip() if symbol and symbol.strip() else active_sym

    # If requested symbol matches active engine symbol, return live engine state
    if target_sym == active_sym:
        state_data = live_state
    else:
        # Load symbol-specific state file
        clean_sym = target_sym.replace(".", "_").replace("^", "")
        state_file = os.path.join("data", f"bot_india_state_{clean_sym}.json")
        state_data = {
            "symbol": target_sym,
            "status": live_state.get("status", "ACTIVE (MONITORING)"),
            "strategy": live_state.get("strategy", "NSE Intraday ORB Breakout"),
            "timeframe": live_state.get("timeframe", "2m"),
            "cash": live_state.get("cash", 1_000_000.0),
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
                    state_data.update(json.load(f))
            except Exception:
                pass

    # Parse real historical trades from trade_history.csv
    history_file = os.path.join("data", "trade_history.csv")
    recent_trades = []
    all_trades = []
    if os.path.exists(history_file):
        try:
            df = pd.read_csv(history_file)
            if not df.empty:
                for idx, row in df.iterrows():
                    ts = str(row.get("Timestamp", ""))
                    try:
                        dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
                        date_str = dt.strftime("%d %b %Y")
                        time_str = dt.strftime("%I:%M %p")
                    except Exception:
                        date_str = ts[:10] if len(ts) >= 10 else ts
                        time_str = ts[11:16] if len(ts) >= 16 else ""

                    action = str(row.get("Action", "BUY")).upper()
                    sym = str(row.get("Symbol", target_sym))
                    shs = int(row.get("Shares", 0))
                    price = float(row.get("Execution_Price", 0.0))
                    cash_change = str(row.get("Cash_Change", "0"))

                    status = "FILLED"
                    if "SQUARE_OFF" in action:
                        status = "SQUARED OFF"
                    elif "COVER" in action or "SELL" in action:
                        status = "COMPLETED"

                    clean_cash = cash_change.replace("+", "").replace(",", "")
                    try:
                        amt_val = float(clean_cash)
                    except Exception:
                        amt_val = 0.0

                    trade_obj = {
                        "id": f"TRD-{idx+1001}",
                        "Timestamp": ts,
                        "Date": date_str,
                        "Time": time_str,
                        "Action": action,
                        "Symbol": sym,
                        "Shares": shs,
                        "Execution_Price": price,
                        "Cash_Change": cash_change,
                        "Status": status,
                        "Amount": f"+₹{amt_val:,.2f}" if amt_val > 0 else (f"-₹{abs(amt_val):,.2f}" if amt_val < 0 else f"₹{amt_val:,.2f}"),
                        "RawAmount": amt_val
                    }
                    all_trades.append(trade_obj)
                    if sym == target_sym:
                        recent_trades.append(trade_obj)
        except Exception as e:
            print(f"[TRADES PARSE ERROR] {e}")

    now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
    is_market_open = (now_ist.weekday() < 5 and (
        (now_ist.hour == 9 and now_ist.minute >= 15) or
        (9 < now_ist.hour < 15) or
        (now_ist.hour == 15 and now_ist.minute <= 30)
    ))

    risk_metrics = get_risk_metrics(state_data)

    return {
        "bot_state": state_data,
        "active_symbol": active_sym,
        "active_strategy": live_state.get("strategy", "NSE Intraday ORB Breakout"),
        "active_status": live_state.get("status", "ACTIVE (MONITORING)"),
        "is_market_open": is_market_open,
        "ist_time": now_ist.strftime("%H:%M:%S"),
        "ist_date": now_ist.strftime("%Y-%m-%d"),
        "recent_trades": recent_trades,
        "all_trades": all_trades,
        "logs": _BOT_LOGS[-60:],
        "risk_metrics": risk_metrics
    }


@app.get("/api/bot/logs")
def get_bot_logs(limit: int = 100):
    """Fetches real-time terminal logs."""
    return {"logs": _BOT_LOGS[-limit:], "total": len(_BOT_LOGS)}


@app.post("/api/bot/logs/clear")
def clear_bot_logs():
    """Clears in-memory terminal logs."""
    global _BOT_LOGS
    _BOT_LOGS = []
    add_bot_log("SYSTEM", "Terminal console buffer cleared by user.")
    return {"success": True, "logs": _BOT_LOGS}


@app.post("/api/bot/control")
def control_paper_bot(req: BotControlRequest):
    """Controls the active live paper trading engine directly with strict safety and validation."""
    try:
        updated_state = command_bot_control(
            action=req.action,
            symbol=req.symbol,
            strategy_name=req.strategy_name,
            capital=req.capital,
            timeframe=req.timeframe,
            max_trades_per_symbol=req.max_trades_per_symbol,
            stop_loss_pct=req.stop_loss_pct,
            take_profit_multiple=req.take_profit_multiple,
            max_drawdown_pct=req.max_drawdown_pct
        )
        return {"success": True, "action": req.action, "bot_state": updated_state}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal control execution error: {str(e)}")


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
@app.get("/api/matrix/tasks/{task_id}")
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
# Telegram Push Notifications Endpoints
# ─────────────────────────────────────────────────────────────────────────────
from notifications.telegram_bot import (
    get_telegram_credentials,
    save_telegram_credentials,
    send_telegram_alert,
    notify_morning_scan
)

class TelegramConfigRequest(BaseModel):
    bot_token: str
    chat_id: str

@app.get("/api/notifications/telegram/status")
def get_telegram_status():
    token, chat_id = get_telegram_credentials()
    configured = bool(token and chat_id)
    masked_token = f"{token[:6]}...{token[-4:]}" if token and len(token) > 10 else None
    return {
        "configured": configured,
        "chat_id": chat_id if configured else None,
        "token_masked": masked_token
    }

@app.post("/api/notifications/telegram/config")
def set_telegram_config(req: TelegramConfigRequest):
    if not req.bot_token.strip() or not req.chat_id.strip():
        raise HTTPException(status_code=400, detail="Bot token and chat ID are required.")
    success = save_telegram_credentials(req.bot_token, req.chat_id)
    return {"success": success, "configured": True}

@app.post("/api/notifications/telegram/test")
def test_telegram_alert():
    token, chat_id = get_telegram_credentials()
    if not token or not chat_id:
        raise HTTPException(status_code=400, detail="Telegram is not configured. Provide bot token and chat ID first.")
    
    test_msg = (
        "🔔 <b>Algo Trading Bot — Connection Verified!</b>\n\n"
        "✅ Your Telegram push notifications are active.\n"
        "📈 You will receive tomorrow's 09:16 AM market breakout picks and live trade signals right here on your phone!\n\n"
        "📱 <i>Live Terminal: https://algorithmic-trading-1-zcqx.onrender.com</i>"
    )
    sent = send_telegram_alert(test_msg)
    if not sent:
        raise HTTPException(status_code=502, detail="Failed to deliver message via Telegram API. Check bot token and chat ID.")
    return {"success": True, "message": "Test alert sent to Telegram!"}


# ─────────────────────────────────────────────────────────────────────────────
# 11. Paper Order Management System (OMS) & Execution Monitor Endpoints
# ─────────────────────────────────────────────────────────────────────────────
from engine.order_manager import (
    get_order_manager,
    OrderStatus,
    OrderSide,
    OrderType,
    InvalidStateTransitionError,
    OrderNotFoundError,
    OrderValidationError
)

class OrderSubmitRequest(BaseModel):
    symbol: str = Field(..., description="NSE symbol e.g. SBIN.NS")
    side: str = Field(..., description="BUY, SELL, SHORT, or COVER")
    order_type: str = Field(default="MARKET", description="MARKET or LIMIT")
    quantity: int = Field(..., gt=0, description="Requested share quantity")
    limit_price: Optional[float] = Field(default=None, description="Price for LIMIT orders")
    idempotency_key: Optional[str] = Field(default=None, description="Client idempotency key")
    strategy_name: Optional[str] = Field(default="NSE Intraday ORB Breakout", description="Strategy generating order")
    bot_id: Optional[str] = Field(default="live_bot_1", description="Associated bot ID")
    simulated_market_price: Optional[float] = Field(default=None, description="Optional simulated current price")

class OrderCancelRequest(BaseModel):
    reason: Optional[str] = Field(default="Cancelled by user", description="Reason for cancellation")

class OrderFillStepRequest(BaseModel):
    quantity: int = Field(..., gt=0, description="Quantity to fill")
    price: float = Field(..., gt=0, description="Fill price")
    slippage: Optional[float] = Field(default=None, description="Modeled slippage amount")

class SimulateTickRequest(BaseModel):
    symbol: str = Field(..., description="Symbol to simulate tick for")
    price: float = Field(..., gt=0, description="Current market price")
    volume: Optional[int] = Field(default=None, description="Available tick volume")


@app.post("/api/orders", status_code=200)
def submit_paper_order(req: OrderSubmitRequest):
    """
    Submits a paper trading order with full idempotency and lifecycle handling.
    Immediate MARKET orders simulate fills, while LIMIT orders queue as PENDING.
    """
    oms = get_order_manager()
    try:
        order, is_new = oms.submit_order(
            symbol=req.symbol,
            side=req.side,
            order_type=req.order_type,
            quantity=req.quantity,
            limit_price=req.limit_price,
            idempotency_key=req.idempotency_key,
            strategy_name=req.strategy_name,
            bot_id=req.bot_id,
            simulated_market_price=req.simulated_market_price
        )
        return {
            "success": True,
            "is_new": is_new,
            "order": order.to_dict()
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/orders")
def list_paper_orders(
    symbol: Optional[str] = Query(None, description="Filter by ticker"),
    side: Optional[str] = Query(None, description="Filter by side: BUY, SELL, SHORT, COVER"),
    status: Optional[str] = Query(None, description="Filter by status: PENDING, FILLED, etc."),
    strategy: Optional[str] = Query(None, description="Filter by strategy"),
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=500, description="Pagination limit"),
    offset: int = Query(0, ge=0, description="Pagination offset")
):
    """Lists orders with rich multi-parameter filtering and chronological ordering."""
    oms = get_order_manager()
    orders, total = oms.list_orders(
        symbol=symbol,
        side=side,
        status=status,
        strategy=strategy,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset
    )
    return {
        "orders": [o.to_dict() for o in orders],
        "total": total,
        "limit": limit,
        "offset": offset
    }


@app.get("/api/orders/{order_id}")
def get_paper_order_details(order_id: str):
    """Fetches comprehensive order details including lifecycle history and individual fills."""
    oms = get_order_manager()
    try:
        order = oms.get_order(order_id)
        return order.to_dict()
    except OrderNotFoundError:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")


@app.post("/api/orders/{order_id}/cancel")
def cancel_paper_order(order_id: str, req: Optional[OrderCancelRequest] = None):
    """
    Cancels outstanding quantity on an order.
    Preserves executed partial fills and cancels only remaining quantity.
    Rejects cancellation if the order is already FILLED, CANCELLED, or EXPIRED.
    """
    oms = get_order_manager()
    reason = req.reason if req else "Cancelled by user"
    try:
        order = oms.cancel_order(order_id, reason=reason)
        return {"success": True, "order": order.to_dict()}
    except OrderNotFoundError:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
    except (ValueError, InvalidStateTransitionError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/orders/{order_id}/fills")
def get_paper_order_fills(order_id: str):
    """Fetches all individual execution fills associated with an order."""
    oms = get_order_manager()
    try:
        fills = oms.get_order_fills(order_id)
        return {
            "order_id": order_id,
            "fills": [f.to_dict() for f in fills],
            "total_fills": len(fills)
        }
    except OrderNotFoundError:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")


@app.get("/api/execution/metrics")
def get_execution_metrics():
    """Returns aggregated execution telemetry and order metrics across the paper trading book."""
    oms = get_order_manager()
    return oms.get_execution_metrics()


@app.post("/api/orders/{order_id}/fill-step")
def execute_order_fill_step(order_id: str, req: OrderFillStepRequest):
    """Simulates an explicit execution fill step for testing or stepped matching."""
    oms = get_order_manager()
    try:
        fill = oms.execute_fill(
            order_id=order_id,
            quantity=req.quantity,
            price=req.price,
            slippage=req.slippage,
            sync_to_ledger=True
        )
        order = oms.get_order(order_id)
        return {
            "success": True,
            "fill": fill.to_dict(),
            "order": order.to_dict()
        }
    except OrderNotFoundError:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
    except (ValueError, InvalidStateTransitionError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/orders/simulate-tick")
def simulate_order_tick(req: SimulateTickRequest):
    """Simulates a market price tick matching against pending LIMIT orders."""
    oms = get_order_manager()
    fills = oms.simulate_tick(
        symbol=req.symbol,
        current_price=req.price,
        available_volume=req.volume,
        sync_to_ledger=True
    )
    return {
        "success": True,
        "matched_fills": [f.to_dict() for f in fills],
        "count": len(fills)
    }


@app.get("/api/execution/reconcile")
def reconcile_execution_ledger():
    """Reconciles paper order fills 1:1 against trade_history.csv."""
    oms = get_order_manager()
    return oms.reconcile_with_ledger()


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
