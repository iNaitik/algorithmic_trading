import urllib.request
import json
import os

BASE_URL = 'http://127.0.0.1:8000'

# 1. Fetch current production state to restore afterwards
res = urllib.request.urlopen(f'{BASE_URL}/api/bot/state')
orig_state = json.loads(res.read())
orig_sym = orig_state.get('symbol', 'SBIN.NS')
orig_cap = orig_state.get('capital', 1000000.0)
orig_tf = orig_state.get('timeframe', '5m')
orig_sl = orig_state.get('stop_loss_pct', 0.8)
orig_tp = orig_state.get('take_profit_multiple', 2.0)
orig_dd = orig_state.get('max_drawdown_pct', 2.0)

print(f"[PRE-TEST] Original Config: {orig_sym}, Cap=Rs {orig_cap:,.0f}, TF={orig_tf}, SL={orig_sl}%, TP={orig_tp}R, DD={orig_dd}%")

try:
    # 2. Update configuration (Automation Workflow)
    update_payload = {
        'action': 'CONFIG',
        'symbol': 'HDFCBANK.NS',
        'strategy_name': 'NSE Intraday ORB Breakout',
        'capital': 2500000.0,
        'timeframe': '15m',
        'stop_loss_pct': 1.5,
        'take_profit_multiple': 3.0,
        'max_drawdown_pct': 2.0,
        'max_trades_per_symbol': 2
    }
    req = urllib.request.Request(
        f'{BASE_URL}/api/bot/control',
        data=json.dumps(update_payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    res = urllib.request.urlopen(req)
    res_json = json.loads(res.read())
    print("[STEP 2] Config update response status:", res_json.get('bot_state', {}).get('status'))

    # 3. Simulate page refresh: GET /api/bot/status
    res = urllib.request.urlopen(f'{BASE_URL}/api/bot/status')
    status_data = json.loads(res.read())
    bot = status_data.get('bot_state', {})
    risk = status_data.get('risk_metrics', {})

    print("[STEP 3/4] Verified Persisted Configuration on Refresh:")
    print(f"  • Symbol: {bot.get('symbol')} (Expected: HDFCBANK.NS)")
    print(f"  • Capital: Rs {bot.get('capital'):,.0f} (Expected: Rs 2,500,000)")
    print(f"  • Timeframe: {bot.get('timeframe')} (Expected: 15m)")
    print(f"  • Stop-Loss: {bot.get('stop_loss_pct')}% (Expected: 1.5%)")
    print(f"  • Take-Profit: {bot.get('take_profit_multiple')}R (Expected: 3.0R)")
    print(f"  • Max Quota: {bot.get('max_trades_per_symbol')} (Expected: 2)")

    assert bot.get('symbol') == 'HDFCBANK.NS'
    assert bot.get('capital') == 2500000.0
    assert bot.get('timeframe') == '15m'
    assert bot.get('stop_loss_pct') == 1.5
    assert bot.get('take_profit_multiple') == 3.0
    assert bot.get('max_trades_per_symbol') == 2

    # 4. Verify Risk Monitor telemetry
    print("[STEP 5] Risk Monitor Telemetry Verification:")
    print(f"  • Day Baseline: Rs {risk.get('starting_daily_equity'):,.0f}")
    print(f"  • Max Daily Loss: Rs {risk.get('max_daily_loss'):,.0f} ({risk.get('max_drawdown_pct')}%)")
    print(f"  • Remaining Risk: Rs {risk.get('remaining_risk_allowance'):,.0f}")
    print(f"  • Circuit Status: {risk.get('circuit_breaker_triggered')}")

    # In Task 04.1.2: The daily opening-equity baseline remains immutable (1,000,000.0)
    # during an active session; configured capital (2,500,000.0) applies to the next session.
    assert risk.get('starting_daily_equity') == orig_cap
    assert risk.get('max_daily_loss') == (orig_cap * (orig_dd / 100.0))
    assert risk.get('circuit_breaker_triggered') == False
    print("✓ Config save, persistence across page refresh, and Risk Monitor telemetry verified!")

finally:
    # Restore original production config
    restore_payload = {
        'action': 'CONFIG',
        'symbol': orig_sym,
        'strategy_name': 'NSE Intraday ORB Breakout',
        'capital': orig_cap,
        'timeframe': orig_tf,
        'stop_loss_pct': orig_sl,
        'take_profit_multiple': orig_tp,
        'max_drawdown_pct': orig_dd,
        'max_trades_per_symbol': 1
    }
    req = urllib.request.Request(
        f'{BASE_URL}/api/bot/control',
        data=json.dumps(restore_payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    urllib.request.urlopen(req)
    print(f"[POST-TEST] Restored production configuration: {orig_sym}, Cap=Rs {orig_cap:,.0f}")
