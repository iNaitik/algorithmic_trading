import React from 'react';

export default function GrowwRocketEmptyState({
  title = "No open positions",
  subtitle = "Equity Intraday and automated bot positions will appear here.",
  actionButton = null
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      textAlign: 'center',
      minHeight: '380px'
    }}>
      {/* Groww Rocket & Launchpad SVG Illustration */}
      <div style={{ width: '220px', height: '200px', marginBottom: '24px', position: 'relative' }}>
        <svg viewBox="0 0 240 220" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          {/* Background Stars / Sparkles */}
          <circle cx="36" cy="48" r="1.5" fill="#5c6579" />
          <circle cx="80" cy="24" r="1" fill="#7d889e" />
          <circle cx="204" cy="40" r="1.5" fill="#5c6579" />
          <circle cx="190" cy="80" r="2" fill="#00d09c" opacity="0.6" />
          <circle cx="30" cy="110" r="1.5" fill="#00d09c" opacity="0.4" />
          
          {/* Star cross */}
          <path d="M42 76L44 80L48 82L44 84L42 88L40 84L36 82L40 80L42 76Z" fill="#7d889e" opacity="0.8" />
          <path d="M198 120L199.5 123L202.5 124.5L199.5 126L198 129L196.5 126L193.5 124.5L196.5 123L198 120Z" fill="#00d09c" opacity="0.7" />
          
          {/* Launch Pad Lattice Tower (Left) */}
          <line x1="88" y1="180" x2="88" y2="90" stroke="#252b3b" strokeWidth="2" strokeDasharray="3 3" />
          <line x1="88" y1="100" x2="104" y2="108" stroke="#252b3b" strokeWidth="1.5" />
          <line x1="88" y1="120" x2="104" y2="128" stroke="#252b3b" strokeWidth="1.5" />
          <line x1="88" y1="140" x2="104" y2="148" stroke="#252b3b" strokeWidth="1.5" />

          {/* Smoke & Cloud base */}
          <path d="M40 195 C 40 180, 60 175, 75 180 C 85 168, 110 168, 120 180 C 135 170, 160 172, 170 185 C 185 178, 205 185, 200 200 C 180 205, 60 205, 40 195 Z" fill="#181d28" />
          <path d="M60 192 C 65 182, 85 180, 95 186 C 105 178, 125 178, 135 185 C 145 180, 165 182, 172 192 Z" fill="#202636" opacity="0.8" />

          {/* Rocket Thruster Flame (Mint Teal glow) */}
          <path d="M112 170 C 114 186, 120 196, 120 196 C 120 196, 126 186, 128 170 Z" fill="#00d09c" opacity="0.8" />
          <path d="M116 170 C 117 180, 120 188, 120 188 C 120 188, 123 180, 124 170 Z" fill="#ffffff" />

          {/* Left Booster Rocket */}
          <path d="M102 125 C 102 110, 107 100, 107 100 C 107 100, 112 110, 112 125 L 112 162 L 102 162 Z" fill="#2a3244" />
          <path d="M102 125 C 102 112, 107 104, 107 104 L 107 162 L 102 162 Z" fill="#323b4f" />
          <polygon points="98,162 102,152 102,166" fill="#1b212f" />

          {/* Right Booster Rocket */}
          <path d="M128 125 C 128 110, 133 100, 133 100 C 133 100, 138 110, 138 125 L 138 162 L 128 162 Z" fill="#2a3244" />
          <path d="M128 125 C 128 112, 133 104, 133 104 L 133 162 L 128 162 Z" fill="#3b465d" />
          <polygon points="142,162 138,152 138,166" fill="#1b212f" />

          {/* Main Central Rocket Body */}
          <path d="M120 48 C 120 48, 108 80, 108 135 L 108 168 L 132 168 L 132 135 C 132 80, 120 48, 120 48 Z" fill="#e2e8f0" />
          {/* Main Shading */}
          <path d="M120 48 C 120 48, 120 80, 120 168 L 132 168 L 132 135 C 132 80, 120 48, 120 48 Z" fill="#cbd5e1" />
          {/* Nose Cone Tip */}
          <path d="M120 48 C 120 48, 114 65, 112 76 L 128 76 C 126 65, 120 48, 120 48 Z" fill="#00d09c" />

          {/* Rocket Window / Porthole */}
          <circle cx="120" cy="92" r="7" fill="#0c0e14" stroke="#00d09c" strokeWidth="2" />
          <circle cx="120" cy="92" r="4" fill="#00d09c" opacity="0.3" />

          {/* Side Fins */}
          <polygon points="108,142 96,166 108,164" fill="#00d09c" />
          <polygon points="132,142 144,166 132,164" fill="#00b084" />
        </svg>
      </div>

      <div style={{
        fontSize: '1.25rem',
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: '8px',
        letterSpacing: '-0.01em'
      }}>
        {title}
      </div>

      <div style={{
        fontSize: '0.85rem',
        color: '#8a939e',
        maxWidth: '420px',
        lineHeight: '1.5',
        marginBottom: actionButton ? '20px' : '0'
      }}>
        {subtitle}
      </div>

      {actionButton && (
        <div style={{ marginTop: '16px' }}>
          {actionButton}
        </div>
      )}
    </div>
  );
}
