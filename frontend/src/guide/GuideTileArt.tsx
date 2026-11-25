import React from 'react'
import { tileDesign, type TileDesignId } from '@/guide/designs'

/**
 * The Guide in one of its designs, drawn on a 48×48 grid. The "body box" is the
 * 24×24 square at (12, 16): that is where the logo's square sits, and what the
 * overlay sizes and positions. Characters spill out of it (hats, speed lines).
 *
 * `form` is either the plain navy square from the logo (tilted like it is there)
 * or the character. Switching pops one into the other — the reshape as it leaves
 * the logo, and back on the way home. `idle` plays the character's own motion
 * (classes in globals.css, all off under reduced motion).
 */
export const BODY = { x: 12, y: 16, size: 24, grid: 48 } as const

const LOGO_NAVY = '#1F2B67'
const GOLD = '#F2C94C'
const RED = '#D64545'

/** An SVG group that animates around a point given in grid units. */
const Move: React.FC<{ cls: string; at: [number, number]; delay?: number; children: React.ReactNode }> = ({ cls, at, delay, children }) => (
  <g className={cls} style={{ transformBox: 'view-box', transformOrigin: `${at[0]}px ${at[1]}px`, ...(delay ? { animationDelay: `${delay}s` } : {}) }}>
    {children}
  </g>
)

