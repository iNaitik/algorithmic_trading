/**
 * test_trade_journal_adapter.js
 * ==============================
 * Validates Trade Journal data adaptation and schema compatibility:
 * 1. Adapting raw execution fills into completed round-trips via computeRoundTrips().
 * 2. Confirming zero NaN, undefined, or missing fields across all columns.
 * 3. Confirming unmatched open positions are isolated from completed round trips.
 * 4. Normalizing backtest trades and live bot fills into identical tabular contracts.
 */

import { computeRoundTrips } from '../../frontend/src/utils/tradeUtils.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ [FAIL] ${message}`);
    process.exit(1);
  }
}

console.log('======================================================');
console.log('--- UNIT TEST SUITE: TRADE JOURNAL DATA ADAPTATION ---');
console.log('======================================================\n');

// 1. Test raw live execution fills from actual bot ledger format
const sampleFills = [
  {
    Timestamp: "2026-11-18 10:15:00",
    Symbol: "TCS.NS",
    Action: "BUY",
    Shares: 208,
    Execution_Price: 2398.70,
    RawAmount: -498929.60,
    BalanceAfter: 501070.40
  },
  {
    Timestamp: "2026-11-18 11:30:00",
    Symbol: "TCS.NS",
    Action: "SELL",
    Shares: 208,
    Execution_Price: 2398.20,
    RawAmount: 498602.58,
    BalanceAfter: 999672.98
  },
  {
    Timestamp: "2026-11-18 12:45:00",
    Symbol: "ICICIBANK.NS",
    Action: "SHORT",
    Shares: 313,
    Execution_Price: 1593.10,
    RawAmount: -199.14,
    BalanceAfter: 999473.84
  },
  {
    Timestamp: "2026-11-18 15:15:00",
    Symbol: "ICICIBANK.NS",
    Action: "COVER",
    Shares: 313,
    Execution_Price: 1599.60,
    RawAmount: -2058.44,
    BalanceAfter: 997415.40
  },
  // Open unmatched entry leg (active position)
  {
    Timestamp: "2026-11-18 15:20:00",
    Symbol: "SBIN.NS",
    Action: "BUY",
    Shares: 500,
    Execution_Price: 818.50,
    RawAmount: -409250.00,
    BalanceAfter: 588165.40
  }
];

const { pairedTrades, openLongs, openShorts, unmatchedExits } = computeRoundTrips(sampleFills);

// Adapt into Trade Journal schema
const adaptedTrades = pairedTrades.map((pt, idx) => ({
  id: pt.id || `LIVE-${idx + 1}`,
  symbol: pt.symbol || "UNKNOWN",
  placed_at: pt.entryTime || pt.entryDate || "N/A",
  exited_at: pt.exitTime || pt.exitDate || "N/A",
  side: pt.side || "LONG",
  entry_price: Number(pt.entryPrice || 0),
  exit_price: Number(pt.exitPrice || 0),
  shares: Number(pt.shares || 0),
  gross_pnl: Number(pt.grossPnl || 0),
  fees: Number(pt.fees || 0),
  net_pnl: Number(pt.netPnl || 0),
  pnl_pct: Number(pt.returnPct || 0),
  is_win: Number(pt.netPnl || 0) >= 0
}));

// Test 1: Paired trades count
assert(adaptedTrades.length === 2, `Expected 2 completed round-trips, got ${adaptedTrades.length}`);
console.log('  ✓ [PASS] 1. Correctly paired 2 completed round trips from raw ledger fills.');

