/**
 * Symbol logos, drawn as inline SVG: no external requests, no font files, and
 * every symbol type gets a recognisable mark.
 *
 *  · FX pairs       → the BASE currency flag only (EURUSD → 🇪🇺, XAUUSD → gold)
 *  · Metals         → gold / silver bars (XAU, XAG, XPT, XPD)
 *  · Energy         → oil droplet (XTI, UKOIL, USOIL…)
 *  · Indices        → blue index bars (US100, GER40, JP225…)
 *  · Crypto         → ₿ / Ξ badges, monogram for the rest
 *  · Anything else  → clean monogram fallback
 */
import type { ReactNode } from "react";

type Props = { symbol: string; size?: number; className?: string };

/* -------------------------------------------------------------- geometry */

const STAR =
  "M0 -10 L2.245 -3.09 L9.51 -3.09 L3.63 1.18 L5.88 8.09 L0 3.82 L-5.88 8.09 L-3.63 1.18 L-9.51 -3.09 L-2.245 -3.09 Z";

/* -------------------------------------------------------------- currencies */

const EUR = (
  <g>
    <rect width="20" height="20" fill="#003399" />
    {Array.from({ length: 12 }, (_, i) => {
      const a = (i * 30 * Math.PI) / 180;
      return (
        <path
          key={i}
          d={STAR}
          fill="#FFCC00"
          transform={`translate(${(10 + 6.2 * Math.cos(a)).toFixed(2)} ${(10 + 6.2 * Math.sin(a)).toFixed(2)}) scale(0.3)`}
        />
      );
    })}
  </g>
);

const USD = (
  <g>
    <rect width="20" height="20" fill="#f5f5f5" />
    {Array.from({ length: 7 }, (_, i) =>
      i % 2 === 0 ? <rect key={i} y={(i * 20) / 7} width="20" height={20 / 7} fill="#B22234" /> : null,
    )}
    <rect width="10" height="9" fill="#3C3B6E" />
    {Array.from({ length: 9 }, (_, i) => (
      <circle key={i} cx={1.6 + (i % 3) * 3.4} cy={1.6 + Math.floor(i / 3) * 3} r="0.85" fill="#fff" />
    ))}
  </g>
);

const GBP = (
  <g>
    <rect width="20" height="20" fill="#012169" />
    <path d="M0 0L20 20M20 0L0 20" stroke="#fff" strokeWidth="4.5" />
    <path d="M0 0L20 20M20 0L0 20" stroke="#C8102E" strokeWidth="1.8" />
    <path d="M10 0V20M0 10H20" stroke="#fff" strokeWidth="6" />
    <path d="M10 0V20M0 10H20" stroke="#C8102E" strokeWidth="3.2" />
  </g>
);

const JPY = (
  <g>
    <rect width="20" height="20" fill="#fff" />
    <circle cx="10" cy="10" r="5.6" fill="#BC002D" />
  </g>
);

const AUD = (
  <g>
    <rect width="20" height="20" fill="#012169" />
    <path d="M0 0H8.5V6H0Z" fill="#fff" fillOpacity="0.12" />
    <path d="M0 0L8 6M8 0L0 6" stroke="#fff" strokeWidth="2" />
    <path d="M4 0V6M0 3H8" stroke="#fff" strokeWidth="2.6" />
    <path d="M4 0V6M0 3H8" stroke="#C8102E" strokeWidth="1.4" />
    <circle cx="15" cy="4.5" r="1" fill="#fff" />
    <circle cx="17.5" cy="8.5" r="1" fill="#fff" />
    <circle cx="13.5" cy="10" r="1" fill="#fff" />
    <circle cx="16.5" cy="13.5" r="1" fill="#fff" />
    <circle cx="14.8" cy="7.4" r="1" fill="#fff" />
    <path d="M4.6 14.5 L5.5 12.3 L5.5 13.5 L6.9 13.5 L5.8 14.9 L6.2 16.1 L4.6 15.3 L3 16.1 L3.4 14.9 L2.3 13.5 L3.7 13.5 L3.7 12.3 Z" fill="#fff" />
  </g>
);

const CAD = (
  <g>
    <rect width="20" height="20" fill="#fff" />
    <rect width="4.6" height="20" fill="#FF0000" />
    <rect x="15.4" width="4.6" height="20" fill="#FF0000" />
    <path
      d="M10 3.6L11.4 7L13.7 6.1L12.7 9L15.4 9.7L13.2 11.5L14.2 13.9L11.5 13.3L11.1 16.1L10 13.9L8.9 16.1L8.5 13.3L5.8 13.9L6.8 11.5L4.6 9.7L7.3 9L6.3 6.1L8.6 7Z"
      fill="#FF0000"
    />
  </g>
);

const CHF = (
  <g>
    <rect width="20" height="20" fill="#D52B1E" />
    <rect x="8.4" y="5" width="3.2" height="10" fill="#fff" />
    <rect x="5" y="8.4" width="10" height="3.2" fill="#fff" />
  </g>
);

const FLAGS: Record<string, ReactNode> = { EUR, USD, GBP, JPY, AUD, CAD, CHF };

const CURRENCIES = new Set(Object.keys(FLAGS));

/* ----------------------------------------------------------- asset badges */

const METALS: Record<string, { body: string; bar: string }> = {
  XAU: { body: "#f0b429", bar: "#ffe6a3" },
  XAG: { body: "#94a3b8", bar: "#e2e8f0" },
  XPT: { body: "#8aa0b5", bar: "#dce7f0" },
  XPD: { body: "#7f93a8", bar: "#d5e1ec" },
};

