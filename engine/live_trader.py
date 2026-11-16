"""
engine/live_trader.py
=====================
Autonomous Real-Time Paper Trading Execution Engine for Indian Equities (NSE).
Binds directly to Morning Scanner picks, evaluates live quantitative strategy math,
tracks intra-candle Stop Loss / Target Profit, executes orders with realistic statutory
friction, and streams live calculation logs to the terminal.
"""

import os
import sys
import json
import time
import csv
import threading
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
from zoneinfo import ZoneInfo

import pandas as pd
import numpy as np
import yfinance as yf

# Root data directory
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
os.makedirs(DATA_DIR, exist_ok=True)
CONFIG_FILE = os.path.join(DATA_DIR, "bot_active_config.json")
HISTORY_FILE = os.path.join(DATA_DIR, "trade_history.csv")

_ENGINE_LOCK = threading.Lock()
_ENGINE_RUNNING = False
_ENGINE_THREAD: Optional[threading.Thread] = None

# Default parameters
DEFAULT_CASH = 1_000_000.0  # ₹10 Lakhs margin
SLIPPAGE_PCT = 0.0005        # 0.05% slippage on entry and exit


# ─────────────────────────────────────────────────────────────────────────────
# 1. Statutory Costs & Slippage Calculator (NSE Intraday MIS)
# ─────────────────────────────────────────────────────────────────────────────
def calculate_buy_costs(shares: int, price: float) -> Tuple[float, float]:
    """Calculates slippage fill price and total cash outflow for a BUY order."""
    exec_price = round(price * (1.0 + SLIPPAGE_PCT), 2)
    trade_val = shares * exec_price
    brokerage = min(20.0, trade_val * 0.0003)
    exchange_fee = trade_val * 0.0000297
    sebi_fee = trade_val * 0.000001
    stamp_duty = trade_val * 0.00003
    gst = (brokerage + exchange_fee + sebi_fee) * 0.18
    total_cost = round(trade_val + brokerage + exchange_fee + sebi_fee + stamp_duty + gst, 2)
    return exec_price, total_cost


def calculate_sell_proceeds(shares: int, price: float) -> Tuple[float, float]:
    """Calculates slippage fill price and net cash inflow for a SELL order."""
    exec_price = round(price * (1.0 - SLIPPAGE_PCT), 2)
    trade_val = shares * exec_price
    brokerage = min(20.0, trade_val * 0.0003)
    exchange_fee = trade_val * 0.0000297
    sebi_fee = trade_val * 0.000001
    stt = trade_val * 0.00025  # 0.025% STT on intraday sell side
    gst = (brokerage + exchange_fee + sebi_fee) * 0.18
    total_fees = brokerage + exchange_fee + sebi_fee + stt + gst
    total_proceeds = round(trade_val - total_fees, 2)
    return exec_price, total_proceeds


