/** @type {import('tailwindcss').Config} */
// Colors, radii, and typography scale generated directly from
// the "Quiet Workbench" system (docs/UI_REDESIGN_PLAN.md §3, docs/DESIGN.md).
// Do not add raw hex values or one-off font sizes elsewhere in the app. If a
// needed token doesn't exist here, that's a rules.md §0 situation: ask before
// inventing one.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        // Sign-in pitch switches from stacked rows to three columns only when there is room
        wide: '1440px',
      },
      colors: {
        'ground': '#F6F5F2',
        'paper': '#FFFFFF',
        'sidebar': '#EFEEE9',
        'tint': '#E9E5DB', // sign-in pitch panel — warm stone, separates by tone alone
        'ink': '#17181C',
        'muted': '#5C6070',
        'faint': '#8A8D98',
        'line': '#E3E1DC',
        'line-soft': '#EFEDE8',
        'control': '#B9B6AE',
        'navy': '#1F2B67',
        'navy-hover': '#18215A',
        'navy-tint': '#F3F4F9',
        'row-hover': '#F0EFEB',
        'row-selected': '#ECEBE6',
        'status-ok': '#1F6B3E',
        'status-info': '#234A8C',
        'status-warn': '#8A5000',
        'status-bad': '#9E2219',
        'status-mute': '#5C6070',
        'bad-tint': '#FBF1F0',
      },
      borderRadius: {
        'pill': '9999px',
        'soft': '4px',
        'card': '12px',
      },
      fontSize: {
        'hero': ['64px', { lineHeight: '1.02', letterSpacing: '-0.025em', fontWeight: '600' }],
        'page': ['38px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
        'panel': ['24px', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '600' }],
        'section': ['16px', { lineHeight: '22px', fontWeight: '600' }],
        'body': ['14px', { lineHeight: '20px' }],
        'lead': ['15px', { lineHeight: '22px' }],
        'meta': ['13px', { lineHeight: '18px' }],
        'micro': ['12px', { lineHeight: '16px' }],
        'metric': ['40px', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '500' }],
        'intro': ['18px', { lineHeight: '1.55' }],
        'wordmark': ['19px', { lineHeight: '1', letterSpacing: '-0.01em', fontWeight: '600' }],
        'code': ['22px', { lineHeight: '1' }],
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Newsreader', 'Georgia', 'serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
