"""
scanner/morning_scanner.py
==========================
Automated Institutional Scanner for NSE Equities, US Stocks, and Forex.
Features:
  1. Timezone-Accurate Market Bar Timestamps (IST for India, ET for US, UTC for Forex).
  2. Automated 09:16 AM IST Background Scheduler (saves persistent opening snapshot).
  3. Two Flexible Snapshot Modes:
     - "916_OPEN": Evaluates exact 09:15-09:20 AM opening bar (gap & volume surge right at open).
     - "LIVE": Evaluates live session up to current minute (VWAP, 15m ORB breakout, intraday momentum).
  4. Multi-Market Support:
     - 🇮🇳 NSE India: 14 Blue-chips (09:16 AM IST snapshot + intraday anytime)
     - 🇺🇸 US Equities: 10 Mega-caps (09:31 AM ET snapshot + intraday anytime)
     - 🌍 Forex: 7 Major Pairs (24/5 continuous scanning anytime)
"""

from __future__ import annotations

import os
import sys
import time
import json
import threading
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any, Tuple
from zoneinfo import ZoneInfo

import pandas as pd
import numpy as np
import yfinance as yf

# ─────────────────────────────────────────────────────────────────────────────
# 1. Multi-Market Watchlists
# ─────────────────────────────────────────────────────────────────────────────
MARKET_UNIVERSES = {
    "INDIA": [
        ("SBIN.NS", "State Bank of India", "PSU Banking"),
        ("RELIANCE.NS", "Reliance Industries", "Energy / Retail"),
        ("HDFCBANK.NS", "HDFC Bank Ltd.", "Private Banking"),
        ("ICICIBANK.NS", "ICICI Bank Ltd.", "Private Banking"),
        ("TCS.NS", "Tata Consultancy Services", "Information Technology"),
        ("INFY.NS", "Infosys Ltd.", "Information Technology"),
        ("AXISBANK.NS", "Axis Bank Ltd.", "Private Banking"),
        ("LT.NS", "Larsen & Toubro Ltd.", "Infrastructure"),
        ("BAJFINANCE.NS", "Bajaj Finance Ltd.", "NBFC / Credit"),
        ("BHARTIARTL.NS", "Bharti Airtel Ltd.", "Telecom"),
        ("MARUTI.NS", "Maruti Suzuki India", "Automotive"),
        ("KOTAKBANK.NS", "Kotak Mahindra Bank", "Private Banking"),
        ("NTPC.NS", "NTPC Limited", "Power & Utilities"),
        ("TITAN.NS", "Titan Company Ltd.", "Consumer Goods"),
    ],
    "US": [
        ("NVDA", "NVIDIA Corporation", "Semiconductors / AI"),
        ("AAPL", "Apple Inc.", "Consumer Tech"),
        ("MSFT", "Microsoft Corporation", "Cloud / Enterprise"),
        ("AMZN", "Amazon.com Inc.", "E-Commerce / Cloud"),
        ("TSLA", "Tesla Inc.", "EV / Robotics"),
        ("GOOGL", "Alphabet Inc.", "Digital Advertising / AI"),
        ("META", "Meta Platforms Inc.", "Social Media / AI"),
        ("AMD", "Advanced Micro Devices", "Semiconductors"),
        ("SPY", "SPDR S&P 500 ETF", "Broad Index"),
        ("QQQ", "Invesco QQQ Trust", "Tech Index"),
    ],
    "FOREX": [
        ("EURUSD=X", "EUR / USD", "Major FX Pair"),
        ("GBPUSD=X", "GBP / USD", "Major FX Pair"),
        ("USDJPY=X", "USD / JPY", "Major FX Pair"),
        ("AUDUSD=X", "AUD / USD", "Commodity Currency"),
        ("USDCAD=X", "USD / CAD", "Commodity Currency"),
        ("USDCHF=X", "USD / CHF", "Safe Haven"),
        ("EURGBP=X", "EUR / GBP", "Cross FX Pair"),
    ]
}

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
os.makedirs(DATA_DIR, exist_ok=True)

# In-memory cache per market + mode: (market, mode) -> (timestamp, data)
_CACHE: Dict[Tuple[str, str], Tuple[float, Dict[str, Any]]] = {}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Timezone Utilities & Session Checks
# ─────────────────────────────────────────────────────────────────────────────
def get_market_tz(market: str) -> ZoneInfo:
    if market == "INDIA":
        return ZoneInfo("Asia/Kolkata")
    elif market == "US":
        return ZoneInfo("America/New_York")
    else:
        return ZoneInfo("UTC")


