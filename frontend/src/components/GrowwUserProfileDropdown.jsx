import React, { useEffect } from 'react';
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
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
        backgroundColor: '#151819',
        border: '1px solid #252A2C',
        borderRadius: '16px',
        boxShadow: '0 20px 48px rgba(0, 0, 0, 0.75)',
        zIndex: 1000,
        color: '#F1F3F4',
        overflow: 'hidden',
        animation: 'fadeIn 0.15s ease-out'
      }}>
        {/* User Card Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid #202426',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: '600', color: '#FFFFFF' }}>
              {userName}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#92999C', marginTop: '2px' }}>
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
              background: 'transparent',
              border: 'none',
              color: '#92999C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <Settings size={18} />
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
            borderBottom: '1px solid #202426',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1c2022'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#101314',
              border: '1px solid #202426',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#92999C'
            }}>
              <CreditCard size={17} />
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: '600', color: '#FFFFFF' }} className="font-tabular">
                ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#92999C' }}>
                Stocks, F&O balance
              </div>
            </div>
          </div>
          <ChevronRight size={16} color="#626A6E" />
        </div>

        {/* US Stocks balance Row (Matches Screenshot 4) */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid #202426',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#101314',
              border: '1px solid #202426',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#92999C'
            }}>
              <span style={{ fontSize: '1rem', fontWeight: '700' }}>$</span>
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#F1F3F4' }}>
                --
              </div>
              <div style={{ fontSize: '0.75rem', color: '#92999C' }}>
                US Stocks balance
              </div>
            </div>
          </div>
          <button style={{
            fontSize: '0.75rem',
            fontWeight: '700',
            padding: '5px 14px',
            borderRadius: '6px',
            backgroundColor: '#00D09C',
            color: '#080A0B',
            border: 'none',
            cursor: 'pointer'
          }}>
            Activate
          </button>
        </div>

        {/* Menu Navigation Items (Matches Screenshot 4) */}
        <div style={{ padding: '8px 0', borderBottom: '1px solid #252A2C' }}>
          {[
            { label: "All Orders", icon: FileText, action: onNavigateToOrders },
            { label: "Bank Details", icon: Building, action: null },
            { label: "24 x 7 Customer Support", icon: Headphones, action: null },
            { label: "Reports", icon: FileSpreadsheet, action: null },
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
                  color: '#F1F3F4',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1c2022'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon size={16} color="#92999C" />
                  <span>{item.label}</span>
                </div>
                <ChevronRight size={14} color="#626A6E" />
              </div>
            );
          })}
        </div>

        {/* Footer: Moon Mode & Log Out (Matches Groww Screenshot 4) */}
        <div style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#101314',
          borderTop: '1px solid #202426'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', color: '#92999C' }}>
            <Moon size={16} />
          </div>

          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#92999C',
              fontSize: '0.85rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'color 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
            onMouseLeave={e => e.currentTarget.style.color = '#92999C'}
          >
            Log out
          </button>
        </div>

      </div>
    </>
  );
}
