"""
notifications/telegram_bot.py
=============================
Instant Interactive Telegram Push Notification & Command Service for Algo Trading Bot.
Delivers real-time mobile alerts and two-way interactive buttons:
  1. 09:00 AM Pre-Market Strategy & Timeframe Selection (with 1-tap buttons & Default VWAP 2m fallback)
  2. 09:16 AM Morning Scanner Breakout Picks with 1-tap Stock Selection Buttons
  3. Real-Time Trade Entry Dispatches & Exit Notifications
  4. 03:15 PM Intraday MIS Auto-Square-Off Alert
  5. 03:30 PM Market Close & End-of-Day Performance Ledger
  6. Interactive Two-Way Commands (/status, /skip, /start) & Inline Keyboards
"""

import os
import json
import time
import threading
from datetime import datetime
from typing import Dict, Any, Optional, Tuple, List
import requests

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
CONFIG_FILE = os.path.join(DATA_DIR, "telegram_config.json")
ACTIVE_CONFIG_FILE = os.path.join(DATA_DIR, "bot_active_config.json")


# ─────────────────────────────────────────────────────────────────────────────
# 1. Credentials Management
# ─────────────────────────────────────────────────────────────────────────────
def get_telegram_credentials() -> Tuple[Optional[str], Optional[str]]:
    """Retrieves token and chat_id from environment or saved config file."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")

    if not token or not chat_id:
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r") as f:
                    cfg = json.load(f)
                    token = token or cfg.get("bot_token")
                    chat_id = chat_id or cfg.get("chat_id")
            except Exception:
                pass

    return token, chat_id


def save_telegram_credentials(bot_token: str, chat_id: str) -> bool:
    """Persists Telegram credentials to local config."""
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump({"bot_token": bot_token.strip(), "chat_id": chat_id.strip()}, f, indent=2)
        start_telegram_listener()
        return True
    except Exception as e:
        print(f"[ERROR] Failed to save Telegram credentials: {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# 2. Active Session Configuration (VWAP 2m Default)
# ─────────────────────────────────────────────────────────────────────────────
def get_active_config() -> Dict[str, Any]:
    """Returns today's active strategy, symbol, and timeframe settings."""
    cfg = {
        "active_symbol": "SBIN.NS",
        "strategy": "NSE Midday VWAP Pullback",
        "timeframe": "2m",
        "status": "ACTIVE (MONITORING)",
        "skip_today": False,
        "user_selected": False,
        "last_updated": datetime.now().isoformat()
    }
    if os.path.exists(ACTIVE_CONFIG_FILE):
        try:
            with open(ACTIVE_CONFIG_FILE, "r") as f:
                cfg.update(json.load(f))
        except Exception:
            pass
    return cfg


def save_active_config(cfg: Dict[str, Any]):
    """Persists active trading settings and synchronizes with the symbol state JSON."""
    os.makedirs(DATA_DIR, exist_ok=True)
    cfg["last_updated"] = datetime.now().isoformat()
    try:
        with open(ACTIVE_CONFIG_FILE, "w") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        print(f"[CONFIG ERROR] Failed to save active config: {e}")

    # Synchronize to symbol state file
    sym = cfg.get("active_symbol", "SBIN.NS")
    clean_sym = sym.replace(".", "_").replace("^", "")
    sf = os.path.join(DATA_DIR, f"bot_india_state_{clean_sym}.json")
    st = {}
    if os.path.exists(sf):
        try:
            with open(sf, "r") as f:
                st = json.load(f)
        except Exception:
            pass
    st.update({
        "symbol": sym,
        "strategy": cfg.get("strategy", "NSE Midday VWAP Pullback"),
        "status": cfg.get("status", "ACTIVE (MONITORING)"),
        "timeframe": cfg.get("timeframe", "2m"),
        "last_updated": datetime.now().isoformat()
    })
    try:
        with open(sf, "w") as f:
            json.dump(st, f, indent=2)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# 3. Message Dispatch (Text & Interactive Keyboards)
# ─────────────────────────────────────────────────────────────────────────────
def send_telegram_alert(message: str) -> bool:
    """Sends a standard HTML formatted alert to the user's Telegram."""
    token, chat_id = get_telegram_credentials()
    if not token or not chat_id:
        print("[TELEGRAM] Alert skipped: Token or Chat ID not configured.")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }

    try:
        res = requests.post(url, json=payload, timeout=8)
        return res.status_code == 200
    except Exception as e:
        print(f"[TELEGRAM EXCEPTION] Failed to dispatch alert: {e}")
        return False


