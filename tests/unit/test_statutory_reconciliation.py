"""
test_statutory_reconciliation.py (Unit Test)
============================================
Isolated validation of Indian statutory charges and trade P&L reconciliation.

Calculates:
- Gross Realized P&L
- Brokerage (0.03% capped at ₹20 per leg)
- STT (0.025% on intraday sell)
- NSE Exchange Transaction Charges (0.00297%)
- SEBI Turnover Charges (₹10 / crore = 0.0001%)
- Stamp Duty (0.003% on buy)
- GST (18% on Brokerage + Exchange + SEBI)
- Net Realized P&L

Isolation Guarantee:
- Pure functional calculations with zero network, disk write, or database mutation.
"""

import sys
import os
import math

# Add root directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from engine.live_trader import calculate_buy_costs, calculate_sell_proceeds, SLIPPAGE_PCT

def calculate_independent_breakdown(shares: int, buy_price: float, sell_price: float, is_short: bool = False):
    """Independently calculates each fee component to micro-cent accuracy according to NSE/SEBI rules."""
    exec_buy_price = round(buy_price * (1.0 + SLIPPAGE_PCT), 2)
    exec_sell_price = round(sell_price * (1.0 - SLIPPAGE_PCT), 2)

    buy_val = shares * exec_buy_price
    sell_val = shares * exec_sell_price

    # Buy Leg Charges
    brokerage_buy = min(20.0, buy_val * 0.0003)
    exchange_buy = buy_val * 0.0000297
    sebi_buy = buy_val * 0.000001
    stamp_duty = buy_val * 0.00003
    gst_buy = (brokerage_buy + exchange_buy + sebi_buy) * 0.18
    total_buy_fees = brokerage_buy + exchange_buy + sebi_buy + stamp_duty + gst_buy
    total_buy_cost = round(buy_val + total_buy_fees, 2)

    # Sell Leg Charges
    brokerage_sell = min(20.0, sell_val * 0.0003)
    exchange_sell = sell_val * 0.0000297
    sebi_sell = sell_val * 0.000001
    stt_sell = sell_val * 0.00025
    gst_sell = (brokerage_sell + exchange_sell + sebi_sell) * 0.18
    total_sell_fees = brokerage_sell + exchange_sell + sebi_sell + stt_sell + gst_sell
    total_sell_proceeds = round(sell_val - total_sell_fees, 2)

    # Aggregates
    total_brokerage = round(brokerage_buy + brokerage_sell, 2)
    total_stt = round(stt_sell, 2)
    total_exchange = round(exchange_buy + exchange_sell, 2)
    total_sebi = round(sebi_buy + sebi_sell, 2)
    total_stamp_duty = round(stamp_duty, 2)
    total_gst = round(gst_buy + gst_sell, 2)
    total_all_charges = round(total_buy_fees + total_sell_fees, 2)

    gross_pnl = round((exec_sell_price - exec_buy_price) * shares, 2)
    net_realized_pnl = round(total_sell_proceeds - total_buy_cost, 2)

    return {
        "exec_buy_price": exec_buy_price,
        "exec_sell_price": exec_sell_price,
        "buy_turnover": buy_val,
        "sell_turnover": sell_val,
        "gross_realized_pnl": gross_pnl,
        "brokerage": total_brokerage,
        "stt": total_stt,
        "exchange_charges": total_exchange,
        "sebi_charges": total_sebi,
        "stamp_duty": total_stamp_duty,
        "gst": total_gst,
        "total_charges": total_all_charges,
        "net_realized_pnl": net_realized_pnl,
        "engine_buy_cost": total_buy_cost,
        "engine_sell_proceeds": total_sell_proceeds
    }


def run_statutory_tests():
    print("\n========================================================")
    print("--- UNIT TEST SUITE: STATUTORY CHARGES RECONCILIATION ---")
    print("========================================================\n")

    test_cases = [
        {"name": "Tier A: Sub-cap small trade (30 shares @ ₹500)", "shares": 30, "entry": 500.0, "exit": 520.0, "is_short": False},
        {"name": "Tier B: Large turnover trade (922 shares @ ₹1080 - SBIN)", "shares": 922, "entry": 1080.0, "exit": 1085.0, "is_short": False},
        {"name": "Tier C: Short intraday trade (200 shares @ ₹2500 - RELIANCE)", "shares": 200, "entry": 2500.0, "exit": 2480.0, "is_short": True},
        {"name": "Tier D: Loss trade (150 shares @ ₹1600 - HDFCBANK)", "shares": 150, "entry": 1600.0, "exit": 1580.0, "is_short": False}
    ]

    all_passed = True
    for tc in test_cases:
        shs = tc["shares"]
        entry_p = tc["entry"]
        exit_p = tc["exit"]
        is_short = tc["is_short"]

        if is_short:
            sell_p, buy_p = entry_p, exit_p
        else:
            buy_p, sell_p = entry_p, exit_p

        # Independent calculation
        ind = calculate_independent_breakdown(shs, buy_p, sell_p, is_short)

        # Engine calculation
        engine_buy_price, engine_buy_cost = calculate_buy_costs(shs, buy_p)
        engine_sell_price, engine_sell_proceeds = calculate_sell_proceeds(shs, sell_p)

        # Comparisons
        diff_buy_cost = abs(ind["engine_buy_cost"] - engine_buy_cost)
        diff_sell_proceeds = abs(ind["engine_sell_proceeds"] - engine_sell_proceeds)
        math_check = abs((ind["gross_realized_pnl"] - ind["total_charges"]) - ind["net_realized_pnl"])

        status = "PASS" if (diff_buy_cost < 0.05 and diff_sell_proceeds < 0.05 and math_check < 0.1) else "FAIL"
        if status == "FAIL":
            all_passed = False

        print(f"[{status}] {tc['name']}")
        print(f"       Shares: {shs} | Entry: ₹{entry_p:.2f} | Exit: ₹{exit_p:.2f}")
        print(f"       Turnover: Buy ₹{ind['buy_turnover']:,.2f} + Sell ₹{ind['sell_turnover']:,.2f}")
        print(f"       - Brokerage:           ₹{ind['brokerage']:.2f}")
        print(f"       - STT (0.025% sell):   ₹{ind['stt']:.2f}")
        print(f"       - Exchange (0.00297%): ₹{ind['exchange_charges']:.2f}")
        print(f"       - SEBI (₹10/cr):       ₹{ind['sebi_charges']:.2f}")
        print(f"       - Stamp Duty (0.003%): ₹{ind['stamp_duty']:.2f}")
        print(f"       - GST (18% on fees):   ₹{ind['gst']:.2f}")
        print(f"       Total Statutory Fees:  ₹{ind['total_charges']:.2f}")
        print(f"       Gross P&L:             ₹{ind['gross_realized_pnl']:+,.2f}")
        print(f"       Net Realized P&L:      ₹{ind['net_realized_pnl']:+,.2f}")
        print(f"       Mathematical Parity:   Gross (₹{ind['gross_realized_pnl']:,.2f}) - Fees (₹{ind['total_charges']:,.2f}) = Net (₹{ind['net_realized_pnl']:,.2f}) ✓\n")

    assert all_passed, "One or more statutory reconciliation tests failed!"
    print("ALL STATUTORY CHARGES AND FINANCIAL RECONCILIATION TESTS PASSED!\n")


if __name__ == "__main__":
    run_statutory_tests()
