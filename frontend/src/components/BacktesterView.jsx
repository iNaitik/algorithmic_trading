import React, { useState } from 'react';
import {
  Play,
  RotateCcw,
  Sliders,
  TrendingUp,
  BarChart3,
  Calendar,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  ChevronDown
} from 'lucide-react';

import CandleChart from './CandleChart';
import EquityChart from './EquityChart';
import StatutoryFeeCard from './StatutoryFeeCard';
import TradeJournal from './TradeJournal';

export default function BacktesterView({
  marketDefs,
  strategiesList,
  selectedMarket,
  setSelectedMarket,
  symbol,
  setSymbol,
  customSymbol,
  setCustomSymbol,
  interval,
  setInterval,
  lookbackDays,
  setLookbackDays,
  capitalInput,
  setCapitalInput,
  initialCapital,
  selectedStrategy,
  setSelectedStrategy,
  loading,
  backtestResult,
  errorMsg,
  onRunBacktest
}) {
  const [subView, setSubView] = useState("CHART");

  const currentMarketDef = marketDefs?.markets.find(m => m.id === selectedMarket);
  const currency = currentMarketDef?.currency || (selectedMarket === "INDIA" ? "₹" : "$");
  const filteredStrategies = strategiesList.filter(s => s.market === selectedMarket || s.market === "ALL");
  const summary = backtestResult?.summary;
  const isNetWin = summary && summary.net_pnl >= 0;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 70px)' }}>
      {/* ── Left Parameter Studio Control Panel ───────────────────────── */}
      <aside style={{
        width: '320px',
        minWidth: '320px',
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f3f4f6', paddingBottom: '14px' }}>
          <Sliders size={18} color="#059669" />
          <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827' }}>
            Strategy Studio
          </span>
        </div>

        {/* 1. Target Market */}
        <div>
          <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
            1. Target Market
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '6px' }}>
            {[
              { id: "INDIA", flag: "🇮🇳", label: "NSE" },
              { id: "US", flag: "🇺🇸", label: "US Tech" },
              { id: "FOREX", flag: "💱", label: "Forex" }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMarket(m.id)}
                style={{
                  padding: '7px 4px',
                  borderRadius: '10px',
                  border: selectedMarket === m.id ? '1px solid #059669' : '1px solid #e5e7eb',
                  backgroundColor: selectedMarket === m.id ? '#e6f4ea' : '#f9fafb',
                  color: selectedMarket === m.id ? '#059669' : '#6b7280',
                  fontWeight: '700',
                  fontSize: '0.72rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <span>{m.flag}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Ticker Symbol */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
              2. Ticker Symbol
            </label>
            <span style={{ fontSize: '0.7rem', color: '#059669', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700' }}>
              {customSymbol || symbol}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
            {currentMarketDef?.presets.slice(0, 6).map(p => (
              <button
                key={p.ticker}
                onClick={() => { setSymbol(p.ticker); setCustomSymbol(""); }}
                style={{
                  fontSize: '0.68rem',
                  fontWeight: '600',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: symbol === p.ticker && !customSymbol ? '#e6f4ea' : '#f9fafb',
                  color: symbol === p.ticker && !customSymbol ? '#059669' : '#6b7280',
                  border: symbol === p.ticker && !customSymbol ? '1px solid #059669' : '1px solid #e5e7eb',
                  cursor: 'pointer'
                }}
              >
                {p.ticker.replace('.NS', '')}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Or custom ticker (e.g. BAJFINANCE)..."
            value={customSymbol}
            onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '8px 10px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              color: '#111827',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          />
        </div>

        {/* 3. Timeframe */}
        <div>
          <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
            3. Candle Interval
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '6px' }}>
            {["1m", "2m", "5m", "15m", "30m", "1h", "1d"].map(tf => (
              <button
                key={tf}
                onClick={() => {
                  setInterval(tf);
                  if (tf === "1m" || tf === "2m") setLookbackDays(7);
                  else if (tf === "1d") setLookbackDays(365);
                  else setLookbackDays(60);
                }}
                style={{
                  padding: '6px 2px',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  borderRadius: '6px',
                  backgroundColor: interval === tf ? '#059669' : '#f9fafb',
                  color: interval === tf ? '#ffffff' : '#6b7280',
                  border: interval === tf ? '1px solid #059669' : '1px solid #e5e7eb',
                  cursor: 'pointer'
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Lookback Period */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
              4. Lookback Period
            </label>
            <span style={{ fontSize: '0.75rem', color: '#111827', fontWeight: '700' }}>
              {lookbackDays} Days
            </span>
          </div>
          <input
            type="range"
            min="1"
            max={interval === "1m" || interval === "2m" ? "7" : (interval === "1d" ? "730" : "60")}
            value={lookbackDays}
            onChange={(e) => setLookbackDays(Number(e.target.value))}
            style={{ width: '100%', marginTop: '6px', accentColor: '#059669' }}
          />
        </div>

        {/* 5. Starting Capital */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
              5. Starting Capital
            </label>
            <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace" }}>
              {currency}{initialCapital.toLocaleString()} {selectedMarket === "INDIA" && initialCapital >= 100000 ? `(${(initialCapital / 100000).toFixed(2)}L)` : ''}
            </span>
          </div>
          <input
            type="text"
            placeholder={selectedMarket === "INDIA" ? "e.g. 10L, 5L, 25L, 1Cr, or 1000000" : "e.g. 100k, 50k"}
            value={capitalInput}
            onChange={(e) => setCapitalInput(e.target.value)}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '8px 10px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              color: '#111827',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          />
        </div>

        {/* 6. Trading Strategy */}
        <div>
          <label style={{ fontSize: '0.72rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
            6. Quantitative Strategy
          </label>
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '8px 10px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              color: '#111827',
              fontWeight: '500',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          >
            {filteredStrategies.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Run Button */}
        <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
          <button
            onClick={onRunBacktest}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              backgroundColor: loading ? '#9ca3af' : '#059669',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.85rem',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <Play size={14} fill="#ffffff" />
            {loading ? "EXECUTING SIMULATION..." : "RUN STRATEGY SIMULATION"}
          </button>
        </div>
      </aside>

      {/* ── Main Backtest View Canvas ─────────────────────────────────── */}
      <main style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {errorMsg && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '12px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#dc2626',
            fontSize: '0.85rem'
          }}>
            <b>Error:</b> {errorMsg}
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div style={{
            padding: '16px 20px',
            borderRadius: '16px',
            backgroundColor: '#ffffff',
            border: '1px solid #a7f3d0',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
          }}>
            <div style={{
              width: '24px',
              height: '24px',
              minWidth: '24px',
              border: '3px solid #e5e7eb',
              borderTopColor: '#059669',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#111827' }}>
                Executing Quantitative Simulation for {customSymbol || symbol} ({interval})
              </span>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Fetching historical price bars, calculating indicators for {selectedStrategy}, and applying SEBI statutory friction...
              </span>
            </div>
          </div>
        )}

        {/* Quixotic 4 KPI Cards */}
        {summary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
          }}>
            {/* Card 1: Net P&L */}
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '20px',
              boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600' }}>
                  Net Strategy P&L
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  backgroundColor: isNetWin ? '#e6f4ea' : '#fee2e2',
                  color: isNetWin ? '#059669' : '#dc2626'
                }}>
                  {summary.total_return_pct >= 0 ? '+' : ''}{summary.total_return_pct}%
                </span>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: isNetWin ? '#059669' : '#dc2626' }}>
                {summary.net_pnl >= 0 ? '+' : ''}{currency}{summary.net_pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                {summary.net_pnl_formatted}
              </span>
            </div>

            {/* Card 2: Final Equity */}
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '20px',
              boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600' }}>
                Final Portfolio Equity
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#111827' }}>
                {currency}{summary.final_equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                {summary.final_equity_formatted}
              </span>
            </div>

            {/* Card 3: Win Rate */}
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '20px',
              boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600' }}>
                Win Rate
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: summary.win_rate >= 50 ? '#059669' : '#dc2626' }}>
                {summary.win_rate} %
              </div>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                {summary.winning_trades}W / {summary.losing_trades}L ({summary.total_trades} Trades)
              </span>
            </div>

            {/* Card 4: Sharpe Ratio */}
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '20px',
              boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600' }}>
                Sharpe Ratio
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: summary.sharpe_ratio > 0 ? '#059669' : '#dc2626' }}>
                {summary.sharpe_ratio}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                Profit Factor: <b style={{ color: '#111827' }}>{summary.profit_factor}</b> • Fee: -{currency}{summary.total_charges.toFixed(0)}
              </span>
            </div>
          </div>
        )}

        {/* View Toggle Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>
          {[
            { id: "CHART", label: "📊 Candlestick Chart & Fills" },
            { id: "EQUITY", label: "📈 Portfolio Equity Curve" },
            { id: "JOURNAL", label: `📜 Trade Journal (${summary?.total_trades || 0})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubView(tab.id)}
              style={{
                padding: '7px 16px',
                fontSize: '0.8rem',
                fontWeight: '700',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: subView === tab.id ? '#059669' : '#ffffff',
                color: subView === tab.id ? '#ffffff' : '#6b7280',
                boxShadow: subView === tab.id ? '0 2px 8px rgba(5,150,105,0.2)' : 'none',
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {subView === "CHART" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <CandleChart
              candles={backtestResult?.candles || []}
              markers={backtestResult?.trade_markers || []}
              indicators={backtestResult?.indicators || {}}
              symbol={customSymbol || symbol}
              interval={interval}
              currency={currency}
            />
            {summary?.charges_breakdown?.total > 0 && (
              <StatutoryFeeCard
                breakdown={summary.charges_breakdown}
                currency={currency}
              />
            )}
          </div>
        )}

        {subView === "EQUITY" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <EquityChart
              equityCurve={backtestResult?.equity_curve || []}
              initialCapital={initialCapital}
              currency={currency}
            />
          </div>
        )}

        {subView === "JOURNAL" && (
          <TradeJournal
            trades={backtestResult?.trades || []}
            currency={currency}
          />
        )}
      </main>
    </div>
  );
}