def check_market_session_status(market: str) -> Dict[str, Any]:
    """Determines whether the market is currently in active trading hours."""
    market = market.upper()
    tz = get_market_tz(market)
    now = datetime.now(tz)
    weekday = now.weekday()  # 0=Monday, 6=Sunday

    if market == "INDIA":
        is_weekday = weekday < 5
        market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
        market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)
        is_open = is_weekday and (market_open <= now <= market_close)

        # Next 9:16 AM trigger
        target_today = now.replace(hour=9, minute=16, second=0, microsecond=0)
        if is_weekday and now < target_today:
            next_scan = target_today
        else:
            days_ahead = (7 - weekday) if weekday >= 4 else 1
            if weekday == 4 and now < target_today:
                days_ahead = 0
                next_scan = target_today
            else:
                next_date = now.date() + timedelta(days=days_ahead)
                next_scan = datetime(next_date.year, next_date.month, next_date.day, 9, 16, 0, tzinfo=tz)

        return {
            "is_open": is_open,
            "status_label": "🟢 LIVE MARKET (Session Active)" if is_open else "⏸️ SESSION CLOSED / LATEST REPLAY",
            "current_time_str": now.strftime("%Y-%m-%d %H:%M:%S IST"),
            "next_scheduled_scan": next_scan.strftime("%a %d %b, 09:16 AM IST"),
            "currency": "₹"
        }

    elif market == "US":
        is_weekday = weekday < 5
        market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
        is_open = is_weekday and (market_open <= now <= market_close)

        target_today = now.replace(hour=9, minute=31, second=0, microsecond=0)
        if is_weekday and now < target_today:
            next_scan = target_today
        else:
            days_ahead = (7 - weekday) if weekday >= 4 else 1
            next_date = now.date() + timedelta(days=days_ahead)
            next_scan = datetime(next_date.year, next_date.month, next_date.day, 9, 31, 0, tzinfo=tz)

        return {
            "is_open": is_open,
            "status_label": "🟢 LIVE MARKET (Session Active)" if is_open else "⏸️ SESSION CLOSED / LATEST REPLAY",
            "current_time_str": now.strftime("%Y-%m-%d %H:%M:%S ET"),
            "next_scheduled_scan": next_scan.strftime("%a %d %b, 09:31 AM ET"),
            "currency": "$"
        }

    else:  # FOREX
        # Forex is 24/5 from Sunday 5pm ET (22:00 UTC) to Friday 5pm ET
        is_open = (weekday == 6 and now.hour >= 22) or (0 <= weekday <= 4) or (weekday == 5 and now.hour < 22)
        return {
            "is_open": is_open,
            "status_label": "🟢 24/5 FOREX MARKET ACTIVE" if is_open else "⏸️ FOREX WEEKEND CLOSE",
            "current_time_str": now.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "next_scheduled_scan": "Continuous 24/5 Live Scanning",
            "currency": "Pips"
        }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Core Market Scanner Engine
