import React, { useState } from 'react';
import { CheckCircle2, XCircle, Search, Filter, AlertTriangle, Clock } from 'lucide-react';

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
        backgroundColor: '#161922',
        border: '1px solid #242938',
        borderRadius: '16px',
        padding: '36px',
        textAlign: 'center',
        color: '#9ca3af'
      }}>
        No trades recorded in this session.
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#161922',
      border: '1px solid #242938',
      borderRadius: '16px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* ── Active Open Inventory (Unmatched Entry Legs) ── */}
      {safeOpenPositions.length > 0 && (
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #242938',
          backgroundColor: 'rgba(251, 191, 36, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} color="#fbbf24" />
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fbbf24' }}>
                Active Open Inventory ({safeOpenPositions.length})
              </span>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                Unmatched entry legs awaiting exit fill • Mark-to-market active
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
                    backgroundColor: '#12151d',
                    border: '1px solid #242938',
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
                        color: isLong ? '#00d09c' : '#eb5b3c'
                      }}>
                        {op.side || (isLong ? 'LONG' : 'SHORT')}
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#ffffff' }}>
                        {op.symbol || "UNKNOWN"}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '4px' }}>
                      Filled: {op.placed_at || "Recent"}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#60a5fa' }}>
                      {Number(op.shares || 0).toLocaleString()} Units
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#d1d5db', marginTop: '2px' }}>
                      @ {currency}{Number(op.entry_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Unmatched Exit Warning (if any) ── */}
      {safeUnmatchedExits.length > 0 && (
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid #242938',
          backgroundColor: 'rgba(235, 91, 60, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertTriangle size={16} color="#eb5b3c" />
          <span style={{ fontSize: '0.78rem', color: '#eb5b3c', fontWeight: '600' }}>
            Warning: {safeUnmatchedExits.length} exit fill(s) could not be matched to an opening position leg.
          </span>
        </div>
      )}

      {/* ── Header & Filter Controls ── */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #242938',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#ffffff' }}>
            📜 Audited Trade Journal & Fills
          </span>
          <span style={{
            fontSize: '0.72rem',
            fontWeight: '700',
            padding: '2px 8px',
            backgroundColor: 'rgba(0, 208, 156, 0.15)',
            color: '#00d09c',
            borderRadius: '12px'
          }}>
            {safeTrades.length} Closed Round Trips
          </span>
        </div>

        {/* Filter Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {["ALL", "WIN", "LOSS", "LONG", "SHORT"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: '0.75rem',
                fontWeight: '600',
                padding: '5px 12px',
                borderRadius: '8px',
                backgroundColor: filter === f ? '#00d09c' : '#0c0e14',
                color: filter === f ? '#0c0e14' : '#9ca3af',
                border: filter === f ? 'none' : '1px solid #242938',
                cursor: 'pointer'
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Closed Round Trips Table ── */}
      {safeTrades.length === 0 ? (
        <div style={{
          padding: '28px',
          textAlign: 'center',
          color: '#9ca3af',
          fontSize: '0.85rem'
        }}>
          No closed round trips completed yet. Active inventory is displayed above.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}>
            <thead>
              <tr style={{ backgroundColor: '#12151d', color: '#9ca3af', borderBottom: '1px solid #242938', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 16px', textAlign: 'center', width: '40px' }}>#</th>
                <th style={{ padding: '12px 16px' }}>Placed At</th>
                <th style={{ padding: '12px 16px' }}>Exited At</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Instrument & Side</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Entry Price</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Exit Price</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Shares</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Gross P&L</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Statutory Fees</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Net In-Hand</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Return %</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
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

                const pnlColor = netPnl >= 0 ? "#00d09c" : "#eb5b3c";
                const grossColor = grossPnl >= 0 ? "#00d09c" : "#eb5b3c";

                return (
                  <tr
                    key={t.id || idx}
                    style={{
                      borderBottom: '1px solid #1f2430',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1c212e')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280' }}>
                      {t.id || idx + 1}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#00d09c', fontWeight: '600' }}>
                      {t.placed_at || t.entry_time || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#9ca3af' }}>
                      {t.exited_at || t.exit_time || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: isLong ? 'rgba(0, 208, 156, 0.15)' : 'rgba(235, 91, 60, 0.15)',
                        color: isLong ? '#00d09c' : '#eb5b3c',
                      }}>
                        {t.symbol ? `${t.symbol} • ` : ''}{t.side || (isLong ? 'LONG' : 'SHORT')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#ffffff' }}>
                      {currency}{Number(t.entry_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#ffffff' }}>
                      {currency}{Number(t.exit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#60a5fa', fontWeight: '600' }}>
                      {Number(t.shares || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: grossColor, fontWeight: '600' }}>
                      {grossPnl >= 0 ? '+' : ''}{currency}{Number(grossPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#fbbf24' }}>
                      {fees > 0 ? `-${currency}${Number(fees).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${currency}0.00`}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: pnlColor, fontWeight: '800' }}>
                      {netPnl >= 0 ? '+' : ''}{currency}{Number(netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: pnlColor, fontWeight: '700' }}>
                      {pnlPct >= 0 ? '+' : ''}{Number(pnlPct).toFixed(2)}%
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {isWin ? (
                        <span style={{ color: '#00d09c', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', fontWeight: '700' }}>
                          <CheckCircle2 size={13} /> WIN
                        </span>
                      ) : (
                        <span style={{ color: '#eb5b3c', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', fontWeight: '700' }}>
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
