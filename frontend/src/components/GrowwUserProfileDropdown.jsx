import React from 'react';
import {
  Settings,
  CreditCard,
  FileText,
  Building,
  Headphones,
  FileSpreadsheet,
  Moon,
  LogOut,
  ChevronRight,
  Shield,
  Zap
} from 'lucide-react';

export default function GrowwUserProfileDropdown({
  isOpen,
  onClose,
  userName = "Naitik Seth",
  userEmail = "sethnaitikgg77@gmail.com",
  balance = 1000000.0,
  onNavigateToOrders = () => {},
  onOpenSettings = () => {}
}) {
  if (!isOpen) return null;

  return (
    <>
      {/* Invisible backdrop to close on outside click */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999
        }}
      />

      <div style={{
        position: 'absolute',
        top: '64px',
        right: '24px',
        width: '320px',
        backgroundColor: '#161922',
        border: '1px solid #242938',
        borderRadius: '16px',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.65)',
        zIndex: 1000,
        color: '#ffffff',
        overflow: 'hidden',
        animation: 'fadeIn 0.15s ease-out'
      }}>
        {/* User Card Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid #242938',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#ffffff' }}>
              {userName}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#8a939e', marginTop: '2px' }}>
              {userEmail}
            </div>
          </div>
          <button
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            title="Bot Settings"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#1c202d',
              border: 'none',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <Settings size={16} />
          </button>
        </div>

        {/* Balance Card */}
        <div
          onClick={() => {
            onClose();
            onNavigateToOrders();
          }}
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #242938',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1c202d'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(0, 208, 156, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00d09c'
            }}>
              <CreditCard size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.98rem', fontWeight: '800', color: '#ffffff' }}>
                ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.70rem', color: '#8a939e' }}>
                Stocks, F&O Trading Balance
              </div>
            </div>
          </div>
          <ChevronRight size={16} color="#6b7280" />
        </div>

        {/* US Stocks / Bot Mode Row */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid #242938',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#1c202d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af'
            }}>
              <Zap size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#c3c9d5' }}>
                Autonomous Bot
              </div>
              <div style={{ fontSize: '0.70rem', color: '#8a939e' }}>
                Execution Engine
              </div>
            </div>
          </div>
          <span style={{
            fontSize: '0.70rem',
            fontWeight: '800',
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(0, 208, 156, 0.15)',
            color: '#00d09c',
            border: '1px solid rgba(0, 208, 156, 0.3)'
          }}>
            Active
          </span>
        </div>

        {/* Menu Navigation Items */}
        <div style={{ padding: '8px 0', borderBottom: '1px solid #242938' }}>
          {[
            { label: "All Orders & Fills", icon: FileText, action: onNavigateToOrders },
            { label: "Risk Guardrails", icon: Shield, action: onOpenSettings },
            { label: "Bank & Broker Details", icon: Building, action: null },
            { label: "24 x 7 Customer Support", icon: Headphones, action: null },
            { label: "P&L Tax Reports", icon: FileSpreadsheet, action: null },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                onClick={() => {
                  if (item.action) {
                    onClose();
                    item.action();
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 20px',
                  fontSize: '0.82rem',
                  color: '#c3c9d5',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1c202d'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon size={16} color="#8a939e" />
                  <span>{item.label}</span>
                </div>
                <ChevronRight size={14} color="#555e70" />
              </div>
            );
          })}
        </div>

        {/* Footer: Dark Mode & Log Out */}
        <div style={{
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#12151d'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8a939e', fontSize: '0.75rem' }}>
            <Moon size={15} color="#00d09c" />
            <span>Dark Theme</span>
          </div>

          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#eb5b3c',
              fontSize: '0.80rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            <LogOut size={14} />
            <span>Log out</span>
          </button>
        </div>

      </div>
    </>
  );
}
