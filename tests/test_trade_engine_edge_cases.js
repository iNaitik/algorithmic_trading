/**
 * test_trade_engine_edge_cases.js
 * ===============================
 * Automated Test Suite for Trading Ledger Edge Cases (TASK 02.1)
 * 
 * Tests:
 * 1. Multiple entries followed by one exit.
 * 2. One entry followed by multiple partial exits.
 * 3. Multiple independent trades in the same instrument.
 * 4. SHORT followed by COVER.
 * 5. Partial square-offs.
 * 6. Unmatched entry legs.
 * 7. Duplicate execution records.
 * 8. Out-of-order execution timestamps.
 * 9. Financial reconciliation & fee allocation.
 * 10. Long & Short portfolio valuation and double-counting prevention.
 */

const assert = require('assert');
const { computeRoundTrips, computePortfolioMetrics, parseTimestamp } = require('../frontend/src/utils/tradeUtils.js');

let passedTests = 0;
let totalTests = 0;
const failures = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failures.push({ name, error: err });
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('--- TEST SUITE 1: FIFO MATCHING & LEDGER EDGE CASES ---');
console.log('======================================================\n');

// ── TEST 1: Multiple entries followed by one exit ──
test('1. Multiple entries followed by one exit (100 @ 100, 200 @ 105 -> SELL 300 @ 110)', () => {
  const trades = [
    { id: 'T1', Timestamp: '2026-11-18 10:00:00', Action: 'BUY', Symbol: 'TCS.NS', Shares: 100, Execution_Price: 100.0, RawAmount: -10005.0 },
    { id: 'T2', Timestamp: '2026-11-18 10:05:00', Action: 'BUY', Symbol: 'TCS.NS', Shares: 200, Execution_Price: 105.0, RawAmount: -21010.0 },
    { id: 'T3', Timestamp: '2026-11-18 10:30:00', Action: 'SELL', Symbol: 'TCS.NS', Shares: 300, Execution_Price: 110.0, RawAmount: 32980.0 }
  ];

  const { pairedTrades, openLongs, unmatchedExits } = computeRoundTrips(trades);

  assert.strictEqual(pairedTrades.length, 2, 'Should produce 2 paired round-trip slices');
  assert.strictEqual(unmatchedExits.length, 0, 'No unmatched exits');
  assert.strictEqual(openLongs['TCS.NS'].length, 0, 'No remaining open inventory');

  // Slice 1: 100 shares matched against T1
  assert.strictEqual(pairedTrades[0].shares, 100);
  assert.strictEqual(pairedTrades[0].entryPrice, 100.0);
  assert.strictEqual(pairedTrades[0].exitPrice, 110.0);
  assert.strictEqual(pairedTrades[0].grossPnl, 1000.0); // (110 - 100) * 100

  // Slice 2: 200 shares matched against T2
  assert.strictEqual(pairedTrades[1].shares, 200);
  assert.strictEqual(pairedTrades[1].entryPrice, 105.0);
  assert.strictEqual(pairedTrades[1].exitPrice, 110.0);
  assert.strictEqual(pairedTrades[1].grossPnl, 1000.0); // (110 - 105) * 200

  const totalGross = pairedTrades[0].grossPnl + pairedTrades[1].grossPnl;
  assert.strictEqual(totalGross, 2000.0, 'Total Gross P&L should be ₹2000.00');

  // Verify net P&L reconciliation
  const totalNet = pairedTrades[0].netPnl + pairedTrades[1].netPnl;
  const expectedNet = (-10005.0 - 21010.0 + 32980.0); // 1965.0
  assert.strictEqual(Math.round(totalNet), Math.round(expectedNet), 'Net P&L must match cash difference');
});

