import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Lock,
  RefreshCw,
  Clock,
  TrendingDown,
  Activity,
  CheckCircle2,
  XCircle,
  Percent,
  Sliders,
  Info
} from 'lucide-react';

export default function RiskGuardrailsView({ currency = "₹" }) {
  const [botData, setBotData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/bot/status');
      if (res.ok) {
        const json = await res.json();
        setBotData(json);
        setLastUpdated(json.ist_time || new Date().toLocaleTimeString('en-IN', { hour12: false }));
      }
    } catch (e) {
      console.error("RiskGuardrailsView fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const bot = botData?.bot_state || {};
  const risk = botData?.risk_metrics || {
    starting_daily_equity: 1000000.0,
    current_equity: 1000000.0,
    daily_realized_pnl: 0.0,
    unrealized_pnl: 0.0,
    daily_net_pnl: 0.0,
    daily_charges: 0.0,
    max_drawdown_pct: 2.0,
    max_daily_loss: 20000.0,
    remaining_risk_allowance: 20000.0,
    current_exposure: 0.0,
    exposure_pct: 0.0,
    position_status: "FLAT",
    circuit_breaker_triggered: false,
    circuit_breaker_reason: null,
    lock_date: null,
    lock_time: null
  };

  const isTriggered = risk.circuit_breaker_triggered || Boolean(bot.daily_drawdown_locked);
  const lockReason = risk.circuit_breaker_reason || bot.daily_drawdown_lock_reason;
  const startingEquity = Number(risk.starting_daily_equity || 1000000.0);
  const currentEquity = Number(risk.current_equity || startingEquity);
  const netPnl = Number(risk.daily_net_pnl || 0.0);
  const realizedPnl = Number(risk.daily_realized_pnl || 0.0);
  const unrealizedPnl = Number(risk.unrealized_pnl || 0.0);
  const maxLoss = Number(risk.max_daily_loss || 20000.0);
  const remainingAllowance = Number(risk.remaining_risk_allowance || 0.0);
  const riskConsumedPct = maxLoss > 0 ? Math.min(100, Math.max(0, (Math.abs(Math.min(0, netPnl)) / maxLoss) * 100)) : 0;

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* ── TOP HEADER BANNER ── */}
      <div style={{
        backgroundColor: '#121517',
        border: '1px solid #202426',
        borderRadius: '16px',
        padding: '24px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: isTriggered ? 'rgba(235, 91, 60, 0.15)' : 'rgba(0, 208, 156, 0.15)',
            border: `1px solid ${isTriggered ? '#EB5B3C' : '#00D09C'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isTriggered ? '#EB5B3C' : '#00D09C'
          }}>
            {isTriggered ? <Lock size={22} /> : <ShieldCheck size={22} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#F1F3F4', margin: 0 }}>
                Institutional Risk Monitor & Circuit Breakers
              </h1>
              <span style={{
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: isTriggered ? 'rgba(235, 91, 60, 0.15)' : 'rgba(0, 208, 156, 0.12)',
                color: isTriggered ? '#EB5B3C' : '#00D09C',
                border: `1px solid ${isTriggered ? '#EB5B3C' : '#00D09C'}`,
                fontSize: '0.72rem',
                fontWeight: '800'
              }}>
                {isTriggered ? "CIRCUIT BREAKER TRIGGERED" : "ENFORCED IN REAL-TIME"}
              </span>
            </div>
            <p style={{ fontSize: '0.825rem', color: '#92999C', margin: '4px 0 0 0' }}>
              Autonomous capital protection daemon. Evaluates intra-candle drawdown, statutory fees, and slippage on every price tick.
            </p>
          </div>
        </div>

        <button
          onClick={fetchStatus}
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor: '#181D20',
            border: '1px solid #202426',
            color: '#F1F3F4',
            fontSize: '0.8rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Synced {lastUpdated || "live"}</span>
        </button>
      </div>

      {/* ── CIRCUIT BREAKER STATUS CARD ── */}
      {isTriggered ? (
        <div style={{
          backgroundColor: 'rgba(235, 91, 60, 0.08)',
          border: '1.5px solid #EB5B3C',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#EB5B3C', fontWeight: '800', fontSize: '1rem' }}>
            <AlertTriangle size={20} />
            <span>SESSION RISK LOCK ACTIVE: DAILY DRAWDOWN LIMIT REACHED</span>
          </div>
          <div style={{ fontSize: '0.875rem', color: '#F1F3F4', lineHeight: 1.5 }}>
            {lockReason || `Daily drawdown threshold of ${currency}${maxLoss.toLocaleString('en-IN')} breached. All open positions were automatically liquidated and trading is suspended for the session.`}
          </div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid rgba(235, 91, 60, 0.25)', fontSize: '0.8rem', color: '#92999C' }}>
            <span>🔒 Re-entries Blocked: <strong style={{ color: '#F1F3F4' }}>YES</strong></span>
            <span>📅 Lock Date: <strong style={{ color: '#F1F3F4' }}>{risk.lock_date || bot.daily_drawdown_lock_date || "Today"}</strong></span>
            <span>⏰ Trigger Timestamp: <strong style={{ color: '#F1F3F4' }}>{risk.lock_time || bot.daily_drawdown_lock_time || "N/A"} IST</strong></span>
            <span>🔄 Auto-Reset: <strong style={{ color: '#00D09C' }}>Next valid NSE trading day (09:15 AM IST)</strong></span>
          </div>
        </div>
      ) : (
        <div style={{
          backgroundColor: '#121517',
          border: '1px solid #202426',
          borderRadius: '16px',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <CheckCircle2 size={20} color="#00D09C" />
            <div>
              <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#F1F3F4' }}>
                Circuit Breaker Healthy ({riskConsumedPct.toFixed(1)}% Daily Risk Allowance Consumed)
              </span>
              <div style={{ fontSize: '0.78rem', color: '#92999C', marginTop: '2px' }}>
                Threshold: Max {risk.max_drawdown_pct}% loss ({currency}{maxLoss.toLocaleString('en-IN')}) │ Remaining Buffer: {currency}{remainingAllowance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Risk allowance progress bar */}
          <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#92999C' }}>
              <span>Risk Used</span>
              <span style={{ color: riskConsumedPct > 70 ? '#EB5B3C' : '#00D09C', fontWeight: '700' }}>
                {riskConsumedPct.toFixed(1)}%
              </span>
            </div>
            <div style={{ height: '6px', borderRadius: '3px', backgroundColor: '#080A0B', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${riskConsumedPct}%`,
                backgroundColor: riskConsumedPct > 70 ? '#EB5B3C' : (riskConsumedPct > 40 ? '#F59E0B' : '#00D09C'),
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>
        </div>
      )}

      {/* ── 10 DYNAMIC RISK METRICS GRID ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px'
      }}>
        {/* 1. Starting Daily Equity */}
        <div style={{ backgroundColor: '#121517', border: '1px solid #202426', borderRadius: '14px', padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Starting Daily Equity</span>
          <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
            {currency}{startingEquity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>Session 09:15 AM Baseline</span>
        </div>

        {/* 2. Current Portfolio Equity */}
        <div style={{ backgroundColor: '#121517', border: '1px solid #202426', borderRadius: '14px', padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Current Portfolio Equity</span>
          <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
            {currency}{currentEquity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.72rem', color: netPnl >= 0 ? '#00D09C' : '#EB5B3C' }}>
            {netPnl >= 0 ? `+${currency}${netPnl.toFixed(2)} (+${((netPnl / startingEquity) * 100).toFixed(2)}%)` : `-${currency}${Math.abs(netPnl).toFixed(2)} (${((netPnl / startingEquity) * 100).toFixed(2)}%)`}
          </span>
        </div>

        {/* 3. Realized Daily P&L */}
        <div style={{ backgroundColor: '#121517', border: '1px solid #202426', borderRadius: '14px', padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Realized Daily P&L</span>
          <div style={{
            fontSize: '1.25rem',
            fontWeight: '800',
            color: realizedPnl >= 0 ? '#00D09C' : '#EB5B3C',
            marginTop: '6px',
            fontFamily: "'JetBrains Mono', monospace"
          }}>
            {realizedPnl >= 0 ? `+${currency}${realizedPnl.toFixed(2)}` : `-${currency}${Math.abs(realizedPnl).toFixed(2)}`}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>Closed Round-Trips Today</span>
        </div>

        {/* 4. Unrealized MTM P&L */}
        <div style={{ backgroundColor: '#121517', border: '1px solid #202426', borderRadius: '14px', padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Unrealized MTM P&L</span>
          <div style={{
            fontSize: '1.25rem',
            fontWeight: '800',
            color: unrealizedPnl >= 0 ? (unrealizedPnl === 0 ? '#92999C' : '#00D09C') : '#EB5B3C',
            marginTop: '6px',
            fontFamily: "'JetBrains Mono', monospace"
          }}>
            {unrealizedPnl >= 0 ? (unrealizedPnl === 0 ? `₹0.00` : `+${currency}${unrealizedPnl.toFixed(2)}`) : `-${currency}${Math.abs(unrealizedPnl).toFixed(2)}`}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>Includes modeled exit costs</span>
        </div>

        {/* 5. Daily Net P&L */}
        <div style={{ backgroundColor: '#121517', border: '1px solid #202426', borderRadius: '14px', padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Total Daily Net P&L</span>
          <div style={{
            fontSize: '1.25rem',
            fontWeight: '800',
            color: netPnl >= 0 ? '#00D09C' : '#EB5B3C',
            marginTop: '6px',
            fontFamily: "'JetBrains Mono', monospace"
          }}>
            {netPnl >= 0 ? `+${currency}${netPnl.toFixed(2)}` : `-${currency}${Math.abs(netPnl).toFixed(2)}`}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>Realized + Unrealized Net</span>
        </div>

        {/* 6. Maximum Daily Loss Limit */}
        <div style={{ backgroundColor: '#121517', border: '1px solid #202426', borderRadius: '14px', padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Max Daily Loss Limit</span>
          <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#EB5B3C', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
            -{currency}{maxLoss.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>{risk.max_drawdown_pct}% Hard Stop</span>
        </div>

        {/* 7. Remaining Risk Allowance */}
        <div style={{ backgroundColor: '#121517', border: '1px solid #202426', borderRadius: '14px', padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Remaining Risk Allowance</span>
          <div style={{ fontSize: '1.25rem', fontWeight: '800', color: remainingAllowance > 0 ? '#00D09C' : '#EB5B3C', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
            {currency}{remainingAllowance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>Before circuit breaker trip</span>
        </div>

        {/* 8. Current Exposure */}
        <div style={{ backgroundColor: '#121517', border: '1px solid #202426', borderRadius: '14px', padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Active Exposure</span>
          <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F1F3F4', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
            {currency}{Number(risk.current_exposure || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>{risk.exposure_pct || 0}% of portfolio</span>
        </div>

        {/* 9. Position Status */}
        <div style={{ backgroundColor: '#121517', border: '1px solid #202426', borderRadius: '14px', padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Position Status</span>
          <div style={{ fontSize: '1.2rem', fontWeight: '800', color: risk.position_status === 'FLAT' ? '#92999C' : '#00D09C', marginTop: '6px' }}>
            {risk.position_status || "FLAT"}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>{bot.symbol || "SBIN.NS"}</span>
        </div>

        {/* 10. Circuit Breaker Engine */}
        <div style={{ backgroundColor: '#121517', border: '1px solid #202426', borderRadius: '14px', padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: '#92999C', fontWeight: '600' }}>Circuit Breaker Guard</span>
          <div style={{ fontSize: '1.15rem', fontWeight: '800', color: isTriggered ? '#EB5B3C' : '#00D09C', marginTop: '6px' }}>
            {isTriggered ? "TRIGGERED (LOCKED)" : "ACTIVE & ENFORCED"}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#626A6E' }}>Python execution loop</span>
        </div>
      </div>

      {/* ── IMPLEMENTATION REALITY & AUDIT SCHEDULE ── */}
      <div style={{
        backgroundColor: '#121517',
        border: '1px solid #202426',
        borderRadius: '16px',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={18} color="#00D09C" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#F1F3F4', margin: 0 }}>
            Risk Controls Audit & Implementation Schedule
          </h3>
        </div>

        <p style={{ fontSize: '0.825rem', color: '#92999C', margin: 0 }}>
          The table below clearly documents which controls are actively enforced in Python vs. roadmap features, reflecting the results of Task 04 audit.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #202426', color: '#92999C', backgroundColor: '#0D1114' }}>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Risk Control</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Implementation Status</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Enforcement Mechanism</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #1A1E22' }}>
                <td style={{ padding: '12px 16px', color: '#F1F3F4', fontWeight: '600' }}>Daily Drawdown Circuit Breaker</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(0, 208, 156, 0.15)', color: '#00D09C', fontWeight: '700', fontSize: '0.75rem' }}>
                    FULLY IMPLEMENTED
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#92999C' }}>
                  Enforced in <code>engine/live_trader.py</code>. Liquidates open positions and locks session when loss reaches {risk.max_drawdown_pct}%.
                </td>
              </tr>

              <tr style={{ borderBottom: '1px solid #1A1E22' }}>
                <td style={{ padding: '12px 16px', color: '#F1F3F4', fontWeight: '600' }}>15:15 IST MIS Auto-Square-Off</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(0, 208, 156, 0.15)', color: '#00D09C', fontWeight: '700', fontSize: '0.75rem' }}>
                    FULLY IMPLEMENTED
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#92999C' }}>
                  Checked every 15s in Python thread. Forces liquidation of any open intraday position at 3:15 PM IST.
                </td>
              </tr>

              <tr style={{ borderBottom: '1px solid #1A1E22' }}>
                <td style={{ padding: '12px 16px', color: '#F1F3F4', fontWeight: '600' }}>Intra-Candle Stop-Loss & Take-Profit</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(0, 208, 156, 0.15)', color: '#00D09C', fontWeight: '700', fontSize: '0.75rem' }}>
                    FULLY IMPLEMENTED
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#92999C' }}>
                  Configurable SL ({bot.stop_loss_pct || 0.8}%) and TP ({bot.take_profit_multiple || 2.0}R) evaluated against real-time LTP every 15s.
                </td>
              </tr>

              <tr style={{ borderBottom: '1px solid #1A1E22' }}>
                <td style={{ padding: '12px 16px', color: '#F1F3F4', fontWeight: '600' }}>Daily Trade Quota Lock</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(0, 208, 156, 0.15)', color: '#00D09C', fontWeight: '700', fontSize: '0.75rem' }}>
                    FULLY IMPLEMENTED
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#92999C' }}>
                  Locks re-entries once {bot.max_trades_per_symbol || 1} trade(s) completed today to prevent overtrading.
                </td>
              </tr>

              <tr style={{ borderBottom: '1px solid #1A1E22' }}>
                <td style={{ padding: '12px 16px', color: '#F1F3F4', fontWeight: '600' }}>Friction & Statutory Deductions</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(0, 208, 156, 0.15)', color: '#00D09C', fontWeight: '700', fontSize: '0.75rem' }}>
                    FULLY IMPLEMENTED
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#92999C' }}>
                  0.05% slippage penalty, brokerage cap, STT (0.025%), NSE fee (0.00297%), SEBI fee, GST, and stamp duty.
                </td>
              </tr>

              <tr style={{ borderBottom: '1px solid #1A1E22' }}>
                <td style={{ padding: '12px 16px', color: '#92999C' }}>Direct Broker API Gateway (Zerodha / Groww)</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#1A1E22', color: '#92999C', fontWeight: '600', fontSize: '0.75rem' }}>
                    ROADMAP (PHASE 5)
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#626A6E' }}>
                  Currently running in paper execution simulation. Real broker order gateway scheduled for subsequent phase.
                </td>
              </tr>

              <tr>
                <td style={{ padding: '12px 16px', color: '#92999C' }}>Dynamic Trailing Stop Loss</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#1A1E22', color: '#92999C', fontWeight: '600', fontSize: '0.75rem' }}>
                    ROADMAP (PHASE 5)
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#626A6E' }}>
                  Fixed stop-loss and 2R bracket targets currently supported. ATR-based trailing SL planned.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
