import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Trash2 } from 'lucide-react';

export default function BloombergLogs() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/bot/logs');
      if (res.ok) {
        const json = await res.json();
        setLogs(json.logs || []);
      }
    } catch (e) {
      console.error("Failed to load logs:", e);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const clearLogs = async () => {
    try {
      await fetch('/api/bot/logs/clear', { method: 'POST' });
      setLogs([]);
    } catch (e) {
      console.error("Failed to clear logs:", e);
    }
  };

  const filtered = logs.filter(l => {
    if (filter === "ALL") return true;
    if (filter === "ORDERS") return l.includes("ORDER") || l.includes("FILL") || l.includes("BUY") || l.includes("SELL");
    if (filter === "RISK") return l.includes("RISK") || l.includes("CIRCUIT") || l.includes("DRAWDOWN") || l.includes("MIS");
    if (filter === "ERRORS") return l.includes("ERROR") || l.includes("FAIL") || l.includes("EXCEPTION");
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', height: 'calc(100vh - 130px)' }}>
      {/* Top Bar */}
      <div className="bbg-panel" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Terminal size={14} color="#ff9900" />
          <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#ff9900' }}>
            AUDIT TRAIL // SYSTEM EXECUTION LOGS
          </span>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
            {logs.length} EVENTS RECORDED
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {['ALL', 'ORDERS', 'RISK', 'ERRORS'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`bbg-fkey-btn ${filter === f ? 'active' : ''}`}
            >
              {f}
            </button>
          ))}

          <div style={{ width: '1px', height: '14px', backgroundColor: '#1e293b' }} />

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className="bbg-fkey-btn"
            style={{ color: autoScroll ? '#00ff66' : '#64748b' }}
          >
            SCROLL: {autoScroll ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={clearLogs}
            className="bbg-fkey-btn"
            style={{ borderColor: '#ff3344', color: '#ff3344' }}
          >
            <Trash2 size={11} />
            <span>&lt;PURGE&gt;</span>
          </button>
        </div>
      </div>

      {/* Terminal View */}
      <div className="bbg-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div
          ref={terminalRef}
          style={{
            flex: 1,
            backgroundColor: '#030508',
            overflowY: 'auto',
            padding: '12px',
            fontSize: '0.75rem',
            lineHeight: '1.45',
            color: '#cbd5e1'
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: '40px' }}>
              &gt; No log entries match the selected filter.
            </div>
          ) : (
            filtered.map((log, i) => {
              let color = '#94a3b8';
              if (log.includes("BUY") || log.includes("FILLED") || log.includes("PROFIT") || log.includes("SUCCESS")) color = '#00ff66';
              else if (log.includes("SELL") || log.includes("STOP") || log.includes("HALT") || log.includes("ERROR") || log.includes("FAIL")) color = '#ff3344';
              else if (log.includes("RISK") || log.includes("WARNING") || log.includes("CIRCUIT")) color = '#ffaa00';
              else if (log.includes("TICK") || log.includes("DAEMON") || log.includes("SCAN")) color = '#00e5ff';

              return (
                <div key={i} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {log}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
