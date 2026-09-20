import os
import sys
import json
import time
import math
import csv
from datetime import datetime, timedelta
import importlib

import yfinance as yf
import pandas as pd
import numpy as np

# ─────────────────────────────────────────────────────────────────────────────
#  Configuration & Constants
# ─────────────────────────────────────────────────────────────────────────────
SYMBOL = "RELIANCE.NS"
STATE_FILE = "bot_india_state.json"
HISTORY_FILE = "trade_history.csv"
INITIAL_CASH = 1000000.00  # 10 Lakhs (₹1,000,000.00)

# ─────────────────────────────────────────────────────────────────────────────
#  1. Dynamic Strategy Ingestion
# ─────────────────────────────────────────────────────────────────────────────
def get_strategy_function():
    try:
        module = importlib.import_module("strategies.india.nse_orb_vwap")
        return getattr(module, "nse_orb_vwap_strategy")
    except Exception as e:
        print(f"[ERROR] Failed to load strategy: {e}")
        sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
#  3. Persistent Local State Management Matrix
# ─────────────────────────────────────────────────────────────────────────────
def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"[ERROR] Failed to read state file {STATE_FILE}: {e}")
    
    # Default State
    return {
        "cash": INITIAL_CASH,
        "shares": 0,
        "in_position": False,
        "entry_price": 0.0
    }

def save_state(state: dict):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=4)

# ─────────────────────────────────────────────────────────────────────────────
#  4. Friction-Accurate Mock Execution Engine
# ─────────────────────────────────────────────────────────────────────────────
def calculate_buy_costs(shares: int, price: float) -> tuple:
    """Calculates all statutory costs and slippage for a buy order."""
    slippage_price = price * 1.0005  # 0.05% slippage penalty
    trade_value = shares * slippage_price
    
    brokerage = min(20.0, trade_value * 0.0003)
    exchange_fee = trade_value * 0.0000325
    sebi_fee = trade_value * 0.000001
    stamp_duty = trade_value * 0.00003  # Buy side only
    gst = (brokerage + exchange_fee + sebi_fee) * 0.18
    
    total_cost = trade_value + brokerage + exchange_fee + sebi_fee + stamp_duty + gst
    return slippage_price, total_cost

def calculate_sell_proceeds(shares: int, price: float) -> tuple:
    """Calculates all statutory costs and slippage for a sell order."""
    slippage_price = price * 0.9995  # 0.05% slippage penalty
    trade_value = shares * slippage_price
    
    brokerage = min(20.0, trade_value * 0.0003)
    exchange_fee = trade_value * 0.0000325
    sebi_fee = trade_value * 0.000001
    stt = trade_value * 0.00025  # STT for intraday equity sell side
    gst = (brokerage + exchange_fee + sebi_fee) * 0.18
    
    total_fees = brokerage + exchange_fee + sebi_fee + stt + gst
    total_proceeds = trade_value - total_fees
    return slippage_price, total_proceeds

def record_trade(action: str, symbol: str, shares: int, price: float, cash_change: float):
    file_exists = os.path.exists(HISTORY_FILE)
    with open(HISTORY_FILE, 'a', newline='') as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["Timestamp", "Action", "Symbol", "Shares", "Execution_Price", "Cash_Change"])
        writer.writerow([
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            action,
            symbol,
            shares,
            round(price, 2),
            round(cash_change, 2)
        ])

def execute_signal(signal: int, current_close: float, state: dict):
    if signal == 1 and not state["in_position"]:
        # BUY
        # Iteratively find max shares that can be afforded including all fees
        affordable_shares = int(state["cash"] / (current_close * 1.0005))
        while affordable_shares > 0:
            exec_price, total_cost = calculate_buy_costs(affordable_shares, current_close)
            if total_cost <= state["cash"]:
                break
            affordable_shares -= 1
            
        if affordable_shares > 0:
            state["cash"] -= total_cost
            state["shares"] = affordable_shares
            state["in_position"] = True
            state["entry_price"] = exec_price
            save_state(state)
            record_trade("BUY", SYMBOL, affordable_shares, exec_price, -total_cost)
            print(f"[EXECUTION] BUY {affordable_shares} shares of {SYMBOL} @ ₹{exec_price:.2f}. Cost: ₹{total_cost:.2f}")
        else:
            print(f"[EXECUTION] BUY signal ignored: Insufficient funds.")
            
    elif signal == -1 and state["in_position"]:
        # SELL
        shares_to_sell = state["shares"]
        exec_price, total_proceeds = calculate_sell_proceeds(shares_to_sell, current_close)
        
        trade_pnl = total_proceeds - (shares_to_sell * state["entry_price"])
        
        state["cash"] += total_proceeds
        state["shares"] = 0
        state["in_position"] = False
        state["entry_price"] = 0.0
        save_state(state)
        record_trade("SELL", SYMBOL, shares_to_sell, exec_price, total_proceeds)
        print(f"[EXECUTION] SELL {shares_to_sell} shares of {SYMBOL} @ ₹{exec_price:.2f}. Proceeds: ₹{total_proceeds:.2f}. PnL: ₹{trade_pnl:.2f}")

