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
        t.placed_at.toLowerCase().includes(s) ||
        t.exited_at.toLowerCase().includes(s) ||
        String(t.entry_price).includes(s) ||
        String(t.exit_price).includes(s)
      );
    }
    return true;
  });

  if (!trades || trades.length === 0) {
    return (
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '20px',
        padding: '36px',
        textAlign: 'center',
        color: '#6b7280',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)'
      }}>
        No trades were executed in this backtest window.
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '20px',
      boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header & Filter Controls */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827' }}>
            📜 Audited Trade Journal & Fills
          </span>
          <span style={{
            fontSize: '0.72rem',
            fontWeight: '700',
            padding: '2px 8px',
            backgroundColor: '#e6f4ea',
            color: '#059669',
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
                backgroundColor: filter === f ? '#059669' : '#f9fafb',
                color: filter === f ? '#ffffff' : '#6b7280',
                border: filter === f ? 'none' : '1px solid #e5e7eb',
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
            <tr style={{ backgroundColor: '#f9fafb', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
              <th style={{ padding: '12px 16px', textAlign: 'center', width: '40px' }}>#</th>
              <th style={{ padding: '12px 16px' }}>Placed At (Date & Time)</th>
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
              const pnlColor = t.net_pnl >= 0 ? "#059669" : "#dc2626";
              const grossColor = t.gross_pnl >= 0 ? "#059669" : "#dc2626";

              return (
                <tr
                  key={t.id || idx}
                  style={{
                    borderBottom: '1px solid #f3f4f6',
                    transition: 'background-color 0.1s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af' }}>{t.id || idx + 1}</td>
                  <td style={{ padding: '12px 16px', color: '#059669', fontWeight: '600' }}>{t.placed_at}</td>
                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>{t.exited_at}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: isLong ? '#e6f4ea' : '#fee2e2',
                      color: isLong ? '#059669' : '#dc2626',
                    }}>
                      {t.side}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#111827' }}>
                    {currency}{t.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#111827' }}>
                    {currency}{t.exit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#2563eb', fontWeight: '600' }}>
                    {t.shares.toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: grossColor, fontWeight: '600' }}>
                    {t.gross_pnl >= 0 ? '+' : ''}{currency}{t.gross_pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#d97706' }}>
                    {t.fees > 0 ? `-${currency}${t.fees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${currency}0.00`}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: pnlColor, fontWeight: '800' }}>
                    {t.net_pnl >= 0 ? '+' : ''}{currency}{t.net_pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: pnlColor, fontWeight: '700' }}>
                    {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct.toFixed(2)}%
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {t.is_win ? (
                      <span style={{ color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', fontWeight: '700' }}>
                        <CheckCircle2 size={13} /> WIN
                      </span>
                    ) : (
                      <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', fontWeight: '700' }}>
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
