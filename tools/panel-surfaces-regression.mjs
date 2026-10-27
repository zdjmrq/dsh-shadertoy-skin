import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const harness = await startHarness()
const output = new URL('../docs/verify/panel-surfaces/', import.meta.url)
await mkdir(output, { recursive: true })
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let panel
  const load = async () => {
    await page.goto(harness.url)
    await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
    panel = page.frames().find(frame => frame.url().includes('panel.html'))
    await panel.waitForSelector('#preset-dd .dd-trigger')
    await panel.click('#tab-code')
    await panel.waitForFunction(() => document.querySelector('#code-image').value.includes('mainImage'))
  }
  const heights = () => panel.evaluate(() => ['image', 'sound'].map(id => document.querySelector('#code-' + id).offsetHeight))
  const key = 'shadertoy-skin.codeHeights'
  await load()
  assert.deepEqual(await heights(), [360, 360], 'fresh Image and Sound editors have equal defaults')
  await panel.evaluate(key => localStorage.setItem(key, JSON.stringify({ image: 480, sound: 90 })), key)
  await load()
  assert.deepEqual(await heights(), [480, 480], 'legacy Sound size migrates to the current Image size')
  assert.equal(await panel.evaluate(key => JSON.parse(localStorage.getItem(key)).version, key), 2)
  await panel.locator('.code-grip').nth(1).press('ArrowDown')
  await load()
  assert.deepEqual(await heights(), [480, 496], 'subsequent independent user sizes survive reload')
  await panel.locator('.code-card').first().getByRole('button', { name: '收起', exact: true }).click()
  await panel.locator('.code-grip').nth(1).press('ArrowDown')
  await load()
  assert.deepEqual(await heights(), [480, 512], 'resizing Sound must not lose a collapsed Image size')
  for (const grip of await panel.locator('.code-grip').all()) await grip.dblclick()
  assert.deepEqual(await heights(), [360, 360], 'both grips reset to the same default')
  console.log('ok    equal defaults, legacy height migration, independent persistence and collapsed editor sizes')

  // Use a busy, audible work so the screenshots exercise both real code panes.
  await panel.click('#tab-params')
  await panel.click('#preset-dd .dd-trigger')
  await panel.press('#preset-dd .dd-trigger', 'End')
  await panel.press('#preset-dd .dd-trigger', 'Enter')
  await panel.waitForFunction(() => document.querySelector('#preset-dd .dd-trigger').textContent.includes('马里奥'))
  await panel.check('#muted')

  const alpha = async selector => panel.locator(selector).first().evaluate(node => {
    const color = getComputedStyle(node).backgroundColor
    return color.startsWith('rgba(') ? Number(color.slice(5, -1).split(',')[3]) : 1
  })
  const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name + '.png', output)) })
  // A known backdrop proves the iframe actually composites through; computed
  // CSS alone misses Chromium's opaque color-scheme fallback canvas.
  const backdropPixel = async () => {
    const png = (await page.screenshot({ clip: { x: 190, y: 10, width: 1, height: 1 } })).toString('base64')
    return page.evaluate(async png => {
      const image = new Image()
      image.src = 'data:image/png;base64,' + png
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0)
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }, png)
  }
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
    await panel.waitForFunction(dark => document.documentElement.dataset.theme === (dark ? 'dark' : 'light'), dark)
    for (const [index, mode] of ['opaque', 'half', 'clear'].entries()) {
      await panel.click('#tab-params')
      await panel.fill('#glass', '60')
      await panel.click('#panels-dd .dd-trigger')
      await panel.locator('#panels-dd .dd-item').nth(index).click()
      const glass = mode !== 'opaque'
      assert.equal(await panel.getAttribute('html', 'data-panels'), mode)
      assert.equal(await alpha('body'), glass ? 0 : 1)
      assert.equal(await alpha('.settings-card'), glass ? (mode === 'half' ? .6 : 0) : 1)
      if (glass) {
        const before = await panel.locator('#blur').boundingBox()
        await panel.click('#panels-dd .dd-trigger')
        assert.equal(await panel.locator('#panels-dd .dd-menu').evaluate(node => getComputedStyle(node).position), 'relative')
        assert.ok((await panel.locator('#blur').boundingBox()).y > before.y + 50, 'transparent options push following controls down instead of overlapping text')
        await panel.press('#panels-dd .dd-trigger', 'Escape')
      }
      await page.evaluate(() => {
        document.querySelector('#main').style.background = 'rgb(190, 75, 50)'
      })
      if (glass) assert.deepEqual(await backdropPixel(), [190, 75, 50], 'the parent backdrop must show through the iframe canvas')
      // Also exercise parent Canvas scheme changes without reloading the iframe.
      await page.evaluate(dark => { document.documentElement.style.colorScheme = dark ? 'dark' : 'light' }, dark)
      // The theme observer sees the same DOM attribute as DSH; force a theme
      // round-trip to refresh the embedding scheme after the test-only change.
      await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', !dark), dark)
      await panel.waitForFunction(dark => document.documentElement.dataset.theme !== (dark ? 'dark' : 'light'), dark)
      await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
      await panel.waitForFunction(dark => document.documentElement.dataset.theme === (dark ? 'dark' : 'light'), dark)
      if (glass) assert.deepEqual(await backdropPixel(), [190, 75, 50])
      await page.evaluate(() => { document.querySelector('#main').style.background = '' })
      if (dark && mode === 'half') await screenshot('settings-dark-half')
      if (!dark && mode === 'clear') {
        await panel.fill('#glass', '20')
        const player = page.frames().find(frame => frame.url().includes('player.html'))
        await player.waitForFunction(() => document.querySelector('#diag').textContent.includes('/0.18'))
        await screenshot('settings-light-clear')
        await panel.fill('#glass', '60')
      }
      await panel.click('#tab-library')
      assert.equal(await alpha('.import-box'), glass ? (mode === 'half' ? .6 : 0) : 1)
      assert.equal(await alpha('.item'), glass ? (mode === 'half' ? .6 : 0) : 1)
      if (!dark && mode === 'clear') await screenshot('library-light-clear')
      await panel.click('#tab-code')
      for (const id of ['image', 'sound']) {
        assert.equal(await alpha(`#code-${id}-frame`), glass ? 0 : 1, 'no double-stacked code fill')
        await panel.click(`[data-focus="code-${id}"]`)
        assert.equal(await alpha('.code-card.focused'), glass ? (mode === 'half' ? .6 : 0) : 1)
        assert.equal(await panel.locator('#view-code > .head').evaluate(node => getComputedStyle(node).visibility), 'hidden', 'focus must not show underlying text')
        assert.ok(await panel.locator('.focused .editor-focus-save').isVisible())
        if (dark && mode === 'clear' && id === 'sound') await screenshot('sound-focus-dark-clear')
        await page.keyboard.press('Escape')
        assert.deepEqual(await heights(), [360, 360])
      }
      assert.equal(await alpha('#view-code > .actions'), glass ? (mode === 'half' ? .6 : 0) : 1)
      assert.equal(await alpha('#code-save'), glass ? 0 : 1, 'primary actions respect transparent surfaces too')
      assert.equal(await panel.locator('#code-save').evaluate(node => getComputedStyle(node).color), glass ? (dark ? 'rgb(249, 250, 251)' : 'rgb(15, 17, 21)') : (dark ? 'rgb(21, 21, 23)' : 'rgb(255, 255, 255)'), 'primary button text stays solid')
    }
  }
  console.log('ok    settings, library, code, sticky actions and both focused editors across six theme/transparency combinations')

  await panel.click('#tab-params')
  await panel.fill('#glass', '20')
  assert.equal(await alpha('.settings-card'), 0, 'clear remains fully transparent even at the lowest slider value')
  await panel.click('#panels-dd .dd-trigger')
  await panel.locator('#panels-dd .dd-item').nth(1).click()
  assert.equal(await alpha('.settings-card'), .2, 'half opacity follows the slider exactly')
  await panel.uncheck('#enabled')
  assert.equal(await panel.getAttribute('html', 'data-panels'), 'opaque')
  assert.equal(await alpha('body'), 1)
  assert.equal(await alpha('.settings-card'), 1)
  await panel.check('#enabled')
  await panel.fill('#glass', '26')
  await panel.click('#panels-dd .dd-trigger')
  await panel.locator('#panels-dd .dd-item').nth(1).click()
  await page.setViewportSize({ width: 1440, height: 1200 })
  await screenshot('settings-mario-half')
  await panel.click('#tab-code')
  await panel.waitForFunction(() => document.querySelector('#code-sound').value.includes('mainSound'))
  await panel.evaluate(() => { document.body.scrollTop = 130 })
  await screenshot('editors-equal-height-half')
  await page.setViewportSize({ width: 390, height: 844 })
  await panel.click('[data-focus="code-sound"]')
  assert.ok(await panel.evaluate(() => document.body.scrollWidth <= innerWidth))
  assert.ok(await panel.locator('.focused .editor-focus-save').isVisible())
  await page.keyboard.press('Escape')
  assert.deepEqual(await heights(), [360, 360])
  assert.deepEqual(errors, [])
  console.log('ok    zero-fill clear mode, slider-linked half mode, disabled background fallback and no uncaught errors')
} finally {
  await browser?.close()
  await harness.close()
}
