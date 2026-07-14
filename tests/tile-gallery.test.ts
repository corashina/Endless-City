import { describe, expect, it } from 'vitest'
import { galleryItems } from '../tools/tiles/gallery'

describe('remix tile gallery manifest', () => {
  it('lists all 12 unique generated URLs with readable labels', () => {
    const items = galleryItems()
    expect(items).toHaveLength(12)
    expect(new Set(items.map(({ url }) => url)).size).toBe(12)
    expect(items.every(({ id, label, url }) =>
      label.length > 0 && url === `/clusters/${id}.glb`,
    )).toBe(true)
  })
})
