import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runPlan, type RunDeps } from '@/guide/runner'
import type { GuidePlan } from '@/guide/plan'

/**
 * The runner on a small fake page: sidebar section "People" goes to /employees,
 * its "Leave & Attendance" tab goes to /leave, where the leave buttons live.
 */
let path = '/home'
const clicks: string[] = []

function Page() {
  return (
    <div>
      <button data-guide-menu="" onClick={() => clicks.push('menu')}>Menu</button>
      <a data-guide-section="People" href="#" onClick={(e) => { e.preventDefault(); clicks.push('section'); path = '/employees' }}>People</a>
      <a data-guide-tab="/leave" href="#" onClick={(e) => { e.preventDefault(); clicks.push('tab'); path = '/leave' }}>Leave</a>
      <button data-guide="leave.apply" onClick={() => clicks.push('apply')}>Ask for leave</button>
      <button data-guide="leave.send" onClick={() => clicks.push('send')}>Send request</button>
      <button data-guide="leave.mine" type="submit" onClick={() => clicks.push('submit-tab')}>My leave</button>
      <input data-guide="assets.search" aria-label="Search" onChange={() => clicks.push('typed')} />
    </div>
  )
}

const deps = (over: Partial<RunDeps> = {}): RunDeps => ({
  signal: new AbortController().signal,
  style: 'show',
  desktop: true,
  navigate: vi.fn((p: string) => { path = p }),
  pathname: () => path,
  moveTo: vi.fn(async () => {}),
  say: vi.fn(),
  dwell: async () => {},
  waitForPerson: vi.fn(async () => {}),
  ...over,
})

const show = (steps: unknown[]): GuidePlan => ({ kind: 'show', title: 'Leave', steps: steps as never })

beforeEach(() => {
  path = '/home'
  clicks.length = 0
  render(<Page />)
})
afterEach(() => vi.restoreAllMocks())

describe('Show me the way', () => {
  it('clicks the sidebar section, then the tab, then points at the button and waits for the person', async () => {
    const d = deps()
    const outcome = await runPlan(show([{ action: 'go', page: 'leave', caption: 'Open Leave' }, { action: 'point', target: 'leave.apply', caption: 'Press Ask for leave' }]), d)
    expect(outcome).toEqual({ status: 'done' })
    expect(clicks).toEqual(['section', 'tab']) // the person presses "Ask for leave" themselves
    expect(path).toBe('/leave')
    expect(d.say).toHaveBeenCalledWith('Open People')
    expect(d.say).toHaveBeenCalledWith('Then Leave & Attendance')
    expect(d.waitForPerson).toHaveBeenCalledWith(document.querySelector('[data-guide="leave.apply"]'))
    expect(d.navigate).not.toHaveBeenCalled()
  })

  it('opens the menu first on phones', async () => {
    await runPlan(show([{ action: 'go', page: 'leave' }]), deps({ desktop: false }))
    expect(clicks.slice(0, 2)).toEqual(['menu', 'section'])
  })

  it('“Take me there” goes straight to the page without the tour', async () => {
    const d = deps({ style: 'take' })
    await runPlan(show([{ action: 'go', page: 'leave' }]), d)
    expect(d.navigate).toHaveBeenCalledWith('/leave')
    expect(clicks).toEqual([])
  })
})

describe('Only safe presses', () => {
  it('opens a harmless button on the way, but never presses one that changes data', async () => {
    path = '/leave'
    await runPlan(show([{ action: 'open', target: 'leave.apply', caption: 'Open the form' }, { action: 'open', target: 'leave.send', caption: 'Send' }]), deps())
    expect(clicks).toEqual(['apply']) // leave.send is changes: true — pointed at only
  })

  it('never presses a submit button, even if the plan says open', async () => {
    path = '/leave'
    await runPlan(show([{ action: 'open', target: 'leave.mine', caption: 'x' }, { action: 'say', caption: 'done' }]), deps())
    expect(clicks).not.toContain('submit-tab')
  })

  it('types into a field when asked to fill it', async () => {
    path = '/assets'
    await runPlan(show([{ action: 'fill', target: 'assets.search', value: 'MacBook', caption: 'Type the name' }]), deps())
    expect((document.querySelector('[data-guide="assets.search"]') as HTMLInputElement).value).toBe('MacBook')
  })
})

describe('Stopping and getting stuck', () => {
  it('stops at once when the person presses Stop', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await runPlan(show([{ action: 'go', page: 'leave' }]), deps({ signal: controller.signal }))).toEqual({ status: 'stopped' })
    expect(clicks).toEqual([])
  })

  it('explains a button that isn’t on screen, using the page map’s note', async () => {
    path = '/assets/a1'
    const outcome = await runPlan(show([{ action: 'point', target: 'asset.assign', caption: 'Press Assign' }]), deps())
    expect(outcome).toEqual({ status: 'stuck', message: 'Assign isn’t on screen right now. Only while the asset is in stock.' })
  }, 10_000)
})

describe('Stop during a pause', () => {
  it('presses nothing after the person stops mid-caption', async () => {
    const controller = new AbortController()
    const outcome = await runPlan(show([{ action: 'go', page: 'leave' }]), deps({ signal: controller.signal, dwell: async () => controller.abort() }))
    expect(outcome).toEqual({ status: 'stopped' })
    expect(clicks).toEqual([]) // the sidebar section was never clicked
  })
})
