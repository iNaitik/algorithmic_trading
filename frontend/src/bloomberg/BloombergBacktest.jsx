import React, { useState } from 'react';
import { Play } from 'lucide-react';
import BloombergChart from './BloombergChart';

export default function BloombergBacktest({
  _marketDefs,
  strategiesList = [],
  selectedMarket = "INDIA",
  setSelectedMarket,
  symbol = "RELIANCE.NS",
  setSymbol,
  customSymbol = "",
  setCustomSymbol,
  interval = "5m",
  setInterval,
  lookbackDays = 60,
  setLookbackDays,
  capitalInput = "10L",
  setCapitalInput,
  initialCapital = 1000000.0,
  selectedStrategy = "NSE Intraday ORB Breakout",
  setSelectedStrategy,
  loading = false,
  backtestResult = null,
  errorMsg = null,
  onRunBacktest = () => {},
  onSelectForBot = () => {}
}) {
  const [activeTab, setActiveTab] = useState("CHART"); // "CHART", "TRADES", "METRICS"
  const [tradeFilter, setTradeFilter] = useState("ALL"); // "ALL", "WINS", "LOSSES"

  const currency = selectedMarket === "INDIA" ? "₹" : "$";
  const summary = backtestResult?.summary || {};
  const trades = backtestResult?.trades || [];
  const candles = backtestResult?.candles || [];
  const markers = backtestResult?.markers || [];
  const indicators = backtestResult?.indicators || {};

  const netPnl = summary.net_profit || 0;
  const isNetPositive = netPnl >= 0;

  const filteredTrades = trades.filter(t => {
    if (tradeFilter === "ALL") return true;
    if (tradeFilter === "WINS") return (t.pnl || 0) > 0;
    if (tradeFilter === "LOSSES") return (t.pnl || 0) <= 0;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px' }}>
      {/* ── Top Bloomberg Parameter Command Bar ── */}
      <div className="bbg-panel" style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          {/* Market Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.68rem', color: '#ff9900', fontWeight: '800' }}>MKT:</span>
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              style={{
                backgroundColor: '#000000',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                padding: '3px 6px',
                fontSize: '0.72rem',
                outline: 'none'
              }}
            >
              <option value="INDIA">🇮🇳 NSE INDIA</option>
              <option value="US">🇺🇸 US EQUITIES</option>
              <option value="FOREX">🌍 FOREX</option>
            </select>
          </div>

          {/* Symbol */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.68rem', color: '#ff9900', fontWeight: '800' }}>SYM:</span>
            <input
              type="text"
              value={customSymbol || symbol}
              onChange={(e) => {
                setCustomSymbol(e.target.value.toUpperCase());
                setSymbol(e.target.value.toUpperCase());
              }}
              className="bbg-cmd-input"
              style={{ width: '110px', fontSize: '0.75rem', padding: '2px 6px' }}
              placeholder="TICKER"
            />
          </div>

          {/* Strategy */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.68rem', color: '#ff9900', fontWeight: '800' }}>STRAT:</span>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              style={{
                backgroundColor: '#000000',
                border: '1px solid #1e293b',
                color: '#00e5ff',
                padding: '3px 8px',
                fontSize: '0.72rem',
                maxWidth: '220px',
                outline: 'none'
              }}
            >
              {strategiesList.map((st, i) => (
                <option key={i} value={st.name || st}>{st.name || st}</option>
              ))}
            </select>
          </div>

          {/* Timeframe */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.68rem', color: '#ff9900', fontWeight: '800' }}>TF:</span>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              style={{
                backgroundColor: '#000000',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                padding: '3px 6px',
                fontSize: '0.72rem',
                outline: 'none'
              }}
            >
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="1d">1d</option>
            </select>
          </div>

          {/* Lookback */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.68rem', color: '#ff9900', fontWeight: '800' }}>LOOKBACK:</span>
            <select
              value={lookbackDays}
              onChange={(e) => setLookbackDays(Number(e.target.value))}
              style={{
                backgroundColor: '#000000',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                padding: '3px 6px',
                fontSize: '0.72rem',
                outline: 'none'
              }}
            >
              <option value={5}>5 Days</option>
              <option value={15}>15 Days</option>
              <option value={30}>30 Days</option>
              <option value={60}>60 Days</option>
              <option value={90}>90 Days</option>
              <option value={365}>1 Year</option>
            </select>
          </div>

          {/* Capital */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.68rem', color: '#ff9900', fontWeight: '800' }}>CAPITAL:</span>
            <input
              type="text"
              value={capitalInput}
              onChange={(e) => setCapitalInput(e.target.value)}
              style={{
                backgroundColor: '#000000',
                border: '1px solid #1e293b',
                color: '#00ff66',
                width: '60px',
                fontSize: '0.72rem',
                padding: '2px 6px',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Execute Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onRunBacktest}
            disabled={loading}
            className="bbg-fkey-btn"
            style={{
              borderColor: '#ff9900',
              color: '#000000',
              backgroundColor: '#ff9900',
              padding: '6px 14px',
              fontWeight: '800',
              fontSize: '0.75rem',
              boxShadow: '0 0 10px rgba(255, 153, 0, 0.4)'
            }}
          >
            <Play size={12} fill="#000000" />
            <span>{loading ? 'SIMULATING...' : '<EXECUTE BT>'}</span>
          </button>
        </div>
      </div>

      {/* Error alert banner if any */}
      {errorMsg && (
        <div style={{ backgroundColor: '#22080a', border: '1px solid #ff3344', padding: '6px 12px', color: '#ff3344', fontSize: '0.75rem' }}>
          <strong>ERROR:</strong> {errorMsg}
        </div>
      )}

      {/* ── Institutional Metrics Ribbon (8 Bloomberg KPI Blocks) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px' }}>
        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>NET PROFIT / LOSS</div>
          <div style={{ fontSize: '1.15rem', fontWeight: '800', color: isNetPositive ? '#00ff66' : '#ff3344', marginTop: '2px' }}>
            {currency}{netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.65rem', color: isNetPositive ? '#00ff66' : '#ff3344' }}>
            {isNetPositive ? '+' : ''}{(summary.net_return_pct || 0).toFixed(2)}%
          </div>
        </div>

        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>WIN RATE %</div>
          <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#00e5ff', marginTop: '2px' }}>
            {(summary.win_rate_pct || 0).toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            {summary.winning_trades || 0}W / {summary.losing_trades || 0}L
          </div>
        </div>

        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>PROFIT FACTOR</div>
          <div style={{ fontSize: '1.15rem', fontWeight: '800', color: (summary.profit_factor || 0) >= 1.5 ? '#00ff66' : '#ffaa00', marginTop: '2px' }}>
            {(summary.profit_factor || 0).toFixed(2)}x
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            GROSS W/L RATIO
          </div>
        </div>

        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>SHARPE RATIO</div>
          <div style={{ fontSize: '1.15rem', fontWeight: '800', color: (summary.sharpe_ratio || 0) >= 1.0 ? '#00ff66' : '#ffaa00', marginTop: '2px' }}>
            {(summary.sharpe_ratio || 0).toFixed(2)}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            ANNUALIZED
          </div>
        </div>

        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>MAX DRAWDOWN</div>
          <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#ff3344', marginTop: '2px' }}>
            -{(summary.max_drawdown_pct || 0).toFixed(2)}%
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            PEAK TO TROUGH
          </div>
        </div>

        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>TOTAL TRADES</div>
          <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#f8fafc', marginTop: '2px' }}>
            {summary.total_trades || 0}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            EXECUTIONS
          </div>
        </div>

        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>AVG TRADE P&L</div>
          <div style={{ fontSize: '1.15rem', fontWeight: '800', color: (summary.avg_trade_pnl || 0) >= 0 ? '#00ff66' : '#ff3344', marginTop: '2px' }}>
            {currency}{Number(summary.avg_trade_pnl || 0).toFixed(2)}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            EXPECTANCY
          </div>
        </div>

        <div className="bbg-panel" style={{ padding: '8px' }}>
          <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>STATUTORY FRICTION</div>
          <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#ffaa00', marginTop: '2px' }}>
            {currency}{Number(summary.total_slippage_and_commissions || summary.friction || 0).toFixed(0)}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            STT + BROKERAGE
          </div>
        </div>
      </div>

      {/* ── Sub Navigation Tabs ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '4px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { id: 'CHART', label: 'CANDLESTICK + SIGNALS' },
            { id: 'TRADES', label: `TRADE BLOTTER (${trades.length})` },
            { id: 'METRICS', label: 'STATISTICAL FACTOR BREAKDOWN' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`bbg-fkey-btn ${activeTab === t.id ? 'active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Quick Send to Bot Action */}
        <button
          onClick={() => onSelectForBot(customSymbol || symbol, selectedStrategy)}
          className="bbg-fkey-btn"
          style={{ borderColor: '#00ff66', color: '#00ff66', background: 'rgba(0, 255, 102, 0.12)' }}
        >
          &lt;ARM IN LIVE BOT F2&gt;
        </button>
      </div>

      {/* ── Tab View 1: Bloomberg Candlestick Chart ── */}
      {activeTab === 'CHART' && (
        <BloombergChart
          candles={candles}
          markers={markers}
          indicators={indicators}
          symbol={customSymbol || symbol}
          interval={interval}
          currency={currency}
          height={440}
        />
      )}

      {/* ── Tab View 2: Executed Trade Blotter Table ── */}
      {activeTab === 'TRADES' && (
        <div className="bbg-panel" style={{ maxHeight: '480px', display: 'flex', flexDirection: 'column' }}>
          <div className="bbg-panel-header" style={{ padding: '6px 12px' }}>
            <span>TRADE EXECUTION LEDGER // {symbol}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['ALL', 'WINS', 'LOSSES'].map(f => (
                <button
                  key={f}
                  onClick={() => setTradeFilter(f)}
                  className={`bbg-fkey-btn ${tradeFilter === f ? 'active' : ''}`}
                  style={{ fontSize: '0.65rem' }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table className="bbg-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>TYPE</th>
                  <th>ENTRY TIME</th>
                  <th>ENTRY</th>
                  <th>EXIT TIME</th>
                  <th>EXIT</th>
                  <th>QTY</th>
                  <th>P&L</th>
                  <th>RETURN %</th>
                  <th>FEES</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                      NO TRADES RECORDED FOR THIS CRITERIA
                    </td>
                  </tr>
                ) : (
                  filteredTrades.map((t, idx) => {
                    const isWin = (t.pnl || 0) > 0;
                    return (
                      <tr key={idx}>
                        <td style={{ color: '#64748b' }}>{idx + 1}</td>
                        <td>
                          <span className={t.type === 'LONG' || t.type === 'BUY' ? 'bbg-badge-up' : 'bbg-badge-down'}>
                            {t.type}
                          </span>
                        </td>
                        <td style={{ color: '#94a3b8' }}>{t.entry_time || '---'}</td>
                        <td style={{ color: '#00e5ff', fontWeight: '700' }}>{currency}{Number(t.entry_price || 0).toFixed(2)}</td>
                        <td style={{ color: '#94a3b8' }}>{t.exit_time || '---'}</td>
                        <td style={{ color: '#00e5ff', fontWeight: '700' }}>{currency}{Number(t.exit_price || 0).toFixed(2)}</td>
                        <td style={{ fontWeight: '700' }}>{t.shares || t.quantity || 1}</td>
                        <td style={{ color: isWin ? '#00ff66' : '#ff3344', fontWeight: '800' }}>
                          {currency}{Number(t.pnl || 0).toFixed(2)}
                        </td>
                        <td style={{ color: isWin ? '#00ff66' : '#ff3344', fontWeight: '700' }}>
                          {isWin ? '+' : ''}{Number(t.return_pct || 0).toFixed(2)}%
                        </td>
                        <td style={{ color: '#ffaa00' }}>{currency}{Number(t.fees || 0).toFixed(1)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab View 3: Statistical Breakdown ── */}
      {activeTab === 'METRICS' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div className="bbg-panel">
            <div className="bbg-panel-header">CAPITAL & RETURNS LEDGER</div>
            <div style={{ padding: '10px' }}>
              <table className="bbg-table">
                <tbody>
                  <tr>
                    <td style={{ color: '#94a3b8' }}>STARTING CAPITAL</td>
                    <td style={{ textAlign: 'right', fontWeight: '700' }}>{currency}{initialCapital.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#94a3b8' }}>ENDING EQUITY</td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: isNetPositive ? '#00ff66' : '#ff3344' }}>
                      {currency}{Number(summary.final_capital || initialCapital).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: '#94a3b8' }}>GROSS PROFIT</td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: '#00ff66' }}>{currency}{Number(summary.gross_profit || 0).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#94a3b8' }}>GROSS LOSS</td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: '#ff3344' }}>{currency}{Number(summary.gross_loss || 0).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#94a3b8' }}>STATUTORY TAXES & FEES</td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: '#ffaa00' }}>
                      {currency}{Number(summary.total_slippage_and_commissions || 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bbg-panel">
            <div className="bbg-panel-header">RISK-ADJUSTED ALPHA METRICS</div>
            <div style={{ padding: '10px' }}>
              <table className="bbg-table">
                <tbody>
                  <tr>
                    <td style={{ color: '#94a3b8' }}>SHARPE RATIO</td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: '#00e5ff' }}>{(summary.sharpe_ratio || 0).toFixed(3)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#94a3b8' }}>SORTINO RATIO</td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: '#00e5ff' }}>{(summary.sortino_ratio || summary.sharpe_ratio || 0).toFixed(3)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#94a3b8' }}>MAX INTRADAY DRAWDOWN</td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: '#ff3344' }}>-{(summary.max_drawdown_pct || 0).toFixed(2)}%</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#94a3b8' }}>PROFIT FACTOR</td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: '#00ff66' }}>{(summary.profit_factor || 0).toFixed(2)}x</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#94a3b8' }}>PAYOFF RATIO (AVG W / AVG L)</td>
                    <td style={{ textAlign: 'right', fontWeight: '700' }}>{(summary.payoff_ratio || 1.8).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
