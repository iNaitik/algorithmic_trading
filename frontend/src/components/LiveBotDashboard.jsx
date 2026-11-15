import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Play,
  Pause,
  Square,
  RotateCcw,
  AlertTriangle,
  Activity,
  ShieldCheck,
  Clock,
  Layers,
  CreditCard,
  Send,
  Download
} from 'lucide-react';

export default function LiveBotDashboard({
  market = "INDIA",
  currency = "₹",
  onNavigateToBacktest = () => {}
}) {
  const [symbol, setSymbol] = useState("SBIN.NS");
  const [strategy, setStrategy] = useState("NSE Intraday ORB Breakout");
  const [botData, setBotData] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch bot telemetry and market quotes
  const fetchData = async () => {
    try {
      const [botRes, wlRes] = await Promise.all([
        fetch(`/api/bot/state?symbol=${encodeURIComponent(symbol)}`),
        fetch(`/api/market/watchlist?market=${market}`)
      ]);
      if (botRes.ok) setBotData(await botRes.json());
      if (wlRes.ok) setWatchlist(await wlRes.json());
    } catch (e) {
      console.error("Telemetry error:", e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [symbol, market]);

  // Bot Control Actions
  const handleControl = async (action) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, symbol, strategy_name: strategy, capital: 1000000.0 })
      });
      if (res.ok) {
        const json = await res.json();
        setBotData(prev => ({ ...prev, bot_state: json.bot_state }));
        fetchData();
      }
    } catch (e) {
      console.error("Control error:", e);
    } finally {
      setActionLoading(false);
    }
  };

  const bot = botData?.bot_state || {
    status: "ACTIVE (IN POSITION)",
    cash: 850000.0,
    in_position: true,
    shares: 500,
    position_side: "LONG",
    entry_price: 813.20,
    stop_loss: 805.00,
    target_price: 825.00
  };

  const currentQuote = watchlist.find(w => w.symbol === symbol) || { price: 818.50, change_pct: 1.25, vwap: 814.20 };
  const currentLtp = currentQuote.price || bot.entry_price || 815.0;
  const positionValue = bot.in_position ? bot.shares * currentLtp : 0;
  const totalNetWorth = (bot.cash || 1000000.0) + positionValue;
  const initialCapital = 1000000.0;
  const totalReturnPct = ((totalNetWorth - initialCapital) / initialCapital) * 100;
  const unrealizedPnl = bot.in_position ? (currentLtp - bot.entry_price) * bot.shares : 0;

  // Recent paper fills
  const recentFills = botData?.recent_trades && botData.recent_trades.length > 0
    ? botData.recent_trades.slice(-4).reverse()
    : [
        { Name: "State Bank of India (SBIN.NS)", Date: "13 Nov 2026", Time: "12:15 PM", Status: "Successful", Amount: "+₹1,775.00" },
        { Name: "Reliance Industries (RELIANCE.NS)", Date: "13 Nov 2026", Time: "10:45 AM", Status: "Successful", Amount: "+₹3,400.00" },
        { Name: "ICICI Bank (ICICIBANK.NS)", Date: "13 Nov 2026", Time: "09:45 AM", Status: "Successful", Amount: "+₹2,100.00" },
        { Name: "HDFC Bank (HDFCBANK.NS)", Date: "13 Nov 2026", Time: "09:20 AM", Status: "Stop Loss Hit", Amount: "-₹1,250.00" }
      ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px 36px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* ── Operational Control Strip ─────────────────────────────────── */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '20px',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '12px',
            backgroundColor: '#e6f4ea',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Activity size={20} color="#059669" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1rem', fontWeight: '700', color: '#111827' }}>
                Paper Execution Engine
              </span>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: bot.status?.includes("ACTIVE") ? '#e6f4ea' : '#fee2e2',
                color: bot.status?.includes("ACTIVE") ? '#059669' : '#dc2626'
              }}>
                {bot.status || "MONITORING"}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              Trading: <b style={{ color: '#111827' }}>{symbol}</b> • Strategy: <b style={{ color: '#111827' }}>{strategy}</b>
            </div>
          </div>
        </div>

        {/* Quick controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            style={{
              padding: '8px 12px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              color: '#111827',
              fontSize: '0.8rem',
              fontWeight: '600',
              outline: 'none'
            }}
          >
            <option value="SBIN.NS">SBIN.NS (State Bank of India)</option>
            <option value="RELIANCE.NS">RELIANCE.NS (Reliance Industries)</option>
            <option value="HDFCBANK.NS">HDFCBANK.NS (HDFC Bank)</option>
            <option value="ICICIBANK.NS">ICICIBANK.NS (ICICI Bank)</option>
            <option value="TCS.NS">TCS.NS (Tata Consultancy Services)</option>
          </select>

          <button
            onClick={() => handleControl("START")}
            disabled={actionLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '10px',
              backgroundColor: '#059669',
              color: '#ffffff',
              fontSize: '0.78rem',
              fontWeight: '700',
              border: 'none',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
              cursor: 'pointer'
            }}
          >
            <Play size={13} fill="#ffffff" /> Start Bot
          </button>

          <button
            onClick={() => handleControl("PAUSE")}
            disabled={actionLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
              fontSize: '0.78rem',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <Pause size={13} /> Pause
          </button>

          <button
            onClick={() => handleControl("SQUARE_OFF")}
            disabled={actionLoading || !bot.in_position}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '10px',
              backgroundColor: bot.in_position ? '#fee2e2' : '#f3f4f6',
              color: bot.in_position ? '#dc2626' : '#9ca3af',
              fontSize: '0.78rem',
              fontWeight: '700',
              border: 'none',
              cursor: bot.in_position ? 'pointer' : 'not-allowed'
            }}
          >
            <AlertTriangle size={13} /> Square Off
          </button>

          <button
            onClick={() => handleControl("RESET")}
            disabled={actionLoading}
            title="Reset Balance to 10 Lakhs"
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              backgroundColor: '#f3f4f6',
              color: '#6b7280',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* ── Quixotic Row 1: Emerald VISA Hero Card + Engagement Rate Bar Chart + Total Balance Mountain ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(300px, 340px) 1fr minmax(280px, 320px)',
        gap: '20px'
      }}>
        {/* Card 1: Payment Goal / Capital Card (Exact Match to Image 1 VISA Card) */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>
                Portfolio Capital
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Total allocated fund</div>
            </div>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280'
            }}>
              <TrendingUp size={16} />
            </div>
          </div>

          {/* Emerald Green VISA style Card */}
          <div style={{
            background: 'linear-gradient(135deg, #059669 0%, #007a4d 100%)',
            borderRadius: '16px',
            padding: '20px',
            color: '#ffffff',
            boxShadow: '0 6px 18px -2px rgba(5, 150, 105, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: '800', letterSpacing: '0.05em' }}>TRADING MARGIN</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>●●●● MIS</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.02em', marginTop: '6px' }}>
              {currency} {totalNetWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', opacity: 0.85, marginTop: '4px' }}>
              <span>•••• 909090</span>
              <span>EXP 09/26</span>
            </div>
          </div>

          {/* Bottom stats under VISA card */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Session Profit / Alpha</div>
              <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#111827' }}>
                +{currency}48,250
              </div>
            </div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              padding: '4px 10px',
              borderRadius: '20px',
              backgroundColor: '#e6f4ea',
              color: '#059669'
            }}>
              +12.8%
            </span>
          </div>
        </div>

        {/* Card 2: Engagement Rate / Performance Bar Chart (Matches Image Card 2) */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={16} color="#059669" />
              </div>
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827' }}>
                Strategy Alpha Yield
              </span>
            </div>

            {/* Toggle: Monthly / Annually */}
            <div style={{ display: 'flex', backgroundColor: '#f3f4f6', padding: '3px', borderRadius: '12px' }}>
              <button style={{ padding: '4px 10px', borderRadius: '9px', border: 'none', backgroundColor: 'transparent', color: '#6b7280', fontSize: '0.75rem', fontWeight: '600' }}>
                Session
              </button>
              <button style={{ padding: '4px 12px', borderRadius: '9px', border: 'none', backgroundColor: '#059669', color: '#ffffff', fontSize: '0.75rem', fontWeight: '700' }}>
                Cumulative
              </button>
            </div>
          </div>

          {/* Striped Mint Green Bars with solid Emerald Peak Bar matching image */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', height: '140px', paddingTop: '20px' }}>
            {[
              { label: "JAN", val: 50, peak: false },
              { label: "FEB", val: 75, peak: false },
              { label: "MAR", val: 65, peak: false },
              { label: "APR", val: 100, peak: true, badge: "+17.8%" },
              { label: "MAY", val: 78, peak: false },
              { label: "JUN", val: 82, peak: false }
            ].map(b => (
              <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '8px' }}>
                {b.peak && (
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: '700',
                    padding: '2px 6px',
                    borderRadius: '12px',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    marginBottom: '-4px'
                  }}>
                    {b.badge}
                  </span>
                )}
                <div style={{
                  width: '100%',
                  height: `${b.val}%`,
                  borderRadius: '14px',
                  backgroundColor: b.peak ? '#059669' : '#a7f3d0',
                  backgroundImage: b.peak ? 'none' : 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(5, 150, 105, 0.15) 5px, rgba(5, 150, 105, 0.15) 10px)',
                  transition: 'height 0.3s ease'
                }} />
                <span style={{ fontSize: '0.72rem', fontWeight: '600', color: b.peak ? '#059669' : '#6b7280' }}>
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 3: Payment Goal / Liquid Cash & Mountain Curve (Matches Image Card 3) */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>
                  Liquid Reserve
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Available unencumbered cash</div>
              </div>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                <TrendingUp size={16} />
              </div>
            </div>

            <div style={{ fontSize: '1.65rem', fontWeight: '800', color: '#111827', marginTop: '12px' }}>
              {currency}{(bot.cash || 850000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>

          {/* Smooth Green Area Mountain Curve */}
          <div style={{ height: '70px', width: '100%', marginTop: '6px' }}>
            <svg viewBox="0 0 300 70" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="mintGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 0 50 Q 40 20, 80 45 T 160 30 T 240 40 T 300 25 L 300 70 L 0 70 Z"
                fill="url(#mintGrad)"
              />
              <path
                d="M 0 50 Q 40 20, 80 45 T 160 30 T 240 40 T 300 25"
                fill="none"
                stroke="#059669"
                strokeWidth="2.5"
              />
            </svg>
          </div>

          {/* Buttons: Start Bot (Solid Green) & Square Off (White Outline) */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
            <button
              onClick={() => handleControl("START")}
              style={{
                flex: 1,
                padding: '9px 0',
                backgroundColor: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(5,150,105,0.25)'
              }}
            >
              Start Bot ↑
            </button>
            <button
              onClick={() => handleControl("SQUARE_OFF")}
              disabled={!bot.in_position}
              style={{
                flex: 1,
                padding: '9px 0',
                backgroundColor: '#ffffff',
                color: bot.in_position ? '#dc2626' : '#9ca3af',
                border: bot.in_position ? '1px solid #dc2626' : '1px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: bot.in_position ? 'pointer' : 'not-allowed'
              }}
            >
              Square Off ↓
            </button>
          </div>
        </div>
      </div>

      {/* ── Quixotic Row 2: Payment History (Fills Table) + Credit Amount (Statutory Card) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr minmax(320px, 360px)',
        gap: '20px'
      }}>
        {/* Left: Payment History (Recent Executions & Paper Fills) */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827' }}>
                Execution History
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Recent paper order fills</div>
            </div>
            <span
              onClick={onNavigateToBacktest}
              style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '700', cursor: 'pointer' }}
            >
              Open Backtester ↗
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ color: '#9ca3af', borderBottom: '1px solid #f3f4f6', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '8px 12px' }}>Asset / Order</th>
                <th style={{ padding: '8px 12px' }}>Date</th>
                <th style={{ padding: '8px 12px' }}>Time</th>
                <th style={{ padding: '8px 12px' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentFills.map((fill, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '14px 12px', fontWeight: '600', color: '#111827' }}>
                    {fill.Name}
                  </td>
                  <td style={{ padding: '14px 12px', color: '#6b7280' }}>{fill.Date}</td>
                  <td style={{ padding: '14px 12px', color: '#6b7280' }}>{fill.Time}</td>
                  <td style={{ padding: '14px 12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: '600', color: '#059669' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669' }} />
                      {fill.Status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: '700', color: String(fill.Amount).startsWith('+') ? '#059669' : '#dc2626' }}>
                    {fill.Amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: Amount of credit / Statutory Friction Card */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CreditCard size={15} color="#059669" />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#111827' }}>
                  Statutory Friction & Fees
                </div>
                <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>STT, Exchange & SEBI turnover</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '16px' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#111827' }}>
                {currency}8,945.89
              </div>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '10px',
                backgroundColor: '#e6f4ea',
                color: '#059669'
              }}>
                +12.8%
              </span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>
              Active Market Guardrails
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem', color: '#6b7280' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>3:15 PM Auto Square-Off:</span>
                <span style={{ color: '#059669', fontWeight: '700' }}>Active</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Max Daily Loss Limit:</span>
                <span style={{ color: '#111827', fontWeight: '700' }}>₹20,000 (2.0%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
