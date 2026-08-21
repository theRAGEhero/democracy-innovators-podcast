// Some imported episodes have the YouTube video as a bare link paragraph rather
// than an embed. Convert those standalone links into a responsive, privacy-
// friendly (youtube-nocookie) iframe. Existing <iframe> embeds are left as-is.

function embedMarkup(id: string): string {
  return (
    `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" ` +
    `title="Episode video" loading="lazy" frameborder="0" ` +
    `allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
    `allowfullscreen></iframe></div>`
  )
}

// Pull the YouTube video id from the stored videoUrl, falling back to any
// embed/link already in the episode HTML.
export function extractYouTubeId(videoUrl?: string | null, html?: string | null): string | null {
  for (const source of [videoUrl || '', html || '']) {
    const m = source.match(
      /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|v\/))([A-Za-z0-9_-]{6,})/,
    )
    if (m) return m[1]
  }
  return null
}

export function extractCastopodEpisodeUrl(html?: string | null): string | null {
  const match = (html || '').match(/https:\/\/podcast\.democracyinnovators\.com\/@[^/]+\/episodes\/[^"'/?#]+/i)
  return match?.[0] || null
}

export function embedYouTube(html: string): string {
  if (!html) return html
  let out = html

  // <p> wrapping a single <a> to a YouTube URL.
  out = out.replace(
    /<p>(?:\s|&nbsp;)*<a\s+href="https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)([A-Za-z0-9_-]{6,})[^"]*"[^>]*>[^<]*<\/a>(?:\s|&nbsp;)*<\/p>/gi,
    (_m, id) => embedMarkup(id),
  )

  // <p> containing a bare YouTube URL (no anchor).
  out = out.replace(
    /<p>(?:\s|&nbsp;)*https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)([A-Za-z0-9_-]{6,})[^<\s]*(?:\s|&nbsp;)*<\/p>/gi,
    (_m, id) => embedMarkup(id),
  )

  return out
}

// Imported episode HTML carries donate links pointing straight at PayPal (two
// variants, with and without a ?ref query). Route them through /paypal so the
// address can be changed in one place — see app/(frontend)/paypal/route.ts.
export function rewriteSupportLinks(html: string): string {
  if (!html) return html
  return html.replace(/href="https?:\/\/(?:www\.)?paypal\.com\/[^"]*"/gi, 'href="/paypal"')
}
