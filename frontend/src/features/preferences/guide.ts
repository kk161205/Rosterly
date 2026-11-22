import type { GuidePage } from '@/guide/types'

export const GUIDE: GuidePage[] = [
  {
    id: 'assistant',
    route: '/assistant',
    title: 'Your assistant',
    purpose: 'Your colour for the app and the Guide, and how the Guide helps you.',
    words: ['colour', 'color', 'theme', 'personalise', 'turn off guide', 'assistant settings', 'preferences', 'voice', 'microphone', 'speak'],
    visible: () => true,
    reach: 'Your name at the bottom of the sidebar, then "Your assistant".',
    targets: [
      { id: 'assistant.colour', label: 'Colour', kind: 'section', changes: false },
      { id: 'assistant.guide', label: 'Show the Guide', kind: 'field', changes: true },
      { id: 'assistant.style', label: 'How it helps', kind: 'section', changes: false },
      { id: 'assistant.voice', label: 'Voice input', kind: 'field', changes: true },
    ],
  },
]
