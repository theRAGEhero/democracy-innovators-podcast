// Links mentioned inside a conversation.
//
// The structured fields the episode page used to read (guests.officialLinks,
// organizations.website, projects.website) are empty across the whole archive,
// so the "useful links" block never rendered for any episode. The transcripts
// themselves do carry the occasional outbound link, and those are exactly the
// references a guest gave on air — so they are worth surfacing.

export type UsefulLink = { label: string; url: string }

// Everything the site puts in every episode by default: the audio embed, the
// video embed, the donate button, the site's own pages.
const BOILERPLATE = /(paypal\.com|youtube\.com|youtu\.be|ytimg\.com|podcast\.democracyinnovators\.com|democracyinnovators\.com)/i

const ANCHOR = /<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi

function decode(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Host plus first path segment, for when the anchor text is just the URL. */
function fallbackLabel(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    const segment = parsed.pathname.split('/').filter(Boolean)[0]
    return segment ? `${host}/${segment}` : host
  } catch {
    return url
  }
}

export function transcriptLinks(html: string | null | undefined): UsefulLink[] {
  if (!html) return []
  const out: UsefulLink[] = []
  const seen = new Set<string>()
  ANCHOR.lastIndex = 0
  for (let match = ANCHOR.exec(html); match; match = ANCHOR.exec(html)) {
    const [, url, inner] = match
    if (BOILERPLATE.test(url) || seen.has(url)) continue
    seen.add(url)
    const text = decode(inner)
    // Anchor text that is just the href (or a truncated version of it) tells
    // the reader nothing more than the URL does.
    const label = !text || url.startsWith(text.slice(0, 20)) ? fallbackLabel(url) : text.slice(0, 90)
    out.push({ label, url })
  }
  return out
}
