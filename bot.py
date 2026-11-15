import os
import sys
import time
import csv

# Force UTF-8 output for Windows console compatibility
sys.stdout.reconfigure(encoding='utf-8')
os.system('') # Enable ANSI escape codes in Windows console

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    RESET = '\033[0m'

from datetime import datetime, timedelta, timezone
import pandas as pd
from dotenv import load_dotenv

from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest, TakeProfitRequest, StopLossRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.data.enums import DataFeed

# 1. Configuration Management
load_dotenv()

ALPACA_API_KEY = os.getenv("ALPACA_API_KEY")
ALPACA_SECRET_KEY = os.getenv("ALPACA_SECRET_KEY")

if not ALPACA_API_KEY or not ALPACA_SECRET_KEY:
    raise ValueError("Missing API keys. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY in your .env file.")

# 2. API Client Initialization
trading_client = TradingClient(ALPACA_API_KEY, ALPACA_SECRET_KEY, paper=True)
data_client = StockHistoricalDataClient(ALPACA_API_KEY, ALPACA_SECRET_KEY)

# Portfolio Configuration
WATCHLIST = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"]
ALLOCATION_PER_TRADE_PCT = 0.05  # 5% of liquid cash per trade

# 3. Account Verification System
def verify_account() -> bool:
    """
    Tests connection health by retrieving account details.
    """
    try:
        account = trading_client.get_account()
        print("=== Account Verification ===")
        print(f"Account Number      : {account.account_number}")
        print(f"Liquid Cash Balance : ${float(account.cash):,.2f}")
        print(f"Buying Power        : ${float(account.buying_power):,.2f}")
        print("============================")
        return True
    except Exception as e:
        print(f"Failed to verify account: {e}")
        return False

# 4. Multi-Index Aware Data Pipeline
def get_5min_bars(symbol: str) -> pd.DataFrame | None:
    """
    Retrieves 5-minute interval historical bars for the trailing 3 days.
    """
    try:
        end_dt = datetime.now(timezone.utc)
        start_dt = end_dt - timedelta(days=3)

        request_params = StockBarsRequest(
            symbol_or_symbols=symbol,
            timeframe=TimeFrame(5, TimeFrameUnit.Minute),
            start=start_dt,
            end=end_dt,
            feed=DataFeed.IEX
        )

        bars = data_client.get_stock_bars(request_params)
        
        if bars.df.empty:
            return None
            
        df = bars.df
        
        # CRITICAL FIX: explicitly flatten or isolate the index 
        # so resulting DataFrame uses a standard single index of timestamps
        df = df.loc[symbol]
        
        return df[['open', 'high', 'low', 'close', 'volume']]
    except Exception as e:
        print(f"Error fetching 5-min bars for {symbol}: {e}")
        return None

