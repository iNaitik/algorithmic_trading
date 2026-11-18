"""
test_quant_lab_api.py
======================
Automated integration test for Quant Lab repairs:
1. Strategy Studio Parameter Binding & execution (/api/backtest)
2. Factor Matrix execution & polling endpoints (/api/matrix/task/{id} and /api/matrix/tasks/{id})
3. Factor Matrix summary telemetry update
"""

import urllib.request
import json
import time
import sys

BASE_URL = "http://127.0.0.1:8000"

def test_strategy_studio_backtest():
    print("\n--- 1. Testing Strategy Studio /api/backtest with Custom Parameters ---")
    payload = {
        "market": "INDIA",
        "symbol": "SBIN.NS",
        "interval": "15m",
        "lookback_days": 10,
        "initial_capital": 500000.0,
        "strategy_name": "NSE Intraday ORB Breakout"
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/backtest",
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as res:
        assert res.status == 200, f"Expected 200, got {res.status}"
        data = json.loads(res.read().decode('utf-8'))
        assert "summary" in data, "Missing 'summary' in backtest response"
        assert "trades" in data, "Missing 'trades' in backtest response"
        assert "candles" in data, "Missing 'candles' in backtest response"
        print(f"  ✓ /api/backtest success! Net P&L: {data['summary'].get('net_pnl')}, Trades: {len(data['trades'])}, Candles: {len(data['candles'])}")
        return data

def test_factor_matrix_run_and_polling():
    print("\n--- 2. Testing Factor Matrix /api/matrix/run and Polling Endpoints ---")
    payload = {
        "symbols": ["SBIN.NS"],
        "timeframes": ["15m"],
        "strategies": ["NSE Intraday ORB Breakout"],
        "initial_capital": 1000000.0,
        "lookback_days": 15
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/matrix/run",
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as res:
        assert res.status == 200
        run_data = json.loads(res.read().decode('utf-8'))
        task_id = run_data["task_id"]
        print(f"  ✓ Started task_id: {task_id}, total_runs: {run_data['total_runs']}")

    # Test singular endpoint /api/matrix/task/{task_id}
    with urllib.request.urlopen(f"{BASE_URL}/api/matrix/task/{task_id}") as res:
        assert res.status == 200
        data_singular = json.loads(res.read().decode('utf-8'))
        assert "status" in data_singular
        print(f"  ✓ Singular route /api/matrix/task/{task_id} OK (status: {data_singular['status']})")

    # Test plural alias route /api/matrix/tasks/{task_id}
    with urllib.request.urlopen(f"{BASE_URL}/api/matrix/tasks/{task_id}") as res:
        assert res.status == 200
        data_plural = json.loads(res.read().decode('utf-8'))
        assert "status" in data_plural
        print(f"  ✓ Plural route alias /api/matrix/tasks/{task_id} OK (status: {data_plural['status']})")

    # Poll until COMPLETED or FAILED
    status_data = None
    for attempt in range(20):
        with urllib.request.urlopen(f"{BASE_URL}/api/matrix/task/{task_id}") as res:
            status_data = json.loads(res.read().decode('utf-8'))
            prog = status_data.get("progress", {})
            print(f"    [Poll #{attempt + 1}] status={status_data['status']}, pct={prog.get('pct')}%, item={prog.get('current_item')}")
            if status_data["status"] in ("COMPLETED", "FAILED"):
                break
        time.sleep(1.2)

    assert status_data["status"] == "COMPLETED", f"Expected COMPLETED, got {status_data['status']}"
    print(f"  ✓ Matrix evaluation completed! Results count: {len(status_data.get('results', []))}")

    # Check /api/matrix/summary
    with urllib.request.urlopen(f"{BASE_URL}/api/matrix/summary") as res:
        assert res.status == 200
        sum_data = json.loads(res.read().decode('utf-8'))
        print(f"  ✓ Factor Matrix Summary refreshed! Total matrix entries: {len(sum_data.get('matrix', []))}")

def main():
    print("==================================================")
    print("QUANT LAB INTEGRATION & API VERIFICATION SUITE")
    print("==================================================")
    test_strategy_studio_backtest()
    test_factor_matrix_run_and_polling()
    print("\n==================================================")
    print("ALL QUANT LAB INTEGRATION TESTS PASSED (100% OK)")
    print("==================================================")

if __name__ == "__main__":
    main()