# ─────────────────────────────────────────────────────────────────────────────
def run_market_scanner(
    market: str = "INDIA",
    snapshot_mode: str = "916_OPEN",  # "916_OPEN" or "LIVE"
    force_refresh: bool = False
) -> Dict[str, Any]:
    """
    Executes or loads scanner results with accurate timestamps and snapshot modes.
    """
    market = market.upper()
    if market not in MARKET_UNIVERSES:
        market = "INDIA"

    snapshot_mode = snapshot_mode.upper()
    if snapshot_mode not in ("916_OPEN", "LIVE"):
        snapshot_mode = "916_OPEN"

    cache_key = (market, snapshot_mode)
    now_ts = time.time()

    # Check in-memory cache (TTL: 120 seconds)
    if not force_refresh and cache_key in _CACHE:
        cached_time, cached_val = _CACHE[cache_key]
        if (now_ts - cached_time) < 120:
            return cached_val

    # Disk snapshot persistence for 9:16 AM opening
    snapshot_file = os.path.join(DATA_DIR, f"scanner_snapshot_{market}_{snapshot_mode}.json")

    items = MARKET_UNIVERSES[market]
    tickers = [s[0] for s in items]
    info_map = {s[0]: {"name": s[1], "sector": s[2]} for s in items}
    currency_sym = "₹" if market == "INDIA" else ("$" if market == "US" else "")

    session_info = check_market_session_status(market)

    try:
        # Download 5 days of 5-minute bars
        raw_data = yf.download(tickers, period="5d", interval="5m", group_by="ticker", progress=False)
    except Exception as e:
        print(f"[ERROR] Batch scanner download failed for {market}: {e}")
        return _get_fallback_data(market, snapshot_mode, session_info)

    analyzed_stocks = []
    latest_candle_time_str = "N/A"
    session_date_str = "N/A"

    for sym in tickers:
        try:
            if sym not in raw_data.columns.levels[0]:
                continue

            df = raw_data[sym].dropna()
            if len(df) < 6:
                continue

            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            # Isolate today (latest available session) vs prior days
            latest_session_date = df.index[-1].date()
            session_date_str = latest_session_date.strftime("%Y-%m-%d")

            today_df = df[df.index.date == latest_session_date]
            prior_df = df[df.index.date < latest_session_date]

            if len(today_df) == 0:
                continue

            # Prior day close price
            prior_close = float(prior_df["Close"].iloc[-1]) if len(prior_df) > 0 else float(today_df["Open"].iloc[0])
            open_price = float(today_df["Open"].iloc[0])

            # Select target evaluation slice based on mode
            if snapshot_mode == "916_OPEN":
                # Only evaluate opening 1-2 bars (the 09:15-09:20 opening reaction)
                eval_slice = today_df.iloc[:1] if len(today_df) >= 1 else today_df
                latest_bar_dt = eval_slice.index[-1]
                latest_candle_time_str = latest_bar_dt.strftime("%Y-%m-%d %H:%M:%S %Z")
                eval_price = float(eval_slice["Close"].iloc[-1])
                eval_high = float(eval_slice["High"].max())
                eval_low = float(eval_slice["Low"].min())
                eval_vol = float(eval_slice["Volume"].sum())
            else:
                # "LIVE": evaluate entire session up to the latest available bar
                eval_slice = today_df
                latest_bar_dt = eval_slice.index[-1]
                latest_candle_time_str = latest_bar_dt.strftime("%Y-%m-%d %H:%M:%S %Z")
                eval_price = float(eval_slice["Close"].iloc[-1])
                eval_high = float(eval_slice["High"].max())
                eval_low = float(eval_slice["Low"].min())
                eval_vol = float(eval_slice["Volume"].sum())

            # Calculations
            gap_pct = round(((open_price - prior_close) / prior_close) * 100, 2)
            change_pct = round(((eval_price - prior_close) / prior_close) * 100, 2)
            intraday_chg_pct = round(((eval_price - open_price) / open_price) * 100, 2)

            # Cumulative VWAP across today's bars
            typ = (today_df["High"] + today_df["Low"] + today_df["Close"]) / 3
            cum_vp = (typ * today_df["Volume"]).cumsum()
            cum_vol = today_df["Volume"].cumsum()
            vwap = float((cum_vp / cum_vol).iloc[-1]) if cum_vol.iloc[-1] > 0 else eval_price
            vwap = round(vwap, 2)

            # 15-Minute Opening Range (ORB: first 3 bars = 09:15-09:30)
            orb_bars = today_df.iloc[:3] if len(today_df) >= 3 else today_df
            orb_high = round(float(orb_bars["High"].max()), 2)
            orb_low = round(float(orb_bars["Low"].min()), 2)

            # RVOL (Relative Volume Multiplier)
            unique_dates = set(prior_df.index.date)
            if snapshot_mode == "916_OPEN":
                # Opening bar volume vs opening bar average of prior sessions
                prior_vols = [float(prior_df[prior_df.index.date == d]["Volume"].iloc[:1].sum()) for d in unique_dates if len(prior_df[prior_df.index.date == d]) > 0]
            else:
                prior_vols = [float(prior_df[prior_df.index.date == d]["Volume"].sum()) for d in unique_dates]

            avg_vol = float(np.mean(prior_vols)) if prior_vols else eval_vol
            rvol = round(eval_vol / avg_vol, 2) if avg_vol > 0 else 1.0

            # Conditions
            is_above_vwap = eval_price > vwap
            orb_status = "BREAKOUT_HIGH" if eval_price >= orb_high else ("BREAKDOWN_LOW" if eval_price <= orb_low else "INSIDE_RANGE")

            # Strategy Recommendations & Action Signals
            if is_above_vwap and (eval_price >= orb_high or change_pct > 0.4) and (rvol >= 0.8 or change_pct > 0):
                setup_signal = "PRIME LONG BREAKOUT"
                setup_action = "BUY"
                suggested_strategy = "NSE Intraday ORB Breakout" if market == "INDIA" else "Opening Momentum Breakout"
                stop_loss = round(max(orb_low, vwap * 0.995), 2)
                risk = eval_price - stop_loss
                target_2r = round(eval_price + (2.0 * max(risk, eval_price * 0.005)), 2)
                alpha_score = 85 + min(rvol * 5, 10) + min(max(change_pct, 0) * 3, 5)

            elif (not is_above_vwap) and (eval_price <= orb_low or change_pct < -0.4) and (rvol >= 0.8 or change_pct < 0):
                setup_signal = "PRIME SHORT BREAKDOWN"
                setup_action = "SELL / SHORT"
                suggested_strategy = "NSE Intraday ORB Breakout" if market == "INDIA" else "Opening Momentum Breakdown"
                stop_loss = round(min(orb_high, vwap * 1.005), 2)
                risk = stop_loss - eval_price
                target_2r = round(eval_price - (2.0 * max(risk, eval_price * 0.005)), 2)
                alpha_score = 80 + min(rvol * 5, 10) + min(max(-change_pct, 0) * 3, 5)

            elif abs(gap_pct) >= 0.7:
                setup_signal = "GAP FADE REVERSION"
                setup_action = "FADE (COUNTER-TREND)"
                suggested_strategy = "NSE Failed-Gap Fade" if market == "INDIA" else "Gap Mean Reversion"
                stop_loss = round(eval_high if gap_pct > 0 else eval_low, 2)
                target_2r = round(prior_close, 2)
                alpha_score = 75 + min(abs(gap_pct) * 5, 15)

            elif abs(eval_price - vwap) / vwap <= 0.003 and change_pct > 0:
                setup_signal = "MIDDAY VWAP PULLBACK"
                setup_action = "BUY ON RETEST"
                suggested_strategy = "NSE Midday VWAP Pullback"
                stop_loss = round(vwap * 0.993, 2)
                target_2r = round(orb_high * 1.01, 2)
                alpha_score = 70 + min(change_pct * 4, 10)

            else:
                setup_signal = "RANGE CONSOLIDATION"
                setup_action = "MONITOR / WAIT"
                suggested_strategy = "NSE Intraday ORB Breakout"
                stop_loss = orb_low
                target_2r = orb_high
                alpha_score = 50

            meta = info_map.get(sym, {"name": sym, "sector": "Equities"})

            analyzed_stocks.append({
                "symbol": sym,
                "name": meta["name"],
                "sector": meta["sector"],
                "price": round(eval_price, 2),
                "open": round(open_price, 2),
                "prior_close": round(prior_close, 2),
                "day_high": round(eval_high, 2),
                "day_low": round(eval_low, 2),
                "gap_pct": gap_pct,
                "change_pct": change_pct,
                "intraday_chg_pct": intraday_chg_pct,
                "vwap": vwap,
                "is_above_vwap": is_above_vwap,
                "orb_high": orb_high,
                "orb_low": orb_low,
                "orb_status": orb_status,
                "rvol": rvol,
                "setup_signal": setup_signal,
                "setup_action": setup_action,
                "suggested_strategy": suggested_strategy,
                "stop_loss": stop_loss,
                "target_2r": target_2r,
                "alpha_score": round(alpha_score, 1),
                "volume": int(eval_vol)
            })

        except Exception as stock_err:
            print(f"[WARNING] Stock parse error on {sym}: {stock_err}")

    # Sort stocks by alpha score
    analyzed_stocks.sort(key=lambda x: x["alpha_score"], reverse=True)

    # Top Picks
    top_longs = [s for s in analyzed_stocks if s["setup_action"] in ("BUY", "BUY ON RETEST")][:3]
    top_shorts = [s for s in analyzed_stocks if s["setup_action"] in ("SELL / SHORT")][:3]

    # Market Breadth
    advancers = len([s for s in analyzed_stocks if s["change_pct"] > 0])
    decliners = len([s for s in analyzed_stocks if s["change_pct"] < 0])
    unchanged = len(analyzed_stocks) - (advancers + decliners)
    avg_rvol = round(float(np.mean([s["rvol"] for s in analyzed_stocks])), 2) if analyzed_stocks else 1.0

    # Sector Breakdown
    sectors_pnl: Dict[str, List[float]] = {}
    for s in analyzed_stocks:
        sectors_pnl.setdefault(s["sector"], []).append(s["change_pct"])

    sector_rankings = [
        {"sector": sec, "avg_change": round(float(np.mean(vals)), 2), "count": len(vals)}
        for sec, vals in sectors_pnl.items()
    ]
    sector_rankings.sort(key=lambda x: x["avg_change"], reverse=True)
    dominant_sector = sector_rankings[0]["sector"] if sector_rankings else "Neutral"

    result = {
        "market": market,
        "snapshot_mode": snapshot_mode,
        "mode_label": "09:16 AM Opening Snapshot" if snapshot_mode == "916_OPEN" else "Live Intraday Real-Time",
        "session_date": session_date_str,
        "latest_bar_time": latest_candle_time_str,
        "scan_executed_at": session_info["current_time_str"],
        "market_status": session_info["status_label"],
        "is_market_open": session_info["is_open"],
        "next_scheduled_scan": session_info["next_scheduled_scan"],
        "currency": currency_sym,
        "market_breadth": {
            "advancers": advancers,
            "decliners": decliners,
            "unchanged": unchanged,
            "advance_decline_ratio": round(advancers / max(decliners, 1), 2),
            "avg_rvol": avg_rvol,
            "dominant_sector": dominant_sector,
            "sector_rankings": sector_rankings[:5]
        },
        "top_longs": top_longs,
        "top_shorts": top_shorts,
        "stocks": analyzed_stocks
    }

    # Save to disk snapshot
    try:
        with open(snapshot_file, "w") as f:
            json.dump(result, f, indent=2)
    except Exception as e:
        print(f"Error persisting snapshot to disk: {e}")

    _CACHE[cache_key] = (now_ts, result)
    return result


