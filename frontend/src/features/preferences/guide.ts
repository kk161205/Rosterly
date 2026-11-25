import type { GuidePage } from '@/guide/types'

export const GUIDE: GuidePage[] = [
  {
    id: 'assistant',
    route: '/assistant',
    title: 'Your assistant',
    purpose: 'Pick your Guide’s design (Bolt, Sprout, Mystic, Skipper, Ember, Ranger or Blossom) and how the Guide helps you.',
    words: ['guide design', 'tile design', 'change my guide', 'tile colour', 'personalise', 'character', 'turn off guide', 'assistant settings', 'preferences', 'voice', 'microphone', 'speak'],
    visible: () => true,
    reach: 'Your name at the bottom of the sidebar, then "Your assistant".',
    targets: [
      { id: 'assistant.tile', label: 'Your Guide (tile designs)', kind: 'section', changes: false },
      { id: 'assistant.guide', label: 'Show the Guide', kind: 'field', changes: true },
      { id: 'assistant.style', label: 'How it helps', kind: 'section', changes: false },
      { id: 'assistant.voice', label: 'Voice input', kind: 'field', changes: true },
    ],
  },
]
