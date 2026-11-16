// The episode email.
//
// Plain template literals, not React Email or MJML: no extra dependency in a
// container capped at 1GB, byte-stable output so the preview is exactly what
// gets stored and sent, and rss.xml already builds markup this way.
//
// Email HTML is its own medium. Tables for layout, inline styles on anything
// structural (Gmail strips <style> in some contexts), colours as literals
// because var() is unsupported, system fonts only, and absolutely no
// JavaScript, web fonts, background images or tracking pixel. The one <style>
// block carries the dark-mode and narrow-screen overrides, which need
// !important to beat the inline styles — that is the trick that makes both
// possible at once.

import { formatTimestamp } from '@/lib/chapters'
import { episodeLabel } from '@/lib/episode-number'
import { escapeHtml } from '@/lib/html-escape'
import { metaDescription } from '@/lib/seo'
import { transcriptExcerpt, type ExcerptSource, type ExcerptTurn } from '@/lib/transcript-excerpt'
import type { Episode, Guest } from '@/payload-types'

/** Substituted per recipient by the send worker. The stored body carries the
 *  placeholder, so one rendering serves every subscriber. */
export const UNSUBSCRIBE_PLACEHOLDER = '{{unsubscribe_url}}'
export const CONSENT_DATE_PLACEHOLDER = '{{consent_date}}'

/** Gmail truncates the HTML part around 102,000 bytes and hides everything
 *  after the cut — including the unsubscribe footer. Refuse well short of it. */
export const MAX_HTML_BYTES = 90_000

export type MailingContent = {
  subject: string
  preheader: string
  html: string
  text: string
  excerptSource: ExcerptSource
  htmlBytes: number
}

const LIGHT = {
  paper: '#fbfbfa',
  card: '#ffffff',
  ink: '#191c20',
  muted: '#667079',
  blue: '#255a78',
  rule: '#e8e6e1',
  onAccent: '#ffffff',
}

const SERIF = "Georgia,'Times New Roman',serif"
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

/** A relative src is a broken image in every mail client, and most episodes
 *  store a relative path while some legacy ones are already absolute. */
function absolute(url: string, origin: string): string {
  return /^https?:\/\//.test(url) ? url : `${origin}${url.startsWith('/') ? '' : '/'}${url}`
}

const HEAD_STYLE = `
    /* Inline styles win over a plain rule, so these have to shout. */
    @media (prefers-color-scheme: dark) {
      .e-paper { background-color: #14171c !important; }
      .e-card { background-color: #1c2027 !important; }
      .e-ink { color: #e9e7e2 !important; }
      .e-ink a { color: #86b6d4 !important; }
      .e-muted { color: #9aa3ad !important; }
      .e-blue { color: #86b6d4 !important; }
      .e-rule { border-color: #2b323b !important; }
      .e-btn { background-color: #86b6d4 !important; }
      .e-btn a { color: #10141a !important; }
    }
    @media (max-width: 620px) {
      .e-pad { padding-left: 18px !important; padding-right: 18px !important; }
      .e-title { font-size: 24px !important; }
    }`