const ENERGY = new Set(["XTI", "UKOIL", "USOIL", "OIL", "CL", "BRENT", "WTI"]);

const CRYPTO = new Set(["BTC", "ETH", "XRP", "SOL", "ADA", "DOGE", "DOT", "LTC", "AVAX", "LINK", "XLM", "BNB", "SHIB", "XMR", "XTZ", "ALGO", "NEAR", "ATOM", "UNI", "TRX"]);

const CRYPTO_GLYPH: Record<string, { fill: string; glyph: string; scale?: number }> = {
  BTC: { fill: "#f7931a", glyph: "₿", scale: 1.15 },
  ETH: { fill: "#627eea", glyph: "Ξ", scale: 1.1 },
};

const INDEX_TICKERS = new Set(["DAX", "NDX", "SPX", "SP500", "DJIA", "DJ30", "FTSE", "CAC", "N225", "NI225"]);

/** normalises "eur/usd", "AAPL.US", "xauusd  " → EURUSD / AAPL / XAUUSD */
function normalize(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "").split(/[._]/)[0];
}

function splitPair(sym: string): { base: string; quote: string } | null {
  if (sym.length === 6 && /^[A-Z]{6}$/.test(sym)) return { base: sym.slice(0, 3), quote: sym.slice(3) };
  return null;
}

function isIndex(code: string): boolean {
  if (INDEX_TICKERS.has(code)) return true;
  return /^[A-Z]{2,3}\d{2,3}$/.test(code);
}

function monogram(code: string): ReactNode {
  return (
    <g>
      <rect width="20" height="20" rx="10" fill="#eef2f7" />
      <text
        x="10"
        y="10.6"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="system-ui, sans-serif"
        fontWeight="700"
        fontSize={code.length > 3 ? 7.5 : 9}
        fill="#7c879a"
      >
        {code.slice(0, 3)}
      </text>
    </g>
  );
}

/** The mark for a single asset code, or null when we don't know it. */
function assetSvg(code: string): ReactNode {
  if (FLAGS[code]) return FLAGS[code];

  const metal = METALS[code];
  if (metal)
    return (
      <g>
        <rect width="20" height="20" rx="10" fill={metal.body} />
        <rect x="4" y="12" width="12" height="4.4" rx="1.2" fill={metal.bar} />
        <rect x="6" y="7.6" width="8" height="4.4" rx="1.2" fill={metal.bar} />
      </g>
    );

  if (ENERGY.has(code))
    return (
      <g>
        <rect width="20" height="20" rx="10" fill="#1f2937" />
        <path d="M10 4.2C13.2 7.4 15 10 15 12.2A5 5 0 0 1 5 12.2C5 10 6.8 7.4 10 4.2Z" fill="#f59e0b" />
      </g>
    );

  if (CRYPTO_GLYPH[code]) {
    const c = CRYPTO_GLYPH[code];
    return (
      <g>
        <rect width="20" height="20" rx="10" fill={c.fill} />
        <text
          x="10"
          y="10.8"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="system-ui, sans-serif"
          fontWeight="700"
          fontSize={12 * (c.scale ?? 1)}
          fill="#fff"
        >
          {c.glyph}
        </text>
      </g>
    );
  }

  if (isIndex(code))
    return (
      <g>
        <rect width="20" height="20" rx="10" fill="#0781fe" />
        <rect x="4.5" y="11.5" width="3" height="5" rx="1" fill="#fff" />
        <rect x="8.5" y="8" width="3" height="8.5" rx="1" fill="#fff" />
        <rect x="12.5" y="5" width="3" height="11.5" rx="1" fill="#fff" />
      </g>
    );

  if (CRYPTO.has(code))
    return (
      <g>
        <rect width="20" height="20" rx="10" fill="#334155" />
        <text x="10" y="10.8" textAnchor="middle" dominantBaseline="middle" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="10" fill="#fff">
          {code.slice(0, 2)}
        </text>
      </g>
    );

  if (CURRENCIES.has(code)) return FLAGS[code];
  return null;
}

/* ------------------------------------------------------------------ pieces */

function Circle({ size, children, title }: { size: number; children: ReactNode; title?: string }) {
  return (
    <span
      className="inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-black/10"
      style={{ width: size, height: size }}
    >
      <svg width="100%" height="100%" viewBox="0 0 20 20" role="img" aria-label={title} shapeRendering="geometricPrecision">
        {children}
      </svg>
    </span>
  );
}

export function SymbolLogo({ symbol, size = 28, className = "" }: Props) {
  const sym = normalize(symbol || "");
  const pair = splitPair(sym);
  const wrap = `inline-flex shrink-0 items-center ${className}`;

  if (pair) {
    // Only the BASE currency is shown, at the full badge size: EURUSD → € flag.
    const base = assetSvg(pair.base);
    if (base)
      return (
        <span className={wrap}>
          <Circle size={size} title={pair.base}>{base}</Circle>
        </span>
      );
    return <Monogram code={pair.base} size={size} className={className} />;
  }

  const single = assetSvg(sym);
  if (single)
    return (
      <span className={wrap}>
        <Circle size={size} title={sym}>{single}</Circle>
      </span>
    );
  return <Monogram code={sym.slice(0, 3) || "?"} size={size} className={className} />;
}

function Monogram({ code, size, className }: { code: string; size: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-panel-2 text-[9px] font-semibold text-muted ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-label={`${code} logo`}
    >
      {code.slice(0, size >= 24 ? 3 : 2)}
    </span>
  );
}