// ── TEST 2: One entry followed by multiple partial exits ──
test('2. One entry followed by multiple partial exits (BUY 300 @ 100 -> SELL 100 @ 105, SELL 200 @ 110)', () => {
  const trades = [
    { id: 'T1', Timestamp: '2026-11-18 10:00:00', Action: 'BUY', Symbol: 'INFY.NS', Shares: 300, Execution_Price: 100.0, RawAmount: -30015.0 },
    { id: 'T2', Timestamp: '2026-11-18 10:15:00', Action: 'SELL', Symbol: 'INFY.NS', Shares: 100, Execution_Price: 105.0, RawAmount: 10495.0 },
    { id: 'T3', Timestamp: '2026-11-18 10:30:00', Action: 'SELL', Symbol: 'INFY.NS', Shares: 200, Execution_Price: 110.0, RawAmount: 21990.0 }
  ];

  const { pairedTrades, openLongs, unmatchedExits } = computeRoundTrips(trades);

  assert.strictEqual(pairedTrades.length, 2, 'Should produce 2 paired round-trip slices');
  assert.strictEqual(unmatchedExits.length, 0, 'All exits matched');
  assert.strictEqual(openLongs['INFY.NS'].length, 0, 'No open longs left');

  // Exit 1: 100 shares
  assert.strictEqual(pairedTrades[0].shares, 100);
  assert.strictEqual(pairedTrades[0].entryPrice, 100.0);
  assert.strictEqual(pairedTrades[0].exitPrice, 105.0);
  assert.strictEqual(pairedTrades[0].grossPnl, 500.0); // (105 - 100) * 100

  // Exit 2: 200 shares
  assert.strictEqual(pairedTrades[1].shares, 200);
  assert.strictEqual(pairedTrades[1].entryPrice, 100.0);
  assert.strictEqual(pairedTrades[1].exitPrice, 110.0);
  assert.strictEqual(pairedTrades[1].grossPnl, 2000.0); // (110 - 100) * 200

  const totalGross = pairedTrades[0].grossPnl + pairedTrades[1].grossPnl;
  assert.strictEqual(totalGross, 2500.0, 'Total Gross P&L should be ₹2500.00');

  // Total Net Cash impact: -30015 + 10495 + 21990 = 2470.0
  const totalNet = Number((pairedTrades[0].netPnl + pairedTrades[1].netPnl).toFixed(2));
  assert.strictEqual(totalNet, 2470.0, 'Net P&L must equal cash change sum');
});

// ── TEST 3: Multiple independent trades in the same instrument ──
test('3. Multiple independent trades in the same instrument', () => {
  const trades = [
    // Trade 1: Long win
    { id: 'T1', Timestamp: '2026-11-18 09:30:00', Action: 'BUY', Symbol: 'RELIANCE.NS', Shares: 50, Execution_Price: 2500.0, RawAmount: -125025.0 },
    { id: 'T2', Timestamp: '2026-11-18 09:45:00', Action: 'SELL', Symbol: 'RELIANCE.NS', Shares: 50, Execution_Price: 2520.0, RawAmount: 125970.0 },
    // Trade 2: Long loss
    { id: 'T3', Timestamp: '2026-11-18 10:15:00', Action: 'BUY', Symbol: 'RELIANCE.NS', Shares: 50, Execution_Price: 2530.0, RawAmount: -126525.0 },
    { id: 'T4', Timestamp: '2026-11-18 10:30:00', Action: 'SELL', Symbol: 'RELIANCE.NS', Shares: 50, Execution_Price: 2510.0, RawAmount: 125470.0 },
    // Trade 3: Short win
    { id: 'T5', Timestamp: '2026-11-18 11:00:00', Action: 'SHORT', Symbol: 'RELIANCE.NS', Shares: 50, Execution_Price: 2510.0, RawAmount: -125470.0 },
    { id: 'T6', Timestamp: '2026-11-18 11:30:00', Action: 'COVER', Symbol: 'RELIANCE.NS', Shares: 50, Execution_Price: 2490.0, RawAmount: 126425.0 }
  ];

  const { pairedTrades } = computeRoundTrips(trades);
  assert.strictEqual(pairedTrades.length, 3, 'Should produce exactly 3 completed round trips');

  // Trade 1
  assert.strictEqual(pairedTrades[0].grossPnl, 1000.0); // (2520 - 2500) * 50
  assert.strictEqual(pairedTrades[0].side, 'LONG');

  // Trade 2
  assert.strictEqual(pairedTrades[1].grossPnl, -1000.0); // (2510 - 2530) * 50
  assert.strictEqual(pairedTrades[1].side, 'LONG');

  // Trade 3
  assert.strictEqual(pairedTrades[2].grossPnl, 1000.0); // (2510 - 2490) * 50
  assert.strictEqual(pairedTrades[2].side, 'SHORT');

  const totalGross = pairedTrades.reduce((acc, t) => acc + t.grossPnl, 0);
  assert.strictEqual(totalGross, 1000.0, 'Cumulative gross P&L should be ₹1000.00');
});

