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

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich import box
    console = Console()
    HAS_RICH = True
except ImportError:
    HAS_RICH = False
    console = None

# ─────────────────────────────────────────────────────────────────────────────
#  Configuration & Constants
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_SYMBOL = "RELIANCE.NS"
SYMBOL = DEFAULT_SYMBOL
INTERVAL = "5m"
DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)
STATE_FILE = os.path.join(DATA_DIR, "bot_india_state.json")
HISTORY_FILE = os.path.join(DATA_DIR, "trade_history.csv")
INITIAL_CASH = 1000000.00  # 10 Lakhs (₹1,000,000.00)
INTRA_CANDLE_POLL_SECONDS = 15  # Polling interval in seconds when in an active position
DEFAULT_STOP_LOSS_PCT = 0.010   # 1.0% Stop-Loss fallback if not specified by strategy
DEFAULT_TAKE_PROFIT_PCT = 0.020 # 2.0% Take-Profit fallback if not specified by strategy

# ─────────────────────────────────────────────────────────────────────────────
#  1. Dynamic Strategy Ingestion
# ─────────────────────────────────────────────────────────────────────────────
def get_strategy_function(strategy_name: str = "NSE Intraday ORB Breakout"):
    try:
        from strategies import get_strategy
        return get_strategy(strategy_name)
    except Exception:
        # Fallback to direct import
        try:
            module = importlib.import_module("strategies.india.nse_orb_breakout")
            return getattr(module, "nse_orb_breakout_strategy")
        except Exception:
            module = importlib.import_module("strategies.india.nse_orb_vwap")
            return getattr(module, "nse_orb_vwap_strategy")

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
        "position_side": None,
        "entry_price": 0.0,
        "entry_total_cost": 0.0,
        "stop_loss": None,
        "target_price": None
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
    exchange_fee = trade_value * 0.0000297  # NSE cash transaction charge (0.00297%)
    sebi_fee = trade_value * 0.000001        # SEBI turnover fee (₹10/crore)
    stamp_duty = trade_value * 0.00003       # Stamp duty on Buy side (0.003%)
    gst = (brokerage + exchange_fee + sebi_fee) * 0.18  # 18% GST
    
    total_cost = trade_value + brokerage + exchange_fee + sebi_fee + stamp_duty + gst
    return slippage_price, total_cost

def calculate_sell_proceeds(shares: int, price: float) -> tuple:
    """Calculates all statutory costs and slippage for a sell order."""
    slippage_price = price * 0.9995  # 0.05% slippage penalty
    trade_value = shares * slippage_price
    
    brokerage = min(20.0, trade_value * 0.0003)
    exchange_fee = trade_value * 0.0000297  # NSE cash transaction charge (0.00297%)
    sebi_fee = trade_value * 0.000001        # SEBI turnover fee (₹10/crore)
    stt = trade_value * 0.00025              # STT for intraday equity sell side (0.025%)
    gst = (brokerage + exchange_fee + sebi_fee) * 0.18  # 18% GST
    
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

