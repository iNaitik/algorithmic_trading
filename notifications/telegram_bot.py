"""
notifications/telegram_bot.py
=============================
Instant Telegram Push Notification Service for Algo Trading Bot.
Delivers real-time mobile alerts during college/work hours:
  1. 09:16 AM Morning Scanner Breakout Picks (RVOL, Gap %, Top Long/Short)
  2. Trade Entry Dispatches (Ticker, Side, Price, Target 2R, Stop Loss)
  3. Trade Exit & Target Notifications (Net P&L in INR, Return %)
  4. 3:15 PM Auto Square-Off & End-of-Day Performance Ledger
"""

import os
import json
import requests
from typing import Dict, Any, Optional

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
CONFIG_FILE = os.path.join(DATA_DIR, "telegram_config.json")


def get_telegram_credentials() -> tuple[Optional[str], Optional[str]]:
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
        return True
    except Exception as e:
        print(f"[ERROR] Failed to save Telegram credentials: {e}")
        return False


def send_telegram_alert(message: str) -> bool:
    """Sends a formatted Markdown alert to the user's Telegram phone."""
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
        if res.status_code == 200:
            print("[TELEGRAM] ✅ Alert dispatched successfully to phone.")
            return True
        else:
            print(f"[TELEGRAM ERROR] Telegram API responded with {res.status_code}: {res.text}")
            return False
    except Exception as e:
        print(f"[TELEGRAM EXCEPTION] Failed to dispatch alert: {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Pre-Formatted Alert Dispatches
# ─────────────────────────────────────────────────────────────────────────────
def notify_morning_scan(scan_result: Dict[str, Any]):
    """Dispatches the 09:16 AM market open summary to user's Telegram."""
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

    if top_longs:
        tl = top_longs[0]
        msg += f"🟢 <b>TOP LONG BREAKOUT:</b> <code>{tl['symbol']}</code>\n"
        msg += f"• Price: ₹{tl['price']:.2f} ({tl['change_pct']:+0.2f}%)\n"
        msg += f"• Institutional RVOL: <b>{tl['rvol']}x</b>\n"
        msg += f"• Target (2R): ₹{tl['target_2r']} | SL: ₹{tl['stop_loss']}\n"
        msg += f"• Strategy: {tl.get('suggested_strategy', 'ORB Breakout').replace('NSE ', '')}\n\n"

    if top_shorts:
        ts = top_shorts[0]
        msg += f"🔴 <b>TOP SHORT BREAKDOWN:</b> <code>{ts['symbol']}</code>\n"
        msg += f"• Price: ₹{ts['price']:.2f} ({ts['change_pct']:+0.2f}%)\n"
        msg += f"• Institutional RVOL: <b>{ts['rvol']}x</b>\n"
        msg += f"• Target (2R): ₹{ts['target_2r']} | SL: ₹{ts['stop_loss']}\n\n"

    msg += f"📱 <b>Live Terminal:</b> https://algorithmic-trading-1-zcqx.onrender.com"
    send_telegram_alert(msg)


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