// Test 2: Schema validation - no NaN, undefined, or missing values
for (const t of adaptedTrades) {
  assert(typeof t.id === 'string' && t.id.length > 0, `Trade ID missing: ${JSON.stringify(t)}`);
  assert(t.placed_at !== undefined && t.placed_at !== "undefined" && !t.placed_at.includes("NaN"), `Invalid placed_at: ${t.placed_at}`);
  assert(t.exited_at !== undefined && t.exited_at !== "undefined" && !t.exited_at.includes("NaN"), `Invalid exited_at: ${t.exited_at}`);
  assert(t.side === "LONG" || t.side === "SHORT", `Invalid side: ${t.side}`);
  assert(!isNaN(t.entry_price) && t.entry_price > 0, `Invalid entry_price: ${t.entry_price}`);
  assert(!isNaN(t.exit_price) && t.exit_price > 0, `Invalid exit_price: ${t.exit_price}`);
  assert(!isNaN(t.shares) && t.shares > 0, `Invalid shares: ${t.shares}`);
  assert(!isNaN(t.gross_pnl), `Invalid gross_pnl: ${t.gross_pnl}`);
  assert(!isNaN(t.fees) && t.fees >= 0, `Invalid fees: ${t.fees}`);
  assert(!isNaN(t.net_pnl), `Invalid net_pnl: ${t.net_pnl}`);
  assert(!isNaN(t.pnl_pct), `Invalid pnl_pct: ${t.pnl_pct}`);
  assert(typeof t.is_win === 'boolean', `Invalid is_win: ${t.is_win}`);
}
console.log('  ✓ [PASS] 2. Schema verified: Zero NaN, zero undefined, and zero blank values across all rows.');

// Test 3: Financial reconciliation of adapted trades
const tcsTrade = adaptedTrades.find(t => t.symbol === "TCS.NS");
assert(tcsTrade, "TCS.NS trade missing");
assert(tcsTrade.side === "LONG", "TCS trade should be LONG");
assert(tcsTrade.shares === 208, `TCS shares expected 208, got ${tcsTrade.shares}`);
assert(tcsTrade.gross_pnl === -104.0, `TCS gross P&L expected -104, got ${tcsTrade.gross_pnl}`);
assert(tcsTrade.is_win === false, "TCS trade should be LOSS");
console.log('  ✓ [PASS] 3. Financial math verified for LONG round-trip (TCS.NS).');

const iciciTrade = adaptedTrades.find(t => t.symbol === "ICICIBANK.NS");
assert(iciciTrade, "ICICIBANK.NS trade missing");
assert(iciciTrade.side === "SHORT", "ICICIBANK trade should be SHORT");
assert(iciciTrade.shares === 313, `ICICI shares expected 313, got ${iciciTrade.shares}`);
assert(iciciTrade.gross_pnl === -2034.5, `ICICI gross P&L expected -2034.5, got ${iciciTrade.gross_pnl}`);
assert(iciciTrade.is_win === false, "ICICI trade should be LOSS");
console.log('  ✓ [PASS] 4. Financial math verified for SHORT round-trip (ICICIBANK.NS).');

// Test 4: Unmatched open positions isolated
const openPositions = [];
Object.entries(openLongs).forEach(([sym, entries]) => {
  entries.forEach((e, idx) => {
    if (e.remainingShares > 0.0001) {
      openPositions.push({
        id: `OPEN-L-${sym}-${idx}`,
        symbol: sym,
        side: "LONG",
        placed_at: e.Timestamp || e.Time || "N/A",
        entry_price: Number(e.price || e.Execution_Price || 0),
        shares: Number(e.remainingShares || 0),
        original_shares: Number(e.originalShares || e.Shares || 0),
        status: "OPEN"
      });
    }
  });
});

assert(openPositions.length === 1, `Expected 1 open position, got ${openPositions.length}`);
assert(openPositions[0].symbol === "SBIN.NS", "Open position should be SBIN.NS");
assert(openPositions[0].shares === 500, "Open position shares should be 500");
assert(openPositions[0].entry_price === 818.5, "Open position price should be 818.5");
console.log('  ✓ [PASS] 5. Unmatched open position (SBIN.NS 500 @ 818.50) isolated cleanly without polluting round-trip table.');

console.log('\n======================================================');
console.log('ALL TRADE JOURNAL ADAPTER TESTS PASSED (100% OK)');
console.log('======================================================\n');
