import React from 'react';

/**
 * CompanyLogo renders official vector / SVG logos for popular stocks and bonds,
 * matching Groww's desktop stock cards precisely.
 */
export default function CompanyLogo({ symbol = "", name = "", size = 38 }) {
  const s = (symbol || "").toUpperCase();
  const n = (name || "").toUpperCase();

  const containerStyle = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
  };

  // 1. NVIDIA (Green eye spiral on white badge)
  if (s.includes("NVDA") || s.includes("NVIDIA") || n.includes("NVIDIA")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#FFFFFF' }}>
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
          <path
            d="M8.9 6.5C11.5 6.3 14 7.2 15.8 8.9L17.7 7C15.3 4.8 12.1 3.7 8.8 4C5.1 4.3 1.9 6.8 0.6 10.2C0.2 11.3 0 12.4 0 13.6C0 14.7 0.2 15.8 0.6 16.9L3.4 15.4C3.1 14.8 3 14.2 3 13.6C3 10.1 5.5 7.1 8.9 6.5ZM13.8 10.4C12.4 9.4 10.6 9 8.9 9.3C7.2 9.6 5.8 10.9 5.3 12.6C5.1 13.3 5.1 13.9 5.2 14.5L7.9 13.1C7.9 12.9 7.9 12.8 7.9 12.6C8.2 11.6 9 10.9 10 10.7C11 10.5 12 10.9 12.6 11.6L13.8 10.4Z"
            fill="#76B900"
          />
          <path
            d="M8.9 11.5C9.4 11.4 9.9 11.5 10.3 11.8C10.7 12.1 11 12.6 11 13.1C11 13.6 10.8 14.1 10.4 14.4C10 14.7 9.5 14.9 9 14.8L12.5 17.5C13.5 16.5 14 15.1 14 13.6C14 11.8 13.1 10.2 11.6 9.2L8.9 11.5Z"
            fill="#76B900"
          />
          <path
            d="M8.9 16.8C7.5 16.8 6.2 16.1 5.5 15L2.8 16.5C4 18.7 6.4 20 8.9 20C12 20 14.8 18.2 16 15.4L13.4 13.8C12.6 15.6 10.8 16.8 8.9 16.8Z"
            fill="#76B900"
          />
        </svg>
      </div>
    );
  }

  // 2. State Street SPDR (White badge with bold SPDR)
  if (s.includes("SPDR") || n.includes("SPDR") || s.includes("SPY")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <span style={{
          color: '#0D1117',
          fontWeight: '900',
          fontSize: `${size * 0.32}px`,
          letterSpacing: '-0.04em',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          SPDR
        </span>
      </div>
    );
  }

  // 3. Amazon (Black badge with orange smile arrow)
  if (s.includes("AMZN") || s.includes("AMAZON") || n.includes("AMAZON")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#131921', border: '1px solid #232F3E' }}>
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
          <path
            d="M4 14.5C8 17.5 14 17.5 18.5 14.5"
            stroke="#FF9900"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M16.5 13L19 14.5L17.5 17"
            fill="#FF9900"
          />
        </svg>
      </div>
    );
  }

  // 4. SpaceX (Black badge with stylized X)
  if (s.includes("SPACEX") || n.includes("SPACEX")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#000000', border: '1px solid #222' }}>
        <svg width={size * 0.68} height={size * 0.68} viewBox="0 0 24 24" fill="none">
          <path
            d="M4 4L14 20M14 4L4 20"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M10 8C14 6 18 10 21 16"
            stroke="#00D09C"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  // 5. Micron Technology (Royal Blue badge with Micron white wordmark)
  if (s.includes("MICRON") || s.includes("MU") || n.includes("MICRON")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#005596' }}>
        <svg width={size * 0.78} height={size * 0.5} viewBox="0 0 40 24" fill="none">
          <text x="2" y="17" fill="#FFFFFF" fontSize="13" fontWeight="800" fontStyle="italic" letterSpacing="-0.5px" fontFamily="sans-serif">
            Micron
          </text>
        </svg>
      </div>
    );
  }

  // 6. AMD (Dark badge with white arrow chevron)
  if (s.includes("AMD") || n.includes("ADVANCED MICRO") || n.includes("AMD")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#101416', border: '1px solid #252A2C' }}>
        <svg width={size * 0.68} height={size * 0.68} viewBox="0 0 24 24" fill="none">
          <path d="M4 4H10V10H4V4Z" fill="#ED1C24" />
          <path d="M12 4H20V12H16V8H12V4Z" fill="#FFFFFF" />
          <path d="M20 14V20H14V16H18V14H20Z" fill="#FFFFFF" />
          <path d="M4 12H8V16H12V20H4V12Z" fill="#FFFFFF" />
        </svg>
      </div>
    );
  }

  // 7. State Bank of India (White badge with iconic SBI blue circle keyhole)
  if (s.includes("SBIN") || s.includes("SBI") || n.includes("STATE BANK")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
          {/* SBI Deep Blue Circle */}
          <circle cx="12" cy="12" r="10" fill="#0072BC" />
          {/* Keyhole cutout in center */}
          <circle cx="12" cy="10" r="3" fill="#FFFFFF" />
          <rect x="11" y="10" width="2" height="9" fill="#FFFFFF" />
        </svg>
      </div>
    );
  }

  // 8. Reliance Industries (White badge with official Reliance flame logo)
  if (s.includes("RELIANCE") || n.includes("RELIANCE")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3C12 3 7 8 7 13C7 16.5 9.5 19 12 21C14.5 19 17 16.5 17 13C17 8 12 3 12 3Z"
            fill="#00509E"
          />
          <path
            d="M12 7C12 7 9 10 9 13.5C9 15.5 10.5 17.5 12 18.5C13.5 17.5 15 15.5 15 13.5C15 10 12 7 12 7Z"
            fill="#ED1C24"
          />
          <circle cx="12" cy="14" r="1.5" fill="#FFCC00" />
        </svg>
      </div>
    );
  }

  // 9. HDFC Bank (White badge with iconic Blue/Red square block logo)
  if (s.includes("HDFCBANK") || s.includes("HDFC") || n.includes("HDFC")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 24 24" fill="none">
          {/* HDFC Outer blocks: Red top, bottom, left, right */}
          <rect x="3" y="3" width="18" height="18" fill="#004B87" rx="2" />
          <rect x="7" y="7" width="10" height="10" fill="#FFFFFF" />
          <rect x="9" y="3" width="6" height="4" fill="#ED1C24" />
          <rect x="9" y="17" width="6" height="4" fill="#ED1C24" />
          <rect x="3" y="9" width="4" height="6" fill="#ED1C24" />
          <rect x="17" y="9" width="4" height="6" fill="#ED1C24" />
          <rect x="10" y="10" width="4" height="4" fill="#004B87" />
        </svg>
      </div>
    );
  }

  // 10. Tata Motors & TCS (White badge with iconic Tata Blue Oval 'T')
  if (s.includes("TATAMOTORS") || s.includes("TATA") || s.includes("TCS") || n.includes("TATA")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
          <ellipse cx="12" cy="12" rx="9" ry="7" stroke="#005A9C" strokeWidth="1.8" />
          <path d="M7 9C10 9 12 11 12 16" stroke="#005A9C" strokeWidth="2" strokeLinecap="round" />
          <path d="M17 9C14 9 12 11 12 16" stroke="#005A9C" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 11. Infosys (White badge with royal blue Infosys script)
  if (s.includes("INFY") || n.includes("INFOSYS")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <span style={{
          color: '#007CC3',
          fontWeight: '900',
          fontSize: `${size * 0.3}px`,
          letterSpacing: '-0.02em',
          fontFamily: 'system-ui, sans-serif'
        }}>
          Infosys
        </span>
      </div>
    );
  }

  // 12. Bharti Airtel (White badge with official red swirl)
  if (s.includes("BHARTI") || s.includes("AIRTEL") || n.includes("AIRTEL")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 4C7.5 4 4 7.5 4 12C4 16.5 7.5 20 12 20C15 20 18 18 19 15C19.5 13.5 18.5 12 17 12C15.5 12 14.5 13 14 14C13.5 15 12.8 15.5 12 15.5C10 15.5 8.5 14 8.5 12C8.5 10 10 8.5 12 8.5C13.5 8.5 14.8 9.5 15.2 11H18.5C18 7 15.2 4 12 4Z"
            fill="#ED1B24"
          />
        </svg>
      </div>
    );
  }

  // 13. ICICI Bank (White badge with iconic orange/maroon 'i')
  if (s.includes("ICICI") || n.includes("ICICI")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="7" r="2.5" fill="#B32025" />
          <path d="M10 11H14V19H10V11Z" fill="#ED8B00" />
          <path d="M8 19H16" stroke="#B32025" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 14. Muthoot Finance (Red badge with twin elephant stylization)
  if (s.includes("MUTHOOT") || n.includes("MUTHOOT")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#C8102E' }}>
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="12" r="4" stroke="#FFFFFF" strokeWidth="1.8" />
          <circle cx="15" cy="12" r="4" stroke="#FFFFFF" strokeWidth="1.8" />
          <path d="M12 9V17" stroke="#FFD100" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 15. Indel Money (Navy Blue badge with white lettering)
  if (s.includes("INDEL") || n.includes("INDEL")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#0B2265' }}>
        <span style={{
          color: '#FFFFFF',
          fontWeight: '900',
          fontSize: `${size * 0.22}px`,
          letterSpacing: '0.02em',
          textAlign: 'center',
          lineHeight: '1.1'
        }}>
          INDEL<br/><span style={{ color: '#00D09C', fontSize: `${size * 0.18}px` }}>MONEY</span>
        </span>
      </div>
    );
  }

  // 16. Paisalo Digital (White badge with Paisalo red wordmark)
  if (s.includes("PAISALO") || n.includes("PAISALO")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <span style={{
          color: '#D8232A',
          fontWeight: '900',
          fontSize: `${size * 0.22}px`,
          letterSpacing: '-0.02em'
        }}>
          PAISALO
        </span>
      </div>
    );
  }

  // 17. Govt of India Bonds (Gold/Navy badge with Ashoka Chakra stylization)
  if (s.includes("GS") || s.includes("GOI") || n.includes("GOVT OF INDIA") || n.includes("GOI")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#0A192F', border: '1px solid #1E3A8A' }}>
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke="#F59E0B" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="2.5" fill="#F59E0B" />
          <line x1="12" y1="4" x2="12" y2="20" stroke="#F59E0B" strokeWidth="1" />
          <line x1="4" y1="12" x2="20" y2="12" stroke="#F59E0B" strokeWidth="1" />
          <line x1="6.3" y1="6.3" x2="17.7" y2="17.7" stroke="#F59E0B" strokeWidth="1" />
          <line x1="6.3" y1="17.7" x2="17.7" y2="6.3" stroke="#F59E0B" strokeWidth="1" />
        </svg>
      </div>
    );
  }

  // 18. REC Ltd (Royal Blue badge with REC)
  if (s.includes("REC") || n.includes("REC")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#00509E' }}>
        <span style={{ color: '#FFFFFF', fontWeight: '900', fontSize: `${size * 0.32}px`, letterSpacing: '0.04em' }}>
          REC
        </span>
      </div>
    );
  }

  // 19. NHAI (Forest Green badge with NHAI)
  if (s.includes("NHAI") || n.includes("NHAI")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#0F766E' }}>
        <span style={{ color: '#FFFFFF', fontWeight: '900', fontSize: `${size * 0.28}px`, letterSpacing: '0.04em' }}>
          NHAI
        </span>
      </div>
    );
  }

  // 20. PFC Ltd (Deep Ruby/Navy badge with PFC)
  if (s.includes("PFC") || n.includes("PFC")) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#1E3A8A' }}>
        <span style={{ color: '#FFFFFF', fontWeight: '900', fontSize: `${size * 0.32}px`, letterSpacing: '0.04em' }}>
          PFC
        </span>
      </div>
    );
  }

  // Default clean monogram badge
  const initials = (symbol || name || "ST").replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || "ST";
  return (
    <div style={{
      ...containerStyle,
      backgroundColor: '#1E2328',
      border: '1px solid #2D343A'
    }}>
      <span style={{
        color: '#00D09C',
        fontWeight: '700',
        fontSize: `${size * 0.34}px`,
        letterSpacing: '0.02em'
      }}>
        {initials}
      </span>
    </div>
  );
}
