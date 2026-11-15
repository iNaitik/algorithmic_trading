import React, { useState, useEffect } from 'react';
import { Send, CheckCircle, AlertCircle, X, Bell, Shield, Smartphone } from 'lucide-react';

export default function TelegramModal({ isOpen, onClose }) {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/notifications/telegram/status');
      if (res.ok) {
        const json = await res.json();
        setStatus(json);
        if (json.chat_id) setChatId(json.chat_id);
      }
    } catch (e) {
      console.error("Failed to load Telegram status:", e);
    }
  };

  const handleSaveAndTest = async () => {
    if (!botToken.trim() && !status?.configured) {
      alert("Please enter your Telegram Bot Token from @BotFather");
      return;
    }
    if (!chatId.trim()) {
      alert("Please enter your Telegram Chat ID from @userinfobot");
      return;
    }

    setLoading(true);
    setTestResult(null);

    try {
      // 1. Save credentials
      if (botToken.trim()) {
        const saveRes = await fetch('/api/notifications/telegram/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bot_token: botToken, chat_id: chatId })
        });
        if (!saveRes.ok) throw new Error("Failed to save credentials");
      }

      // 2. Dispatch test message
      const testRes = await fetch('/api/notifications/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!testRes.ok) {
        const errJson = await testRes.json();
        throw new Error(errJson.detail || "Failed to deliver test message");
      }

      setTestResult({ success: true, message: "✅ Test message delivered to your Telegram phone!" });
      fetchStatus();
    } catch (err) {
      setTestResult({ success: false, message: `❌ Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '20px',
        width: '520px',
        maxWidth: '92vw',
        padding: '28px',
        boxShadow: '0 20px 40px -8px rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: '#e6f4ea',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669'
            }}>
              <Smartphone size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827' }}>
                Telegram Live Mobile Alerts
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Receive 09:16 AM breakout picks & live trade signals on your phone
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              border: 'none',
              backgroundColor: '#f3f4f6',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={16} color="#6b7280" />
          </button>
        </div>

        {/* Current status badge */}
        <div style={{
          padding: '10px 14px',
          borderRadius: '10px',
          backgroundColor: status?.configured ? '#e6f4ea' : '#fef2f2',
          border: `1px solid ${status?.configured ? '#bbf7d0' : '#fecaca'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.78rem',
          fontWeight: '600',
          color: status?.configured ? '#166534' : '#991b1b'
        }}>
          {status?.configured ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span>
            {status?.configured
              ? `Connected to Telegram (Chat ID: ${status.chat_id})`
              : "Not Configured — Follow the 30-second steps below"}
          </span>
        </div>

        {/* 30-second instructions */}
        <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', padding: '14px 16px', fontSize: '0.75rem', color: '#4b5563', lineHeight: '1.5' }}>
          <strong style={{ color: '#111827' }}>Quick 30-Second Setup:</strong>
          <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li>Open Telegram, search for <strong>@BotFather</strong>, send <code>/newbot</code>, and copy the HTTP API token.</li>
            <li>Start your new bot, then search for <strong>@userinfobot</strong> and send any message to get your numeric <strong>Chat ID</strong>.</li>
            <li>Paste both below and click <strong>"Save & Send Test Alert"</strong>.</li>
          </ol>
        </div>

        {/* Inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>
              Telegram Bot Token {status?.token_masked && <span style={{ color: '#059669', fontWeight: '500' }}>({status.token_masked})</span>}
            </label>
            <input
              type="password"
              placeholder={status?.configured ? "••••••••••••••••••••••••••••••••••••" : "Paste token from @BotFather (e.g. 7123456789:AAH...)"}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 14px',
                borderRadius: '10px',
                border: '1px solid #e5e7eb',
                fontSize: '0.8rem',
                outline: 'none',
                fontFamily: 'monospace'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>
              Your Telegram Chat ID
            </label>
            <input
              type="text"
              placeholder="Paste Chat ID from @userinfobot (e.g. 123456789)"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 14px',
                borderRadius: '10px',
                border: '1px solid #e5e7eb',
                fontSize: '0.8rem',
                outline: 'none',
                fontFamily: 'monospace'
              }}
            />
          </div>
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor: testResult.success ? '#e6f4ea' : '#fef2f2',
            color: testResult.success ? '#059669' : '#dc2626',
            fontSize: '0.75rem',
            fontWeight: '700'
          }}>
            {testResult.message}
          </div>
        )}

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
              fontSize: '0.8rem',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Close
          </button>

          <button
            onClick={handleSaveAndTest}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 18px',
              borderRadius: '10px',
              backgroundColor: '#059669',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: '700',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(5,150,105,0.25)'
            }}
          >
            <Send size={14} />
            <span>{loading ? "Sending Test..." : "Save & Send Test Alert"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
