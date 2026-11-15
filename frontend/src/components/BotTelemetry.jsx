import React, { useState, useEffect } from 'react';
import { Activity, ShieldAlert, Clock, RefreshCw, CheckCircle, TrendingUp, DollarSign } from 'lucide-react';

export default function BotTelemetry({ symbol = "SBIN.NS", currency = "₹" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const fetchBotState = async () => {
    try {
      const res = await fetch(`/api/bot/state?symbol=${encodeURIComponent(symbol)}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch bot state:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBotState();
    const interval = setInterval(fetchBotState, 5000); // 5s polling
    return () => clearInterval(interval);
  }, [symbol]);

  const bot = data?.bot_state || {};
  const recentTrades = data?.recent_trades || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Status Banner */}
      <div style={{
        backgroundColor: '#111622',
        border: '1px solid #1e2638',
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: bot.in_position ? '#10b981' : (bot.status?.includes('ACTIVE') ? '#3b82f6' : '#64748b'),
            boxShadow: bot.in_position ? '0 0 10px #10b981' : 'none'
          }} />
          <div>
            <div style={{ fontSize: '1rem', fontWeight: '800', color: '#f8fafc', letterSpacing: '0.01em' }}>
              Paper Trading Engine: {bot.status || "MONITORING"}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Syncing with local state file: <code style={{ color: '#38bdf8' }}>data/bot_india_state_{symbol.replace('.', '_')}.json</code>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={fetchBotState}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#161c2b',
              color: '#94a3b8',
              border: '1px solid #1e2638',
              fontSize: '0.75rem',
              fontWeight: '600'
            }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Poll Now ({lastRefreshed.toLocaleTimeString()})
          </button>
        </div>
      </div>

      {/* Real-time State Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {/* Cash Balance Card */}
        <div style={{
          backgroundColor: '#111622',
          border: '1px solid #1e2638',
          borderRadius: '8px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>Available Liquid Cash</span>
          <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f1f5f9', fontFamily: 'JetBrains Mono, monospace' }}>
            {currency}{bot.cash?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
            {currency === '₹' && bot.cash >= 100000 ? `(${(bot.cash / 100000).toFixed(2)} Lakhs)` : ''}
          </span>
        </div>

        {/* Active Position Card */}
        <div style={{
          backgroundColor: '#111622',
          border: '1px solid #1e2638',
          borderRadius: '8px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>Active Position</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '0.85rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: bot.position_side === 'LONG' ? 'rgba(16, 185, 129, 0.15)' : (bot.position_side === 'SHORT' ? 'rgba(239, 68, 68, 0.15)' : '#1e2638'),
              color: bot.position_side === 'LONG' ? '#10b981' : (bot.position_side === 'SHORT' ? '#ef4444' : '#64748b'),
            }}>
              {bot.position_side || "FLAT (NO POSITION)"}
            </span>
            {bot.shares > 0 && (
              <span style={{ fontSize: '0.9rem', color: '#c084fc', fontFamily: 'JetBrains Mono, monospace', fontWeight: '700' }}>
                {bot.shares} Shares
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
            Entry Price: {bot.entry_price > 0 ? `${currency}${bot.entry_price.toFixed(2)}` : 'N/A'}
          </span>
        </div>

        {/* Risk Stop Loss & Target */}
        <div style={{
          backgroundColor: '#111622',
          border: '1px solid #1e2638',
          borderRadius: '8px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>SL / Target Trailing</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>
            <span style={{ color: '#ef4444' }}>SL: {bot.stop_loss ? `${currency}${bot.stop_loss.toFixed(2)}` : 'N/A'}</span>
            <span style={{ color: '#10b981' }}>TP: {bot.target_price ? `${currency}${bot.target_price.toFixed(2)}` : 'N/A'}</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
            Intra-candle polling interval: 15 seconds
          </span>
        </div>
      </div>

      {/* Recent Paper Trades Log Table */}
      <div style={{
        backgroundColor: '#111622',
        border: '1px solid #1e2638',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2638', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#f8fafc' }}>
            Continuous Live Paper Trade Journal (`data/trade_history.csv`)
          </span>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Latest 15 Fills</span>
        </div>

        {recentTrades.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
            No live paper trades recorded yet. Start `python bot_india.py` to begin simulated live execution.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace' }}>
            <thead>
              <tr style={{ backgroundColor: '#0a0d14', color: '#94a3b8', borderBottom: '1px solid #1e2638', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                <th style={{ padding: '8px 14px' }}>Timestamp</th>
                <th style={{ padding: '8px 14px' }}>Action</th>
                <th style={{ padding: '8px 14px' }}>Symbol</th>
                <th style={{ padding: '8px 14px', textAlign: 'right' }}>Shares</th>
                <th style={{ padding: '8px 14px', textAlign: 'right' }}>Price</th>
                <th style={{ padding: '8px 14px', textAlign: 'right' }}>Cash Flow</th>
              </tr>
            </thead>
            <tbody>
              {recentTrades.map((t, idx) => {
                const isBuy = t.Action?.includes("BUY") || t.Action?.includes("COVER");
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #161c2b' }}>
                    <td style={{ padding: '8px 14px', color: '#38bdf8' }}>{t.Timestamp}</td>
                    <td style={{ padding: '8px 14px', fontWeight: '700', color: isBuy ? '#10b981' : '#ef4444' }}>
                      {t.Action}
                    </td>
                    <td style={{ padding: '8px 14px', color: '#f8fafc' }}>{t.Symbol}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: '#c084fc' }}>{t.Shares}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: '#f8fafc' }}>
                      {currency}{Number(t.Execution_Price).toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: Number(t.Cash_Change) >= 0 ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                      {Number(t.Cash_Change) >= 0 ? '+' : ''}{currency}{Number(t.Cash_Change).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

