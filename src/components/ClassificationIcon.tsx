'use client';

import { useId } from 'react';
import type { MoveClass } from '@/types';
import { MOVE_CLASS_META } from '@/lib/analysis/classify';

/**
 * Polished vector icons for the move-quality classifications, styled after the
 * "paid analyzer" convention: a coloured disc with a distinct white glyph
 * (star, thumbs-up, check, open book, chevrons, and typographic !!/?!/??).
 *
 * These are original drawings — not copied artwork — so they theme cleanly and
 * stay crisp from 14px (move list) up to the board badge.
 */

/** Darkens a #rrggbb colour by `amount` (0..1) for the disc gradient. */
function darken(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(m[1], 16) * (1 - amount));
  const g = clamp(parseInt(m[2], 16) * (1 - amount));
  const b = clamp(parseInt(m[3], 16) * (1 - amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** White symbol for each classification, drawn inside a 24×24 viewBox. */
function Symbol({ id }: { id: MoveClass }) {
  const stroke = {
    fill: 'none',
    stroke: '#fff',
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const text = (value: string, size: number) => (
    <text
      x="12"
      y="12.8"
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={size}
      fontWeight={900}
      fontFamily="'Inter', ui-sans-serif, system-ui, sans-serif"
      fill="#fff"
      style={{ letterSpacing: value.length > 1 ? '-0.5px' : '0' }}
    >
      {value}
    </text>
  );

  switch (id) {
    case 'brilliant':
      return text('!!', 13);
    case 'great':
      return text('!', 14);
    case 'best':
      // 5-point star
      return (
        <path
          fill="#fff"
          d="M12 4.6l1.98 4.35 4.74.42-3.57 3.13 1.06 4.64L12 14.9l-4.21 2.24 1.06-4.64-3.57-3.13 4.74-.42z"
        />
      );
    case 'excellent':
      // thumbs-up
      return (
        <path
          fill="#fff"
          d="M8.2 10.9l3.1-5.2c.2-.34.57-.53.96-.5.9.06 1.55.9 1.36 1.79l-.62 2.86h3.63c1.03 0 1.8.96 1.57 1.97l-1.12 4.9c-.17.75-.83 1.28-1.6 1.28H8.2zm-2.05.2H7v7.9H6.15a1.4 1.4 0 0 1-1.4-1.4v-5.1c0-.77.63-1.4 1.4-1.4z"
        />
      );
    case 'good':
      return <path {...stroke} d="M6.8 12.5l3.2 3.2 7.2-7.4" />;
    case 'book':
      // open book
      return (
        <path
          fill="#fff"
          d="M11.3 7.3C9.2 6.1 6.9 5.9 4.7 6.6a.9.9 0 0 0-.62.86v8.7c0 .6.6 1.02 1.17.83 1.86-.62 3.86-.42 5.63.6.28.16.42.16.42-.2V7.6c0-.12-.06-.24-.02-.3zM19.3 6.6c-2.2-.7-4.5-.5-6.6.7.04.06-.02.18-.02.3v9.79c0 .36.14.36.42.2 1.77-1.02 3.77-1.22 5.63-.6.57.19 1.17-.23 1.17-.83v-8.7a.9.9 0 0 0-.62-.86z"
        />
      );
    case 'forced':
      // double chevron (only-move / forced continuation)
      return (
        <g {...stroke}>
          <path d="M7 7.5l4.2 4.5L7 16.5" />
          <path d="M12.6 7.5l4.2 4.5-4.2 4.5" />
        </g>
      );
    case 'inaccuracy':
      return text('?!', 12);
    case 'mistake':
      return text('?', 14);
    case 'blunder':
      return text('??', 12);
    default:
      return null;
  }
}

export function ClassificationIcon({
  classification,
  size = 20,
  className,
  title,
}: {
  classification: MoveClass;
  size?: number;
  className?: string;
  title?: string;
}) {
  const meta = MOVE_CLASS_META[classification];
  const gradId = useId();
  const top = meta.color;
  const bottom = darken(meta.color, 0.28);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={title ?? meta.label}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <title>{title ?? meta.label}</title>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#${gradId})`} />
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.9" />
      <Symbol id={classification} />
    </svg>
  );
}