function shell({ subject, preheader, body, origin }: {
  subject: string
  preheader: string
  body: string
  origin: string
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>${HEAD_STYLE}
</style>
</head>
<body class="e-paper" style="margin:0;padding:0;background-color:${LIGHT.paper};-webkit-text-size-adjust:100%">
<span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:${LIGHT.paper}">${escapeHtml(preheader)}${'&zwnj;&nbsp;'.repeat(60)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-paper" style="background-color:${LIGHT.paper}">
<tr><td align="center" style="padding:24px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="e-card" style="width:100%;max-width:600px;background-color:${LIGHT.card};border-collapse:collapse">
${body}
<tr><td class="e-pad e-rule" style="padding:22px 36px 30px;border-top:1px solid ${LIGHT.rule}">
<p class="e-muted" style="margin:0 0 8px;font:400 12px/1.6 ${SANS};color:${LIGHT.muted}">
You are receiving this because you subscribed to the Democracy Innovators Podcast newsletter on ${CONSENT_DATE_PLACEHOLDER}.
</p>
<p class="e-muted" style="margin:0;font:400 12px/1.6 ${SANS};color:${LIGHT.muted}">
<a href="${UNSUBSCRIBE_PLACEHOLDER}" class="e-blue" style="color:${LIGHT.blue}">Unsubscribe</a>
&nbsp;·&nbsp;<a href="${origin}/privacy" class="e-blue" style="color:${LIGHT.blue}">Privacy notice</a>
&nbsp;·&nbsp;<a href="${origin}" class="e-blue" style="color:${LIGHT.blue}">democracyinnovators.com</a>
</p>
<p class="e-muted" style="margin:10px 0 0;font:400 12px/1.6 ${SANS};color:${LIGHT.muted}">
No opens, clicks or anything else about you is tracked in this email.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function masthead(origin: string): string {
  return `<tr><td class="e-pad e-rule" style="padding:26px 36px 20px;border-bottom:1px solid ${LIGHT.rule}">
<a href="${origin}" class="e-blue" style="font:700 12px/1 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${LIGHT.blue};text-decoration:none">Democracy Innovators</a>
</td></tr>`
}

function cover(episode: Episode, origin: string, title: string): string {
  const src = episode.featureImageUrl || episode.squareCoverUrl
  if (!src) return ''
  return `<tr><td style="padding:0">
<a href="${origin}/episode/${encodeURIComponent(episode.slug)}"><img src="${escapeHtml(absolute(src, origin))}" width="600" alt="${escapeHtml(`${title} cover art`)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none"></a>
</td></tr>`
}

function turnRows(turns: ExcerptTurn[], episodeUrl: string): string {
  return turns
    .map((turn) => {
      const cue = turn.speaker
        ? `<div style="margin:0 0 6px"><span class="e-blue" style="font:700 11px/1.4 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${LIGHT.blue}">${escapeHtml(turn.speaker)}</span>${
            turn.startTime === null
              ? ''
              : ` <a href="${episodeUrl}?t=${turn.startTime}" class="e-muted" style="font:400 11px/1.4 ${SANS};color:${LIGHT.muted};text-decoration:none">${formatTimestamp(turn.startTime)}</a>`
          }</div>`
        : ''
      return `<tr><td class="e-pad" style="padding:0 36px 16px">${cue}<div class="e-ink" style="font:400 16px/1.65 ${SERIF};color:${LIGHT.ink}">${escapeHtml(turn.text)}</div></td></tr>`
    })
    .join('\n')
}

function cta(href: string, label: string): string {
  return `<tr><td class="e-pad" style="padding:10px 36px 30px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="e-btn" align="center" style="background-color:${LIGHT.blue};border-radius:2px">
<a href="${href}" style="display:block;padding:14px 24px;font:700 13px/1 ${SANS};letter-spacing:.04em;color:${LIGHT.onAccent};text-decoration:none">${escapeHtml(label)}</a>
</td></tr></table>
</td></tr>`
}

function textFooter(origin: string): string {
  return [
    '',
    '--',
    `You are receiving this because you subscribed to the Democracy Innovators Podcast newsletter on ${CONSENT_DATE_PLACEHOLDER}.`,
    `Unsubscribe: ${UNSUBSCRIBE_PLACEHOLDER}`,
    `Privacy notice: ${origin}/privacy`,
    'No opens, clicks or anything else about you is tracked in this email.',
  ].join('\n')
}

function guestNames(episode: Episode): string[] {
  const guests = (episode.guests || []) as (number | Guest)[]
  return guests
    .map((guest) => (typeof guest === 'object' && guest && 'name' in guest ? String(guest.name) : ''))
    .filter(Boolean)
}

function finish(parts: { subject: string; preheader: string; html: string; text: string; excerptSource: ExcerptSource }): MailingContent {
  return {
    ...parts,
    // Bytes, not .length: the transcripts carry names like Wetherall-Grujić and
    // whole Italian episodes, so characters and bytes are not the same number.
    htmlBytes: Buffer.byteLength(parts.html, 'utf8'),
  }
}

export function renderEpisodeMailing({ episode, origin }: { episode: Episode; origin: string }): MailingContent {
  const title = String(episode.title || 'New episode')
  const label = episodeLabel(episode)
  const subject = label ? `Episode ${label}: ${title}` : title
  const episodeUrl = `${origin}/episode/${encodeURIComponent(episode.slug)}`
  const excerpt = transcriptExcerpt(String(episode.transcriptText || ''), { knownNames: guestNames(episode) })
  const preheader = metaDescription(episode.excerpt) || `The opening of the transcript, and a link to the rest.`

  const intro = episode.excerpt
    ? `<tr><td class="e-pad" style="padding:0 36px 22px"><p class="e-ink" style="margin:0;font:400 17px/1.6 ${SERIF};color:${LIGHT.ink}">${escapeHtml(String(episode.excerpt))}</p></td></tr>`
    : ''

  const html = shell({
    subject,
    preheader,
    origin,
    body: [
      masthead(origin),
      cover(episode, origin, title),
      `<tr><td class="e-pad" style="padding:28px 36px 0">
${label ? `<p class="e-muted" style="margin:0 0 10px;font:700 11px/1 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${LIGHT.muted}">Episode ${escapeHtml(label)}</p>` : ''}
<h1 class="e-title e-ink" style="margin:0 0 18px;font:400 28px/1.25 ${SERIF};color:${LIGHT.ink}"><a href="${episodeUrl}" class="e-ink" style="color:${LIGHT.ink};text-decoration:none">${escapeHtml(title)}</a></h1>
</td></tr>`,
      intro,
      excerpt.turns.length
        ? `<tr><td class="e-pad e-rule" style="padding:4px 36px 18px"><p class="e-muted" style="margin:0;padding-top:16px;border-top:1px solid ${LIGHT.rule};font:700 11px/1 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${LIGHT.muted}">From the transcript</p></td></tr>\n${turnRows(excerpt.turns, episodeUrl)}`
        : '',
      cta(episodeUrl, excerpt.truncated ? 'Read the full transcript →' : 'Listen and read →'),
    ].filter(Boolean).join('\n'),
  })

  const text = [
    label ? `EPISODE ${label}` : 'NEW EPISODE',
    title,
    '',
    episode.excerpt ? `${String(episode.excerpt)}\n` : '',
    excerpt.turns.length ? 'FROM THE TRANSCRIPT\n' : '',
    ...excerpt.turns.map((turn) => {
      const cue = turn.speaker
        ? `${turn.speaker}${turn.startTime === null ? '' : ` (${formatTimestamp(turn.startTime)})`}`
        : ''
      return `${cue ? `${cue}\n` : ''}${turn.text}\n`
    }),
    excerpt.truncated ? `Read the full transcript: ${episodeUrl}` : `Listen and read: ${episodeUrl}`,
    textFooter(origin),
  ].filter((line) => line !== '').join('\n')

  return finish({ subject, preheader, html, text, excerptSource: excerpt.source })
}

export function renderAnnouncementMailing({ title, paragraphs, origin }: {
  title: string
  paragraphs: string[]
  origin: string
}): MailingContent {
  const body = paragraphs.filter(Boolean)
  const preheader = metaDescription(body[0]) || title

  const html = shell({
    subject: title,
    preheader,
    origin,
    body: [
      masthead(origin),
      `<tr><td class="e-pad" style="padding:28px 36px 18px">
<h1 class="e-title e-ink" style="margin:0;font:400 28px/1.25 ${SERIF};color:${LIGHT.ink}">${escapeHtml(title)}</h1>
</td></tr>`,
      ...body.map(
        (paragraph) =>
          `<tr><td class="e-pad" style="padding:0 36px 18px"><p class="e-ink" style="margin:0;font:400 17px/1.65 ${SERIF};color:${LIGHT.ink}">${escapeHtml(paragraph)}</p></td></tr>`,
      ),
      cta(`${origin}/episodes`, 'Browse the episodes →'),
    ].join('\n'),
  })

  const text = [title, '', ...body.flatMap((paragraph) => [paragraph, '']), `${origin}/episodes`, textFooter(origin)].join('\n')

  return finish({ subject: title, preheader, html, text, excerptSource: 'plain' })
}
