import React from 'react';
import { Receipt } from 'lucide-react';

export default function StatutoryFeeCard({ breakdown = {}, currency = "₹" }) {
  const total = breakdown.total || 0;
  if (total <= 0) return null;

  const feeItems = [
    { label: "Brokerage", value: breakdown.brokerage, basis: "min(0.03%, ₹20) per leg", color: "#00D09C" },
    { label: "STT (Securities Tax)", value: breakdown.stt, basis: "0.025% on Sell Turnover", color: "#F59E0B" },
    { label: "NSE Exchange Fee", value: breakdown.exchange, basis: "0.00297% on Turnover", color: "#60A5FA" },
    { label: "Stamp Duty", value: breakdown.stamp, basis: "0.003% on Buy Turnover", color: "#A78BFA" },
    { label: "SEBI Turnover", value: breakdown.sebi, basis: "₹10 / crore (0.0001%)", color: "#92999C" },
    { label: "GST (18%)", value: breakdown.gst, basis: "18% on (Brokerage + NSE + SEBI)", color: "#EB5B3C" },
  ].filter(item => item.value > 0);

  return (
    <div style={{
      backgroundColor: '#121517',
      border: '1px solid #202426',
      borderRadius: '16px',
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #202426', paddingBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Receipt size={17} color="#F59E0B" />
          </div>
          <div>
            <span style={{ fontSize: '0.92rem', fontWeight: '700', color: '#F1F3F4' }}>
              Statutory Transaction Charges & Tax Deductions
            </span>
            <div style={{ fontSize: '0.72rem', color: '#92999C', marginTop: '2px' }}>
              SEBI, Exchange, and Government Regulatory Friction (Reconciled)
            </div>
          </div>
        </div>
        <span style={{ fontSize: '1.05rem', fontWeight: '800', color: '#EB5B3C', fontFamily: "'JetBrains Mono', monospace" }}>
          -{currency}{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Progress Bar of fees */}
      <div style={{ display: 'flex', height: '6px', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#1A1E22' }}>
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

      {/* Grid of fee cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}>
        {feeItems.map((item, idx) => {
          const pct = ((item.value / total) * 100).toFixed(1);
          return (
            <div key={idx} style={{
              backgroundColor: '#080A0B',
              border: '1px solid #202426',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>{item.label}</span>
                <span style={{ fontSize: '0.7rem', color: item.color, fontWeight: '700' }}>{pct}%</span>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4', fontFamily: "'JetBrains Mono', monospace" }}>
                {currency}{item.value.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#626A6E' }}>{item.basis}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
