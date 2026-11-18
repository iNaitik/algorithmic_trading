/**
 * tradeUtils.js
 * =============
 * Institutional-grade quantitative trade matching, statutory accounting,
 * and portfolio reconciliation engine.
 * 
 * Supports:
 * - Multi-leg FIFO order matching (1:N, N:1, partial fills, partial square-offs)
 * - Exact pro-rata statutory fee and cash-flow allocation
 * - Duplicate execution deduplication
 * - Out-of-order timestamp sorting
 * - Accurate Long & Short mark-to-market position valuations
 * - Mathematical reconciliation preventing double counting
 */

/**
 * Safely parse date strings into epoch milliseconds for reliable sorting.
 */
export function parseTimestamp(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  const str = String(ts).trim();
  // If formatted as "YYYY-MM-DD HH:MM:SS"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    return new Date(str.replace(' ', 'T')).getTime();
  }
  const parsed = Date.parse(str);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Pairs raw order fill legs into closed round trips using multi-leg FIFO matching.
 * Handles:
 * - 1 Entry -> Multiple Partial Exits
 * - Multiple Entries -> 1 Exit
 * - Multiple independent trades in the same instrument
 * - SHORT followed by COVER
 * - Partial Square-Offs
 * - Unmatched entry legs
 * - Duplicate execution records
 * - Out-of-order execution timestamps
 * 
 * @param {Array} allTrades - Raw execution fill records from trade ledger.
 * @returns {Object} { pairedTrades, openLongs, openShorts, unmatchedExits, duplicatesCount }
 */
