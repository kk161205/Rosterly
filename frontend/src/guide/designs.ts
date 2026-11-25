/**
 * The Guide tile's looks. Each person picks one on "Your assistant"; it only
 * changes the tile, never the rest of the app.
 *
 * The ids are what the API stores (the old colour ids, kept so saved choices
 * still work); people only ever see the names.
 */
export const TILE_DESIGNS = [
  { id: 'navy', name: 'Bolt', blurb: 'Always in a rush' },
  { id: 'sage', name: 'Sprout', blurb: 'Calm, curious' },
  { id: 'lavender', name: 'Mystic', blurb: 'Quietly wise' },
  { id: 'dusk', name: 'Skipper', blurb: 'Steady at the helm' },
  { id: 'peach', name: 'Ember', blurb: 'Warm and bright' },
  { id: 'sand', name: 'Ranger', blurb: 'Ready to explore' },
  { id: 'rose', name: 'Blossom', blurb: 'Gentle and kind' },
] as const

export type TileDesignId = (typeof TILE_DESIGNS)[number]['id']

export const DEFAULT_DESIGN: TileDesignId = 'navy'

export function tileDesign(id: string | undefined) {
  return TILE_DESIGNS.find((d) => d.id === id) ?? TILE_DESIGNS[0]
}
