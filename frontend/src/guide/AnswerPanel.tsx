import React, { useEffect, useRef, useState } from 'react'
import { Button, SidePanel, Table, Td, Th, THead, TextField, Tr } from '@/ui'
import type { GuidePlan } from '@/guide/plan'
import type { ResolvedPage } from '@/guide/types'

type Answer = Extract<GuidePlan, { kind: 'answer' }>

/**
 * The Guide's answer: the reply in words, a small table when
 * it helps, a way to open the page where the person can see it for themselves,
 * and a box for a follow-up question.
 */
export const AnswerPanel: React.FC<{
  answer: Answer
  pages: ResolvedPage[]
  onClose: () => void
  onOpenPage: (pageId: string) => void
  onFollowUp: (question: string) => void
  /** Where the tile should rest: beside the panel's answer. */
  onShown: (el: HTMLElement | null) => void
}> = ({ answer, pages, onClose, onOpenPage, onFollowUp, onShown }) => {
  const [followUp, setFollowUp] = useState('')
  const textRef = useRef<HTMLParagraphElement | null>(null)
  const page = answer.page ? pages.find((p) => p.id === answer.page) : undefined

  // Once per answer — the callback lives in a ref so re-renders don't re-run this.
  const shownRef = useRef(onShown)
  shownRef.current = onShown
  useEffect(() => {
    const t = setTimeout(() => shownRef.current(textRef.current), 50)
    return () => clearTimeout(t)
  }, [answer])

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    if (followUp.trim()) onFollowUp(followUp.trim())
  }

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Rosterly"
      description={answer.question ? `You asked: ${answer.question}` : undefined}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {page ? (
            <Button variant="secondary" onClick={() => onOpenPage(page.id)}>
              Open {page.title}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <p ref={textRef} data-guide-answer="" className="whitespace-pre-line text-lead text-ink">
          {answer.text}
        </p>

        {answer.table && (
          <Table label="Answer details">
            <THead>
              {answer.table.columns.map((c) => (
                <Th key={c}>{c}</Th>
              ))}
            </THead>
            <tbody>
              {answer.table.rows.map((row, i) => (
                <Tr key={i}>
                  {row.map((cell, j) => (
                    <Td key={j}>{cell}</Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        <p className="text-meta text-muted">Answered from what you can see in Rosterly. The Guide can be wrong — check the page if it matters.</p>

        <form onSubmit={send} className="flex items-end gap-2 border-t border-line pt-4">
          <div className="flex-1">
            <TextField label="Ask a follow-up" value={followUp} onChange={(e) => setFollowUp(e.target.value)} maxLength={400} />
          </div>
          <Button type="submit" variant="secondary" disabled={!followUp.trim()}>
            Ask
          </Button>
        </form>
      </div>
    </SidePanel>
  )
}
