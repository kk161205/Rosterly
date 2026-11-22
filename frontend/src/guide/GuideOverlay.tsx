import React from 'react'
import { cn } from '@/ui'
import type { GuidePlan } from '@/guide/plan'
import type { GuidePhase, TilePosition } from '@/guide/GuideProvider'

const TILE = 18
const CAPTION_WIDTH = 240

/**
 * The Guide on screen: the tile in the person's accent
 * with a strong outline, a one-line caption beside it, and a fixed pill at the
 * bottom with Stop / Ask again. No shadows, trails or bouncing.
 */
export const GuideOverlay: React.FC<{
  phase: GuidePhase
  tile: TilePosition | null
  fading: boolean
  moveMs: number
  caption: string
  title: string
  message: string
  question: string
  choices: { label: string; plan: GuidePlan }[]
  lastQuestion: string
  onChoose: (plan: GuidePlan) => void
  onStop: () => void
  onAskAgain: () => void
}> = ({ phase, tile, fading, moveMs, caption, title, message, question, choices, lastQuestion, onChoose, onStop, onAskAgain }) => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const captionLeft = tile ? (tile.x + TILE + 8 + CAPTION_WIDTH > vw - 8 ? Math.max(8, tile.x - CAPTION_WIDTH - 8) : tile.x + TILE + 8) : 0
  const showPill = phase === 'guiding' || phase === 'thinking' || phase === 'asking' || phase === 'message'

  return (
    <>
      {tile && (
        <div
          data-testid="guide-tile"
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 z-[70] rounded-soft border-[1.5px] border-navy bg-accent-soft"
          style={{
            width: TILE,
            height: TILE,
            transform: `translate(${tile.x}px, ${tile.y}px) rotate(-14deg)`,
            transition: `transform ${moveMs}ms cubic-bezier(0.45, 0, 0.25, 1), opacity 120ms ease-out`,
            opacity: fading ? 0 : 1,
          }}
        />
      )}

      {tile && caption && phase === 'guiding' && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 z-[70] max-w-[240px] rounded-card border border-line bg-paper px-3 py-1.5 text-body text-ink"
          style={{
            transform: `translate(${captionLeft}px, ${Math.max(8, tile.y - 4)}px)`,
            transition: `transform ${moveMs}ms cubic-bezier(0.45, 0, 0.25, 1)`,
          }}
        >
          {caption}
        </div>
      )}

      {/* Screen readers hear each caption; the bubble itself is decorative. */}
      <p className="sr-only" role="status" aria-live="polite">
        {phase === 'guiding' ? caption : phase === 'message' ? message : ''}
      </p>

      {showPill && (
        <div
          role="region"
          aria-label="Guide"
          className="fixed bottom-4 left-1/2 z-[70] flex w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-paper px-4 py-2.5 text-body text-ink"
        >
          {phase === 'thinking' && <span className="flex-1 text-muted">Finding the way…</span>}
          {phase === 'guiding' && (
            <span className="min-w-0 flex-1 truncate">
              Guiding you to <span className="font-medium">{title}</span>
            </span>
          )}
          {phase === 'message' && <span className="min-w-0 flex-1">{message}</span>}
          {phase === 'asking' && (
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span>{question}</span>
              <div className="flex flex-wrap gap-2">
                {choices.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => onChoose(c.plan)}
                    className="min-h-10 rounded-pill border border-navy px-3 text-body text-navy hover:bg-navy-tint focus-visible:outline-navy"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {(phase === 'guiding' || phase === 'message' || phase === 'asking') && (
              <button
                type="button"
                onClick={onAskAgain}
                title={lastQuestion ? `You asked: ${lastQuestion}` : undefined}
                className={cn('min-h-10 rounded-pill px-3 text-body text-navy underline-offset-4 hover:underline')}
              >
                Ask again
              </button>
            )}
            <button type="button" onClick={onStop} className="min-h-10 rounded-pill border border-ink px-3 text-body text-ink hover:bg-row-hover">
              {phase === 'message' ? 'Close' : 'Stop'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