def execute_signal(signal: int, current_close: float, state: dict, stop_loss: float = 0.0, target_price: float = 0.0, exit_reason: str = "STRATEGY SIGNAL"):
    if signal == 1 and not state.get("in_position", False):
        # LONG BUY ENTRY
        affordable_shares = int(state["cash"] / (current_close * 1.0005))
        while affordable_shares > 0:
            exec_price, total_cost = calculate_buy_costs(affordable_shares, current_close)
            if total_cost <= state["cash"]:
                break
            affordable_shares -= 1
            
        if affordable_shares > 0:
            sl = round(stop_loss, 2) if (stop_loss and stop_loss > 0) else round(exec_price * (1.0 - DEFAULT_STOP_LOSS_PCT), 2)
            tp = round(target_price, 2) if (target_price and target_price > 0) else round(exec_price * (1.0 + DEFAULT_TAKE_PROFIT_PCT), 2)

            state["cash"] -= total_cost
            state["shares"] = affordable_shares
            state["in_position"] = True
            state["position_side"] = "LONG"
            state["entry_price"] = exec_price
            state["entry_total_cost"] = total_cost
            state["stop_loss"] = sl
            state["target_price"] = tp
            save_state(state)
            record_trade("BUY", SYMBOL, affordable_shares, exec_price, -total_cost)
            if HAS_RICH and console:
                console.print(f"[bold green]🟢 [EXECUTION] BUY (LONG) {affordable_shares} shares of {SYMBOL} @ ₹{exec_price:.2f}[/bold green] (Cost: ₹{total_cost:,.2f} │ Stop: [red]₹{sl:.2f}[/red] │ Target: [green]₹{tp:.2f}[/green])")
            else:
                print(f"[EXECUTION] BUY (LONG) {affordable_shares} shares of {SYMBOL} @ ₹{exec_price:.2f}. Cost: ₹{total_cost:.2f} | Stop: ₹{sl:.2f} | Target: ₹{tp:.2f}")
        else:
            if HAS_RICH and console:
                console.print("[yellow]⚠️  [EXECUTION] BUY signal ignored: Insufficient funds.[/yellow]")
            else:
                print(f"[EXECUTION] BUY signal ignored: Insufficient funds.")

    elif signal == 1 and state.get("in_position", False) and state.get("position_side") == "SHORT":
        # SHORT COVER EXIT
        shares_to_cover = state["shares"]
        exec_price, total_cost = calculate_buy_costs(shares_to_cover, current_close)
        
        entry_margin = state.get("entry_total_cost", shares_to_cover * state["entry_price"])
        gross_pnl = shares_to_cover * (state["entry_price"] - exec_price)
        initial_fees = entry_margin - (shares_to_cover * state["entry_price"])
        exit_fees = total_cost - (shares_to_cover * exec_price)
        trade_pnl = gross_pnl - (initial_fees + exit_fees)
        
        state["cash"] += entry_margin + trade_pnl
        state["shares"] = 0
        state["in_position"] = False
        state["position_side"] = None
        state["entry_price"] = 0.0
        state["entry_total_cost"] = 0.0
        state["stop_loss"] = None
        state["target_price"] = None
        save_state(state)
        record_trade("COVER", SYMBOL, shares_to_cover, exec_price, entry_margin + trade_pnl)
        pnl_color = "bold green" if trade_pnl >= 0 else "bold red"
        if HAS_RICH and console:
            console.print(f"[{pnl_color}]🟢 [EXECUTION] COVER (SHORT) {shares_to_cover} shares of {SYMBOL} @ ₹{exec_price:.2f}[/{pnl_color}] (PnL: [{pnl_color}]₹{trade_pnl:+,.2f}[/{pnl_color}] │ Reason: [bold]{exit_reason}[/bold])")
        else:
            print(f"[EXECUTION] COVER (SHORT) {shares_to_cover} shares of {SYMBOL} @ ₹{exec_price:.2f}. PnL: ₹{trade_pnl:.2f} | Reason: {exit_reason}")

    elif signal == -1 and not state.get("in_position", False):
        # SHORT SELL ENTRY
        affordable_shares = int(state["cash"] / (current_close * 1.0005))
        while affordable_shares > 0:
            exec_price, proceeds = calculate_sell_proceeds(affordable_shares, current_close)
            fees = (affordable_shares * exec_price) - proceeds
            margin_required = (affordable_shares * exec_price) + fees
            if margin_required <= state["cash"]:
                break
            affordable_shares -= 1

        if affordable_shares > 0:
            sl = round(stop_loss, 2) if (stop_loss and stop_loss > 0) else round(exec_price * (1.0 + DEFAULT_STOP_LOSS_PCT), 2)
            tp = round(target_price, 2) if (target_price and target_price > 0) else round(exec_price * (1.0 - DEFAULT_TAKE_PROFIT_PCT), 2)

            state["cash"] -= margin_required
            state["shares"] = affordable_shares
            state["in_position"] = True
            state["position_side"] = "SHORT"
            state["entry_price"] = exec_price
            state["entry_total_cost"] = margin_required
            state["stop_loss"] = sl
            state["target_price"] = tp
            save_state(state)
            record_trade("SHORT", SYMBOL, affordable_shares, exec_price, -margin_required)
            if HAS_RICH and console:
                console.print(f"[bold red]🔴 [EXECUTION] SHORT {affordable_shares} shares of {SYMBOL} @ ₹{exec_price:.2f}[/bold red] (Margin: ₹{margin_required:,.2f} │ Stop: [red]₹{sl:.2f}[/red] │ Target: [green]₹{tp:.2f}[/green])")
            else:
                print(f"[EXECUTION] SHORT {affordable_shares} shares of {SYMBOL} @ ₹{exec_price:.2f}. Margin: ₹{margin_required:.2f} | Stop: ₹{sl:.2f} | Target: ₹{tp:.2f}")
        else:
            if HAS_RICH and console:
                console.print("[yellow]⚠️  [EXECUTION] SHORT signal ignored: Insufficient funds.[/yellow]")
            else:
                print(f"[EXECUTION] SHORT signal ignored: Insufficient funds.")
            
    elif signal == -1 and state.get("in_position", False) and state.get("position_side", "LONG") == "LONG":
        # LONG SELL EXIT
        shares_to_sell = state["shares"]
        exec_price, total_proceeds = calculate_sell_proceeds(shares_to_sell, current_close)
        
        buy_outflow = state.get("entry_total_cost", shares_to_sell * state["entry_price"])
        trade_pnl = total_proceeds - buy_outflow
        
        state["cash"] += total_proceeds
        state["shares"] = 0
        state["in_position"] = False
        state["position_side"] = None
        state["entry_price"] = 0.0
        state["entry_total_cost"] = 0.0
        state["stop_loss"] = None
        state["target_price"] = None
        save_state(state)
        record_trade("SELL", SYMBOL, shares_to_sell, exec_price, total_proceeds)
        pnl_color = "bold green" if trade_pnl >= 0 else "bold red"
        if HAS_RICH and console:
            console.print(f"[{pnl_color}]🔴 [EXECUTION] SELL (LONG) {shares_to_sell} shares of {SYMBOL} @ ₹{exec_price:.2f}[/{pnl_color}] (Proceeds: ₹{total_proceeds:,.2f} │ PnL: [{pnl_color}]₹{trade_pnl:+,.2f}[/{pnl_color}] │ Reason: [bold]{exit_reason}[/bold])")
        else:
            print(f"[EXECUTION] SELL (LONG) {shares_to_sell} shares of {SYMBOL} @ ₹{exec_price:.2f}. Proceeds: ₹{total_proceeds:.2f}. PnL: ₹{trade_pnl:.2f} | Reason: {exit_reason}")