def send_telegram_interactive(message: str, inline_keyboard: List[List[Dict[str, str]]]) -> bool:
    """Sends a Telegram message with interactive clickable buttons."""
    token, chat_id = get_telegram_credentials()
    if not token or not chat_id:
        print("[TELEGRAM INTERACTIVE] Skipped: Token or Chat ID not configured.")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
        "reply_markup": {
            "inline_keyboard": inline_keyboard
        }
    }

    try:
        res = requests.post(url, json=payload, timeout=8)
        return res.status_code == 200
    except Exception as e:
        print(f"[TELEGRAM INTERACTIVE ERROR] {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# 4. Interactive Pre-Market Setup Prompt (09:00 AM IST)
# ─────────────────────────────────────────────────────────────────────────────
def prompt_morning_setup():
    """Dispatches the 09:00 AM interactive setup prompt with 1-tap strategy buttons."""
    msg = (
        "🌅 <b>GOOD MORNING! NSE PRE-MARKET SETUP</b>\n\n"
        "NSE Market opens in 15 minutes (09:15 AM IST).\n\n"
        "⚙️ <b>Select Your Strategy & Timeframe for Today:</b>\n"
        "• <i>Default:</i> <b>VWAP Pullback (2-min)</b> will auto-activate at 09:14 AM if no choice is made.\n\n"
        "👇 <b>Tap an option below:</b>"
    )
    buttons = [
        [
            {"text": "🌊 VWAP Pullback (2m - Default)", "callback_data": "strat_vwap_2m"},
            {"text": "⚡ ORB Breakout (5m)", "callback_data": "strat_orb_5m"}
        ],
        [
            {"text": "⏸️ Don't Start Today (Skip Session)", "callback_data": "strat_skip"}
        ]
    ]
    send_telegram_interactive(msg, buttons)


# ─────────────────────────────────────────────────────────────────────────────
# 5. Pre-Formatted Alert Dispatches
# ─────────────────────────────────────────────────────────────────────────────
def notify_morning_scan(scan_result: Dict[str, Any]):
    """Dispatches the 09:16 AM market open summary with 1-tap stock pick buttons."""
    date_str = scan_result.get("session_date", "Today")
    breadth = scan_result.get("market_breadth", {})
    adv = breadth.get("advancers", 0)
    dec = breadth.get("decliners", 0)
    leading_sec = breadth.get("dominant_sector", "General")
    top_longs = scan_result.get("top_longs", [])
    top_shorts = scan_result.get("top_shorts", [])

    msg = f"🔔 <b>NSE INTRADAY OPEN — 09:16 AM SCANNER</b>\n"
    msg += f"📅 <i>Session: {date_str}</i>\n"
    msg += f"📊 <b>Market Breadth:</b> {adv} ▲ Advancers | {dec} ▼ Decliners\n"
    msg += f"🏛️ <b>Leading Flow:</b> {leading_sec}\n\n"

    top_syms = []
    if top_longs:
        tl = top_longs[0]
        top_syms.append(tl['symbol'])
        msg += f"🟢 <b>TOP LONG BREAKOUT:</b> <code>{tl['symbol']}</code>\n"
        msg += f"• Price: ₹{tl['price']:.2f} ({tl['change_pct']:+0.2f}%)\n"
        msg += f"• Institutional RVOL: <b>{tl['rvol']}x</b>\n"
        msg += f"• Target (2R): ₹{tl['target_2r']} | SL: ₹{tl['stop_loss']}\n\n"

    if len(top_longs) > 1:
        tl2 = top_longs[1]
        top_syms.append(tl2['symbol'])
        msg += f"🟢 <b>RUNNER-UP LONG:</b> <code>{tl2['symbol']}</code>\n"
        msg += f"• Price: ₹{tl2['price']:.2f} ({tl2['change_pct']:+0.2f}%) | RVOL: <b>{tl2['rvol']}x</b>\n\n"

    if top_shorts:
        ts = top_shorts[0]
        msg += f"🔴 <b>TOP SHORT BREAKDOWN:</b> <code>{ts['symbol']}</code>\n"
        msg += f"• Price: ₹{ts['price']:.2f} ({ts['change_pct']:+0.2f}%)\n"
        msg += f"• Institutional RVOL: <b>{ts['rvol']}x</b>\n\n"

    msg += "👉 <b>Which stock should the bot trade today?</b>\n"
    msg += "<i>(Auto-selects #1 pick if not chosen by 09:20 AM)</i>\n"

    # Interactive buttons
    buttons = []
    pick_row = []
    for idx, sym in enumerate(top_syms):
        clean = sym.replace(".", "_")
        pick_row.append({"text": f"🚀 Trade #{idx+1}: {sym}", "callback_data": f"pick_{clean}"})
    if pick_row:
        buttons.append(pick_row)

    buttons.append([{"text": "⏸️ Don't Trade Today (Skip Session)", "callback_data": "pick_skip"}])

    send_telegram_interactive(msg, buttons)


def notify_trade_entry(symbol: str, side: str, price: float, shares: int, sl: float, tp: float, strategy: str):
    """Dispatches trade execution alert."""
    emoji = "🟢" if side.upper() == "BUY" else "🔴"
    action = "LONG ENTRY" if side.upper() == "BUY" else "SHORT ENTRY"

    msg = f"⚡ <b>BOT TRADE EXECUTED</b>\n\n"
    msg += f"{emoji} <b>Action:</b> {action} (Paper Mode)\n"
    msg += f"📈 <b>Instrument:</b> <code>{symbol}</code>\n"
    msg += f"💵 <b>Fill Price:</b> ₹{price:,.2f}\n"
    msg += f"🔢 <b>Shares:</b> {shares} units (MIS)\n"
    msg += f"🎯 <b>Target (2R):</b> ₹{tp:,.2f}\n"
    msg += f"🛑 <b>Stop Loss:</b> ₹{sl:,.2f}\n"
    msg += f"🧠 <b>Algorithm:</b> {strategy}\n\n"
    msg += f"📱 View: https://algorithmic-trading-1-zcqx.onrender.com"
    send_telegram_alert(msg)


def notify_trade_exit(symbol: str, exit_price: float, pnl: float, pnl_pct: float, reason: str):
    """Dispatches trade exit / target / SL alert."""
    emoji = "🎉" if pnl >= 0 else "🛑"
    pnl_sign = "+" if pnl >= 0 else ""

    msg = f"{emoji} <b>BOT TRADE CLOSED</b>\n\n"
    msg += f"📈 <b>Instrument:</b> <code>{symbol}</code>\n"
    msg += f"🏁 <b>Reason:</b> {reason}\n"
    msg += f"💵 <b>Exit Price:</b> ₹{exit_price:,.2f}\n"
    msg += f"💰 <b>Net P&L:</b> <b>{pnl_sign}₹{pnl:,.2f} ({pnl_sign}{pnl_pct:.2f}%)</b>\n\n"
    msg += f"📱 View: https://algorithmic-trading-1-zcqx.onrender.com"
    send_telegram_alert(msg)


def notify_daily_summary(total_trades: int, wins: int, losses: int, net_pnl: float, charges: float):
    """Dispatches 3:15 PM EOD summary."""
    pnl_sign = "+" if net_pnl >= 0 else ""
    msg = f"🏁 <b>NSE INTRADAY CLOSE — DAILY REPORT</b>\n\n"
    msg += f"📊 <b>Total Trades:</b> {total_trades} ({wins}W / {losses}L)\n"
    msg += f"💰 <b>Net In-Hand P&L:</b> <b>{pnl_sign}₹{net_pnl:,.2f}</b>\n"
    msg += f"📑 <b>Taxes & Fees:</b> ₹{charges:,.2f}\n"
    msg += f"🔒 <b>Status:</b> All positions squared off (3:15 PM MIS Rule)\n\n"
    msg += f"📱 View: https://algorithmic-trading-1-zcqx.onrender.com"
    send_telegram_alert(msg)


# ─────────────────────────────────────────────────────────────────────────────
# 6. Two-Way Interactive Listener & Callback Handlers
# ─────────────────────────────────────────────────────────────────────────────
def handle_telegram_callback(cb_data: str):
    """Processes button taps received from Telegram."""
    cfg = get_active_config()

    if cb_data == "strat_vwap_2m":
        cfg["strategy"] = "NSE Midday VWAP Pullback"
        cfg["timeframe"] = "2m"
        cfg["status"] = "ACTIVE (MONITORING)"
        cfg["skip_today"] = False
        cfg["user_selected"] = True
        save_active_config(cfg)
        send_telegram_alert(
            "✅ <b>CONFIGURATION SAVED!</b>\n\n"
            "• <b>Strategy:</b> NSE Midday VWAP Pullback\n"
            "• <b>Timeframe:</b> 2-minute candles\n"
            "• <b>Status:</b> ACTIVE (Monitoring)\n\n"
            "<i>The bot will monitor for VWAP entries once the market opens at 09:15 AM.</i>"
        )

    elif cb_data == "strat_orb_5m":
        cfg["strategy"] = "NSE Intraday ORB Breakout"
        cfg["timeframe"] = "5m"
        cfg["status"] = "ACTIVE (MONITORING)"
        cfg["skip_today"] = False
        cfg["user_selected"] = True
        save_active_config(cfg)
        send_telegram_alert(
            "✅ <b>CONFIGURATION SAVED!</b>\n\n"
            "• <b>Strategy:</b> NSE Intraday ORB Breakout\n"
            "• <b>Timeframe:</b> 5-minute candles\n"
            "• <b>Status:</b> ACTIVE (Monitoring)\n\n"
            "<i>The bot will evaluate the 09:15-09:30 AM Opening Range breakout.</i>"
        )

    elif cb_data in ["strat_skip", "pick_skip"]:
        cfg["status"] = "PAUSED (USER SKIPPED TODAY)"
        cfg["skip_today"] = True
        cfg["user_selected"] = True
        save_active_config(cfg)
        send_telegram_alert(
            "⏸️ <b>SESSION SKIPPED FOR TODAY</b>\n\n"
            "The bot has been paused. <b>No trades will be executed today.</b>\n"
            "Have a great day at college! You can resume anytime by sending <code>/start</code>."
        )

    elif cb_data.startswith("pick_"):
        sym = cb_data.replace("pick_", "").replace("_", ".")
        cfg["active_symbol"] = sym
        cfg["status"] = "ACTIVE (MONITORING)"
        cfg["skip_today"] = False
        cfg["user_selected"] = True
        save_active_config(cfg)
        send_telegram_alert(
            f"🚀 <b>ACTIVE STOCK SELECTED: {sym}</b>\n\n"
            f"The bot is now locked on <b>{sym}</b> for today's session.\n"
            f"Using <b>{cfg.get('strategy')}</b> ({cfg.get('timeframe')}).\n"
            f"You will receive an alert as soon as an entry signal triggers!"
        )


def handle_telegram_text_command(text: str):
    """Processes slash commands sent by user in Telegram chat."""
    t = text.strip().lower()
    if t in ["/stop", "/skip", "skip", "stop"]:
        handle_telegram_callback("strat_skip")
    elif t in ["/start", "start", "/resume"]:
        cfg = get_active_config()
        cfg["status"] = "ACTIVE (MONITORING)"
        cfg["skip_today"] = False
        save_active_config(cfg)
        send_telegram_alert("▶️ <b>Bot Resumed!</b> Status set to <b>ACTIVE (MONITORING)</b>.")
    elif t in ["/status", "status"]:
        cfg = get_active_config()
        send_telegram_alert(
            f"📊 <b>BOT CURRENT STATUS:</b>\n\n"
            f"• <b>Status:</b> {cfg.get('status')}\n"
            f"• <b>Active Stock:</b> {cfg.get('active_symbol')}\n"
            f"• <b>Strategy:</b> {cfg.get('strategy')}\n"
            f"• <b>Timeframe:</b> {cfg.get('timeframe')}\n"
            f"• <b>Skip Today:</b> {'YES' if cfg.get('skip_today') else 'NO'}\n\n"
            f"📱 View Terminal: https://algorithmic-trading-1-zcqx.onrender.com"
        )


_LISTENER_RUNNING = False

def _telegram_listener_worker():
    """Polls Telegram getUpdates for interactive taps and chat commands."""
    last_update_id = 0
    while True:
        try:
            token, chat_id = get_telegram_credentials()
            if not token:
                time.sleep(10)
                continue

            url = f"https://api.telegram.org/bot{token}/getUpdates"
            params = {"offset": last_update_id + 1, "timeout": 20}
            res = requests.get(url, params=params, timeout=25)
            if res.status_code != 200:
                time.sleep(5)
                continue

            data = res.json()
            for update in data.get("result", []):
                last_update_id = update["update_id"]

                # 1. Handle Callback Query (Button click)
                if "callback_query" in update:
                    cb = update["callback_query"]
                    cb_id = cb["id"]
                    cb_data = cb.get("data", "")
                    try:
                        requests.post(f"https://api.telegram.org/bot{token}/answerCallbackQuery", json={"callback_query_id": cb_id}, timeout=4)
                    except Exception:
                        pass
                    handle_telegram_callback(cb_data)

                # 2. Handle Text Commands (/status, /skip, /start)
                elif "message" in update and "text" in update["message"]:
                    handle_telegram_text_command(update["message"]["text"])

            time.sleep(1)
        except Exception:
            time.sleep(5)


def start_telegram_listener():
    """Starts the Telegram interactive listener background thread once."""
    global _LISTENER_RUNNING
    if not _LISTENER_RUNNING:
        _LISTENER_RUNNING = True
        t = threading.Thread(target=_telegram_listener_worker, daemon=True, name="TelegramInteractiveListener")
        t.start()
        print("✅ Interactive Telegram Bot Listener started (Two-way button taps & commands active)")


# Start listener on module load
start_telegram_listener()