# ─────────────────────────────────────────────────────────────────────────────
# 2. State & History Persistence
# ─────────────────────────────────────────────────────────────────────────────
def get_live_state() -> Dict[str, Any]:
    """Loads the active live bot state from config."""
    state = {
        "symbol": "SBIN.NS",
        "strategy": "NSE Midday VWAP Pullback",
        "timeframe": "2m",
        "status": "ACTIVE (MONITORING)",
        "cash": DEFAULT_CASH,
        "in_position": False,
        "shares": 0,
        "position_side": None,
        "entry_price": 0.0,
        "entry_total_cost": 0.0,
        "stop_loss": None,
        "target_price": None,
        "last_updated": datetime.now().isoformat(),
        "last_eval_time": None,
        "last_ltp": None,
        "vwap": None,
        "rsi": None
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                saved = json.load(f)
                state.update(saved)
                # Map active_symbol if present
                if "active_symbol" in saved and saved["active_symbol"]:
                    state["symbol"] = saved["active_symbol"]
        except Exception:
            pass
    return state


def save_live_state(state: Dict[str, Any]):
    """Persists the updated live engine state."""
    state["last_updated"] = datetime.now().isoformat()
    state["active_symbol"] = state.get("symbol", "SBIN.NS")
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        print(f"[ENGINE STATE ERROR] Failed to save {CONFIG_FILE}: {e}")

    # Synchronize to symbol-specific file for fallback
    sym = state.get("symbol", "SBIN.NS")
    clean_sym = sym.replace(".", "_").replace("^", "")
    sf = os.path.join(DATA_DIR, f"bot_india_state_{clean_sym}.json")
    try:
        with open(sf, "w") as f:
            json.dump(state, f, indent=2)
    except Exception:
        pass


def record_live_trade(action: str, symbol: str, shares: int, price: float, cash_change: float):
    """Appends an executed trade to trade_history.csv."""
    os.makedirs(DATA_DIR, exist_ok=True)
    file_exists = os.path.exists(HISTORY_FILE)
    now_str = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d %H:%M:%S")
    try:
        with open(HISTORY_FILE, "a", newline="") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["Timestamp", "Action", "Symbol", "Shares", "Execution_Price", "Cash_Change"])
            writer.writerow([now_str, action, symbol, shares, round(price, 2), f"{cash_change:+.2f}"])
    except Exception as e:
        print(f"[ENGINE CSV ERROR] Failed to log trade: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Market Data Ingestion Pipeline
# ─────────────────────────────────────────────────────────────────────────────
def fetch_intraday_data(symbol: str, interval: str = "2m") -> pd.DataFrame:
    """Fetches rolling 2-day candle data with standardized columns."""
    valid_intervals = {"1m", "2m", "5m", "15m", "30m"}
    if interval not in valid_intervals:
        interval = "2m"

    period = "2d" if interval in {"1m", "2m"} else "5d"

    try:
        df = yf.download(tickers=symbol, period=period, interval=interval, progress=False)
        if not df.empty:
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.droplevel(1)
            df.columns = [c.lower() for c in df.columns]
            df = df.dropna(subset=['close', 'volume'])
            return df
    except Exception:
        pass

    try:
        t = yf.Ticker(symbol)
        df = t.history(period=period, interval=interval)
        if not df.empty:
            df.columns = [c.lower() for c in df.columns]
            df = df.dropna(subset=['close', 'volume'])
            return df
    except Exception:
        pass

    return pd.DataFrame()


def fetch_live_price(symbol: str) -> Optional[float]:
    """Fetches real-time Last Traded Price (LTP)."""
    try:
        t = yf.Ticker(symbol)
        p = t.fast_info.get("last_price")
        if p is not None and not np.isnan(p) and p > 0:
            return float(p)
    except Exception:
        pass

    try:
        df = yf.download(tickers=symbol, period="1d", interval="1m", progress=False)
        if not df.empty:
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.droplevel(1)
            return float(df['Close'].iloc[-1])
    except Exception:
        pass

    return None


def calculate_real_indicators(df: pd.DataFrame) -> Tuple[float, float, float]:
    """Computes real VWAP, RSI(14), and 9/21 EMA spread."""
    if df.empty or len(df) < 5:
        return 0.0, 50.0, 0.0

    # 1. Intraday VWAP
    cum_vol = df['volume'].cumsum()
    cum_tp = ((df['high'] + df['low'] + df['close']) / 3.0 * df['volume']).cumsum()
    vwap_series = cum_tp / cum_vol.replace(0, np.nan)
    vwap_val = round(float(vwap_series.iloc[-1]), 2) if not vwap_series.empty else float(df['close'].iloc[-1])

    # 2. RSI(14)
    delta = df['close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=14, min_periods=5).mean()
    avg_loss = loss.rolling(window=14, min_periods=5).mean().replace(0, 0.00001)
    rs = avg_gain / avg_loss
    rsi_series = 100 - (100 / (1 + rs))
    rsi_val = round(float(rsi_series.iloc[-1]), 1) if not np.isnan(rsi_series.iloc[-1]) else 50.0

    # 3. EMA spread (9 EMA - 21 EMA)
    ema9 = df['close'].ewm(span=9, adjust=False).mean()
    ema21 = df['close'].ewm(span=21, adjust=False).mean()
    ema_spread = round(float(ema9.iloc[-1] - ema21.iloc[-1]), 2)

    return vwap_val, rsi_val, ema_spread


# ─────────────────────────────────────────────────────────────────────────────
# 4. Strategy Ingestion & Signal Evaluator
# ─────────────────────────────────────────────────────────────────────────────
def evaluate_strategy_signal(df: pd.DataFrame, strategy_name: str) -> Tuple[int, float, float, str]:
    """
    Evaluates real quantitative strategy on historical candles.
    Returns: (signal: -1, 0, 1, stop_loss: float, target_price: float, reason: str)
    """
    if df.empty or len(df) < 10:
        return 0, 0.0, 0.0, "Insufficient candle bars for strategy calculation"

    try:
        from strategies import get_strategy
        strat_fn = get_strategy(strategy_name)
    except Exception:
        strat_fn = None

    curr_close = float(df['close'].iloc[-1])

    if strat_fn is not None:
        try:
            # Strategies expect DataFrame with ['open', 'high', 'low', 'close', 'volume']
            clean_df = df.copy()
            clean_df.columns = [c.capitalize() for c in clean_df.columns]
            res_df = strat_fn(clean_df)
            if 'Signal' in res_df.columns and not res_df['Signal'].empty:
                last_sig = int(res_df['Signal'].iloc[-1])
                sl = float(res_df.get('StopLoss', pd.Series([curr_close * 0.99])).iloc[-1])
                tp = float(res_df.get('Target', pd.Series([curr_close * 1.02])).iloc[-1])
                return last_sig, sl, tp, f"Strategy '{strategy_name}' generated Signal {last_sig}"
        except Exception as e:
            pass

    # Built-in robust VWAP Pullback Rule if module not found:
    # BUY when close > VWAP and 9 EMA > 21 EMA and RSI > 50
    vwap_val, rsi_val, ema_spread = calculate_real_indicators(df)
    if curr_close > vwap_val and ema_spread > 0 and 52 <= rsi_val <= 68:
        sl = round(curr_close * 0.992, 2)   # 0.8% Stop Loss
        tp = round(curr_close * 1.016, 2)   # 1.6% 2R Target
        return 1, sl, tp, f"VWAP Pullback LONG: Price ₹{curr_close:.2f} > VWAP ₹{vwap_val:.2f} (RSI {rsi_val})"
    elif curr_close < vwap_val and ema_spread < 0 and 32 <= rsi_val <= 48:
        sl = round(curr_close * 1.008, 2)
        tp = round(curr_close * 0.984, 2)
        return -1, sl, tp, f"VWAP Breakdown SHORT: Price ₹{curr_close:.2f} < VWAP ₹{vwap_val:.2f} (RSI {rsi_val})"

    return 0, 0.0, 0.0, f"No trigger. Price ₹{curr_close:.2f} | VWAP ₹{vwap_val:.2f} | RSI {rsi_val}"


# ─────────────────────────────────────────────────────────────────────────────
# 5. Core Live Execution Worker Thread
# ─────────────────────────────────────────────────────────────────────────────
def _execution_worker():
    """Autonomous live loop running throughout market hours (09:15 - 15:30 IST)."""
    global _ENGINE_RUNNING
    print("🚀 [LIVE ENGINE] Autonomous Execution Worker started.")

    while _ENGINE_RUNNING:
        try:
            with _ENGINE_LOCK:
                state = get_live_state()

            status = state.get("status", "STOPPED")
            if not status.startswith("ACTIVE"):
                time.sleep(5)
                continue

            symbol = state.get("symbol", "SBIN.NS")
            strategy_name = state.get("strategy", "NSE Midday VWAP Pullback")
            timeframe = state.get("timeframe", "2m")
            in_pos = state.get("in_position", False)
            cash = state.get("cash", DEFAULT_CASH)

            # Check if within market session (09:15 - 15:30 IST)
            now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
            is_market_hours = (now_ist.weekday() < 5 and (
                (now_ist.hour == 9 and now_ist.minute >= 15) or
                (9 < now_ist.hour < 15) or
                (now_ist.hour == 15 and now_ist.minute <= 30)
            ))

            # 1. Fetch live data & LTP
            df = fetch_intraday_data(symbol, interval=timeframe)
            current_ltp = fetch_live_price(symbol)
            if current_ltp is None and not df.empty:
                current_ltp = float(df['close'].iloc[-1])

            if current_ltp is None:
                time.sleep(10)
                continue

            # Compute real indicator values
            vwap_val, rsi_val, ema_spread = calculate_real_indicators(df)
            state["last_ltp"] = current_ltp
            state["vwap"] = vwap_val
            state["rsi"] = rsi_val
            state["last_eval_time"] = now_ist.strftime("%H:%M:%S")

            # ─────────────────────────────────────────────────────────
            # A. IF ALREADY IN POSITION: Fast Intra-Candle Risk Monitor
            # ─────────────────────────────────────────────────────────
            if in_pos and state.get("shares", 0) > 0:
                shs = state["shares"]
                side = state.get("position_side", "LONG")
                ep = state.get("entry_price", current_ltp)
                sl = state.get("stop_loss")
                tp = state.get("target_price")

                pnl_per_share = (current_ltp - ep) if side == "LONG" else (ep - current_ltp)
                total_unrealized_pnl = round(pnl_per_share * shs, 2)
                pnl_pct = round((pnl_per_share / ep) * 100, 2)

                # Log intra-candle monitoring tick
                from server import add_bot_log
                add_bot_log(
                    "SIGNAL",
                    f"Holding {side} {shs} units {symbol} @ ₹{ep:.2f} │ LTP: ₹{current_ltp:.2f} │ P&L: {total_unrealized_pnl:+,.2f} ({pnl_pct:+.2f}%) │ SL: ₹{sl:.2f} │ TP: ₹{tp:.2f}",
                    symbol
                )

                # Check 03:15 PM MIS Intraday Auto-Square-Off Gate
                is_square_off_time = (now_ist.hour == 15 and now_ist.minute >= 15)
                
                # Check Stop Loss / Target Profit / MIS Exit
                should_exit = False
                exit_reason = ""

                if is_square_off_time:
                    should_exit = True
                    exit_reason = "3:15 PM MIS INTRADAY AUTO-SQUARE-OFF"
                elif side == "LONG":
                    if sl is not None and current_ltp <= sl:
                        should_exit = True
                        exit_reason = f"STOP LOSS HIT (LTP ₹{current_ltp:.2f} <= SL ₹{sl:.2f})"
                    elif tp is not None and current_ltp >= tp:
                        should_exit = True
                        exit_reason = f"TARGET 2R ACHIEVED (LTP ₹{current_ltp:.2f} >= TP ₹{tp:.2f})"
                elif side == "SHORT":
                    if sl is not None and current_ltp >= sl:
                        should_exit = True
                        exit_reason = f"STOP LOSS HIT (LTP ₹{current_ltp:.2f} >= SL ₹{sl:.2f})"
                    elif tp is not None and current_ltp <= tp:
                        should_exit = True
                        exit_reason = f"TARGET 2R ACHIEVED (LTP ₹{current_ltp:.2f} <= TP ₹{tp:.2f})"

                if should_exit:
                    # Execute Exit
                    if side == "LONG":
                        exec_price, proceeds = calculate_sell_proceeds(shs, current_ltp)
                        realized_pnl = round(proceeds - state.get("entry_total_cost", shs * ep), 2)
                        realized_pct = round((realized_pnl / state.get("entry_total_cost", shs * ep)) * 100, 2)
                        state["cash"] = round(state["cash"] + proceeds, 2)
                        record_live_trade("SELL", symbol, shs, exec_price, proceeds)
                    else:
                        exec_price, total_cost = calculate_buy_costs(shs, current_ltp)
                        realized_pnl = round(state.get("entry_total_cost", shs * ep) - total_cost, 2)
                        realized_pct = round((realized_pnl / total_cost) * 100, 2)
                        state["cash"] = round(state["cash"] + (state.get("entry_total_cost", shs * ep) + realized_pnl), 2)
                        record_live_trade("COVER", symbol, shs, exec_price, total_cost)

                    # Reset position fields
                    state["in_position"] = False
                    state["shares"] = 0
                    state["position_side"] = None
                    state["entry_price"] = 0.0
                    state["entry_total_cost"] = 0.0
                    state["stop_loss"] = None
                    state["target_price"] = None

                    with _ENGINE_LOCK:
                        save_live_state(state)

                    add_bot_log("ORDER", f"EXIT FILLED: {shs} shares of {symbol} closed @ ₹{exec_price:.2f}. Realized P&L: ₹{realized_pnl:+,.2f} ({realized_pct:+.2f}%). Reason: {exit_reason}", symbol)

                    # Dispatch push notification to Telegram
                    try:
                        from notifications.telegram_bot import notify_trade_exit
                        notify_trade_exit(symbol, exec_price, realized_pnl, realized_pct, exit_reason)
                    except Exception as t_err:
                        print(f"[ENGINE TELEGRAM ERROR] {t_err}")

                # Sleep 15s during active position monitoring
                time.sleep(15)

            # ─────────────────────────────────────────────────────────
            # B. IF FLAT: Evaluate Candle Strategy for New Entry Signal
            # ─────────────────────────────────────────────────────────
            else:
                sig, stop_loss, target_price, reason = evaluate_strategy_signal(df, strategy_name)

                from server import add_bot_log
                # Log actual calculation
                add_bot_log(
                    "TICK",
                    f"Evaluating {symbol} ({strategy_name} [{timeframe}]): LTP ₹{current_ltp:.2f} │ VWAP ₹{vwap_val:.2f} │ RSI {rsi_val} │ EMA Spread {ema_spread:+.2f} │ Signal: {sig}",
                    symbol
                )

                # Check if Entry Signal triggered (only within market hours before 02:45 PM)
                can_enter = is_market_hours and (now_ist.hour < 14 or (now_ist.hour == 14 and now_ist.minute <= 45))

                if sig != 0 and can_enter:
                    # Allocate max 50% cash to a single trade for prudent risk sizing
                    alloc_cash = cash * 0.50
                    affordable_shares = int(alloc_cash / (current_ltp * (1.0 + SLIPPAGE_PCT)))

                    if affordable_shares > 0:
                        if sig == 1:
                            # LONG BUY
                            exec_price, total_cost = calculate_buy_costs(affordable_shares, current_ltp)
                            state["cash"] = round(state["cash"] - total_cost, 2)
                            state["shares"] = affordable_shares
                            state["in_position"] = True
                            state["position_side"] = "LONG"
                            state["entry_price"] = exec_price
                            state["entry_total_cost"] = total_cost
                            state["stop_loss"] = stop_loss
                            state["target_price"] = target_price
                            record_live_trade("BUY", symbol, affordable_shares, exec_price, -total_cost)

                            add_bot_log("ORDER", f"🟢 ENTRY EXECUTED: BUY {affordable_shares} shares of {symbol} @ ₹{exec_price:.2f} (Total Outflow: ₹{total_cost:,.2f}) │ SL: ₹{stop_loss:.2f} │ Target: ₹{target_price:.2f}", symbol)

                            try:
                                from notifications.telegram_bot import notify_trade_entry
                                notify_trade_entry(symbol, "BUY", exec_price, affordable_shares, stop_loss, target_price, strategy_name)
                            except Exception as t_err:
                                print(f"[ENGINE TELEGRAM ERROR] {t_err}")

                        elif sig == -1:
                            # SHORT SELL
                            exec_price, total_proceeds = calculate_sell_proceeds(affordable_shares, current_ltp)
                            margin_req = total_proceeds
                            state["cash"] = round(state["cash"] - margin_req, 2)
                            state["shares"] = affordable_shares
                            state["in_position"] = True
                            state["position_side"] = "SHORT"
                            state["entry_price"] = exec_price
                            state["entry_total_cost"] = margin_req
                            state["stop_loss"] = stop_loss
                            state["target_price"] = target_price
                            record_live_trade("SHORT", symbol, affordable_shares, exec_price, -margin_req)

                            add_bot_log("ORDER", f"🔴 ENTRY EXECUTED: SHORT {affordable_shares} shares of {symbol} @ ₹{exec_price:.2f} (Margin: ₹{margin_req:,.2f}) │ SL: ₹{stop_loss:.2f} │ Target: ₹{target_price:.2f}", symbol)

                            try:
                                from notifications.telegram_bot import notify_trade_entry
                                notify_trade_entry(symbol, "SHORT", exec_price, affordable_shares, stop_loss, target_price, strategy_name)
                            except Exception as t_err:
                                print(f"[ENGINE TELEGRAM ERROR] {t_err}")

                        with _ENGINE_LOCK:
                            save_live_state(state)

                # Sleep 20s when flat awaiting candle triggers
                time.sleep(20)

        except Exception as e:
            print(f"[ENGINE WORKER ERROR] {e}")
            time.sleep(15)


# ─────────────────────────────────────────────────────────────────────────────
# 6. Public Controls (START, PAUSE, STOP, SQUARE_OFF, SET_SYMBOL)
# ─────────────────────────────────────────────────────────────────────────────
def start_live_execution_engine():
    """Launches the background execution worker daemon once."""
    global _ENGINE_RUNNING, _ENGINE_THREAD
    if not _ENGINE_RUNNING:
        _ENGINE_RUNNING = True
        _ENGINE_THREAD = threading.Thread(target=_execution_worker, daemon=True, name="LiveExecutionWorker")
        _ENGINE_THREAD.start()
        print("✅ Live Execution Engine daemon armed and running.")


def command_bot_control(action: str, symbol: Optional[str] = None, strategy_name: Optional[str] = None, capital: Optional[float] = None, timeframe: Optional[str] = None) -> Dict[str, Any]:
    """Handles START, PAUSE, STOP, SQUARE_OFF, RESET directly on the live engine."""
    with _ENGINE_LOCK:
        state = get_live_state()

        if symbol:
            state["symbol"] = symbol
            state["active_symbol"] = symbol
        if strategy_name:
            state["strategy"] = strategy_name
        if timeframe:
            state["timeframe"] = timeframe
        if capital and capital > 0:
            if not state.get("in_position"):
                state["cash"] = capital

        act = action.upper()

        if act == "START":
            state["status"] = "ACTIVE (IN POSITION)" if state.get("in_position") else "ACTIVE (MONITORING)"
            from server import add_bot_log
            add_bot_log("CONTROL", f"Bot STARTED on {state['symbol']}. Strategy: '{state['strategy']}' [{state.get('timeframe', '2m')}]. Real-time calculation loop engaged.", state['symbol'])

        elif act == "PAUSE":
            state["status"] = "PAUSED"
            from server import add_bot_log
            add_bot_log("CONTROL", f"Bot PAUSED on {state['symbol']}. Real-time trade entries suspended.", state['symbol'])

        elif act == "STOP":
            state["status"] = "STOPPED"
            from server import add_bot_log
            add_bot_log("CONTROL", f"Bot STOPPED on {state['symbol']}.", state['symbol'])

        elif act == "RESET":
            state["status"] = "ACTIVE (MONITORING)"
            state["cash"] = capital or DEFAULT_CASH
            state["in_position"] = False
            state["shares"] = 0
            state["position_side"] = None
            state["entry_price"] = 0.0
            state["entry_total_cost"] = 0.0
            state["stop_loss"] = None
            state["target_price"] = None
            from server import add_bot_log
            add_bot_log("SYSTEM", f"Bot state reset: Cash set to ₹{state['cash']:,.2f}. All positions cleared.", state['symbol'])

        elif act == "SQUARE_OFF":
            if state.get("in_position") and state.get("shares", 0) > 0:
                shs = state["shares"]
                side = state.get("position_side", "LONG")
                curr_price = fetch_live_price(state["symbol"]) or state.get("entry_price", 100.0)

                if side == "LONG":
                    exec_price, proceeds = calculate_sell_proceeds(shs, curr_price)
                    realized_pnl = round(proceeds - state.get("entry_total_cost", shs * exec_price), 2)
                    state["cash"] = round(state["cash"] + proceeds, 2)
                    record_live_trade("MANUAL_SQUARE_OFF", state["symbol"], shs, exec_price, proceeds)
                else:
                    exec_price, total_cost = calculate_buy_costs(shs, curr_price)
                    realized_pnl = round(state.get("entry_total_cost", shs * exec_price) - total_cost, 2)
                    state["cash"] = round(state["cash"] + (state.get("entry_total_cost", shs * exec_price) + realized_pnl), 2)
                    record_live_trade("MANUAL_SQUARE_OFF", state["symbol"], shs, exec_price, total_cost)

                state["in_position"] = False
                state["shares"] = 0
                state["position_side"] = None
                state["entry_price"] = 0.0
                state["entry_total_cost"] = 0.0
                state["stop_loss"] = None
                state["target_price"] = None
                state["status"] = "ACTIVE (MONITORING)"

                from server import add_bot_log
                add_bot_log("ORDER", f"MANUAL SQUARE-OFF FILLED: {shs} shares of {state['symbol']} closed @ ₹{exec_price:.2f}. Realized P&L: ₹{realized_pnl:+,.2f}.", state['symbol'])
            else:
                from server import add_bot_log
                add_bot_log("ORDER", f"Manual square-off requested for {state['symbol']}, but no open position exists.", state['symbol'])

        save_live_state(state)
        return state


# Arm engine on module load
start_live_execution_engine()