# ─────────────────────────────────────────────────────────────────────────────
#  2. Streaming Data Ingestion Pipeline
# ─────────────────────────────────────────────────────────────────────────────
def fetch_and_process_data(symbol: str, interval: str = "5m", max_retries: int = 3) -> pd.DataFrame:
    """Fetches rolling 5-day candle data with auto-retry and multi-endpoint fallback."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching rolling 5-day {interval} data for {symbol}...")
    
    for attempt in range(1, max_retries + 1):
        try:
            df = yf.download(tickers=symbol, period="5d", interval=interval, progress=False)
            if not df.empty:
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.droplevel(1)
                df.columns = [c.lower() for c in df.columns]
                return df
        except Exception:
            pass

        # Fallback to Ticker.history endpoint
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period="5d", interval=interval)
            if not df.empty:
                df.columns = [c.lower() for c in df.columns]
                return df
        except Exception:
            pass

        if attempt < max_retries:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚠️  Transient data fetch issue. Retrying ({attempt}/{max_retries})...")
            time.sleep(2.5)

    print(f"[ERROR] No data returned from yfinance for {symbol} after {max_retries} attempts.")
    return pd.DataFrame()

def fetch_current_price(symbol: str) -> Optional[float]:
    """Fetches real-time Last Traded Price (LTP) with multiple fallback paths."""
    try:
        t = yf.Ticker(symbol)
        price = t.fast_info.get("last_price")
        if price is not None and not np.isnan(price) and price > 0:
            return float(price)
    except Exception:
        pass

    try:
        df = yf.download(tickers=symbol, period="1d", interval="1m", progress=False)
        if not df.empty:
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.droplevel(1)
            df.columns = [c.lower() for c in df.columns]
            return float(df["close"].iloc[-1])
    except Exception:
        pass
    return None

def get_next_candle_target(interval_minutes: int = 5) -> datetime:
    """Calculates the target datetime for exactly 5 seconds past the next candle boundary."""
    now = datetime.now()
    next_minute = ((now.minute // interval_minutes) + 1) * interval_minutes
    if next_minute >= 60:
        target = now.replace(hour=(now.hour + 1) % 24, minute=0, second=5, microsecond=0)
    else:
        target = now.replace(minute=next_minute, second=5, microsecond=0)
    if target < now:
        target += timedelta(days=1)
    return target

# ─────────────────────────────────────────────────────────────────────────────
#  5. Precision Clock Synchronization & Main Loop
# ─────────────────────────────────────────────────────────────────────────────
def wait_for_next_interval(interval_minutes: int = 5):
    """Sleeps until exactly 5 seconds past the next candle boundary."""
    now = datetime.now()
    target = get_next_candle_target(interval_minutes)
    sleep_seconds = (target - now).total_seconds()
    print(f"[{now.strftime('%H:%M:%S')}] Sleeping for {sleep_seconds:.1f}s until next candle close: {target.strftime('%H:%M:%S')}")
    time.sleep(sleep_seconds)

def is_market_open(now: datetime) -> bool:
    """Checks if current time is within Indian equity market hours (Mon-Fri, 09:15 - 15:30)."""
    if now.weekday() >= 5:  # Saturday = 5, Sunday = 6
        return False
        
    market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)
    
    return market_open <= now <= market_close

def main():
    global SYMBOL, STATE_FILE, INTERVAL

    if HAS_RICH and console:
        console.print()
        console.print(Panel(
            "[bold cyan]🇮🇳  NSE Intraday Paper-Trading Bot[/bold cyan]\n"
            "[dim white]Real-time Candle Synchronization • Idempotent State Engine • Accurate Friction Simulation[/dim white]",
            box=box.DOUBLE,
            border_style="bright_blue",
            padding=(0, 2)
        ))
        console.print()
    else:
        print(f"===========================================================")
        print(f"  Live Mock Broker Execution Engine (India)")
        print(f"===========================================================")

    # 1. Interactive Stock Selection
    INDIAN_PRESETS = [
        ("RELIANCE.NS", "Reliance Industries Ltd.", "Energy & Conglomerate", "[Default]"),
        ("HDFCBANK.NS", "HDFC Bank Ltd.", "Private Banking", ""),
        ("TCS.NS", "Tata Consultancy Services Ltd.", "Information Technology", ""),
        ("INFY.NS", "Infosys Ltd.", "Information Technology", ""),
        ("SBIN.NS", "State Bank of India", "PSU Banking", ""),
        ("ICICIBANK.NS", "ICICI Bank Ltd.", "Private Banking", ""),
        ("TATAMOTORS.NS", "Tata Motors Ltd.", "Automotive", ""),
        ("^NSEI", "Nifty 50 Index", "Benchmark Index", ""),
    ]

    if HAS_RICH and console:
        sym_table = Table(title="📈 Step 1: Select NSE Stock to Trade", box=box.ROUNDED, header_style="bold cyan")
        sym_table.add_column("#", justify="center", min_width=3, no_wrap=True, style="bold yellow")
        sym_table.add_column("Ticker", style="bold green", no_wrap=True)
        sym_table.add_column("Company / Asset", style="bold white")
        sym_table.add_column("Sector", style="dim cyan")
        sym_table.add_column("Default", justify="center", no_wrap=True, style="bold green")

        for idx, (sym, name, sector, is_def) in enumerate(INDIAN_PRESETS, 1):
            sym_table.add_row(str(idx), sym, name, sector, is_def)
        sym_table.add_row("9", "Custom Ticker", "Enter any custom NSE ticker", "User Defined", "")
        console.print(sym_table)
        sym_choice = console.input("[bold yellow]Enter choice [1-9 or type ticker, default 1]: [/bold yellow]").strip()
    else:
        print("1. Select Stock to Trade:")
        for idx, (sym, name, sector, is_def) in enumerate(INDIAN_PRESETS, 1):
            print(f"   {idx}. {sym:<16} — {name}")
        print("   9. Enter custom ticker...")
        try:
            sym_choice = input("Enter choice [1-9, default 1]: ").strip()
        except (EOFError, KeyboardInterrupt):
            sym_choice = "1"

    if not sym_choice or sym_choice == "1":
        SYMBOL = "RELIANCE.NS"
    elif sym_choice.isdigit() and 1 <= int(sym_choice) <= len(INDIAN_PRESETS):
        SYMBOL = INDIAN_PRESETS[int(sym_choice) - 1][0]
    elif sym_choice == "9":
        prompt = "[bold yellow]Enter custom NSE ticker (e.g. BAJFINANCE.NS): [/bold yellow]" if HAS_RICH and console else "Enter custom NSE ticker (e.g. BAJFINANCE.NS): "
        try:
            custom_sym = (console.input(prompt) if HAS_RICH and console else input(prompt)).strip().upper()
        except (EOFError, KeyboardInterrupt):
            custom_sym = "RELIANCE.NS"
        if custom_sym and not custom_sym.endswith(".NS") and not custom_sym.startswith("^"):
            custom_sym += ".NS"
        SYMBOL = custom_sym or "RELIANCE.NS"
    else:
        custom_sym = sym_choice.upper()
        if not custom_sym.endswith(".NS") and not custom_sym.startswith("^"):
            custom_sym += ".NS"
        SYMBOL = custom_sym

    clean_sym = SYMBOL.replace(".", "_").replace("^", "")
    STATE_FILE = os.path.join(DATA_DIR, f"bot_india_state_{clean_sym}.json")
    # Fallback to root if previously saved there
    if not os.path.exists(STATE_FILE) and os.path.exists(f"bot_india_state_{clean_sym}.json"):
        STATE_FILE = f"bot_india_state_{clean_sym}.json"

    # 2. Interactive Strategy Selection
    from strategies import list_strategies, get_strategy
    all_strats = list_strategies()
    indian_strats = [s for s in all_strats if s.get('market', 'US') in ('INDIA', 'ALL')]

    if HAS_RICH and console:
        strat_table = Table(title="🎯 Step 2: Select Intraday Strategy", box=box.ROUNDED, header_style="bold cyan")
        strat_table.add_column("#", justify="center", min_width=3, no_wrap=True, style="bold yellow")
        strat_table.add_column("Strategy Name", style="bold white", no_wrap=True)
        strat_table.add_column("Description", style="dim white")

        for idx, s in enumerate(indian_strats, 1):
            strat_table.add_row(str(idx), s['name'], s['description'])
        console.print(strat_table)

        strat_choice = console.input(f"[bold yellow]Enter choice [1-{len(indian_strats)}, default 1]: [/bold yellow]").strip()
    else:
        print("2. Select Strategy:")
        for idx, s in enumerate(indian_strats, 1):
            print(f"   {idx}. {s['name']:<28} — {s['description']}")
        try:
            strat_choice = input(f"Enter choice [1-{len(indian_strats)}, default 1]: ").strip()
        except (EOFError, KeyboardInterrupt):
            strat_choice = "1"

    if strat_choice.isdigit() and 1 <= int(strat_choice) <= len(indian_strats):
        selected_strat_name = indian_strats[int(strat_choice) - 1]['name']
    else:
        selected_strat_name = indian_strats[0]['name'] if indian_strats else "NSE Intraday ORB Breakout"

    strategy_func = get_strategy(selected_strat_name)

    # 3. Interactive Candle Interval Selection
    CANDLE_OPTIONS = [
        ("1m", "1-Minute Bars", "Fast Scalping & High-Frequency Signals", 1),
        ("2m", "2-Minute Bars", "Micro-Momentum & Clean Pullbacks", 2),
        ("5m", "5-Minute Bars", "Intraday Momentum & Breakouts [Default]", 5),
        ("15m", "15-Minute Bars", "Short-term Momentum", 15),
        ("30m", "30-Minute Bars", "Multi-hour Trend Following", 30),
    ]

    if HAS_RICH and console:
        tf_table = Table(title="⏱️  Step 3: Select Candle Timeframe", box=box.ROUNDED, header_style="bold cyan")
        tf_table.add_column("#", justify="center", min_width=3, no_wrap=True, style="bold yellow")
        tf_table.add_column("Timeframe", style="bold green", no_wrap=True)
        tf_table.add_column("Description", style="bold white")
        tf_table.add_column("Recommended Strategy Context", style="dim cyan")

        for idx, (tf, desc, context, _) in enumerate(CANDLE_OPTIONS, 1):
            tf_table.add_row(str(idx), tf, desc, context)
        console.print(tf_table)
        interval_choice = console.input("[bold yellow]Enter choice [1-5, default 3 for 5m]: [/bold yellow]").strip()
    else:
        print("3. Select Candle Interval:")
        for idx, (tf, desc, context, _) in enumerate(CANDLE_OPTIONS, 1):
            print(f"   {idx}. {tf:<6} — {desc}")
        try:
            interval_choice = input("Enter choice [1-5, default 3 for 5m]: ").strip()
        except (EOFError, KeyboardInterrupt):
            interval_choice = "3"

    if interval_choice == "1" or interval_choice.lower() == "1m":
        INTERVAL = "1m"
        interval_minutes = 1
    elif interval_choice == "2" or interval_choice.lower() == "2m":
        INTERVAL = "2m"
        interval_minutes = 2
    elif interval_choice == "4" or interval_choice.lower() == "15m":
        INTERVAL = "15m"
        interval_minutes = 15
    elif interval_choice == "5" or interval_choice.lower() == "30m":
        INTERVAL = "30m"
        interval_minutes = 30
    else:
        INTERVAL = "5m"
        interval_minutes = 5

    state = load_state()

    # Active Bot Dashboard
    if HAS_RICH and console:
        console.print()
        if state['in_position']:
            side = state.get('position_side', 'LONG')
            pos_str = f"[bold green]{side} {state['shares']} shares @ ₹{state['entry_price']:.2f}[/bold green]"
            sl = state.get('stop_loss')
            tp = state.get('target_price')
            sl_str = f"₹{sl:,.2f}" if sl else "N/A"
            tp_str = f"₹{tp:,.2f}" if tp else "N/A"
            pos_str += f"\n[bold white]Stop-Loss:[/bold white]        [bold red]{sl_str}[/bold red]     [bold white]Target Price:[/bold white] [bold green]{tp_str}[/bold green]"
        else:
            pos_str = "[dim]No active position (FLAT)[/dim]"

        dashboard_content = (
            f"[bold white]Target Ticker:[/bold white]      [bold green]{SYMBOL}[/bold green]         "
            f"[bold white]Timeframe:[/bold white]    [bold yellow]{INTERVAL}[/bold yellow]\n"
            f"[bold white]Active Strategy:[/bold white]    [bold cyan]{selected_strat_name}[/bold cyan]\n"
            f"[bold white]Cash Balance:[/bold white]       [bold white]₹{state['cash']:,.2f}[/bold white]    "
            f"[bold white]Position:[/bold white]     {pos_str}\n"
            f"[bold white]State File:[/bold white]         [dim]{STATE_FILE}[/dim]\n"
            f"[bold white]Trade Journal:[/bold white]      [dim]{HISTORY_FILE}[/dim]\n"
            f"[bold white]Trading Session:[/bold white]    [bold magenta]09:15 - 15:30 IST (Mon-Fri)[/bold magenta]\n"
            f"[bold white]Intra-Candle Monitor:[/bold white] [bold green]Active (every {INTRA_CANDLE_POLL_SECONDS}s while in position)[/bold green]"
        )
        console.print(Panel(
            dashboard_content,
            title="🟢 Live Paper-Trading Dashboard",
            box=box.ROUNDED,
            border_style="bright_green",
            padding=(0, 2)
        ))
        console.print("[dim]Press Ctrl+C to terminate bot at any time.[/dim]\n")
    else:
        print(f"[CONFIG] Active Ticker: {SYMBOL} | Interval: {INTERVAL} | Strategy: {selected_strat_name}")
        print(f"[SYSTEM] Loaded State -> Cash: ₹{state['cash']:.2f} | Shares: {state['shares']} | In Position: {state['in_position']}")
        print(f"[SYSTEM] Bot is running with intra-candle monitoring ({INTRA_CANDLE_POLL_SECONDS}s). Press Ctrl+C to terminate.")
    
    while True:
        now = datetime.now()
        if not is_market_open(now):
            print(f"[{now.strftime('%H:%M:%S')}] Outside market hours. Waiting for next market open...")
            time.sleep(60)
            continue
            
        target_time = get_next_candle_target(interval_minutes=interval_minutes)
        state = load_state()

        if not state.get("in_position", False):
            # ── FLAT: Sleep until next candle boundary to evaluate entry signals ──
            sleep_sec = (target_time - datetime.now()).total_seconds()
            if sleep_sec > 0:
                if HAS_RICH and console:
                    console.print(f"[dim][{datetime.now().strftime('%H:%M:%S')}] [FLAT] Sleeping {sleep_sec:.1f}s until next candle close: {target_time.strftime('%H:%M:%S')}[/dim]")
                else:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] [FLAT] Sleeping for {sleep_sec:.1f}s until next candle close: {target_time.strftime('%H:%M:%S')}")
                time.sleep(sleep_sec)
        else:
            # ── IN POSITION: Real-time Intra-Candle Fast Monitoring Loop ──────
            side = state.get("position_side", "LONG")
            sl = state.get("stop_loss")
            tp = state.get("target_price")
            sl_fmt = f"₹{sl:,.2f}" if sl else "None"
            tp_fmt = f"₹{tp:,.2f}" if tp else "None"

            if HAS_RICH and console:
                console.print(f"[bold cyan]⚡ [ACTIVE MONITOR] In {side} position │ Stop: [red]{sl_fmt}[/red] │ Target: [green]{tp_fmt}[/green] │ Polling every {INTRA_CANDLE_POLL_SECONDS}s until {target_time.strftime('%H:%M:%S')}[/bold cyan]")
            else:
                print(f"[ACTIVE MONITOR] In {side} position | Stop: {sl_fmt} | Target: {tp_fmt} | Polling every {INTRA_CANDLE_POLL_SECONDS}s until {target_time.strftime('%H:%M:%S')}")

            position_closed_early = False
            while datetime.now() < target_time:
                remaining_sec = (target_time - datetime.now()).total_seconds()
                sleep_slice = min(float(INTRA_CANDLE_POLL_SECONDS), remaining_sec)
                if sleep_slice > 0:
                    time.sleep(sleep_slice)

                if datetime.now() >= target_time:
                    break

                # Fetch real-time Last Traded Price (LTP)
                current_ltp = fetch_current_price(SYMBOL)
                if current_ltp is None:
                    continue

                # Live Unrealized PnL Calculation
                pnl_per_share = (current_ltp - state["entry_price"]) if side == "LONG" else (state["entry_price"] - current_ltp)
                pnl_color = "bold green" if pnl_per_share >= 0 else "bold red"
                
                if HAS_RICH and console:
                    console.print(
                        f"[dim]{datetime.now().strftime('%H:%M:%S')}[/dim] ⚡ [bold white]LTP: ₹{current_ltp:,.2f}[/bold white] │ "
                        f"Target: [green]{tp_fmt}[/green] │ Stop: [red]{sl_fmt}[/red] │ "
                        f"Unrealized: [{pnl_color}]₹{pnl_per_share:+,.2f}/sh[/{pnl_color}]"
                    )
                else:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] LTP: ₹{current_ltp:.2f} | Target: {tp_fmt} | Stop: {sl_fmt} | Unrealized: ₹{pnl_per_share:+.2f}/sh")

                # Check Stop-Loss and Target Violations Immediately
                if side == "LONG":
                    if sl is not None and current_ltp <= sl:
                        if HAS_RICH and console:
                            console.print(f"[bold red]🛑 [INTRA-CANDLE EXIT] STOP-LOSS triggered: LTP ₹{current_ltp:,.2f} <= Stop ₹{sl:,.2f}![/bold red]")
                        else:
                            print(f"[INTRA-CANDLE EXIT] STOP-LOSS triggered: LTP ₹{current_ltp:.2f} <= Stop ₹{sl:.2f}!")
                        execute_signal(-1, current_ltp, state, exit_reason="STOP LOSS (INTRA-CANDLE)")
                        position_closed_early = True
                        break
                    elif tp is not None and current_ltp >= tp:
                        if HAS_RICH and console:
                            console.print(f"[bold green]🎯 [INTRA-CANDLE EXIT] TARGET HIT: LTP ₹{current_ltp:,.2f} >= Target ₹{tp:,.2f}![/bold green]")
                        else:
                            print(f"[INTRA-CANDLE EXIT] TARGET HIT: LTP ₹{current_ltp:.2f} >= Target ₹{tp:.2f}!")
                        execute_signal(-1, current_ltp, state, exit_reason="TARGET HIT (INTRA-CANDLE)")
                        position_closed_early = True
                        break

                elif side == "SHORT":
                    if sl is not None and current_ltp >= sl:
                        if HAS_RICH and console:
                            console.print(f"[bold red]🛑 [INTRA-CANDLE EXIT] STOP-LOSS triggered: LTP ₹{current_ltp:,.2f} >= Stop ₹{sl:,.2f}![/bold red]")
                        else:
                            print(f"[INTRA-CANDLE EXIT] STOP-LOSS triggered: LTP ₹{current_ltp:.2f} >= Stop ₹{sl:.2f}!")
                        execute_signal(1, current_ltp, state, exit_reason="STOP LOSS (INTRA-CANDLE)")
                        position_closed_early = True
                        break
                    elif tp is not None and current_ltp <= tp:
                        if HAS_RICH and console:
                            console.print(f"[bold green]🎯 [INTRA-CANDLE EXIT] TARGET HIT: LTP ₹{current_ltp:,.2f} <= Target ₹{tp:,.2f}![/bold green]")
                        else:
                            print(f"[INTRA-CANDLE EXIT] TARGET HIT: LTP ₹{current_ltp:.2f} <= Target ₹{tp:.2f}!")
                        execute_signal(1, current_ltp, state, exit_reason="TARGET HIT (INTRA-CANDLE)")
                        position_closed_early = True
                        break

            if position_closed_early:
                # Wait until the current candle boundary finishes before seeking fresh entries
                remaining = (target_time - datetime.now()).total_seconds()
                if remaining > 0:
                    time.sleep(remaining)
                continue

        # ── Regular Candle Boundary Execution ─────────────────────────────────
        df = fetch_and_process_data(SYMBOL, interval=INTERVAL)
        if df.empty:
            continue
            
        try:
            strategy_df = strategy_func(df)
            
            # Strictly evaluate the final completed candle
            latest_row = strategy_df.iloc[-1]
            signal = int(latest_row.get("execution_signal", 0))
            current_close = float(latest_row["close"])
            strat_sl = float(latest_row.get("stop_loss", 0.0))
            strat_tp = float(latest_row.get("target_price", 0.0))
            
            if HAS_RICH and console:
                sig_text = "[bold green]BUY (1)[/bold green]" if signal == 1 else ("[bold red]SELL (-1)[/bold red]" if signal == -1 else "[dim]HOLD (0)[/dim]")
                console.print(f"[dim]{datetime.now().strftime('%H:%M:%S')}[/dim] 📊 Candle Close: [bold white]₹{current_close:,.2f}[/bold white] | Signal: {sig_text}")
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Latest Close: ₹{current_close:.2f} | Strategy Signal: {signal}")
            
            # Execute on non-zero signal
            if signal != 0:
                state = load_state()
                execute_signal(
                    signal,
                    current_close,
                    state,
                    stop_loss=strat_sl,
                    target_price=strat_tp,
                    exit_reason="CANDLE CLOSE SIGNAL"
                )
                
        except Exception as e:
            if HAS_RICH and console:
                console.print(f"[bold red]❌ [ERROR] Strategy execution failed: {e}[/bold red]")
            else:
                print(f"[ERROR] Strategy execution failed: {e}")

if __name__ == "__main__":
    main()
