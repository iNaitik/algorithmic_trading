import React, { useState, useMemo } from 'react';
import { CheckCircle2, XCircle, Search, Filter, AlertTriangle, Clock, TrendingUp, TrendingDown, DollarSign, Layers } from 'lucide-react';

export default function TradeJournal({
  trades = [],
  openPositions = [],
  unmatchedExits = [],
  currency = "₹"
}) {
  const [filter, setFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const getNetPnl = (t) => {
    if (t.net_pnl !== undefined && t.net_pnl !== null) return Number(t.net_pnl);
    if (t.pnl !== undefined && t.pnl !== null) return Number(t.pnl);
    return 0;
  };

  const getGrossPnl = (t) => {
    if (t.gross_pnl !== undefined && t.gross_pnl !== null) return Number(t.gross_pnl);
    return getNetPnl(t);
  };

  const getFees = (t) => {
    if (t.fees !== undefined && t.fees !== null) return Number(t.fees);
    if (t.total_cost !== undefined && t.total_cost !== null) return Number(t.total_cost);
    return 0;
  };

  const getPnlPct = (t) => {
    if (t.pnl_pct !== undefined && t.pnl_pct !== null) return Number(t.pnl_pct);
    if (t.returnPct !== undefined && t.returnPct !== null) return Number(t.returnPct);
    return 0;
  };

  const getIsWin = (t) => {
    if (typeof t.is_win === 'boolean') return t.is_win;
    return getNetPnl(t) >= 0;
  };

  const safeTrades = Array.isArray(trades) ? trades : [];
  const safeOpenPositions = Array.isArray(openPositions) ? openPositions : [];
  const safeUnmatchedExits = Array.isArray(unmatchedExits) ? unmatchedExits : [];

  // Summary Metrics
  const metrics = useMemo(() => {
    if (safeTrades.length === 0) {
      return { totalTrades: 0, wins: 0, losses: 0, winRate: 0, grossPnl: 0, totalFees: 0, netPnl: 0, profitFactor: 0 };
    }
    let wins = 0;
    let losses = 0;
    let grossPnl = 0;
    let totalFees = 0;
    let netPnl = 0;
    let totalWinGross = 0;
    let totalLossGross = 0;

    safeTrades.forEach(t => {
      const net = getNetPnl(t);
      const gross = getGrossPnl(t);
      const fee = getFees(t);

      grossPnl += gross;
      totalFees += fee;
      netPnl += net;

      if (net >= 0) {
        wins++;
        totalWinGross += Math.max(0, gross);
      } else {
        losses++;
        totalLossGross += Math.abs(Math.min(0, gross));
      }
    });

    const winRate = safeTrades.length > 0 ? ((wins / safeTrades.length) * 100).toFixed(1) : 0;
    const profitFactor = totalLossGross > 0 ? (totalWinGross / totalLossGross).toFixed(2) : (totalWinGross > 0 ? "∞" : "0.00");

    return {
      totalTrades: safeTrades.length,
      wins,
      losses,
      winRate,
      grossPnl: Number(grossPnl.toFixed(2)),
      totalFees: Number(totalFees.toFixed(2)),
      netPnl: Number(netPnl.toFixed(2)),
      profitFactor
    };
  }, [safeTrades]);

  // Filtering
  const filteredTrades = safeTrades.filter((t) => {
    const isWin = getIsWin(t);
    const side = (t.side || "LONG").toUpperCase();
    if (filter === "WIN" && !isWin) return false;
    if (filter === "LOSS" && isWin) return false;
    if (filter === "LONG" && side !== "LONG") return false;
    if (filter === "SHORT" && side !== "SHORT") return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const placed = (t.placed_at || t.entry_time || "").toLowerCase();
      const exited = (t.exited_at || t.exit_time || "").toLowerCase();
      const sym = (t.symbol || "").toLowerCase();
      return (
        sym.includes(s) ||
        placed.includes(s) ||
        exited.includes(s) ||
        String(t.entry_price || "").includes(s) ||
        String(t.exit_price || "").includes(s)
      );
    }
    return true;
  });

  const hasNoActivity = safeTrades.length === 0 && safeOpenPositions.length === 0 && safeUnmatchedExits.length === 0;

  if (hasNoActivity) {
    return (
      <div style={{
        backgroundColor: '#121517',
        border: '1px solid #202426',
        borderRadius: '16px',
        padding: '40px',
        textAlign: 'center',
        color: '#92999C'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          backgroundColor: 'rgba(0, 208, 156, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px auto',
          color: '#00D09C'
        }}>
          <Clock size={22} />
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4' }}>
          No Audited Trades Recorded
        </div>
        <div style={{ fontSize: '0.78rem', color: '#92999C', marginTop: '4px' }}>
          Execute live bot positions or run a strategy simulation to inspect verified trade fills.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#121517',
      border: '1px solid #202426',
      borderRadius: '16px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '0px'
    }}>
      {/* ── 1. Top Institutional Metrics Ribbon ── */}
      {safeTrades.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '12px',
          padding: '18px 24px',
          borderBottom: '1px solid #202426',
          backgroundColor: '#151819'
        }}>
          {/* Net Realized In-Hand */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '0.7rem', color: '#92999C', fontWeight: '700', textTransform: 'uppercase' }}>
              Net Realized P&L
            </span>
            <div style={{
              fontSize: '1.35rem',
              fontWeight: '800',
              color: metrics.netPnl >= 0 ? '#00D09C' : '#EB5B3C',
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {metrics.netPnl >= 0 ? '+' : ''}{currency}{metrics.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>Post statutory deduction</span>
          </div>

          {/* Win Rate */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '0.7rem', color: '#92999C', fontWeight: '700', textTransform: 'uppercase' }}>
              Win Rate
            </span>
            <div style={{
              fontSize: '1.35rem',
              fontWeight: '800',
              color: Number(metrics.winRate) >= 50 ? '#00D09C' : '#EB5B3C',
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {metrics.winRate}%
            </div>
            <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>{metrics.wins}W / {metrics.losses}L ({metrics.totalTrades} Trades)</span>
          </div>

          {/* Gross P&L */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '0.7rem', color: '#92999C', fontWeight: '700', textTransform: 'uppercase' }}>
              Gross Trading P&L
            </span>
            <div style={{
              fontSize: '1.35rem',
              fontWeight: '800',
              color: metrics.grossPnl >= 0 ? '#00D09C' : '#EB5B3C',
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {metrics.grossPnl >= 0 ? '+' : ''}{currency}{metrics.grossPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>Pre-fee execution price delta</span>
          </div>

          {/* Total Statutory Fees */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '0.7rem', color: '#92999C', fontWeight: '700', textTransform: 'uppercase' }}>
              Statutory Taxes & Fees
            </span>
            <div style={{
              fontSize: '1.35rem',
              fontWeight: '800',
              color: '#F59E0B',
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              -{currency}{metrics.totalFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>STT, NSE, SEBI & GST</span>
          </div>

          {/* Profit Factor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '0.7rem', color: '#92999C', fontWeight: '700', textTransform: 'uppercase' }}>
              Profit Factor
            </span>
            <div style={{
              fontSize: '1.35rem',
              fontWeight: '800',
              color: '#60A5FA',
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {metrics.profitFactor}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#626A6E' }}>Gross Gains / Gross Losses</span>
          </div>
        </div>
      )}

      {/* ── 2. Active Open Inventory (Unmatched Entry Legs) ── */}
      {safeOpenPositions.length > 0 && (
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #202426',
          backgroundColor: 'rgba(245, 158, 11, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} color="#F59E0B" />
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#F59E0B' }}>
                Active Open Inventory ({safeOpenPositions.length})
              </span>
              <span style={{ fontSize: '0.72rem', color: '#92999C' }}>
                Unmatched entry legs awaiting exit fills • Unrealized MTM active
              </span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
            {safeOpenPositions.map((op, idx) => {
              const isLong = (op.side || "LONG").toUpperCase() === "LONG";
              return (
                <div
                  key={op.id || idx}
                  style={{
                    backgroundColor: '#080A0B',
                    border: '1px solid #202426',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: '700',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: isLong ? 'rgba(0, 208, 156, 0.15)' : 'rgba(235, 91, 60, 0.15)',
                        color: isLong ? '#00D09C' : '#EB5B3C'
                      }}>
                        {op.side || (isLong ? 'LONG' : 'SHORT')}
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#F1F3F4' }}>
                        {op.symbol || "UNKNOWN"}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#92999C', marginTop: '4px' }}>
                      Filled: {op.placed_at || "Recent"}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#60A5FA', fontFamily: "'JetBrains Mono', monospace" }}>
                      {Number(op.shares || 0).toLocaleString()} Units
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#D1D5DB', marginTop: '2px', fontFamily: "'JetBrains Mono', monospace" }}>
                      @ {currency}{Number(op.entry_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. Unmatched Exit Warning (if any) ── */}
      {safeUnmatchedExits.length > 0 && (
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid #202426',
          backgroundColor: 'rgba(235, 91, 60, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertTriangle size={16} color="#EB5B3C" />
          <span style={{ fontSize: '0.78rem', color: '#EB5B3C', fontWeight: '600' }}>
            Warning: {safeUnmatchedExits.length} exit fill(s) could not be matched to an opening position leg.
          </span>
        </div>
      )}

      {/* ── 4. Header & Filter Controls ── */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid #202426',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Search input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#080A0B',
          border: '1px solid #202426',
          borderRadius: '8px',
          padding: '6px 12px',
          width: '260px'
        }}>
          <Search size={14} color="#92999C" />
          <input
            type="text"
            placeholder="Search by symbol, date..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#F1F3F4',
              fontSize: '0.78rem',
              width: '100%'
            }}
          />
        </div>

        {/* Filter Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {[
            { id: "ALL", label: `All (${safeTrades.length})` },
            { id: "WIN", label: `Wins (${metrics.wins})` },
            { id: "LOSS", label: `Losses (${metrics.losses})` },
            { id: "LONG", label: "Long" },
            { id: "SHORT", label: "Short" }
          ].map((f) => {
            const isFilterActive = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  fontSize: '0.74rem',
                  fontWeight: isFilterActive ? '700' : '500',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  backgroundColor: isFilterActive ? '#00D09C' : '#080A0B',
                  color: isFilterActive ? '#080A0B' : '#92999C',
                  border: isFilterActive ? '1px solid #00D09C' : '1px solid #202426',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 5. Closed Round Trips Table ── */}
      {safeTrades.length === 0 ? (
        <div style={{
          padding: '32px',
          textAlign: 'center',
          color: '#92999C',
          fontSize: '0.85rem'
        }}>
          No closed round trips completed yet. Active open inventory is displayed above.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}>
            <thead>
              <tr style={{ backgroundColor: '#101314', color: '#92999C', borderBottom: '1px solid #202426', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 18px', textAlign: 'center', width: '40px' }}>#</th>
                <th style={{ padding: '12px 18px' }}>Placed At</th>
                <th style={{ padding: '12px 18px' }}>Exited At</th>
                <th style={{ padding: '12px 18px', textAlign: 'center' }}>Instrument & Side</th>
                <th style={{ padding: '12px 18px', textAlign: 'right' }}>Entry Price</th>
                <th style={{ padding: '12px 18px', textAlign: 'right' }}>Exit Price</th>
                <th style={{ padding: '12px 18px', textAlign: 'right' }}>Shares</th>
                <th style={{ padding: '12px 18px', textAlign: 'right' }}>Gross P&L</th>
                <th style={{ padding: '12px 18px', textAlign: 'right' }}>Statutory Fees</th>
                <th style={{ padding: '12px 18px', textAlign: 'right' }}>Net In-Hand</th>
                <th style={{ padding: '12px 18px', textAlign: 'right' }}>Return %</th>
                <th style={{ padding: '12px 18px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((t, idx) => {
                const isLong = (t.side || "LONG").toUpperCase() === "LONG";
                const netPnl = getNetPnl(t);
                const grossPnl = getGrossPnl(t);
                const fees = getFees(t);
                const pnlPct = getPnlPct(t);
                const isWin = getIsWin(t);

                const pnlColor = netPnl >= 0 ? "#00D09C" : "#EB5B3C";
                const grossColor = grossPnl >= 0 ? "#00D09C" : "#EB5B3C";

                return (
                  <tr
                    key={t.id || idx}
                    style={{
                      borderBottom: '1px solid #1E2326',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#181D20')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '12px 18px', textAlign: 'center', color: '#626A6E' }}>
                      {t.id || idx + 1}
                    </td>
                    <td style={{ padding: '12px 18px', color: '#00D09C', fontWeight: '600' }}>
                      {t.placed_at || t.entry_time || '-'}
                    </td>
                    <td style={{ padding: '12px 18px', color: '#92999C' }}>
                      {t.exited_at || t.exit_time || '-'}
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: isLong ? 'rgba(0, 208, 156, 0.15)' : 'rgba(235, 91, 60, 0.15)',
                        color: isLong ? '#00D09C' : '#EB5B3C',
                      }}>
                        {t.symbol ? `${t.symbol} • ` : ''}{t.side || (isLong ? 'LONG' : 'SHORT')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', color: '#F1F3F4' }}>
                      {currency}{Number(t.entry_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', color: '#F1F3F4' }}>
                      {currency}{Number(t.exit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', color: '#60A5FA', fontWeight: '600' }}>
                      {Number(t.shares || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', color: grossColor, fontWeight: '600' }}>
                      {grossPnl >= 0 ? '+' : ''}{currency}{Number(grossPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', color: '#F59E0B' }}>
                      {fees > 0 ? `-${currency}${Number(fees).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${currency}0.00`}
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', color: pnlColor, fontWeight: '800' }}>
                      {netPnl >= 0 ? '+' : ''}{currency}{Number(netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', color: pnlColor, fontWeight: '700' }}>
                      {pnlPct >= 0 ? '+' : ''}{Number(pnlPct).toFixed(2)}%
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                      {isWin ? (
                        <span style={{ color: '#00D09C', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.74rem', fontWeight: '700' }}>
                          <CheckCircle2 size={13} /> WIN
                        </span>
                      ) : (
                        <span style={{ color: '#EB5B3C', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.74rem', fontWeight: '700' }}>
                          <XCircle size={13} /> LOSS
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
