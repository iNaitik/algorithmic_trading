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
          borderBottom: '1px solid #252A2C',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#F1F3F4' }}>
              {userName}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#92999C', marginTop: '2px' }}>
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
              backgroundColor: '#101314',
              border: '1px solid #252A2C',
              color: '#92999C',
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
            borderBottom: '1px solid #252A2C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1c2022'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: 'rgba(0, 208, 156, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00D09C'
            }}>
              <CreditCard size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.98rem', fontWeight: '800', color: '#F1F3F4' }}>
                ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.70rem', color: '#92999C' }}>
                Stocks, F&O balance
              </div>
            </div>
          </div>
          <ChevronRight size={16} color="#626A6E" />
        </div>

        {/* US Stocks balance / Bot Mode Row */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid #252A2C',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: '#101314',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#92999C'
            }}>
              <Zap size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#F1F3F4' }}>
                US Stocks balance
              </div>
              <div style={{ fontSize: '0.70rem', color: '#92999C' }}>
                --
              </div>
            </div>
          </div>
          <span style={{
            fontSize: '0.70rem',
            fontWeight: '800',
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(0, 208, 156, 0.12)',
            color: '#00D09C',
            border: '1px solid rgba(0, 208, 156, 0.28)'
          }}>
            Activate
          </span>
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

        {/* Footer: Dark Theme & Log Out */}
        <div style={{
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#101314'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92999C', fontSize: '0.75rem' }}>
            <Moon size={15} color="#00D09C" />
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
              color: '#EB5B3C',
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
