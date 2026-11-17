import React, { useState } from 'react';
import { X, TrendingUp, TrendingDown, Play, Sliders, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';

export default function InstrumentModal({
  instrument,
  onClose,
  onSelectForBot,
  onBacktest,
  currency = "₹"
}) {
  if (!instrument) return null;

  const [selectedTf, setSelectedTf] = useState("5m");
  const isUp = instrument.isUp ?? (instrument.change_pct ? instrument.change_pct >= 0 : !instrument.chg?.includes("-"));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#151819',
          border: '1px solid #252A2C',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
          animation: 'fadeIn 0.2s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid #252A2C'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: '#101314',
              border: '1px solid #252A2C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              fontWeight: '800',
              color: '#00D09C'
            }}>
              {instrument.logo || (instrument.sym || instrument.symbol || "EQ").slice(0, 2)}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: '800', color: '#F1F3F4' }}>
                  {instrument.sym || instrument.symbol}
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(0, 208, 156, 0.12)',
                  color: '#00D09C',
                  fontSize: '0.72rem',
                  fontWeight: '700'
                }}>
                  NSE • EQUITY
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#92999C' }}>
                {instrument.name || "National Stock Exchange"}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              backgroundColor: '#101314',
              border: '1px solid #252A2C',
              color: '#92999C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Price & Change Hero */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#92999C', textTransform: 'uppercase', fontWeight: '600' }}>
                Last Traded Price
              </span>
              <div style={{ fontSize: '2.2rem', fontWeight: '800', color: '#F1F3F4', fontVariantNumeric: 'tabular-nums' }}>
                {currency}{instrument.price || "818.50"}
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '10px',
              backgroundColor: isUp ? 'rgba(0, 208, 156, 0.12)' : 'rgba(235, 91, 60, 0.12)',
              color: isUp ? '#00D09C' : '#EB5B3C',
              fontSize: '0.9rem',
              fontWeight: '700'
            }}>
              {isUp ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
              <span>{instrument.chg || instrument.change_pct || "+1.25%"}</span>
            </div>
          </div>

          {/* Timeframe Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #252A2C', paddingBottom: '12px' }}>
            <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Timeframe:</span>
            {["1m", "5m", "15m", "1h", "1d"].map(tf => (
              <button
                key={tf}
                onClick={() => setSelectedTf(tf)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  backgroundColor: selectedTf === tf ? '#00D09C' : '#101314',
                  color: selectedTf === tf ? '#080A0B' : '#92999C',
                  border: '1px solid',
                  borderColor: selectedTf === tf ? '#00D09C' : '#252A2C',
                  fontSize: '0.75rem',
                  fontWeight: '700'
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Mini Sparkline Visualization */}
          <div style={{
            height: '140px',
            backgroundColor: '#080A0B',
            borderRadius: '12px',
            border: '1px solid #252A2C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <svg viewBox="0 0 400 100" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isUp ? "#00D09C" : "#EB5B3C"} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={isUp ? "#00D09C" : "#EB5B3C"} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={isUp ? "M 0,80 Q 80,65 140,55 T 240,40 T 320,25 L 400,15 L 400,100 L 0,100 Z" : "M 0,20 Q 80,35 140,45 T 240,60 T 320,75 L 400,85 L 400,100 L 0,100 Z"}
                fill="url(#chartGrad)"
              />
              <path
                d={isUp ? "M 0,80 Q 80,65 140,55 T 240,40 T 320,25 L 400,15" : "M 0,20 Q 80,35 140,45 T 240,60 T 320,75 L 400,85"}
                fill="none"
                stroke={isUp ? "#00D09C" : "#EB5B3C"}
                strokeWidth="2.5"
              />
            </svg>
            <div style={{ position: 'absolute', bottom: '8px', right: '12px', fontSize: '0.72rem', color: '#626A6E' }}>
              Real-time Intraday Tick Feed
            </div>
          </div>

          {/* Key Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            padding: '16px',
            backgroundColor: '#101314',
            borderRadius: '12px',
            border: '1px solid #252A2C'
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#626A6E' }}>52W High</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }}>
                {currency}{(Number(String(instrument.price || "818").replace(/,/g, '')) * 1.18).toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#626A6E' }}>52W Low</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }}>
                {currency}{(Number(String(instrument.price || "818").replace(/,/g, '')) * 0.78).toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#626A6E' }}>Avg Volume</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F1F3F4', marginTop: '2px' }}>
                14.2M
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              onClick={() => {
                onSelectForBot(instrument.sym || instrument.symbol);
                onClose();
              }}
              className="btn-groww-primary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Play size={16} fill="#080A0B" />
              <span>Select for Live Paper Bot</span>
            </button>

            <button
              onClick={() => {
                onBacktest(instrument.sym || instrument.symbol);
                onClose();
              }}
              className="btn-groww-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Sliders size={15} />
              <span>Backtest Quantitative Strategy</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