// ── TEST 4: SHORT followed by COVER ──
test('4. SHORT followed by COVER', () => {
  const trades = [
    { id: 'S1', Timestamp: '2026-11-18 09:40:00', Action: 'SHORT', Symbol: 'SBIN.NS', Shares: 100, Execution_Price: 800.0, RawAmount: -80016.0 },
    { id: 'C1', Timestamp: '2026-11-18 10:20:00', Action: 'COVER', Symbol: 'SBIN.NS', Shares: 100, Execution_Price: 790.0, RawAmount: 80980.0 }
  ];

  const { pairedTrades } = computeRoundTrips(trades);
  assert.strictEqual(pairedTrades.length, 1);
  const t = pairedTrades[0];
  assert.strictEqual(t.side, 'SHORT');
  assert.strictEqual(t.grossPnl, 1000.0); // (800 - 790) * 100
  assert.strictEqual(t.netPnl, 964.0); // 80980 - 80016 = 964
  assert.strictEqual(t.fees, 36.0); // 1000 - 964 = 36
});

// ── TEST 5: Partial square-offs ──
test('5. Partial square-offs (SHORT 500 @ 500 -> SQUARE_OFF 200 @ 490, SQUARE_OFF 300 @ 510)', () => {
  const trades = [
    { id: 'S1', Timestamp: '2026-11-18 11:00:00', Action: 'SHORT', Symbol: 'WIPRO.NS', Shares: 500, Execution_Price: 500.0, RawAmount: -250050.0 },
    { id: 'SQ1', Timestamp: '2026-11-18 12:00:00', Action: 'SQUARE_OFF', Symbol: 'WIPRO.NS', Shares: 200, Execution_Price: 490.0, RawAmount: 101960.0 },
    { id: 'SQ2', Timestamp: '2026-11-18 15:15:00', Action: 'MANUAL_SQUARE_OFF', Symbol: 'WIPRO.NS', Shares: 300, Execution_Price: 510.0, RawAmount: 146930.0 }
  ];

  const { pairedTrades, openShorts } = computeRoundTrips(trades);
  assert.strictEqual(pairedTrades.length, 2);
  assert.strictEqual(openShorts['WIPRO.NS'].length, 0, 'Position fully closed');

  // Slice 1: 200 shares
  assert.strictEqual(pairedTrades[0].shares, 200);
  assert.strictEqual(pairedTrades[0].grossPnl, 2000.0); // (500 - 490) * 200

  // Slice 2: 300 shares
  assert.strictEqual(pairedTrades[1].shares, 300);
  assert.strictEqual(pairedTrades[1].grossPnl, -3000.0); // (500 - 510) * 300

  const netTotalGross = pairedTrades[0].grossPnl + pairedTrades[1].grossPnl;
  assert.strictEqual(netTotalGross, -1000.0, 'Net Gross should be -₹1000.00');
});

// ── TEST 6: Unmatched entry legs ──
test('6. Unmatched entry legs (BUY 150 shares with no subsequent exit)', () => {
  const trades = [
    { id: 'T1', Timestamp: '2026-11-18 10:00:00', Action: 'BUY', Symbol: 'HDFCBANK.NS', Shares: 150, Execution_Price: 1600.0, RawAmount: -240050.0 }
  ];

  const { pairedTrades, openLongs } = computeRoundTrips(trades);
  assert.strictEqual(pairedTrades.length, 0, 'No round trips formed');
  assert.strictEqual(openLongs['HDFCBANK.NS'].length, 1, '1 open long entry pending');
  assert.strictEqual(openLongs['HDFCBANK.NS'][0].remainingShares, 150);
});

