import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/*
 * tailwind-merge only knows Tailwind's default scale. Our named font sizes
 * (text-lead, text-meta…) would otherwise be read as text colours and knock
 * out the real colour class (e.g. text-paper on a primary button).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'hero', 'page', 'panel', 'section', 'body', 'lead', 'meta', 'micro', 'metric', 'intro', 'wordmark',
            'code', 'display-lg', 'headline-lg', 'headline-lg-mobile', 'title-md', 'body-md', 'body-sm',
            'label-caps', 'code-sm',
          ],
        },
      ],
      rounded: [{ rounded: ['pill', 'soft', 'card'] }],
    },
  },
})

/** Merge class names; later Tailwind classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
