import React from 'react';
import { Receipt } from 'lucide-react';

export default function StatutoryFeeCard({ breakdown = {}, currency = "₹" }) {
  const total = breakdown.total || 0;
  if (total <= 0) return null;

  const feeItems = [
    { label: "Brokerage", value: breakdown.brokerage, basis: "min(0.03%, ₹20) per leg", color: "#059669" },
    { label: "STT (Securities Tax)", value: breakdown.stt, basis: "0.025% on Sell Turnover", color: "#d97706" },
    { label: "NSE Exchange Fee", value: breakdown.exchange, basis: "0.00297% on Turnover", color: "#2563eb" },
    { label: "Stamp Duty", value: breakdown.stamp, basis: "0.003% on Buy Turnover", color: "#7c3aed" },
    { label: "SEBI Turnover", value: breakdown.sebi, basis: "₹10 / crore (0.0001%)", color: "#6b7280" },
    { label: "GST (18%)", value: breakdown.gst, basis: "18% on (Brokerage + NSE + SEBI)", color: "#dc2626" },
  ].filter(item => item.value > 0);

  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '20px',
      boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            backgroundColor: '#fef3c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Receipt size={16} color="#d97706" />
          </div>
          <div>
            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>
              Statutory Transaction Charges & Tax Deductions
            </span>
            <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>SEBI & Exchange Regulatory Friction</div>
          </div>
        </div>
        <span style={{ fontSize: '1rem', fontWeight: '800', color: '#dc2626', fontFamily: "'JetBrains Mono', monospace" }}>
          -{currency}{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Progress Bar of fees */}
      <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
        {feeItems.map((item, idx) => {
          const pct = (item.value / total) * 100;
          return (
            <div
              key={idx}
              title={`${item.label}: ${currency}${item.value.toFixed(2)} (${pct.toFixed(1)}%)`}
              style={{ width: `${pct}%`, backgroundColor: item.color }}
            />
          );
        })}
      </div>

      {/* Grid of fees */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
        {feeItems.map((item, idx) => {
          const pct = ((item.value / total) * 100).toFixed(1);
          return (
            <div key={idx} style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>{item.label}</span>
                <span style={{ fontSize: '0.7rem', color: item.color, fontWeight: '700' }}>{pct}%</span>
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827', fontFamily: "'JetBrains Mono', monospace" }}>
                {currency}{item.value.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{item.basis}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