// ── TEST 7: Duplicate execution records ──
test('7. Duplicate execution records (Identical ID / composite fingerprint ignored)', () => {
  const trades = [
    { id: 'DUP-1', Timestamp: '2026-11-18 10:00:00', Action: 'BUY', Symbol: 'TATAMOTORS.NS', Shares: 100, Execution_Price: 900.0, RawAmount: -90018.0 },
    // Duplicate 1 (same ID)
    { id: 'DUP-1', Timestamp: '2026-11-18 10:00:00', Action: 'BUY', Symbol: 'TATAMOTORS.NS', Shares: 100, Execution_Price: 900.0, RawAmount: -90018.0 },
    // Exit
    { id: 'DUP-2', Timestamp: '2026-11-18 10:30:00', Action: 'SELL', Symbol: 'TATAMOTORS.NS', Shares: 100, Execution_Price: 920.0, RawAmount: 91978.0 },
    // Duplicate 2 (same ID)
    { id: 'DUP-2', Timestamp: '2026-11-18 10:30:00', Action: 'SELL', Symbol: 'TATAMOTORS.NS', Shares: 100, Execution_Price: 920.0, RawAmount: 91978.0 }
  ];

  const { pairedTrades, duplicatesCount } = computeRoundTrips(trades);
  assert.strictEqual(duplicatesCount, 2, 'Should detect exactly 2 duplicate records');
  assert.strictEqual(pairedTrades.length, 1, 'Should produce only 1 paired trade');
  assert.strictEqual(pairedTrades[0].grossPnl, 2000.0);
});

// ── TEST 8: Out-of-order execution timestamps ──
test('8. Out-of-order execution timestamps (Chronological sorting before FIFO matching)', () => {
  const trades = [
    // Out-of-order sequence: Exit listed first, entry listed second
    { id: 'T2', Timestamp: '2026-11-18 10:30:00', Action: 'SELL', Symbol: 'AXISBANK.NS', Shares: 50, Execution_Price: 1100.0, RawAmount: 54989.0 },
    { id: 'T1', Timestamp: '2026-11-18 10:00:00', Action: 'BUY', Symbol: 'AXISBANK.NS', Shares: 50, Execution_Price: 1050.0, RawAmount: -52511.0 }
  ];

  const { pairedTrades, unmatchedExits } = computeRoundTrips(trades);
  assert.strictEqual(unmatchedExits.length, 0, 'No unmatched exits after sorting');
  assert.strictEqual(pairedTrades.length, 1, 'Should pair correctly after sort');
  assert.strictEqual(pairedTrades[0].entryPrice, 1050.0);
  assert.strictEqual(pairedTrades[0].exitPrice, 1100.0);
  assert.strictEqual(pairedTrades[0].grossPnl, 2500.0); // (1100 - 1050) * 50
});

console.log('\n======================================================');
console.log('--- TEST SUITE 2: PORTFOLIO ACCOUNTING & VALUATION ---');
console.log('======================================================\n');

// ── TEST 9: Long Position Mark-to-Market Valuation & Total Equity ──
test('9. Long position mark-to-market valuation (Profit & Loss scenarios)', () => {
  // Scenario A: Long position in profit
  const botStateProfit = {
    bot_state: {
      cash: 500000.0,
      in_position: true,
      shares: 500,
      entry_price: 1000.0,
      position_side: 'LONG',
      symbol: 'SBIN.NS'
    },
    all_trades: []
  };

  const metricsProfit = computePortfolioMetrics(botStateProfit, 1050.0, 1000000.0); // LTP 1050 (+50)
  assert.strictEqual(metricsProfit.investedCapital, 500000.0);
  assert.strictEqual(metricsProfit.positionValue, 525000.0); // 500 * 1050
  assert.strictEqual(metricsProfit.unrealizedPnl, 25000.0); // +25k
  assert.strictEqual(metricsProfit.totalPortfolioValue, 1025000.0); // Cash 500k + Pos 525k

  // Scenario B: Long position in drawdown
  const metricsLoss = computePortfolioMetrics(botStateProfit, 950.0, 1000000.0); // LTP 950 (-50)
  assert.strictEqual(metricsLoss.positionValue, 475000.0); // 500 * 950
  assert.strictEqual(metricsLoss.unrealizedPnl, -25000.0); // -25k
  assert.strictEqual(metricsLoss.totalPortfolioValue, 975000.0); // Cash 500k + Pos 475k
});

