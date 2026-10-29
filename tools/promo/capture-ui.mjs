// Record the real plugin panel/player in an isolated browser-harness profile.
// No installed DSH profile or user project is read or changed.
import { startHarness } from '../browser-harness.mjs'
import { chromium } from 'playwright'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadBuiltin } from '../../native-dist/project.js'

const output=resolve('.tmp-validation/promo-v2/captures')
await mkdir(output,{recursive:true})
const h=await startHarness()
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']})
const scenes={}
const marks={}
const baseState={version:2,activeId:'aurora',settings:{enabled:true,glass:35,panels:'half',blur:0,scale:.5,fps:30,muted:true},entries:[]}
const baseImage='void mainImage(out vec4 c,in vec2 p){vec2 uv=p/iResolution.xy;c=vec4(.2+.3*sin(iTime*.2+uv.xyx+vec3(0.,2.,4.)),1.);}'
let context
async function start(name,state=baseState){
  context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:output,size:{width:1920,height:1080}}})
  await context.request.put(h.url+'/shader-skin/state',{data:state})
  const page=await context.newPage();const started=Date.now()
  await page.goto(h.url)
  await page.addStyleTag({content:'nav{display:none!important}#main{left:0!important}'})
  const panel=page.frameLocator('iframe[title="ShaderToy 背景设置"]')
  await panel.locator('#tab-params').waitFor()
  const player=page.frames().find(f=>f.url().includes('player.html'))
  await player.waitForFunction(()=>window.__player?.ready)
  const mark=key=>{marks[`${name}:${key}`]=(Date.now()-started)/1000}
  const hold=ms=>page.waitForTimeout(ms)
  async function end(){
    await page.close();const path=await page.video().path();await copyFile(path,resolve(output,`${name}.webm`));await context.close()
    scenes[name]={file:resolve(output,`${name}.webm`),marks:Object.fromEntries(Object.entries(marks).filter(([key])=>key.startsWith(name+':')).map(([key,value])=>[key.slice(name.length+1),value]))}
    console.log(`captured ${name}`,scenes[name].marks)
  }
  return {page,panel,player,mark,hold,end}
}
try{
  let c=await start('select')
  c.mark('start');await c.hold(900)
  await c.panel.locator('#preset-dd .dd-trigger').click();await c.hold(1800)
  await c.panel.locator('#preset-dd-options').getByRole('option',{name:'流体色带 · 内置',exact:true}).click()
  await c.hold(2200);c.mark('end');await c.end()

  c=await start('settings')
  c.mark('start');await c.hold(1800)
  for(const [id,value] of [['glass',60],['glass',30],['brightness',135],['brightness',100]]){
    await c.panel.locator('#'+id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}))},value)
    await c.hold(1200)
  }
  c.mark('preview');await c.panel.locator('.wallpaper-preview').click();await c.hold(2000)
  await c.page.keyboard.press('Escape');await c.hold(1100);c.mark('end');await c.end()

  c=await start('import')
  await c.panel.locator('#tab-library').click()
  await c.panel.locator('#paste-name').scrollIntoViewIfNeeded();await c.hold(700)
  c.mark('start');await c.hold(1000)
  await c.panel.locator('#paste-name').fill('我的背景')
  await c.hold(600)
  await c.panel.locator('#paste-image').fill(baseImage)
  await c.hold(1600)
  await c.panel.locator('#paste-add').click();await c.hold(2200)
  c.mark('end');await c.end()

  c=await start('multi-import')
  await c.panel.locator('#tab-library').click()
  await c.panel.locator('#project-input').scrollIntoViewIfNeeded();await c.hold(700)
  c.mark('start')
  await c.panel.locator('#project-input').setInputFiles([
    {name:'Image.glsl',mimeType:'text/plain',buffer:Buffer.from('void mainImage(out vec4 c,in vec2 p){c=texture(iChannel0,p/iResolution.xy);}')},
    {name:'Common.glsl',mimeType:'text/plain',buffer:Buffer.from('vec3 palette(float t){return .5+.5*cos(t+vec3(0.,2.,4.));}')},
    {name:'Buffer A.glsl',mimeType:'text/plain',buffer:Buffer.from('void mainImage(out vec4 c,in vec2 p){c=vec4(palette(iTime+p.x/iResolution.x),1.);}')},
    {name:'Sound.glsl',mimeType:'text/plain',buffer:Buffer.from('vec2 mainSound(float t){return vec2(0.0);}')},
  ])
  await c.hold(1100)
  await c.panel.locator('#project-staging').scrollIntoViewIfNeeded();await c.hold(3600)
  c.mark('end');await c.end()

  const multi={image:'void mainImage(out vec4 c,in vec2 p){c=texture(iChannel0,p/iResolution.xy);}',sound:'vec2 mainSound(float t){return vec2(0.0);}',common:'vec3 palette(float t){return .5+.5*cos(t+vec3(0.,2.,4.));}',buffers:{A:'void mainImage(out vec4 c,in vec2 p){c=vec4(palette(iTime*.2+p.x/iResolution.x),1.);}'},channels:{image:['buffer:A']}}
  c=await start('editor',{...baseState,activeId:'demo-project',entries:[{id:'demo-project',name:'我的多文件项目',code:multi}]})
  await c.panel.locator('#tab-code').click();await c.panel.locator('#project-tabs').waitFor();await c.hold(700)
  c.mark('start');await c.hold(1600)
  for(const name of ['Common','Buffer A','Sound','Image']){
    await c.panel.locator('#project-tabs').getByRole('tab',{name,exact:true}).click();await c.hold(1400)
  }
  c.mark('end');await c.end()

  const manifest=JSON.parse(await readFile(resolve('native-dist/presets/index.json'),'utf8'))
  const sea=await loadBuiltin(manifest.find(p=>p.id==='seascape'),file=>readFile(resolve('native-dist/presets',file),'utf8'))
  const stars=`
// Demo adaptation: a layer of small glowing points. Original Seascape credits stay above.
void mainImage(out vec4 c,in vec2 p){
  seaBackground(c,p);
  vec2 uv=(p-.5*iResolution.xy)/iResolution.y;
  for(int i=0;i<12;i++){
    float n=float(i)+1.;
    vec2 center=vec2(fract(sin(n*12.9898)*43758.5453)-.5,fract(sin(n*78.233)*12345.6789)-.5)*vec2(1.6,.85);
    vec2 q=uv-center;
    float d=length(q);
    float core=.8*exp(-d*d*160000.);
    float glow=.14*exp(-d*80.);
    float rays=.18*exp(-min(abs(q.x),abs(q.y))*2500.)*exp(-d*90.);
    c.rgb+=vec3(.55,.8,1.)*(core+glow+rays);
  }
}`
  const modified={...sea,image:sea.image.replace(/void\s+mainImage\s*\(/,'void seaBackground(')+stars}
  await writeFile(resolve(output,'星光叠加示例.glsl'),stars,'utf8')
  const demo=await browser.newPage({viewport:{width:1280,height:720}})
  await demo.goto(`${h.url}/shader-skin/player.html?preset=seascape&scale=1&fps=15&dim=1&tintMix=0&muted=1`)
  await demo.waitForFunction(()=>window.__player?.ready)
  for(const [name,code] of [['sea-before',sea],['sea-after',modified]]){
    await demo.evaluate(({name,code})=>window.postMessage({type:'init',preset:{name,code},params:{speed:0,dim:1,tintMix:0}},location.origin),{name,code})
    await demo.waitForFunction(name=>window.__player?.preset===name&&window.__player.frames>4,name)
    await demo.screenshot({path:resolve(output,`${name}.png`)})
  }
  await demo.close()
  await writeFile(resolve(output,'captures.json'),JSON.stringify(scenes,null,2))
}finally{await context?.close();await browser.close();await h.close()}