# 5. Signal Generation Logic
def calculate_signals(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculates short-term and long-term SMAs, drops NaNs, and detects crossovers.
    Generates 'BUY', 'SELL', or 'HOLD' signals based on the crossover.
    """
    # Calculate SMAs
    df['fast_sma'] = df['close'].rolling(window=9).mean()
    df['slow_sma'] = df['close'].rolling(window=21).mean()
    
    # Drop rows containing NaN values from rolling windows
    df = df.dropna().copy()
    
    # Shift SMAs to get the previous period's value for crossover detection
    prev_fast = df['fast_sma'].shift(1)
    prev_slow = df['slow_sma'].shift(1)
    
    # Initialize signal column with 'HOLD'
    df['signal'] = 'HOLD'
    
    # BUY signal: fast_sma crossed ABOVE slow_sma
    # This means currently fast > slow AND previously fast <= slow
    buy_conditions = (df['fast_sma'] > df['slow_sma']) & (prev_fast <= prev_slow)
    df.loc[buy_conditions, 'signal'] = 'BUY'
    
    # SELL signal: fast_sma crossed BELOW slow_sma
    # This means currently fast < slow AND previously fast >= slow
    sell_conditions = (df['fast_sma'] < df['slow_sma']) & (prev_fast >= prev_slow)
    df.loc[sell_conditions, 'signal'] = 'SELL'
    
    return df

# 6. CSV Trade Audit Logger
def log_trade_to_csv(symbol: str, side: str, qty: int, price: float,
                     order_id: str, tp: float = None, sl: float = None) -> None:
    """
    Appends a completed trade record to trade_history.csv.
    Creates the file with headers if it does not exist.
    """
    data_dir = "data"
    os.makedirs(data_dir, exist_ok=True)
    csv_file = os.path.join(data_dir, "trade_history.csv")
    headers = ["timestamp", "symbol", "side", "quantity", "execution_price",
               "order_id", "take_profit", "stop_loss"]
    file_exists = os.path.isfile(csv_file)

    try:
        with open(csv_file, mode="a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(headers)
            writer.writerow([
                datetime.now().isoformat(),
                symbol,
                side,
                qty,
                price,
                order_id,
                tp if tp is not None else "",
                sl if sl is not None else ""
            ])
        print(f"📝 Trade logged to {csv_file}")
    except Exception as e:
        print(f"⚠️  Failed to log trade to CSV: {e}")

# 7. Position Checker
def get_open_position(symbol: str):
    """
    Checks the current open position for a given symbol.
    Returns the position object, or None if no position exists.
    """
    try:
        positions = trading_client.get_all_positions()
        for position in positions:
            if position.symbol == symbol:
                return position
        return None
    except Exception as e:
        print(f"Error checking positions for {symbol}: {e}")
        return None

# 7. Order Execution Layer (Bracket Orders + Dynamic Capital Allocation)
def execute_trade(symbol: str, signal: str, latest_close: float, current_cash: float) -> None:
    """
    Executes a trade based on the latest signal and current position state.
    BUY entries dynamically size the position using ALLOCATION_PER_TRADE_PCT
    of current liquid cash, then submit a bracket order with a 2% take-profit
    and 1% stop-loss managed server-side by Alpaca.
    SELL signals liquidate the position and cancel any remaining bracket legs.
    """
    try:
        position = get_open_position(symbol)
        current_qty = float(position.qty) if position else 0.0
        
        signal_color = Colors.GREEN if signal == 'BUY' else (Colors.RED if signal == 'SELL' else '')
        signal_display = f"{signal_color}{signal}{Colors.RESET}" if signal_color else signal

        print(f"\n=== Trade Execution for {symbol} ===")
        print(f"Latest Signal  : {signal_display}")
        print(f"Latest Close   : ${latest_close:,.2f}")
        print(f"Available Cash : ${current_cash:,.2f}")
        print(f"Current Position: {current_qty} shares")

        if signal == 'BUY' and current_qty == 0:
            # Dynamic position sizing: 5% of liquid cash
            cash_to_risk = current_cash * ALLOCATION_PER_TRADE_PCT
            qty = int(cash_to_risk / latest_close)

            # Safety gate: ensure we can afford at least 1 share
            if qty <= 0:
                print(f"⚠️  Insufficient capital for 5% allocation on {symbol}.")
                print(f"   Cash to risk: ${cash_to_risk:,.2f} | Price: ${latest_close:,.2f}")
                print("===================================")
                return

            # Calculate bracket prices based on the latest candle close
            take_profit_price = round(latest_close * 1.02, 2)
            stop_loss_price = round(latest_close * 0.99, 2)

            # Construct a bracket order: entry + take-profit + stop-loss
            order_data = MarketOrderRequest(
                symbol=symbol,
                qty=qty,
                side=OrderSide.BUY,
                time_in_force=TimeInForce.DAY,
                order_class="bracket",
                take_profit=TakeProfitRequest(limit_price=take_profit_price),
                stop_loss=StopLossRequest(stop_price=stop_loss_price)
            )
            order = trading_client.submit_order(order_data)
            print(f"{Colors.GREEN}✅ BRACKET BUY ORDER SUBMITTED: {qty} shares of {symbol}{Colors.RESET}")
            print(f"   Allocation   : ${cash_to_risk:,.2f} (5% of ${current_cash:,.2f})")
            print(f"   Order ID     : {order.id}")
            print(f"   Take Profit  : ${take_profit_price:,.2f} (+2%)")
            print(f"   Stop Loss    : ${stop_loss_price:,.2f} (-1%)")
            log_trade_to_csv(symbol, "BUY", qty, latest_close, str(order.id),
                             tp=take_profit_price, sl=stop_loss_price)

        elif signal == 'SELL' and current_qty > 0:
            # Cancel any remaining open orders (bracket legs) before liquidating
            try:
                trading_client.cancel_orders()
                print("🧹 Cancelled all open orders (bracket legs cleanup).")
            except Exception as cancel_err:
                print(f"⚠️  Could not cancel open orders: {cancel_err}")

            # Liquidate the entire long position with a standard market sell
            sell_qty = int(current_qty)
            order_data = MarketOrderRequest(
                symbol=symbol,
                qty=sell_qty,
                side=OrderSide.SELL,
                time_in_force=TimeInForce.DAY
            )
            order = trading_client.submit_order(order_data)
            
            avg_entry = float(position.avg_entry_price)
            pl_pct = ((latest_close - avg_entry) / avg_entry) * 100
            is_profit = pl_pct >= 0
            pl_color = Colors.GREEN if is_profit else Colors.RED
            pl_label = "Profit" if is_profit else "Loss"
            
            print(f"{Colors.RED}✅ SELL ORDER SUBMITTED: {sell_qty} shares of {symbol}{Colors.RESET}")
            print(f"   Order ID: {order.id}")
            print(f"   Entry: ${avg_entry:,.2f} | Exit: ${latest_close:,.2f} | {pl_color}{pl_pct:+.2f}% {pl_label}{Colors.RESET}")
            log_trade_to_csv(symbol, "SELL", sell_qty, latest_close, str(order.id))

        elif signal == 'BUY' and current_qty > 0:
            print(f"⏭️  BUY signal SKIPPED — already holding {current_qty} shares of {symbol}.")

        elif signal == 'SELL' and current_qty == 0:
            print(f"⏭️  SELL signal SKIPPED — no open position in {symbol} to sell.")

        elif signal == 'HOLD':
            print(f"⏸️  HOLD — No action taken for {symbol}.")

        print("===================================")

    except Exception as e:
        print(f"❌ Error executing trade for {symbol}: {e}")

# 8. Market Clock Checker
def is_market_open() -> bool:
    """
    Queries the Alpaca market clock to determine if the exchange is
    currently open and actively clearing trades.
    """
    try:
        clock = trading_client.get_clock()
        return clock.is_open
    except Exception as e:
        print(f"Error checking market clock: {e}")
        return False

# 9. Precise Interval Alignment
def wait_until_next_interval(interval_minutes: int = 5) -> None:
    """
    Calculates the exact number of seconds remaining until the next clean
    interval mark (e.g., :00, :05, :10, ..., :55) and sleeps for that
    duration plus a 5-second padding to ensure Alpaca has finalized
    candle aggregation.
    """
    now = datetime.now()
    current_minute = now.minute
    current_second = now.second

    # Calculate minutes remaining until the next clean interval boundary
    minutes_remaining = interval_minutes - (current_minute % interval_minutes)
    
    # Total seconds to wait: remaining minutes converted to seconds minus elapsed seconds, plus padding
    seconds_to_wait = (minutes_remaining * 60) - current_second + 5

    next_run = now + timedelta(seconds=seconds_to_wait)
    print(f"\n⏳ Next cycle at {next_run.strftime('%H:%M:%S')} (waiting {seconds_to_wait} seconds)...")
    time.sleep(seconds_to_wait)

if __name__ == "__main__":

    # Initial account verification before entering the loop
    print("🚀 Starting Algo Trading Bot...")
    print(f"📋 Watchlist: {WATCHLIST}")
    print(f"💰 Allocation per trade: {ALLOCATION_PER_TRADE_PCT * 100:.0f}% of liquid cash")
    if not verify_account():
        print("❌ Account verification failed. Exiting.")
        exit(1)

    try:
        while True:
            # Check if the market is currently open
            if not is_market_open():
                print(f"\n🔒 Market is CLOSED. Sleeping for 60 seconds before rechecking...")
                time.sleep(60)
                continue

            # === Full Trading Pipeline ===
            print(f"\n{'='*60}")
            print(f"📊 Running trading cycle at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"{'='*60}")

            # Fetch the latest liquid cash balance for dynamic allocation
            try:
                account = trading_client.get_account()
                liquid_cash = float(account.cash)
                print(f"💵 Current Liquid Cash: ${liquid_cash:,.2f}")
            except Exception as e:
                print(f"❌ Failed to fetch account balance: {e}")
                print("Skipping this cycle.")
                wait_until_next_interval(5)
                continue

            # Iterate over each ticker in the watchlist
            for ticker in WATCHLIST:
                try:
                    print(f"\n--- Processing {ticker} ---")

                    # Fetch 5-minute bars
                    bars_df = get_5min_bars(ticker)

                    if bars_df is None or bars_df.empty:
                        print(f"⚠️  No data returned for {ticker}. Skipping.")
                        continue

                    # Calculate SMA crossover signals
                    signals_df = calculate_signals(bars_df)

                    # Display last 5 rows with visual indicator on closed candle
                    tail_df = signals_df[['close', 'fast_sma', 'slow_sma', 'signal']].tail(5)
                    print(f"Latest 5 rows for {ticker}:")
                    for i, (idx, row) in enumerate(tail_df.iterrows()):
                        marker = "  ◀ CLOSED (trading on this)" if i == len(tail_df) - 2 else \
                                 "  ◀ LIVE (ignored)" if i == len(tail_df) - 1 else ""
                                 
                        row_signal = row['signal']
                        r_color = Colors.GREEN if row_signal == 'BUY' else (Colors.RED if row_signal == 'SELL' else '')
                        r_display = f"{r_color}{row_signal}{Colors.RESET}" if r_color else row_signal
                        
                        print(f"  {idx}  {row['close']:.3f}  {row['fast_sma']:.6f}  "
                              f"{row['slow_sma']:.6f}  {r_display}{marker}")

                    # Use second-to-last row (closed candle) to avoid signal repainting
                    if len(signals_df) < 2:
                        print(f"⚠️  Not enough data rows for {ticker}. Skipping.")
                        continue

                    closed_row = signals_df.iloc[-2]
                    latest_signal = closed_row['signal']
                    latest_close = float(closed_row['close'])
                    
                    signal_color = Colors.GREEN if latest_signal == 'BUY' else (Colors.RED if latest_signal == 'SELL' else '')
                    signal_display = f"{signal_color}{latest_signal}{Colors.RESET}" if signal_color else latest_signal
                    
                    print(f"\n🕯️  Closed candle signal for {ticker}: {signal_display} @ ${latest_close:,.2f}")
                    execute_trade(ticker, latest_signal, latest_close, liquid_cash)

                except Exception as e:
                    print(f"❌ Error processing {ticker}: {e}")
                    print(f"   Skipping {ticker} and continuing with next symbol.")
                    continue

            # Wait precisely until the next 5-minute candle is ready
            wait_until_next_interval(5)

    except KeyboardInterrupt:
        print("\n\n🛑 Bot stopped gracefully by user (Ctrl+C). Goodbye!")