// ── TEST 10: Short Position Mark-to-Market Valuation & Total Equity (CRITICAL EDGE CASE) ──
test('10. Short position mark-to-market valuation (Correct inverse price sensitivity)', () => {
  const botStateShort = {
    bot_state: {
      cash: 500000.0, // Remaining free margin
      in_position: true,
      shares: 500,
      entry_price: 1000.0,
      position_side: 'SHORT',
      symbol: 'SBIN.NS'
    },
    all_trades: []
  };

  // Scenario A: Market drops to 950 (Short makes +₹25,000 profit!)
  const metricsDrop = computePortfolioMetrics(botStateShort, 950.0, 1000000.0);
  assert.strictEqual(metricsDrop.investedCapital, 500000.0);
  assert.strictEqual(metricsDrop.unrealizedPnl, 25000.0); // (1000 - 950) * 500 = +25,000
  // Position Value must be Reserved Margin + Unrealized P&L = 500,000 + 25,000 = 525,000
  assert.strictEqual(metricsDrop.positionValue, 525000.0);
  // Total Portfolio Value must be 500,000 (Cash) + 525,000 (Pos) = 1,025,000 (+25k equity gain)
  assert.strictEqual(metricsDrop.totalPortfolioValue, 1025000.0);

  // Scenario B: Market rises to 1050 (Short suffers -₹25,000 loss!)
  const metricsRise = computePortfolioMetrics(botStateShort, 1050.0, 1000000.0);
  assert.strictEqual(metricsRise.unrealizedPnl, -25000.0); // (1000 - 1050) * 500 = -25,000
  // Position Value must be Reserved Margin + Unrealized P&L = 500,000 - 25,000 = 475,000
  assert.strictEqual(metricsRise.positionValue, 475000.0);
  // Total Portfolio Value must be 500,000 (Cash) + 475,000 (Pos) = 975,000 (-25k equity drawdown)
  assert.strictEqual(metricsRise.totalPortfolioValue, 975000.0);
});

// ── TEST 11: Double Counting Check ──
test('11. Verify absence of double-counting between cash, margin, and unrealized P&L', () => {
  const botState = {
    bot_state: {
      cash: 750000.0,
      in_position: true,
      shares: 250,
      entry_price: 1000.0,
      position_side: 'LONG',
      symbol: 'SBIN.NS'
    },
    all_trades: []
  };

  const metrics = computePortfolioMetrics(botState, 1020.0, 1000000.0);
  // Initial capital: 1,000,000
  // Entry: 250 shares @ 1000 = 250,000 deducted from cash -> available cash = 750,000
  // Mark to market: 250 * 1020 = 255,000
  // Unrealized P&L: +5,000
  // Total Equity: 750,000 + 255,000 = 1,005,000
  assert.strictEqual(metrics.totalPortfolioValue, 1005000.0);
  assert.strictEqual(
    metrics.totalPortfolioValue,
    metrics.availableCash + metrics.reservedMargin + metrics.unrealizedPnl,
    'Total Equity must equal Available Cash + Reserved Margin + Unrealized P&L exactly'
  );
});

console.log('\n======================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (failures.length > 0) {
  console.log(`FAILURES: ${failures.length}`);
  failures.forEach(f => console.error(` - ${f.name}: ${f.error.message}`));
  process.exit(1);
} else {
  console.log('ALL TRADING LEDGER EDGE-CASE TESTS PASSED PERFECTLY!');
  console.log('======================================================\n');
}
