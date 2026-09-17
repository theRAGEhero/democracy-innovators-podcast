import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'

// The citation -> playback path had no coverage, which is how a bug that
// stopped every cited moment from playing survived to production. The player
// is exercised elsewhere through .episode-play-button, but that button never
// passes a start position, and passing one was the whole defect.

const AUDIO_URL = 'https://audio.test/fixture.wav'
const START_AT = 1.5

/** Three seconds of silence: 8-bit mono PCM at 8 kHz, small enough to inline
 *  and long enough to seek into. */
function wav(seconds = 3, rate = 8000) {
  const samples = seconds * rate
  const buffer = Buffer.alloc(44 + samples)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate, 28)
  buffer.writeUInt16LE(1, 32)
  buffer.writeUInt16LE(8, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples, 40)
  buffer.fill(128, 44) // 8-bit PCM silence sits at the midpoint, not at zero
  return buffer
}

/** One citation carrying a start position, framed the way the route streams it. */
function citationStream() {
  const citations = [
    {
      label: 'S1',
      title: 'A test conversation',
      url: '/episode/test-episode',
      snippet: 'the passage that was quoted',
      score: 0.9,
      startTime: START_AT,
      speaker: 'A Guest',
      episode: {
        id: 1,
        slug: 'test-episode',
        title: 'A test conversation',
        audioUrl: AUDIO_URL,
        coverUrl: null,
        chapters: [],
      },
    },
  ]
  return [
    `event: citations\ndata: ${JSON.stringify({ citations, provider: 'test', model: 'test' })}\n\n`,
    `event: token\ndata: ${JSON.stringify({ text: 'A cited answer.' })}\n\n`,
    `event: done\ndata: {}\n\n`,
  ].join('')
}

test.describe('Archive assistant', () => {
  test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

  test('a cited moment plays, and plays from the cited second', async ({ page }) => {
    test.slow()

    await page.route('**/api/chatbot', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
        body: citationStream(),
      }),
    )
    await page.route(AUDIO_URL, (route) =>
      route.fulfill({ status: 200, headers: { 'content-type': 'audio/wav' }, body: wav() }),
    )

    await page.goto(BASE)
    await page.locator('.assistant-bubble').click()
    await page.fill('#archive-question', 'what did anyone say about democracy')
    await page.getByRole('button', { name: 'Send question' }).click()

    // The button names the moment, which is also the label that used to read
    // "Listen at 0:00" for a citation at second zero.
    const listen = page.getByRole('button', { name: /^Listen at/ })
    await expect(listen).toBeVisible({ timeout: 30_000 })
    await listen.click()

    await expect(page.locator('.persistent-player')).toBeVisible()

    // The real assertion: the audio is running, and it is running from the
    // cited second rather than the top of the episode.
    await expect
      .poll(async () => page.evaluate(() => document.querySelector('audio')?.currentTime ?? 0), {
        timeout: 15_000,
      })
      .toBeGreaterThan(START_AT)

    expect(await page.evaluate(() => document.querySelector('audio')?.paused)).toBe(false)
  })

  test('the drawer does not cover the player it just started', async ({ page }) => {
    test.slow()
    await page.route('**/api/chatbot', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
        body: citationStream(),
      }),
    )
    await page.route(AUDIO_URL, (route) =>
      route.fulfill({ status: 200, headers: { 'content-type': 'audio/wav' }, body: wav() }),
    )

    await page.setViewportSize({ width: 390, height: 780 })
    await page.goto(BASE)
    await page.locator('.assistant-bubble').click()
    await page.fill('#archive-question', 'anything')
    await page.getByRole('button', { name: 'Send question' }).click()
    await page.getByRole('button', { name: /^Listen at/ }).click({ timeout: 30_000 })

    const player = page.locator('.persistent-player')
    await expect(player).toBeVisible()
    const bar = await player.boundingBox()
    const drawer = await page.locator('.assistant-drawer').boundingBox()
    // The drawer stays open on purpose; it must stop above the bar.
    expect(bar).not.toBeNull()
    expect(drawer).not.toBeNull()
    expect(drawer!.y + drawer!.height).toBeLessThanOrEqual(bar!.y + 1)
  })
})
