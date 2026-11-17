import React from 'react';
import { X, CheckCircle2, ShieldCheck, FileText, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';

export default function TradeDetailsModal({ trade, onClose, currency = "₹" }) {
  if (!trade) return null;

  const isBuy = trade.Action?.includes("BUY");
  const isShort = trade.Action?.includes("SHORT");
  const isCover = trade.Action?.includes("COVER");
  const isSquareOff = trade.Action?.includes("SQUARE_OFF") || trade.Action?.includes("SQUAREOFF");

  const shares = Number(trade.Shares || 0);
  const price = Number(trade.Execution_Price || 0);
  const tradeValue = shares * price;

  // Real Indian statutory cost model (matches engine/live_trader.py)
  const brokerage = Math.min(20.0, tradeValue * 0.0003);
  const stt = isBuy ? 0.0 : (tradeValue * 0.00025); // 0.025% STT on sell side
  const exchangeFee = tradeValue * 0.0000297;      // 0.00297% NSE cash
  const sebiFee = tradeValue * 0.000001;           // 0.0001%
  const gst = (brokerage + exchangeFee + sebiFee) * 0.18; // 18% GST
  const stampDuty = isBuy ? (tradeValue * 0.00003) : 0.0; // 0.003% buy side
  const totalCharges = brokerage + stt + exchangeFee + sebiFee + gst + stampDuty;

  // Clean cash change
  const rawCash = trade.Cash_Change ? parseFloat(String(trade.Cash_Change).replace(/[₹,+ ]/g, '')) : (isBuy ? -tradeValue : tradeValue);
  const isPositiveCash = rawCash >= 0;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(5, 7, 10, 0.78)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: '#161922',
        border: '1px solid #242938',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.7)',
        color: '#ffffff'
      }} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #242938',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: isBuy ? 'rgba(0, 208, 156, 0.15)' : 'rgba(235, 91, 60, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isBuy ? '#00d09c' : '#eb5b3c'
            }}>
              {isBuy ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: '800', letterSpacing: '-0.01em' }}>
                {trade.Symbol || "SBIN.NS"}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#8a939e' }}>
                Order #{trade.id || "TRD-LIVE"} • {trade.Date || trade.Timestamp?.slice(0, 10)} {trade.Time ? `• ${trade.Time}` : ''}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#1c202d',
              border: 'none',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Order Summary Ribbon */}
        <div style={{
          padding: '18px 24px',
          backgroundColor: '#12151d',
          borderBottom: '1px solid #242938',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px'
        }}>
          <div>
            <div style={{ fontSize: '0.70rem', color: '#8a939e', textTransform: 'uppercase', fontWeight: '700' }}>Order Action</div>
            <div style={{
              display: 'inline-block',
              marginTop: '4px',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: '800',
              backgroundColor: isBuy ? 'rgba(0, 208, 156, 0.15)' : 'rgba(235, 91, 60, 0.15)',
              color: isBuy ? '#00d09c' : '#eb5b3c'
            }}>
              {trade.Action}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.70rem', color: '#8a939e', textTransform: 'uppercase', fontWeight: '700' }}>Shares / Qty</div>
            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#ffffff', marginTop: '4px' }}>
              {shares.toLocaleString('en-IN')} units
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.70rem', color: '#8a939e', textTransform: 'uppercase', fontWeight: '700' }}>Execution Price</div>
            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#ffffff', marginTop: '4px' }}>
              ₹{price.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Order Values & Charges Breakdown */}
        <div style={{ padding: '20px 24px' }}>
          {/* Gross Amount */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '12px',
            borderBottom: '1px solid #242938'
          }}>
            <span style={{ fontSize: '0.82rem', color: '#8a939e' }}>Gross Order Value</span>
            <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#ffffff' }}>
              ₹{tradeValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Section: Regulatory & Broker Charges */}
          <div style={{ marginTop: '16px', marginBottom: '10px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              fontWeight: '800',
              color: '#00d09c',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '12px'
            }}>
              <ShieldCheck size={14} />
              <span>Statutory & Regulatory Charges (NSE MIS)</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.80rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c3c9d5' }}>
                <span>Brokerage (Discount Broker Standard)</span>
                <span style={{ fontWeight: '600' }}>₹{brokerage.toFixed(2)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c3c9d5' }}>
                <span>Securities Transaction Tax (STT / CTT)</span>
                <span style={{ fontWeight: '600' }}>₹{stt.toFixed(2)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c3c9d5' }}>
                <span>Exchange Turnover Charges (NSE 0.00297%)</span>
                <span style={{ fontWeight: '600' }}>₹{exchangeFee.toFixed(2)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c3c9d5' }}>
                <span>SEBI Turnover Charges (₹10 / Crore)</span>
                <span style={{ fontWeight: '600' }}>₹{sebiFee.toFixed(2)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c3c9d5' }}>
                <span>GST (18% on Brokerage + Exchange + SEBI)</span>
                <span style={{ fontWeight: '600' }}>₹{gst.toFixed(2)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c3c9d5' }}>
                <span>Stamp Duty (0.003% State Levy)</span>
                <span style={{ fontWeight: '600' }}>₹{stampDuty.toFixed(2)}</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1px dashed #2e3547',
                color: '#eb5b3c',
                fontWeight: '700'
              }}>
                <span>Total Statutory Charges & Fees</span>
                <span>-₹{totalCharges.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Net Settlement Amount */}
          <div style={{
            marginTop: '20px',
            padding: '14px 18px',
            backgroundColor: '#1c202d',
            borderRadius: '12px',
            border: '1px solid #2e3547',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: '0.70rem', color: '#8a939e', textTransform: 'uppercase', fontWeight: '700' }}>
                Net Cash Impact
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                {isPositiveCash ? 'Credited to account' : 'Debited from cash margin'}
              </div>
            </div>
            <div style={{
              fontSize: '1.15rem',
              fontWeight: '900',
              color: isPositiveCash ? '#00d09c' : '#ffffff'
            }}>
              {isPositiveCash ? '+' : ''}₹{Math.abs(rawCash).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid #242938',
          display: 'flex',
          justifyContent: 'flex-end',
          backgroundColor: '#12151d',
          borderBottomLeftRadius: '20px',
          borderBottomRightRadius: '20px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '10px',
              backgroundColor: '#00d09c',
              color: '#0c0e14',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '800',
              cursor: 'pointer'
            }}
          >
            Close Details
          </button>
        </div>

      </div>
    </div>
  );
}
