"""
tests/integration/test_orders_api.py
====================================
Integration test suite for the Paper Order Management System (OMS) REST API endpoints.
Tests FastAPI endpoints:
- POST /api/orders
- GET /api/orders
- GET /api/orders/{order_id}
- POST /api/orders/{order_id}/cancel
- GET /api/orders/{order_id}/fills
- GET /api/execution/metrics
- POST /api/orders/{order_id}/fill-step
- POST /api/orders/simulate-tick
- GET /api/execution/reconcile
"""

import os
import json
import tempfile
import unittest
from fastapi.testclient import TestClient
from datetime import datetime
from zoneinfo import ZoneInfo

from server import app
from engine import order_manager


class TestOrdersAPI(unittest.TestCase):

    def setUp(self):
        """Sets up isolated temporary paths and swaps the singleton OMS."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.orders_path = os.path.join(self.temp_dir.name, "paper_orders.json")
        self.history_path = os.path.join(self.temp_dir.name, "trade_history.csv")
        self.config_path = os.path.join(self.temp_dir.name, "bot_active_config.json")

        initial_config = {
            "symbol": "SBIN.NS",
            "cash": 1_000_000.0,
            "capital": 1_000_000.0,
            "daily_starting_equity": 1_000_000.0,
            "daily_baseline_date": datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d"),
            "circuit_breaker_triggered": False,
            "in_position": False,
            "shares": 0,
            "status": "ARMED"
        }
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(initial_config, f, indent=2)

        # Create isolated OMS instance and monkeypatch into order_manager module
        self.isolated_oms = order_manager.OrderManager(
            orders_file_path=self.orders_path,
            history_file_path=self.history_path,
            config_file_path=self.config_path,
            enforce_market_hours=False
        )
        self.orig_oms = order_manager._GLOBAL_ORDER_MANAGER
        order_manager._GLOBAL_ORDER_MANAGER = self.isolated_oms

        self.client = TestClient(app)

    def tearDown(self):
        """Restores original singleton OMS and cleans up temp files."""
        order_manager._GLOBAL_ORDER_MANAGER = self.orig_oms
        self.temp_dir.cleanup()

    def test_01_submit_market_order_and_get_details(self):
        payload = {
            "symbol": "SBIN.NS",
            "side": "BUY",
            "order_type": "MARKET",
            "quantity": 100,
            "simulated_market_price": 820.0
        }
        resp = self.client.post("/api/orders", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertTrue(data["is_new"])
        order = data["order"]
        self.assertEqual(order["status"], "FILLED")
        self.assertEqual(order["filled_quantity"], 100)
        self.assertEqual(len(order["fills"]), 1)

        # GET /api/orders/{order_id}
        get_resp = self.client.get(f"/api/orders/{order['order_id']}")
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.json()["order_id"], order["order_id"])

        # GET /api/orders/{order_id}/fills
        fills_resp = self.client.get(f"/api/orders/{order['order_id']}/fills")
        self.assertEqual(fills_resp.status_code, 200)
        self.assertEqual(len(fills_resp.json()["fills"]), 1)

    def test_02_idempotency_protection(self):
        payload = {
            "symbol": "TCS.NS",
            "side": "BUY",
            "order_type": "LIMIT",
            "quantity": 50,
            "limit_price": 4100.0,
            "idempotency_key": "IDEMP-TEST-KEY-456"
        }
        resp1 = self.client.post("/api/orders", json=payload)
        self.assertEqual(resp1.status_code, 200)
        d1 = resp1.json()
        self.assertTrue(d1["is_new"])

        # Immediate retry
        resp2 = self.client.post("/api/orders", json=payload)
        self.assertEqual(resp2.status_code, 200)
        d2 = resp2.json()
        self.assertFalse(d2["is_new"])
        self.assertEqual(d1["order"]["order_id"], d2["order"]["order_id"])

    def test_03_cancel_limit_order(self):
        payload = {
            "symbol": "INFY.NS",
            "side": "BUY",
            "order_type": "LIMIT",
            "quantity": 100,
            "limit_price": 1800.0
        }
        resp = self.client.post("/api/orders", json=payload)
        order_id = resp.json()["order[" if "order[" in resp.json() else "order"]["order_id"]

        cancel_resp = self.client.post(f"/api/orders/{order_id}/cancel", json={"reason": "User test cancel"})
        self.assertEqual(cancel_resp.status_code, 200)
        self.assertEqual(cancel_resp.json()["order"]["status"], "CANCELLED")

        # Second cancel attempt must return 400
        repeat_cancel = self.client.post(f"/api/orders/{order_id}/cancel")
        self.assertEqual(repeat_cancel.status_code, 400)

    def test_04_fill_step_and_simulate_tick(self):
        # Create limit order
        payload = {
            "symbol": "HDFCBANK.NS",
            "side": "BUY",
            "order_type": "LIMIT",
            "quantity": 100,
            "limit_price": 1700.0
        }
        order_id = self.client.post("/api/orders", json=payload).json()["order"]["order_id"]

        # Step 1: Partial fill via fill-step
        step_resp = self.client.post(
            f"/api/orders/{order_id}/fill-step",
            json={"quantity": 30, "price": 1695.0}
        )
        self.assertEqual(step_resp.status_code, 200)
        self.assertEqual(step_resp.json()["order"]["status"], "PARTIALLY_FILLED")
        self.assertEqual(step_resp.json()["order"]["filled_quantity"], 30)

        # Step 2: Tick matching for remaining 70 shares
        tick_resp = self.client.post(
            "/api/orders/simulate-tick",
            json={"symbol": "HDFCBANK.NS", "price": 1690.0, "volume": 100}
        )
        self.assertEqual(tick_resp.status_code, 200)
        self.assertEqual(tick_resp.json()["count"], 1)

        # Check order is now FILLED
        final_order = self.client.get(f"/api/orders/{order_id}").json()
        self.assertEqual(final_order["status"], "FILLED")
        self.assertEqual(final_order["filled_quantity"], 100)

    def test_05_execution_metrics_and_reconciliation(self):
        # Place 1 market order
        self.client.post(
            "/api/orders",
            json={"symbol": "SBIN.NS", "side": "BUY", "order_type": "MARKET", "quantity": 50, "simulated_market_price": 800.0}
        )
        # Place 1 limit order
        self.client.post(
            "/api/orders",
            json={"symbol": "SBIN.NS", "side": "BUY", "order_type": "LIMIT", "quantity": 50, "limit_price": 750.0}
        )

        metrics_resp = self.client.get("/api/execution/metrics")
        self.assertEqual(metrics_resp.status_code, 200)
        m = metrics_resp.json()
        self.assertEqual(m["total_orders"], 2)
        self.assertEqual(m["filled_orders"], 1)
        self.assertEqual(m["pending_orders"], 1)
        self.assertEqual(m["total_executed_qty"], 50)
        self.assertEqual(m["execution_source"], "PAPER")

        recon_resp = self.client.get("/api/execution/reconcile")
        self.assertEqual(recon_resp.status_code, 200)
        r = recon_resp.json()
        self.assertTrue(r["is_reconciled"])
        self.assertEqual(r["orders_filled_quantity"], 50)


if __name__ == "__main__":
    unittest.main()
