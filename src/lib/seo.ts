// Small SEO helpers: meta description truncation and JSON-LD builders.

const META_DESCRIPTION_LIMIT = 158

// Search engines cut descriptions around 155-160 chars. Trim on a word boundary
// so the snippet reads as a sentence rather than a hard cut.
export function metaDescription(value?: string | null): string | undefined {
  const text = (value || '').replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  if (text.length <= META_DESCRIPTION_LIMIT) return text
  const clipped = text.slice(0, META_DESCRIPTION_LIMIT)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${(lastSpace > 80 ? clipped.slice(0, lastSpace) : clipped).replace(/[,;:.\s]+$/, '')}…`
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

export function collectionJsonLd(opts: {
  url: string
  name: string
  items: { name: string; url: string }[]
}): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url: opts.url,
    name: opts.name,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: opts.items.length,
      itemListElement: opts.items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        url: item.url,
      })),
    },
  }
}
