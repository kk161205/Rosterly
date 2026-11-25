import { beforeEach, describe, expect, it } from 'vitest'
import { greetingText, nextGreeting } from '@/guide/greeting'

const user = { id: 'u', full_name: 'Asha Rao' }

describe('The Guide greeting', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('says hello the first time, welcome back on a new visit', () => {
    expect(greetingText('first', 'Asha')).toBe('Hello, Asha')
    expect(greetingText('visit', 'Asha')).toBe('Welcome back, Asha')
    expect(greetingText('visit', '')).toBe('Welcome back')
  })

  it('greets once a visit and stays quiet after that', () => {
    expect(nextGreeting(user)).toBe('Hello, Asha')
    expect(nextGreeting(user)).toBe('')
    sessionStorage.clear() // a new visit
    expect(nextGreeting(user)).toBe('Welcome back, Asha')
    expect(nextGreeting(user)).toBe('')
  })
})
