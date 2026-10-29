import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { chromium } from 'playwright'

const root=resolve('site'), output=resolve('.tmp-validation/site')
await mkdir(output,{recursive:true})
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mp4':'video/mp4','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.vtt':'text/vtt','.txt':'text/plain','.xml':'application/xml','.json':'application/json'}
const server=createServer(async(req,res)=>{
  try{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html')))
    if(!path.startsWith(root+sep)){res.writeHead(403).end();return}
    const bytes=await readFile(path)
    const headers={'Content-Type':`${types[extname(path)]??'application/octet-stream'}${extname(path)==='.mp4'?'':'; charset=utf-8'}`,'Accept-Ranges':'bytes'}
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range??'')
    if(range){
      const start=Number(range[1]),end=Math.min(bytes.length-1,range[2]?Number(range[2]):bytes.length-1)
      if(start>end){res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`}).end();return}
      res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':end-start+1});res.end(bytes.subarray(start,end+1));return
    }
    res.writeHead(200,{...headers,'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes)
  }catch{res.writeHead(404).end('Not found')}
})
await new Promise(done=>server.listen(0,'127.0.0.1',done))
const url=`http://127.0.0.1:${server.address().port}`
let browser
try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.env.CI?'chrome':'msedge'),headless:true})
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']})
  const page=await context.newPage(), errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.setViewportSize({width:1440,height:1000})
  await page.goto(url)
  await page.locator('#showcase-video').waitFor()
  const assets=await page.locator('[src],[poster],[href]').evaluateAll(nodes=>nodes.flatMap(n=>['src','poster','href'].map(k=>n.getAttribute(k))).filter(v=>v?.startsWith('assets/')))
  for(const asset of new Set(assets)){const r=await page.request.get(`${url}/${asset}`);assert.equal(r.status(),200,asset)}
  await page.locator('#scene-mountain').click()
  assert.equal(await page.locator('#stage-name').innerText(),'造山')
  await page.locator('#scene-mountain').press('ArrowRight')
  assert.equal(await page.locator('#stage-name').innerText(),'地牢游戏')
  assert.equal(await page.locator('#showcase-panel').getAttribute('aria-labelledby'),'scene-dungeon')
  await page.locator('#scene-ocean').click()
  await page.waitForFunction(()=>document.querySelector('#showcase-video').readyState>=2)
  await page.locator('#play-toggle').click()
  assert.equal(await page.locator('#showcase-video').evaluate(v=>v.paused),true)
  console.log('ok    real recording assets load; mouse/keyboard scene tabs and playback controls work')
  await page.locator('#code-sound').click()
  assert.match(await page.locator('#code-content').innerText(),/mainSound/)
  await page.locator('[data-copy="install-command"]').click()
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'dsh plugin --profile desktop add dsh-shadertoy-skin')
  await page.locator('[data-copy="ai-prompt"]').click()
  assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/保留我已有的设置和个人作品/)
  await page.locator('#open-credits').click()
  assert.equal(await page.locator('#credits').evaluate(d=>d.open),true)
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('#credits').evaluate(d=>d.open),false)
  console.log('ok    code examples, copy actions and accessible credits dialog work')
  await page.locator('.film').scrollIntoViewIfNeeded()
  await page.locator('.film').evaluate(v=>{v.load();v.textTracks[0].mode='hidden'})
  await page.waitForFunction(()=>document.querySelector('.film').readyState>=2)
  const film=await page.locator('.film').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration}))
  const expectedFilm=JSON.parse(await readFile(resolve(root,'assets/film-info.json'),'utf8'))
  assert.equal(await page.locator('.film source').getAttribute('src'),`assets/film.mp4?v=${expectedFilm.revision}`)
  assert.equal(await page.locator('.film track').getAttribute('src'),`assets/film.vtt?v=${expectedFilm.revision}`)
  assert.equal(film.width,expectedFilm.width);assert.equal(film.height,expectedFilm.height);assert.ok(Math.abs(film.duration-expectedFilm.duration)<.1)
  await page.locator('.film').evaluate(v=>{v.currentTime=53;return v.play()})
  await page.waitForFunction(()=>document.querySelector('.film').currentTime>53)
  await page.waitForFunction(()=>document.querySelector('.film').textTracks[0].cues?.length>10)
  assert.equal(await page.locator('.film').evaluate(v=>v.textTracks[0].cues[0].text),'各位人类和ai大家好呀。')
  assert.equal(expectedFilm.greeting,'各位人类和ai大家好呀。')
  assert.equal(await page.locator('#showcase-video').evaluate(v=>v.paused),true)
  await page.locator('.film').evaluate(v=>v.pause())
  console.log('ok    revised film decodes with the requested greeting; captions and seeking work; background clips pause')
  await page.goto(url)
  await page.locator('#scene-ocean').waitFor()
  await page.screenshot({path:resolve(output,'desktop.png'),fullPage:true})
  await page.emulateMedia({reducedMotion:'reduce'})
  for(const width of [390,320,768]){
    await page.setViewportSize({width,height:900});await page.goto(url)
    await page.waitForTimeout(150)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`horizontal overflow at ${width}`)
    assert.equal(await page.locator('#showcase-video').evaluate(v=>v.paused),true)
    assert.equal(await page.locator('#showcase-video').getAttribute('src'),null,'reduced motion must not preload autoplay video')
    if(width===390)await page.screenshot({path:resolve(output,'mobile.png'),fullPage:true})
  }
  console.log('ok    320/390/768px layouts fit; reduced motion keeps a still poster and avoids autoplay downloads')
  const names=['ocean','rain','mountain','dungeon','take-on-me','mario']
  for(const name of names){for(const extension of ['webp','mp4'])assert.ok((await stat(resolve(root,`assets/${name}.${extension}`))).size>1000)}
  assert.deepEqual(errors,[])
  console.log('Site verification passed')
}finally{await browser?.close();await new Promise(done=>server.close(done))}
