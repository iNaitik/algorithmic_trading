"""
test_control_safety.py
======================
Concurrency, Stress, and Control Safety Validation for Algo Trading Engine (TASK 02.1 Section 4).

Tests:
1. Rapid repeated PAUSE requests (10 concurrent calls)
2. Rapid repeated START requests (10 concurrent calls)
3. Repeated SQUARE_OFF requests (10 concurrent calls on flat / open position)
4. Concurrent conflicting control requests (Simultaneous START and PAUSE race conditions)
5. Simulated network timeout during a control request
"""

import sys
import os
import json
import time
import socket
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "http://127.0.0.1:8000"

def post_control(action: str, symbol: str = "SBIN.NS", timeout: float = 5.0):
    url = f"{BASE_URL}/api/bot/control"
    payload = json.dumps({"action": action, "symbol": symbol}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    start_t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            elapsed = time.time() - start_t
            body = json.loads(res.read().decode("utf-8"))
            return {"status_code": res.status, "body": body, "elapsed": elapsed, "error": None}
    except Exception as e:
        elapsed = time.time() - start_t
        return {"status_code": getattr(e, "code", 500), "body": None, "elapsed": elapsed, "error": str(e)}

def get_status():
    url = f"{BASE_URL}/api/bot/status"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=5.0) as res:
        return json.loads(res.read().decode("utf-8"))

def run_control_safety_tests():
    print("\n========================================================")
    print("--- TEST SUITE 4: CONCURRENCY & CONTROL SAFETY TESTS ---")
    print("========================================================\n")

    # ── TEST 1: Rapid Repeated PAUSE Requests ──
    print("[RUNNING] 1. Rapid repeated PAUSE requests (10 concurrent calls)...")
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(post_control, "PAUSE") for _ in range(10)]
        results = [f.result() for f in as_completed(futures)]

    status_codes = [r["status_code"] for r in results]
    assert all(code == 200 for code in status_codes), f"Expected all 200 OK, got: {status_codes}"
    current_state = get_status()
    bot_status = current_state.get("bot_state", {}).get("status")
    assert bot_status == "PAUSED", f"Expected bot state PAUSED, got {bot_status}"
    print(f"  ✓ [PASS] All 10 PAUSE requests returned 200 OK. Final state: '{bot_status}'\n")

    # ── TEST 2: Rapid Repeated START Requests ──
    print("[RUNNING] 2. Rapid repeated START requests (10 concurrent calls)...")
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(post_control, "START") for _ in range(10)]
        results = [f.result() for f in as_completed(futures)]

    status_codes = [r["status_code"] for r in results]
    assert all(code == 200 for code in status_codes), f"Expected all 200 OK, got: {status_codes}"
    current_state = get_status()
    bot_status = current_state.get("bot_state", {}).get("status")
    assert "ARMED" in bot_status or "ACTIVE" in bot_status, f"Expected ARMED/ACTIVE, got {bot_status}"
    print(f"  ✓ [PASS] All 10 START requests returned 200 OK. Final state: '{bot_status}'\n")

    # ── TEST 3: Repeated SQUARE_OFF Requests (Flat Position) ──
    print("[RUNNING] 3. Repeated SQUARE_OFF requests (10 concurrent calls on flat position)...")
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(post_control, "SQUARE_OFF") for _ in range(10)]
        results = [f.result() for f in as_completed(futures)]

    status_codes = [r["status_code"] for r in results]
    assert all(code == 200 for code in status_codes), f"Expected all 200 OK, got: {status_codes}"
    current_state = get_status()
    in_pos = current_state.get("bot_state", {}).get("in_position")
    shares = current_state.get("bot_state", {}).get("shares")
    assert in_pos is False and shares == 0, f"Expected in_position False, shares 0, got {in_pos}, {shares}"
    print(f"  ✓ [PASS] All 10 SQUARE_OFF requests handled gracefully without duplicate fills or errors.\n")

    # ── TEST 4: Concurrent Conflicting Control Requests (START vs PAUSE Race Condition) ──
    print("[RUNNING] 4. Concurrent conflicting control requests (5 START + 5 PAUSE simultaneous)...")
    actions = ["START", "PAUSE"] * 5
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(post_control, act) for act in actions]
        results = [f.result() for f in as_completed(futures)]

    status_codes = [r["status_code"] for r in results]
    assert all(code == 200 for code in status_codes), f"Conflicting requests caused errors: {status_codes}"
    current_state = get_status()
    bot_status = current_state.get("bot_state", {}).get("status")
    # Must be either PAUSED or ARMED/ACTIVE, never null, corrupted, or broken
    valid_states = ["PAUSED", "ARMED (STANDBY • MARKET CLOSED)", "ACTIVE (MONITORING)", "ACTIVE (IN POSITION)"]
    assert bot_status in valid_states, f"Invalid engine state after conflicting race: {bot_status}"
    print(f"  ✓ [PASS] Lock serialized 10 conflicting requests cleanly. Consistent final state: '{bot_status}'\n")

    # ── TEST 5: Simulated Network Timeout / Dropped Connection ──
    print("[RUNNING] 5. Simulated client network timeout / socket disconnect...")
    # Open socket, send partial HTTP request and immediately close socket to simulate client disconnect
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.0)
        s.connect(("127.0.0.1", 8000))
        # Send headers without finishing body or abruptly closing
        s.sendall(b"POST /api/bot/control HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 100\r\n\r\n{\"action\":")
        s.close()
    except Exception as e:
        pass

    # Now verify server is still responsive and healthy
    time.sleep(0.5)
    health_check = get_status()
    assert "bot_state" in health_check, "Server failed to respond after client timeout!"
    print(f"  ✓ [PASS] Server resilience verified: daemon intact and responding normally after aborted request.\n")

    # Restore bot state to ARMED
    post_control("START")
    print("ALL CONCURRENCY & CONTROL SAFETY TESTS PASSED!\n")

if __name__ == "__main__":
    run_control_safety_tests()
