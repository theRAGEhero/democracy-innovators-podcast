import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'

test.describe('Frontend', () => {
  test('homepage shows the podcast branding', async ({ page }) => {
    await page.goto(BASE)
    await expect(page).toHaveTitle(/Democracy Innovators/)
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('episodes listing renders episodes', async ({ page }) => {
    await page.goto(`${BASE}/episodes`)
    await expect(page.locator('.episode-row').first()).toBeVisible()
  })

  test('search is reachable from the header and reports results', async ({ page }) => {
    await page.goto(BASE)
    await page.getByRole('link', { name: /search/i }).first().click()
    await expect(page).toHaveURL(/\/search/)
    await page.fill('#q', 'democracy')
    await page.getByRole('button', { name: /search/i }).click()
    await expect(page.locator('.search-results, .search-empty')).toBeVisible()
  })

  test('episode transcript labels who is speaking', async ({ page }) => {
    test.slow() // an episode page is the heaviest route to compile
    await page.goto(`${BASE}/episodes`)
    await page.locator('.episode-row h2 a').first().click()
    await page.waitForURL(/\/episode\//)
    await expect(page.locator('.episode-content')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.speaker-name').first()).toBeVisible()
    // The cast lives behind the sidebar's "Voices" tab on desktop.
    await page.getByRole('tab', { name: 'Voices' }).click()
    await expect(page.locator('.speaker-key li').first()).toBeVisible()
  })

  test('theme toggle flips the palette and survives a reload', async ({ page }) => {
    test.slow()
    await page.goto(BASE)
    await expect(page.locator('.theme-toggle')).toBeVisible()
    await page.getByRole('button', { name: /switch (to (dark|light) )?theme/i }).click()
    const chosen = await page.evaluate(() => document.documentElement.dataset.theme)
    expect(chosen).toMatch(/^(dark|light)$/)
    await page.reload()
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(chosen)
  })

  test('player offers a way back to the episode that was interrupted', async ({ page }) => {
    test.slow()
    await page.goto(`${BASE}/episodes`)
    const first = await page.locator('.episode-row h2 a').first().textContent()
    await page.locator('.episode-play-button').first().click()
    await expect(page.locator('.persistent-player')).toBeVisible()
    await expect(page.locator('.player-back')).toHaveCount(0)

    await page.locator('.episode-play-button').nth(2).click()
    await expect(page.locator('.player-back')).toBeVisible()
    await expect(page.locator('.player-back')).toHaveAttribute('aria-label', new RegExp(first!.slice(0, 25).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

    await page.locator('.player-back').click()
    await expect(page.locator('.player-identity strong')).toHaveText(first!)
  })

  test('closing the player still leaves a way back to what was playing', async ({ page }) => {
    test.slow()
    await page.goto(`${BASE}/episodes`)
    const first = await page.locator('.episode-row h2 a').first().textContent()
    await page.locator('.episode-play-button').first().click()
    await expect(page.locator('.persistent-player')).toBeVisible()

    await page.locator('.player-close').click()
    await expect(page.locator('.persistent-player')).toHaveCount(0)

    // A different episode reopens the player, and the closed one is still
    // reachable — closing is not the same as discarding.
    await page.locator('.episode-play-button').nth(2).click()
    await expect(page.locator('.player-back')).toBeVisible()
    await page.locator('.player-back').click()
    await expect(page.locator('.player-identity strong')).toHaveText(first!)
  })

  // Clicking a server-rendered play button can land before React hydrates it.
  async function startFirstEpisode(page: import('@playwright/test').Page) {
    await expect(async () => {
      await page.locator('.episode-play-button').first().click({ timeout: 5_000 })
      await expect(page.locator('.persistent-player')).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 60_000 })
  }

  for (const width of [320, 360, 390, 430]) {
    test(`player bar stays readable at ${width}px`, async ({ page }) => {
      test.slow()
      await page.setViewportSize({ width, height: 844 })
      await page.goto(`${BASE}/episodes`)
      await startFirstEpisode(page)

      const metrics = await page.evaluate(() => {
        const bar = document.querySelector('.persistent-player')!
        return {
          barOverflow: bar.scrollWidth - bar.clientWidth,
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          title: Math.round(bar.querySelector('.player-identity strong')!.getBoundingClientRect().width),
        }
      })
      expect(metrics.barOverflow).toBeLessThanOrEqual(0)
      expect(metrics.docOverflow).toBeLessThanOrEqual(1)
      // The title is the only part of the bar carrying information; it used to
      // collapse to 64px at 320px.
      expect(metrics.title).toBeGreaterThanOrEqual(110)
    })
  }

  test('player sheet carries the settings the bar cannot show', async ({ page }) => {
    test.slow()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE}/episodes`)
    await startFirstEpisode(page)

    await page.locator('.player-expand').click()
    const sheet = page.locator('.player-sheet')
    await expect(sheet).toHaveClass(/is-open/)
    // It must fit the viewport and scroll, not push past it.
    const box = await sheet.boundingBox()
    expect(box!.height).toBeLessThanOrEqual(844)

    await sheet.locator('.player-speeds button', { hasText: '1.5×' }).click()
    await expect.poll(() => page.evaluate(() => document.querySelector('audio')?.playbackRate)).toBe(1.5)
    await expect(sheet.locator('.player-speeds button[aria-pressed="true"]')).toHaveText('1.5×')

    await page.keyboard.press('Escape')
    await expect(sheet).not.toHaveClass(/is-open/)
  })

  test('skipping moves playback by fifteen seconds', async ({ page }) => {
    test.slow()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE}/episodes`)
    await startFirstEpisode(page)
    await expect.poll(() => page.evaluate(() => document.querySelector('audio')?.readyState ?? 0)).toBeGreaterThan(0)

    await page.evaluate(() => { document.querySelector('audio')!.currentTime = 300 })
    await page.locator('.player-expand').click()
    await page.locator('.player-sheet .player-skip').first().click()
    // A playing episode also advances on its own, hence the window rather than
    // an exact value.
    await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('audio')!.currentTime))).toBeGreaterThan(280)
    const back = await page.evaluate(() => Math.round(document.querySelector('audio')!.currentTime))
    expect(back).toBeLessThan(292)
  })

  test('sitemap lists episode URLs', async ({ request }) => {
    const response = await request.get(`${BASE}/sitemap.xml`)
    expect(response.ok()).toBeTruthy()
    expect(await response.text()).toContain('/episode/')
  })

  for (const width of [360, 390, 430, 768, 1280, 1440]) {
    test(`core shell has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 900 })
      await page.goto(BASE)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
      await expect(page.locator('.site-header')).toBeVisible()
      if (width <= 620) await expect(page.locator('.mobile-platform-bar')).toBeVisible()
    })
  }

  test('mobile navigation opens and closes with Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE)
    const menu = page.getByRole('button', { name: /menu/i })
    await menu.click()
    const nav = page.getByRole('navigation', { name: 'Primary navigation' })
    await expect(nav).toBeVisible()
    // The open menu must cover the viewport, not be clipped to the header: a
    // containing block on the header once left it 41px tall with only the
    // first link on screen.
    const box = await nav.boundingBox()
    expect(box!.height).toBeGreaterThan(400)
    for (const label of ['Episodes', 'Listen', 'Contact']) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeInViewport()
    }
    await page.keyboard.press('Escape')
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
  })

  test('archive assistant opens contextually from search and restores focus', async ({ page }) => {
    await page.goto(`${BASE}/search`)
    const trigger = page.getByRole('button', { name: /ask the archive/i }).first()
    const dialog = page.getByRole('dialog', { name: 'Archive assistant' })
    // The trigger is server-rendered, so against a cold dev server a click can
    // land before React has attached the handler. Retry until it takes.
    await expect(async () => {
      if (!(await dialog.isVisible())) await trigger.click()
      await expect(dialog).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 30_000 })
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  })
})