export function computeRoundTrips(allTrades = []) {
  if (!Array.isArray(allTrades) || allTrades.length === 0) {
    return {
      pairedTrades: [],
      openLongs: {},
      openShorts: {},
      unmatchedExits: [],
      duplicatesCount: 0
    };
  }

  // 1. Sort chronologically by timestamp (oldest first)
  const sorted = [...allTrades].sort((a, b) => {
    return parseTimestamp(a.Timestamp || a.Time) - parseTimestamp(b.Timestamp || b.Time);
  });

  // 2. Deduplicate identical execution records
  const seenKeys = new Set();
  const dedupedFills = [];
  let duplicatesCount = 0;

  for (const fill of sorted) {
    const act = String(fill.Action || "").toUpperCase();
    const sym = fill.Symbol || "UNKNOWN";
    const shs = Number(fill.Shares || 0);
    const px = Number(fill.Execution_Price || 0);
    const ts = fill.Timestamp || fill.Time || "";
    const raw = Number(fill.RawAmount || 0);

    // If explicit ID exists, use it; otherwise create unique composite fingerprint
    const key = fill.id
      ? String(fill.id)
      : `${ts}|${sym}|${act}|${shs}|${px}|${raw}`;

    if (seenKeys.has(key)) {
      duplicatesCount++;
      continue;
    }
    seenKeys.add(key);
    dedupedFills.push(fill);
  }

  const pairedTrades = [];
  const openLongs = {};   // sym -> Array of { ..., remainingShares, originalShares, rawAmt }
  const openShorts = {};  // sym -> Array of { ..., remainingShares, originalShares, rawAmt }
  const unmatchedExits = [];

  // Helper to process an exit against an open inventory queue
  function matchExit(sym, fill, queue, isShort) {
    let exitRemaining = Number(fill.Shares || 0);
    const exitOriginal = exitRemaining;
    const exitPrice = Number(fill.Execution_Price || 0);
    const exitRawAmt = Number(fill.RawAmount || 0);

    while (exitRemaining > 0.0001 && queue.length > 0) {
      const entry = queue[0];
      const matchedShares = Math.min(exitRemaining, entry.remainingShares);

      // Pro-rate cash flow (outflows/inflows) for partial allocations
      const entryCashFrac = entry.originalShares > 0
        ? entry.rawAmt * (matchedShares / entry.originalShares)
        : 0;
      const exitCashFrac = exitOriginal > 0
        ? exitRawAmt * (matchedShares / exitOriginal)
        : 0;

      // Gross Realized P&L
      const grossPnl = isShort
        ? (entry.price - exitPrice) * matchedShares
        : (exitPrice - entry.price) * matchedShares;

      // Net Realized P&L from pro-rated marginal cash impacts
      const netPnl = exitCashFrac + entryCashFrac;
      const fees = Math.max(0, grossPnl - netPnl);

      pairedTrades.push({
        id: `RT-${entry.id || 'E'}-${fill.id || 'X'}-${pairedTrades.length + 1}`,
        symbol: sym,
        side: isShort ? "SHORT" : "LONG",
        shares: matchedShares,
        entryTime: entry.Timestamp || entry.Time || "",
        exitTime: fill.Timestamp || fill.Time || "",
        entryDate: entry.Date || (entry.Timestamp ? entry.Timestamp.slice(0, 10) : ""),
        exitDate: fill.Date || (fill.Timestamp ? fill.Timestamp.slice(0, 10) : ""),
        entryPrice: entry.price,
        exitPrice: exitPrice,
        grossPnl: Number(grossPnl.toFixed(2)),
        netPnl: Number(netPnl.toFixed(2)),
        fees: Number(fees.toFixed(2)),
        returnPct: entry.price > 0
          ? Number(((grossPnl / (entry.price * matchedShares)) * 100).toFixed(2))
          : 0
      });

      entry.remainingShares -= matchedShares;
      exitRemaining -= matchedShares;

      if (entry.remainingShares <= 0.0001) {
        queue.shift(); // Entry fully exhausted
      }
    }

    if (exitRemaining > 0.0001) {
      unmatchedExits.push({
        ...fill,
        unmatchedShares: exitRemaining
      });
    }
  }

  // 3. Process fills sequentially in FIFO order
  for (const fill of dedupedFills) {
    const sym = fill.Symbol || "UNKNOWN";
    const act = String(fill.Action || "").toUpperCase();
    const shs = Number(fill.Shares || 0);
    const price = Number(fill.Execution_Price || 0);
    const rawAmt = Number(fill.RawAmount || 0);

    if (!openLongs[sym]) openLongs[sym] = [];
    if (!openShorts[sym]) openShorts[sym] = [];

    if (act.includes("BUY")) {
      openLongs[sym].push({
        ...fill,
        price,
        rawAmt,
        originalShares: shs,
        remainingShares: shs
      });
    } else if (act.includes("SHORT")) {
      openShorts[sym].push({
        ...fill,
        price,
        rawAmt,
        originalShares: shs,
        remainingShares: shs
      });
    } else if (act.includes("COVER")) {
      matchExit(sym, fill, openShorts[sym], true);
    } else if (act.includes("SELL")) {
      matchExit(sym, fill, openLongs[sym], false);
    } else if (act.includes("SQUARE")) {
      // Manual or intraday square-off applies to whichever open side exists
      if (openShorts[sym].length > 0) {
        matchExit(sym, fill, openShorts[sym], true);
      } else if (openLongs[sym].length > 0) {
        matchExit(sym, fill, openLongs[sym], false);
      } else {
        unmatchedExits.push(fill);
      }
    }
  }

  return {
    pairedTrades,
    openLongs,
    openShorts,
    unmatchedExits,
    duplicatesCount
  };
}

/**
 * Computes portfolio liquidity, mark-to-market valuations, equity progression,
 * and mathematical reconciliation between balance ledger and realized/unrealized P&L.
 * 
 * Accurately prevents double counting:
 * Total Portfolio Equity = Available Cash + Reserved Margin + Unrealized P&L
 */
