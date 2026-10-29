// Source-shaped DSH consumers catch missing tokens, local-variable shadowing,
// and duplicate fills which cannot be tested by reading body tokens alone.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
const output = new URL('../.tmp-validation/verify/unified-transparency/', import.meta.url)
await mkdir(output, { recursive: true })
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(h.url)
  await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
  const panel = page.frames().find(f => f.url().includes('panel.html'))
  await panel.waitForSelector('#preset-dd .dd-trigger')
  await panel.click('#preset-dd .dd-trigger')
  await panel.locator('#preset-dd .dd-item').filter({ hasText: '马里奥' }).click()
  await panel.waitForFunction(() => document.querySelector('#preset-dd .dd-trigger').textContent.includes('马里奥'))
  await panel.check('#muted')
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = `
      body {--dsw-alias-bg-layer-1:#fff;--dsw-specific-menu:#fff;--dsw-specific-input-major:#fff;--dsw-alias-button-elevated-fill:#fff;--dsw-alias-markdown-code-block:#f7f7f8;--dsw-alias-markdown-code-block-banner:#fff;--dsw-alias-markdown-inline-code:#eee}
      body[data-ds-dark-theme] {--dsw-alias-bg-layer-1:#232324;--dsw-specific-menu:#2c2c2e;--dsw-specific-input-major:#1b1b1c;--dsw-alias-button-elevated-fill:#303032;--dsw-alias-markdown-code-block:#1b1b1c;--dsw-alias-markdown-code-block-banner:#232324;--dsw-alias-markdown-inline-code:#303032}
      .surface-proof {position:fixed;inset:50px 50px 30px 230px;z-index:900;color:#111;font:16px/1.8 system-ui}
      body[data-ds-dark-theme] .surface-proof {color:#fafafa}
      .surface-proof h1 {font-size:24px;margin:0 0 24px}
      .surface-proof section {margin:16px 0;padding:20px;border:1px solid #8886;border-radius:12px}
      .native_newSession {border:1px solid #8886;border-radius:10px;padding:12px 70px;color:inherit;font:inherit;background:var(--dsw-alias-button-elevated-fill)}
      .native_newSession:hover {background:var(--dsw-alias-button-floating-hover)}
      .md-code-block {--dsl-code-block-background:var(--dsw-alias-markdown-code-block);--dsl-code-block-banner-background-color:var(--dsw-alias-markdown-code-block-banner);background:var(--dsl-code-block-background)}
      [data-code-block-banner] {padding:8px 14px;background:var(--dsl-code-block-banner-background-color)}
      [data-code-block-content] pre {margin:0;padding:14px;background:var(--dsl-code-block-background)!important}
      .native_card {--changes-fill:#fff;--changes-hover:#eee;background:var(--dsw-alias-bg-layer-1)}
      body[data-ds-dark-theme] .native_card {--changes-fill:#232324;--changes-hover:#303032}
      .native_card header {padding:12px;background:var(--changes-fill)}
      .native_root {--deliverable-fill:#fff;--deliverable-hover:#eee}
      .native_root .file {background:var(--deliverable-fill);padding:12px}
      .plan_card {--plan-card-fill:#fff;--plan-card-hover:#eee;background:var(--plan-card-fill)}
      .surface-proof input {width:95%;padding:16px;font:inherit;color:inherit;border:1px solid #8886;border-radius:10px;background:var(--dsw-specific-input-major)}
      .surface-proof code {background:var(--dsw-alias-markdown-inline-code);border-radius:6px;padding:3px 8px}
      .surface-proof [role=menu] {background:var(--dsw-specific-menu)}
    `
    document.head.append(style)
    const fixture = document.createElement('div')
    fixture.className = 'surface-proof'
    fixture.innerHTML = '<h1>统一透明表面 · DSH 结构回归</h1><button class="native_newSession">⊕ 新会话</button><section class="md-code-block"><div data-code-block-banner>代码块 · JavaScript　　复制</div><div data-code-block-content><pre>const opacity = mode === "clear" ? 0 : glass / 100;\nrender(shader);</pre></div></section><p>行内代码：<code>npm run test:surfaces</code></p><section class="native_card"><header>文件变更卡片</header><div>查看修改 · 样式跟随设置</div></section><div class="native_root"><section class="file">交付物卡片</section></div><section class="plan_card">计划卡片</section><input value="聊天输入框"><section role="menu">菜单与弹层 · 同一不透明度</section>'
    document.body.append(fixture)
  })
  const alpha = selector => page.locator(selector).first().evaluate(node => {
    const color = getComputedStyle(node).backgroundColor
    return color.startsWith('rgba(') ? Number(color.slice(5, -1).split(',')[3]) : 1
  })
  const select = async mode => {
    await page.locator('.surface-proof').evaluate(node => { node.style.display = 'none' })
    await page.locator('#main').evaluate(node => { node.style.visibility = '' })
    await panel.click('#panels-dd .dd-trigger')
    await panel.locator('#panels-dd .dd-item').nth(['opaque','half','clear'].indexOf(mode)).click()
  }
  const surfaces = ['.native_newSession','.md-code-block','.native_card','.native_root .file','.plan_card','.surface-proof input','.surface-proof code','.surface-proof [role=menu]']
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
    for (const mode of ['opaque','half','clear']) {
      await select(mode)
      for (const value of [20,60,95]) {
        await panel.fill('#glass', String(value))
        const expected = mode === 'opaque' ? 1 : mode === 'clear' ? 0 : value / 100
        await page.waitForFunction(({mode, expected}) => {
          const css = document.body.style.getPropertyValue('--dsw-alias-bg-layer-1')
          return mode === 'opaque' ? !css : Number(css.match(/, ([0-9.]+)\)/)?.[1]) === expected
        }, {mode,expected})
        for (const selector of surfaces) assert.equal(await alpha(selector), expected, `${dark?'dark':'light'} ${mode} ${value}: ${selector}`)
        if (mode !== 'opaque') {
          assert.equal(await alpha('[data-code-block-banner]'), 0)
          assert.equal(await alpha('[data-code-block-content] pre'), 0)
          assert.equal(await alpha('.native_card header'), 0, 'changed-file headers must not stack a second fill')
        }
        assert.ok(!Object.keys(await page.evaluate(() => window.__glassTokens)).some(k => k.startsWith('--dsw-static-')))
      }
      await panel.fill('#glass', '20')
      await page.locator('#main').evaluate(node => { node.style.visibility = 'hidden' })
      await page.locator('.surface-proof').evaluate(node => { node.style.display = '' })
      await page.screenshot({path:fileURLToPath(new URL(`${dark?'dark':'light'}-${mode}.png`,output))})
    }
  }
  await select('half')
  await panel.uncheck('#enabled')
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-shader-skin-panels') && !document.querySelector('#shadertoy-skin-glass-style'))
  assert.equal(await page.getAttribute('html','data-shader-skin-panels'), null)
  assert.equal(await page.locator('#shadertoy-skin-glass-style').count(), 0)
  for (const selector of surfaces) assert.equal(await alpha(selector), 1, `disabled restores ${selector}`)
  assert.deepEqual(errors, [])
  console.log('ok    18 theme/mode/slider combinations: new session, code body/header, input, inline code, cards and menus')
  console.log('ok    zero means zero, half follows slider, no duplicate header fill or static palette overrides; disabling restores native fills')
} finally {
  await browser?.close()
  await h.close()
}
