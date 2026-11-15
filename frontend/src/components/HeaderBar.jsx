import React, { useState, useEffect } from 'react';
import { Search, Calendar, Bell, Activity } from 'lucide-react';

export default function HeaderBar({
  selectedMarket = "INDIA",
  onSelectMarket = () => {},
  searchQuery = "",
  onSearchChange = () => {}
}) {
  const [currentDateStr, setCurrentDateStr] = useState("");
  const [istTimeStr, setIstTimeStr] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
      setCurrentDateStr(dStr);

      // IST clock
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const istDate = new Date(utc + (3600000 * 5.5));
      setIstTimeStr(istDate.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header style={{
      height: '70px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      gap: '20px',
      backgroundColor: '#0e0e11',
      borderBottom: '1px solid #1c1c22'
    }}>
      {/* ── Left: Search Tickers Input ────────────────────────────────── */}
      <div style={{ position: 'relative', width: '380px' }}>
        <Search
          size={16}
          color="#585864"
          style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        />
        <input
          type="text"
          placeholder="Search tickers (e.g. RELIANCE, SBIN, AAPL, EUR/USD)..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: '100%',
            height: '42px',
            padding: '0 16px 0 42px',
            backgroundColor: '#18181d',
            border: '1px solid #25252e',
            borderRadius: '12px',
            color: '#ffffff',
            fontSize: '0.85rem',
            outline: 'none',
            fontFamily: "'Inter', sans-serif"
          }}
        />
      </div>

      {/* ── Center: Target Market Switcher ────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#18181d',
        padding: '3px',
        borderRadius: '10px',
        border: '1px solid #25252e'
      }}>
        {[
          { id: "INDIA", label: "🇮🇳 NSE India" },
          { id: "US", label: "🇺🇸 US Tech" },
          { id: "FOREX", label: "💱 Forex" }
        ].map(m => (
          <button
            key={m.id}
            onClick={() => onSelectMarket(m.id)}
            style={{
              padding: '6px 14px',
              fontSize: '0.75rem',
              fontWeight: selectedMarket === m.id ? '600' : '500',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: selectedMarket === m.id ? '#25252e' : 'transparent',
              color: selectedMarket === m.id ? '#ffffff' : '#90909c',
              cursor: 'pointer'
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Right: Live Date/Clock Pill, Notification Bell, User Avatar ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Date & Market Hours Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          height: '42px',
          padding: '0 16px',
          backgroundColor: '#18181d',
          border: '1px solid #25252e',
          borderRadius: '12px',
          fontSize: '0.8rem',
          color: '#90909c',
          fontWeight: '500',
          fontFamily: "'Inter', sans-serif"
        }}>
          <span>{currentDateStr}</span>
          <span style={{ color: '#585864' }}>•</span>
          <span style={{ color: '#ffffff', fontFamily: "'JetBrains Mono', Consolas, monospace", fontWeight: '600' }}>
            {istTimeStr} IST
          </span>
          <Calendar size={15} color="#90909c" />
        </div>

        {/* Trade Execution Alert Bell */}
        <div style={{
          position: 'relative',
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          backgroundColor: '#18181d',
          border: '1px solid #25252e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer'
        }}>
          <Bell size={17} color="#90909c" />
          <span style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: '#ff5744'
          }} />
        </div>

        {/* Quant Desk Avatar */}
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          backgroundColor: '#241b1d',
          border: '1px solid #ff5744',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ff5744',
          fontWeight: '700',
          fontSize: '0.9rem',
          cursor: 'pointer'
        }}>
          QD
        </div>
      </div>
    </header>
  );
}
