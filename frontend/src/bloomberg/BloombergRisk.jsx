import React, { useEffect } from 'react';
import { ShieldCheck, Bell } from 'lucide-react';

export default function BloombergRisk({ currency = "₹", onOpenTelegram = () => {} }) {
  useEffect(() => {
    fetch('/api/notifications/telegram/status').catch(() => {});
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px' }}>
      {/* Top Banner */}
      <div className="bbg-panel" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldCheck size={16} color="#00ff66" />
          <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#ff9900' }}>
            INSTITUTIONAL RISK CONTROL ARCHITECTURE // SEBI COMPLIANT
          </span>
        </div>
        <div style={{ fontSize: '0.7rem', color: '#00ff66', fontWeight: '700' }}>
          ● ALL GUARDRAILS ACTIVE
        </div>
      </div>

      {/* Grid of Risk Modules */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {/* Module 1: Intraday MIS & Circuit Breaker */}
        <div className="bbg-panel">
          <div className="bbg-panel-header">
            <span>INTRADAY MIS EXECUTION SAFEGUARDS</span>
            <span style={{ color: '#00ff66' }}>ACTIVE</span>
          </div>
          <div style={{ padding: '12px' }}>
            <table className="bbg-table">
              <tbody>
                <tr>
                  <td style={{ color: '#94a3b8' }}>3:15 PM AUTO SQUARE-OFF</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#00ff66' }}>ENABLED (15:15 IST)</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>MAX DAILY DRAWDOWN</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#ff3344' }}>{currency}20,000 (2.0% CIRCUIT)</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>PEAK LEVERAGE LIMIT</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#00e5ff' }}>5.0x MIS (SEBI MANDATED)</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>PER-TRADE CAPITAL AT RISK</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#ffaa00' }}>1.0% (₹10,000 HARD STOP)</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>CONSECUTIVE LOSS HALT</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#ff3344' }}>3 STOPS → 60 MIN COOLDOWN</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Module 2: Survivorship & Regulatory Bias */}
        <div className="bbg-panel">
          <div className="bbg-panel-header">
            <span>REGULATORY & MARKET FILTERS</span>
            <span style={{ color: '#ff9900' }}>ENFORCED</span>
          </div>
          <div style={{ padding: '12px' }}>
            <table className="bbg-table">
              <tbody>
                <tr>
                  <td style={{ color: '#94a3b8' }}>F&amp;O BAN LIST EXCLUSION</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#00ff66' }}>ACTIVE (DAILY SYNC)</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>QUARTERLY EARNINGS BLACKOUT</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#00ff66' }}>NO POSITIONS ON RESULT DAY</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>MINIMUM 20D ADTV THRESHOLD</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#00e5ff' }}>₹50 CRORE LIQUIDITY FLOOR</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>SPREAD SLIPPAGE TOLERANCE</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#ffaa00' }}>MAX 0.05% SPREAD GAP</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>STATUTORY TAX ALLOCATION</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: '#ffaa00' }}>STT + SEBI + GST + STAMP</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Telegram Alerts Configuration Card */}
      <div className="bbg-panel" style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Bell size={20} color="#ff9900" />
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#f8fafc' }}>
              TELEGRAM MOBILE TELEMETRY &amp; EMERGENCY KILL-SWITCH
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
              Instant push notifications for orders, fills, stop losses, and 1-tap square-off on mobile.
            </div>
          </div>
        </div>

        <button
          onClick={onOpenTelegram}
          className="bbg-fkey-btn"
          style={{ borderColor: '#00e5ff', color: '#00e5ff', padding: '6px 14px' }}
        >
          &lt;CONFIGURE TELEGRAM BOT&gt;
        </button>
      </div>
    </div>
  );
}
