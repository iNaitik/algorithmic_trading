import React, { useState } from 'react';
import { CheckCircle2, XCircle, Search, Filter } from 'lucide-react';

export default function TradeJournal({ trades = [], currency = "₹" }) {
  const [filter, setFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTrades = trades.filter((t) => {
    if (filter === "WIN" && !t.is_win) return false;
    if (filter === "LOSS" && t.is_win) return false;
    if (filter === "LONG" && t.side !== "LONG") return false;
    if (filter === "SHORT" && t.side !== "SHORT") return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return (
        t.placed_at?.toLowerCase().includes(s) ||
        t.exited_at?.toLowerCase().includes(s) ||
        String(t.entry_price).includes(s) ||
        String(t.exit_price).includes(s)
      );
    }
    return true;
  });

  if (!trades || trades.length === 0) {
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
      {/* Header & Filter Controls */}
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
            {trades.length} Fills
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

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}>
          <thead>
            <tr style={{ backgroundColor: '#12151d', color: '#9ca3af', borderBottom: '1px solid #242938', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
              <th style={{ padding: '12px 16px', textAlign: 'center', width: '40px' }}>#</th>
              <th style={{ padding: '12px 16px' }}>Placed At</th>
              <th style={{ padding: '12px 16px' }}>Exited At</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Side</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Entry Price</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Exit Price</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Shares</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Gross P&L</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>SEBI Fees</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Net In-Hand</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Return %</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrades.map((t, idx) => {
              const isLong = t.side === "LONG";
              const pnlColor = t.net_pnl >= 0 ? "#00d09c" : "#eb5b3c";
              const grossColor = t.gross_pnl >= 0 ? "#00d09c" : "#eb5b3c";

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
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280' }}>{t.id || idx + 1}</td>
                  <td style={{ padding: '12px 16px', color: '#00d09c', fontWeight: '600' }}>{t.placed_at}</td>
                  <td style={{ padding: '12px 16px', color: '#9ca3af' }}>{t.exited_at}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: isLong ? 'rgba(0, 208, 156, 0.15)' : 'rgba(235, 91, 60, 0.15)',
                      color: isLong ? '#00d09c' : '#eb5b3c',
                    }}>
                      {t.side}
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
                    {t.gross_pnl >= 0 ? '+' : ''}{currency}{Number(t.gross_pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#fbbf24' }}>
                    {t.fees > 0 ? `-${currency}${Number(t.fees).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${currency}0.00`}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: pnlColor, fontWeight: '800' }}>
                    {t.net_pnl >= 0 ? '+' : ''}{currency}{Number(t.net_pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: pnlColor, fontWeight: '700' }}>
                    {t.pnl_pct >= 0 ? '+' : ''}{Number(t.pnl_pct || 0).toFixed(2)}%
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {t.is_win ? (
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
    </div>
  );
}
