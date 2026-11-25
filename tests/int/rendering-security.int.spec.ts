import { describe, expect, it, vi } from 'vitest'

import { serializeJsonLd } from '@/lib/json-ld'
import { sanitizeEpisodeHtml } from '@/lib/sanitize-episode-html'

describe('browser output security', () => {
  it('serializes JSON-LD without permitting an HTML script terminator', () => {
    const value = { name: 'episode</script><svg onload="executed">&more' }
    const serialized = serializeJsonLd(value)
    expect(serialized).not.toContain('</script>')
    expect(serialized).toContain('\\u003c/script\\u003e')
    expect(JSON.parse(serialized)).toEqual(value)
  })

  it('removes active imported HTML while preserving transcript markup', () => {
    const input = [
      '<p id="intro" class="speaker">Alessandro Oppo (00:00)</p>',
      '<p>Hello <strong>world</strong> <a href="https://example.org" target="_blank">link</a>.</p>',
      '<script>executed()</script><svg onload="executed"></svg>',
      '<a href="javascript:executed()">bad link</a>',
      '<iframe src="https://evil.example/embed"></iframe>',
      '<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/abc123" title="Episode video" allowfullscreen></iframe></div>',
    ].join('')
    const output = sanitizeEpisodeHtml(input)

    expect(output).toContain('<p id="intro" class="speaker">')
    expect(output).toContain('<strong>world</strong>')
    expect(output).toContain('href="https://example.org"')
    expect(output).toContain('https://www.youtube-nocookie.com/embed/abc123')
    expect(output).not.toContain('<script')
    expect(output).not.toContain('<svg')
    expect(output).not.toContain('onload')
    expect(output).not.toContain('javascript:')
    expect(output).not.toContain('evil.example')
  })
})

describe('public health errors', () => {
  it('does not expose database configuration or driver errors', async () => {
    const original = process.env.DATABASE_URL
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.DATABASE_URL = 'file://dummy-user:dummy-password@bad-host.invalid/database'
    vi.resetModules()
    try {
      const { GET } = await import('@/app/(payload)/api/health/route')
      const response = await GET()
      expect(response.status).toBe(503)
      const body = await response.json()
      expect(body.error).toBe('database unreachable')
      expect(JSON.stringify(body)).not.toContain('dummy-password')
      expect(JSON.stringify(body)).not.toContain('bad-host')
    } finally {
      process.env.DATABASE_URL = original
      log.mockRestore()
      vi.resetModules()
    }
  })
})