const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r} L${x + r * 0.32} ${y - r * 0.32} L${x + r} ${y} L${x + r * 0.32} ${y + r * 0.32} L${x} ${y + r} L${x - r * 0.32} ${y + r * 0.32} L${x - r} ${y} L${x - r * 0.32} ${y - r * 0.32} Z`

const Flower: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g>
    {[0, 72, 144, 216, 288].map((a) => (
      <circle key={a} cx={x + 1.9 * Math.cos(((a - 90) * Math.PI) / 180)} cy={y + 1.9 * Math.sin(((a - 90) * Math.PI) / 180)} r="1.7" fill="#FFC2D1" />
    ))}
    <circle cx={x} cy={y} r="1.15" fill={GOLD} />
  </g>
)

function Character({ id }: { id: TileDesignId }) {
  // Every character fits a square: a ~24×24 body on the body box, extras kept short.
  switch (id) {
    case 'navy': // Bolt: always in a rush
      return (
        <>
          <Move cls="gt-dash" at={[7, 29]}>
            <g stroke="#8C9BFF" strokeWidth="2" strokeLinecap="round">
              <path d="M4.5 25 H9.5" />
              <path d="M2.5 29.5 H9.5" />
              <path d="M4.5 34 H9.5" />
            </g>
          </Move>
          <Move cls="gt-jitter" at={[24, 41]}>
            <rect x="12" y="16.5" width="24" height="24.5" rx="3" fill="#2E3A8C" transform="rotate(4 24 29)" />
            <path d="M11 20 L9 14.5 L14 15.5 L15 9.5 L19.5 14 L23.5 8 L26.5 13.5 L31.5 9.5 L31.5 14.5 L37.5 14.5 L36 20.5 Z" fill="#141B4D" />
            <path d="M19.5 14.8 L22.3 11.5 L24.5 14.3 L27.5 10.6" fill="none" stroke="#4C5BD4" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M27.5 22 L21.5 30.5 L25.2 30.5 L23 37.5 L30.5 27.8 L26.8 27.8 L29.5 22 Z" fill={GOLD} />
          </Move>
        </>
      )
    case 'sage': // Sprout: calm, curious
      return (
        <Move cls="gt-squash" at={[24, 42]}>
          <path d="M24 19 C24 16.5 23.4 14.5 24 12.5" fill="none" stroke="#2E6440" strokeWidth="1.6" strokeLinecap="round" />
          <Move cls="gt-sway" at={[24, 13]}>
            <path d="M24 12.5 C21 8.8 16 8.6 13.5 10 C16 13 21 13.4 24 12.5 Z" fill="#7BC47F" />
            <path d="M24 12.5 C27 8.4 32 8 34.5 9.4 C32 12.6 27 13.4 24 12.5 Z" fill="#9AD69B" />
          </Move>
          <ellipse cx="18.5" cy="41.3" rx="3.4" ry="1.6" fill="#2E6440" />
          <ellipse cx="29.5" cy="41.3" rx="3.4" ry="1.6" fill="#2E6440" />
          <rect x="12" y="18" width="24" height="23" rx="10" fill="#3D7A4F" />
          <ellipse cx="24" cy="33.5" rx="7" ry="5" fill="#A5D6A0" />
          <circle cx="17.5" cy="26" r="0.9" fill="#2E6440" />
          <circle cx="30.5" cy="26" r="0.9" fill="#2E6440" />
        </Move>
      )
    case 'lavender': // Mystic: quietly wise
      return (
        <>
          <path d="M16.5 19 H31.5 L36.5 39.5 Q37 42 34.5 42 H13.5 Q11 42 11.5 39.5 Z" fill="#5B4A9E" />
          <path d="M19.5 20 H28.5 L26.5 33 Q24 36.5 21.5 33 Z" fill="#F2F0FA" />
          <circle cx="15.5" cy="38" r="0.85" fill={GOLD} />
          <circle cx="32" cy="38.5" r="0.85" fill={GOLD} />
          <circle cx="31" cy="31" r="0.85" fill={GOLD} />
          <Move cls="gt-bob" at={[24, 19]}>
            <path d="M16.5 19 L21.5 10 Q25 5 31.5 6 Q27 7.5 27 11 L31.5 19 Z" fill="#3B2F70" />
            <rect x="17.4" y="16.2" width="13.2" height="2.1" fill={GOLD} />
            <ellipse cx="24" cy="19.2" rx="11" ry="1.8" fill="#3B2F70" />
            <Move cls="gt-twinkle" at={[21.5, 13]}>
              <path d={star(21.5, 13, 2)} fill={GOLD} />
            </Move>
          </Move>
        </>
      )
    case 'dusk': // Skipper: steady at the helm
      return (
        <Move cls="gt-rock" at={[24, 42]}>
          <rect x="12" y="17.5" width="24" height="24" rx="4.5" fill="#2F6690" />
          <path d="M13.5 21.5 H34.5 L24 35.5 Z" fill="#1B3A57" />
          <path d="M17 22.3 L24 32 L31 22.3" fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M22 32.5 H26 L24 37 Z" fill={RED} />
          <path d="M12.5 18.5 C12.5 11.2 35.5 11.2 35.5 18.5 Z" fill="#FFFFFF" />
          <rect x="12.5" y="16.3" width="23" height="2.8" rx="0.6" fill="#1B3A57" />
          <circle cx="24" cy="14.4" r="0.95" fill={GOLD} />
          <circle cx="24" cy="10.8" r="1.6" fill={RED} />
        </Move>
      )
    case 'peach': // Ember: warm and bright
      return (
        <>
          <Move cls="gt-flicker" at={[24, 42]}>
            <path d="M24 10 C28 16 36.5 20 36.5 30.5 C36.5 37.5 31 42 24 42 C17 42 11.5 37.5 11.5 30.5 C11.5 22 20 18 24 10 Z" fill="#E8612C" />
          </Move>
          <Move cls="gt-flicker-in" at={[24, 40]}>
            <path d="M24 20 C26.5 24.5 31.5 27 31.5 32.5 C31.5 36.8 28.3 39.6 24 39.6 C19.7 39.6 16.5 36.8 16.5 32.5 C16.5 27.5 21.5 24.5 24 20 Z" fill="#F2A33A" />
            <path d="M24 27.5 C25.6 30 28.2 31.5 28.2 34.4 C28.2 36.9 26.3 38.5 24 38.5 C21.7 38.5 19.8 36.9 19.8 34.4 C19.8 31.6 22.4 30 24 27.5 Z" fill="#FFD166" />
          </Move>
          <Move cls="gt-spark" at={[8.5, 24]}>
            <circle cx="8.5" cy="24" r="1.15" fill={GOLD} />
          </Move>
          <Move cls="gt-spark" at={[39.5, 19]} delay={0.6}>
            <circle cx="39.5" cy="19" r="1.25" fill="#F2A33A" />
          </Move>
          <Move cls="gt-spark" at={[40.5, 31]} delay={1.1}>
            <circle cx="40.5" cy="31" r="0.95" fill={GOLD} />
          </Move>
        </>
      )
    case 'sand': // Ranger: ready to explore
      return (
        <>
          <rect x="12" y="19.5" width="24" height="22.5" rx="3" fill="#8A6A2E" />
          <path d="M17.5 21 V42 M30.5 21 V42" stroke="#5A3E1B" strokeWidth="1.7" />
          <path d="M14 21 H34 L24 30.5 Z" fill={RED} />
          <circle cx="24" cy="34" r="1.05" fill="#8B2E2E" />
          <Move cls="gt-bob" at={[24, 20]}>
            <path d="M17 20 C17 12 31 12 31 20 Z" fill="#6E4C22" />
            <path d="M22 13.8 Q24 15.4 26 13.8" fill="none" stroke="#5A3E1B" strokeWidth="0.9" />
            <rect x="17" y="16.6" width="14" height="2" fill="#E0B85C" />
            <ellipse cx="24" cy="20" rx="15" ry="2.6" fill="#5A3E1B" />
          </Move>
        </>
      )
    case 'rose': // Blossom: gentle and kind
      return (
        <Move cls="gt-breathe" at={[24, 42]}>
          <ellipse cx="10.5" cy="33" rx="3.6" ry="1.5" fill="#7BC47F" transform="rotate(-25 10.5 33)" />
          <ellipse cx="37.5" cy="33" rx="3.6" ry="1.5" fill="#7BC47F" transform="rotate(25 37.5 33)" />
          <rect x="12" y="17" width="24" height="25" rx="10.5" fill="#C9507A" />
          <circle cx="18.5" cy="29" r="0.95" fill="#FFFFFF" />
          <circle cx="29" cy="27" r="0.95" fill="#FFFFFF" />
          <circle cx="25" cy="36" r="0.95" fill="#FFFFFF" />
          <circle cx="31" cy="34" r="0.95" fill="#FFFFFF" />
          <Move cls="gt-crown" at={[24, 17]}>
            <ellipse cx="14.5" cy="17.5" rx="2.4" ry="1.1" fill="#7BC47F" transform="rotate(-30 14.5 17.5)" />
            <ellipse cx="33.5" cy="17.5" rx="2.4" ry="1.1" fill="#7BC47F" transform="rotate(30 33.5 17.5)" />
            <Flower x={18} y={16} />
            <Flower x={30} y={16} />
            <Flower x={24} y={13.5} />
          </Move>
        </Move>
      )
  }
}

export const GuideTileArt: React.FC<{
  design?: string
  form?: 'square' | 'character'
  idle?: boolean
  /** Wait this long before reshaping into the character (mid-flight); going back is immediate. */
  revealDelay?: number
  className?: string
  style?: React.CSSProperties
}> = ({ design, form = 'character', idle = false, revealDelay = 0, className, style }) => {
  const d = tileDesign(design)
  const character = form === 'character'
  const origin: React.CSSProperties = { transformBox: 'view-box', transformOrigin: '24px 28px' }
  return (
    <svg viewBox={`0 0 ${BODY.grid} ${BODY.grid}`} className={className} style={{ overflow: 'visible', ...style }} aria-hidden="true" focusable="false">
      {/* The logo's square: navy and tilted, exactly as it sits in the logo. */}
      <g
        data-part="square"
        style={{
          ...origin,
          transform: `rotate(-14deg) scale(${character ? 0.55 : 1})`,
          opacity: character ? 0 : 1,
          transition: `transform 220ms ease-in ${character ? revealDelay : 0}ms, opacity 160ms ease-in ${character ? revealDelay : 0}ms`,
        }}
      >
        <rect x={BODY.x} y={BODY.y} width={BODY.size} height={BODY.size} rx="5.4" fill={LOGO_NAVY} />
      </g>
      {/* The character pops out of it, with a little overshoot. */}
      <g
        data-part="character"
        style={{
          ...origin,
          transform: `scale(${character ? 1 : 0.45})`,
          opacity: character ? 1 : 0,
          transition: character
            ? `transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1) ${revealDelay}ms, opacity 160ms ease-out ${revealDelay}ms`
            : 'transform 180ms ease-in, opacity 140ms ease-in',
        }}
      >
        <g className={idle && character ? 'gt-idle' : undefined}>
          <Move cls="gt-float" at={[24, 28]}>
            <Character id={d.id} />
          </Move>
        </g>
      </g>
    </svg>
  )
}