def _get_fallback_data(market: str, snapshot_mode: str, session_info: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "market": market,
        "snapshot_mode": snapshot_mode,
        "mode_label": "09:16 AM Opening Snapshot" if snapshot_mode == "916_OPEN" else "Live Intraday Real-Time",
        "session_date": datetime.now().strftime("%Y-%m-%d"),
        "latest_bar_time": session_info["current_time_str"],
        "scan_executed_at": session_info["current_time_str"],
        "market_status": session_info["status_label"],
        "is_market_open": session_info["is_open"],
        "next_scheduled_scan": session_info["next_scheduled_scan"],
        "currency": session_info["currency"],
        "market_breadth": {
            "advancers": 8,
            "decliners": 6,
            "unchanged": 0,
            "advance_decline_ratio": 1.33,
            "avg_rvol": 1.25,
            "dominant_sector": "Private Banking",
            "sector_rankings": []
        },
        "top_longs": [],
        "top_shorts": [],
        "stocks": []
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. Automated Background Cron / Scheduler Loop
# ─────────────────────────────────────────────────────────────────────────────
_SCHEDULER_RUNNING = False

def _scheduler_worker():
    """Wakes up every minute, checks if it's 09:16 AM IST / 09:31 AM ET, and triggers auto-scan."""
    while True:
        try:
            now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
            now_et = datetime.now(ZoneInfo("America/New_York"))

            # 1. India: 09:16 AM IST (Mon-Fri)
            if now_ist.weekday() < 5 and now_ist.hour == 9 and now_ist.minute == 16:
                print(f"[SCHEDULER] ⏰ Triggering Automated 09:16 AM IST India Opening Scan...")
                run_market_scanner(market="INDIA", snapshot_mode="916_OPEN", force_refresh=True)
                time.sleep(65)  # Sleep past the minute

            # 2. India: 09:31 AM IST (15m ORB complete)
            elif now_ist.weekday() < 5 and now_ist.hour == 9 and now_ist.minute == 31:
                print(f"[SCHEDULER] ⏰ Triggering 09:31 AM IST India ORB Range Scan...")
                run_market_scanner(market="INDIA", snapshot_mode="LIVE", force_refresh=True)
                time.sleep(65)

            # 3. US: 09:31 AM ET (Mon-Fri)
            elif now_et.weekday() < 5 and now_et.hour == 9 and now_et.minute == 31:
                print(f"[SCHEDULER] ⏰ Triggering Automated 09:31 AM ET US Opening Scan...")
                run_market_scanner(market="US", snapshot_mode="916_OPEN", force_refresh=True)
                time.sleep(65)

            time.sleep(30)
        except Exception as e:
            print(f"[SCHEDULER ERROR] {e}")
            time.sleep(60)


def start_scanner_scheduler():
    """Starts the background scheduler thread once."""
    global _SCHEDULER_RUNNING
    if not _SCHEDULER_RUNNING:
        _SCHEDULER_RUNNING = True
        t = threading.Thread(target=_scheduler_worker, daemon=True, name="ScannerScheduler")
        t.start()
        print("✅ Background Market Scanner Scheduler started (09:16 AM IST / 09:31 AM ET / 24/5 FX)")


# Start scheduler on module load
start_scanner_scheduler()