# ─────────────────────────────────────────────────────────────────────────────
#  2. Streaming Data Ingestion Pipeline
# ─────────────────────────────────────────────────────────────────────────────
def fetch_and_process_data() -> pd.DataFrame:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching rolling 5-day 5m data for {SYMBOL}...")
    df = yf.download(tickers=SYMBOL, period="5d", interval="5m", progress=False)
    
    if df.empty:
        print("[ERROR] No data returned from yfinance.")
        return df
        
    # Handle yfinance >= 0.2.x returning MultiIndex columns
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
        
    # Header string normalization to lowercase for backward compatibility
    df.columns = [c.lower() for c in df.columns]
    
    return df

# ─────────────────────────────────────────────────────────────────────────────
#  5. Precision Clock Synchronization & Main Loop
# ─────────────────────────────────────────────────────────────────────────────
def wait_for_next_interval():
    """Sleeps until exactly 5 seconds past the next 5-minute mark."""
    now = datetime.now()
    
    # Calculate minutes to next 5-minute boundary
    next_minute = ((now.minute // 5) + 1) * 5
    
    # Create target time
    if next_minute >= 60:
        target = now.replace(hour=now.hour + 1, minute=0, second=5, microsecond=0)
    else:
        target = now.replace(minute=next_minute, second=5, microsecond=0)
        
    # If the target jumped over midnight (unlikely during market hours but safe to handle)
    if target < now:
        target += timedelta(days=1)
        
    sleep_seconds = (target - now).total_seconds()
    print(f"[{now.strftime('%H:%M:%S')}] Sleeping for {sleep_seconds:.1f}s until next sync: {target.strftime('%H:%M:%S')}")
    time.sleep(sleep_seconds)

def is_market_open(now: datetime) -> bool:
    """Checks if current time is within Indian equity market hours (Mon-Fri, 09:15 - 15:30)."""
    if now.weekday() >= 5:  # Saturday = 5, Sunday = 6
        return False
        
    market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)
    
    return market_open <= now <= market_close

def main():
    print(f"===========================================================")
    print(f"  Live Mock Broker Execution Engine (India) - {SYMBOL}")
    print(f"===========================================================")
    
    strategy_func = get_strategy_function()
    print("[SYSTEM] Strategy dynamically loaded successfully.")
    
    state = load_state()
    print(f"[SYSTEM] Loaded State -> Cash: ₹{state['cash']:.2f} | Shares: {state['shares']} | In Position: {state['in_position']}")
    
    while True:
        now = datetime.now()
        if not is_market_open(now):
            print(f"[{now.strftime('%H:%M:%S')}] Outside market hours. Waiting for next market open...")
            # Sleep until 09:15 next valid day, or simply sleep 60s and check again
            time.sleep(60)
            continue
            
        wait_for_next_interval()
        
        # We are now at exactly past the 5-minute close. Fetch data.
        df = fetch_and_process_data()
        if df.empty:
            continue
            
        # Execute Strategy
        try:
            strategy_df = strategy_func(df)
            
            # Strictly evaluate the final row
            latest_row = strategy_df.iloc[-1]
            signal = int(latest_row.get("execution_signal", 0))
            current_close = float(latest_row["close"])
            
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Latest Close: ₹{current_close:.2f} | Strategy Signal: {signal}")
            
            # Pass to mock execution engine
            if signal != 0:
                state = load_state()  # Reload in case manual edits were made
                execute_signal(signal, current_close, state)
                
        except Exception as e:
            print(f"[ERROR] Strategy execution failed: {e}")

if __name__ == "__main__":
    main()
