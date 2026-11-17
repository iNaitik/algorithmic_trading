import React from 'react';

/**
 * GrowwRocketEmptyState matches the exact rocket launch illustration
 * and typography from Groww's desktop Positions (Image 2) and Orders (Image 3) tabs.
 */
export default function GrowwRocketEmptyState({
  title = "No open positions",
  subtitle = "Equity, Intraday and MTF positions will appear here",
  actionButton = null
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      textAlign: 'center',
      minHeight: '420px',
      width: '100%'
    }}>
      {/* Rocket & Launchpad Illustration (Matches Screenshot 2 & 3) */}
      <div style={{ width: '260px', height: '240px', marginBottom: '24px', position: 'relative' }}>
        <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          {/* Subtle Star Sparkles */}
          <path d="M48 60L49.5 64L53.5 65.5L49.5 67L48 71L46.5 67L42.5 65.5L46.5 64L48 60Z" fill="#94A3B8" opacity="0.6" />
          <path d="M216 75L217.5 78.5L221 80L217.5 81.5L216 85L214.5 81.5L211 80L214.5 78.5L216 75Z" fill="#00D09C" opacity="0.7" />
          <circle cx="36" cy="115" r="1.5" fill="#64748B" />
          <circle cx="228" cy="130" r="1.5" fill="#64748B" />
          <circle cx="80" cy="40" r="1" fill="#94A3B8" />

          {/* Launch Truss / Tower on Left */}
          <line x1="72" y1="210" x2="72" y2="95" stroke="#1E293B" strokeWidth="2.5" />
          <line x1="72" y1="105" x2="88" y2="115" stroke="#1E293B" strokeWidth="1.5" />
          <line x1="72" y1="125" x2="88" y2="135" stroke="#1E293B" strokeWidth="1.5" />
          <line x1="72" y1="145" x2="88" y2="155" stroke="#1E293B" strokeWidth="1.5" />
          <line x1="72" y1="165" x2="88" y2="175" stroke="#1E293B" strokeWidth="1.5" />
          <line x1="72" y1="185" x2="88" y2="195" stroke="#1E293B" strokeWidth="1.5" />
          <line x1="72" y1="115" x2="88" y2="105" stroke="#1E293B" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="72" y1="135" x2="88" y2="125" stroke="#1E293B" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="72" y1="155" x2="88" y2="145" stroke="#1E293B" strokeWidth="1" strokeDasharray="2 2" />

          {/* Layered Exhaust Billowing Clouds */}
          {/* Deep base clouds */}
          <path d="M40 215 C35 190, 60 170, 85 180 C95 160, 130 160, 145 178 C160 162, 195 165, 205 185 C225 185, 235 210, 220 225 C190 235, 60 235, 40 215 Z" fill="#0F172A" />
          {/* Mid cloud layer */}
          <path d="M55 210 C50 195, 70 185, 88 192 C98 178, 128 178, 138 190 C152 178, 180 180, 190 196 C205 198, 215 218, 200 226 C170 232, 70 230, 55 210 Z" fill="#1E293B" />
          {/* Soft inner smoke highlights */}
          <path d="M75 208 C80 198, 95 198, 105 205 C115 195, 135 195, 145 204 C155 198, 170 200, 178 210 C160 220, 90 220, 75 208 Z" fill="#334155" opacity="0.6" />

          {/* Rocket Thruster Flame (Mint Glow) */}
          <path d="M122 175 C124 195, 130 210, 130 210 C130 210, 136 195, 138 175 Z" fill="#00D09C" />
          <path d="M126 175 C128 190, 130 200, 130 200 C130 200, 132 190, 134 175 Z" fill="#FFFFFF" />

          {/* Left Booster Rocket */}
          <path d="M106 120 C106 102, 112 90, 112 90 C112 90, 118 102, 118 120 L118 172 L106 172 Z" fill="#334155" />
          <path d="M106 120 C106 102, 112 90, 112 90 L112 172 L106 172 Z" fill="#1E293B" />
          <polygon points="102,172 106,160 106,176" fill="#0F172A" />

          {/* Right Booster Rocket */}
          <path d="M142 120 C142 102, 148 90, 148 90 C148 90, 154 102, 154 120 L154 172 L142 172 Z" fill="#334155" />
          <path d="M148 90 C148 90, 154 102, 154 120 L154 172 L148 172 Z" fill="#475569" />
          <polygon points="158,172 154,160 154,176" fill="#0F172A" />

          {/* Central Rocket Body (Soft Mint and White Shading) */}
          <path d="M130 38 C130 38, 116 75, 116 138 L116 178 L144 178 L144 138 C144 75, 130 38, 130 38 Z" fill="#E2E8F0" />
          {/* Right half shadow */}
          <path d="M130 38 C130 38, 130 75, 130 178 L144 178 L144 138 C144 75, 130 38, 130 38 Z" fill="#CBD5E1" />

          {/* Soft Pastel Mint Nose Cone (Iconic Groww palette) */}
          <path d="M130 38 C130 38, 122 58, 120 72 L140 72 C138 58, 130 38, 130 38 Z" fill="#5EEAD4" />
          <path d="M130 38 C130 38, 130 58, 130 72 L140 72 C138 58, 130 38, 130 38 Z" fill="#2DD4BF" />

          {/* Center Seam / Detail lines */}
          <line x1="130" y1="72" x2="130" y2="178" stroke="#94A3B8" strokeWidth="1.2" />

          {/* Circular Porthole Window */}
          <circle cx="130" cy="100" r="7.5" fill="#0F172A" stroke="#5EEAD4" strokeWidth="2" />
          <circle cx="130" cy="100" r="4.5" fill="#5EEAD4" opacity="0.4" />

          {/* Left & Right Stabilizer Fins */}
          <polygon points="116,148 102,176 116,172" fill="#2DD4BF" />
          <polygon points="144,148 158,176 144,172" fill="#0F766E" />
        </svg>
      </div>

      {/* Main Title (Matches Screenshot 2 & 3: Bold, Clean White) */}
      <h2 style={{
        fontSize: '1.45rem',
        fontWeight: '700',
        color: '#FFFFFF',
        margin: '0 0 8px 0',
        letterSpacing: '-0.02em',
        fontFamily: "'Inter', -apple-system, sans-serif"
      }}>
        {title}
      </h2>

      {/* Subtitle (Subtle Gray, Exactly like Groww) */}
      {subtitle && (
        <p style={{
          fontSize: '0.9rem',
          color: '#92999C',
          maxWidth: '460px',
          lineHeight: '1.5',
          margin: 0
        }}>
          {subtitle}
        </p>
      )}

      {actionButton && (
        <div style={{ marginTop: '20px' }}>
          {actionButton}
        </div>
      )}
    </div>
  );
}