export function computePortfolioMetrics(botData, currentLtp = 0, initialCapital = 1000000.0) {
  const bot = botData?.bot_state || {};
  const allFills = botData?.all_trades || [];
  const istDate = botData?.ist_date || "";

  // 1. Current Live Position
  const isInPosition = Boolean(bot.in_position && (bot.shares > 0 || bot.entry_price > 0));
  const shares = Number(bot.shares || 0);
  const entryPrice = Number(bot.entry_price || 0);
  const ltp = Number(currentLtp || bot.last_ltp || entryPrice);
  const side = (bot.position_side || "LONG").toUpperCase();

  // Invested Capital / Reserved Margin committed to active position
  const investedCapital = isInPosition ? shares * entryPrice : 0;
  const reservedMargin = investedCapital;

  // Mark-to-market unrealized P&L
  const unrealizedPnl = isInPosition
    ? (side === "SHORT" ? (entryPrice - ltp) * shares : (ltp - entryPrice) * shares)
    : 0;
  const unrealizedPct = isInPosition && entryPrice > 0
    ? (unrealizedPnl / (shares * entryPrice)) * 100
    : 0;

  // Position Valuation:
  // For LONG: shares * ltp = reservedMargin + unrealizedPnl
  // For SHORT: shares * (2 * entryPrice - ltp) = reservedMargin + unrealizedPnl
  const positionValue = isInPosition
    ? (side === "SHORT" ? shares * (2 * entryPrice - ltp) : shares * ltp)
    : 0;

  // Available Cash (free margin unencumbered)
  const availableCash = Number(bot.cash ?? initialCapital);

  // Total Portfolio Capital = Available Cash + Position Value
  // = Available Cash + Reserved Margin + Unrealized P&L (No double counting)
  const totalPortfolioValue = availableCash + positionValue;

  // 2. Paired trade ledger calculations (multi-leg FIFO)
  const {
    pairedTrades,
    openLongs,
    openShorts,
    unmatchedExits,
    duplicatesCount
  } = computeRoundTrips(allFills);

  // Today ISO date matching
  let todayIso = istDate;
  if (!todayIso) {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istDateObj = new Date(utc + (3600000 * 5.5));
    todayIso = istDateObj.toISOString().slice(0, 10);
  }

  const todayPaired = pairedTrades.filter(t => {
    const tTime = t.exitTime || "";
    const tDate = t.exitDate || "";
    return tTime.startsWith(todayIso) || tDate === todayIso;
  });

  const todayRealizedPnl = todayPaired.reduce((acc, t) => acc + t.netPnl, 0);
  const todayGrossPnl = todayPaired.reduce((acc, t) => acc + t.grossPnl, 0);
  const todayFees = todayPaired.reduce((acc, t) => acc + t.fees, 0);

  const allTimeRealizedPnl = pairedTrades.reduce((acc, t) => acc + t.netPnl, 0);
  const allTimeGrossPnl = pairedTrades.reduce((acc, t) => acc + t.grossPnl, 0);
  const allTimeFees = pairedTrades.reduce((acc, t) => acc + t.fees, 0);

  // Combined P&L (Realized + Unrealized)
  const combinedTodayPnl = todayRealizedPnl + unrealizedPnl;
  const todayPnlPct = (combinedTodayPnl / initialCapital) * 100;

  const combinedAllTimePnl = allTimeRealizedPnl + unrealizedPnl;
  const overallReturnPct = (combinedAllTimePnl / initialCapital) * 100;

  // 3. Construct mathematically verified equity curve points
  const equityPoints = [];
  let runningEquity = initialCapital;
  equityPoints.push({ label: 'Initial', equity: initialCapital, time: 'Start' });

  pairedTrades.forEach((t, idx) => {
    runningEquity += t.netPnl;
    equityPoints.push({
      label: t.exitTime ? (t.exitTime.length >= 16 ? t.exitTime.slice(11, 16) : t.exitTime) : `#${idx + 1}`,
      equity: Number(runningEquity.toFixed(2)),
      trade: t
    });
  });

  if (isInPosition && Math.abs(unrealizedPnl) > 0.01) {
    equityPoints.push({
      label: 'Live',
      equity: Number((runningEquity + unrealizedPnl).toFixed(2)),
      isLive: true
    });
  }

  // 4. Mathematical reconciliation verification
  const theoreticalTotal = initialCapital + allTimeRealizedPnl + unrealizedPnl;
  const isMathematicallyReconciled = Math.abs(totalPortfolioValue - theoreticalTotal) < 1.0;

  return {
    isInPosition,
    shares,
    entryPrice,
    ltp,
    side,
    investedCapital,
    reservedMargin,
    positionValue,
    availableCash,
    totalPortfolioValue,
    unrealizedPnl,
    unrealizedPct,
    pairedTrades,
    todayPaired,
    todayRealizedPnl,
    todayGrossPnl,
    todayFees,
    allTimeRealizedPnl,
    allTimeGrossPnl,
    allTimeFees,
    combinedTodayPnl,
    todayPnlPct,
    combinedAllTimePnl,
    overallReturnPct,
    equityPoints,
    theoreticalTotal,
    isMathematicallyReconciled,
    initialCapital,
    openLongs,
    openShorts,
    unmatchedExits,
    duplicatesCount
  };
}
