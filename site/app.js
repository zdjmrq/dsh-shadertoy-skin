const $ = selector => document.querySelector(selector)
const scenes = {
  ocean: { name:'海面 / Seascape', kind:'把工作日，交给海风。', source:'https://www.shadertoy.com/view/Ms2SD1' },
  rain: { name:'下雨的窗户', kind:'留一点雨声里的想象。', source:'https://www.shadertoy.com/user/BigWings' },
  mountain: { name:'造山', kind:'鼠标一划，山海生长。', source:'https://www.shadertoy.com/view/sf23W1' },
  dungeon: { name:'地牢游戏', kind:'摸鱼，也可能被反杀。', source:'https://www.shadertoy.com/view/Xs2fWD' },
  'take-on-me': { name:'Take On Me', kind:'一脚油门，驶进黑白电影。', source:'https://www.shadertoy.com/view/fXc3RB' },
  mario: { name:'马里奥', kind:'一点像素，一点童年。', source:'https://www.shadertoy.com/user/iq' },
}
const video = $('#showcase-video'), toggle = $('#play-toggle')
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const constrained = navigator.connection?.saveData === true
let selected = 'ocean', wanted = !reduced.matches && !constrained, inView = false, hiddenPause = false
let action = 0, toastTimer

function syncButton() {
  toggle.textContent = video.paused ? '播放 ▶' : '暂停 Ⅱ'
  toggle.setAttribute('aria-label', video.paused ? '播放演示' : '暂停演示')
}
function source() {
  if (!video.getAttribute('src')) { video.src = `assets/${selected}.mp4`; video.load() }
}
async function play() {
  if (!inView || !wanted || document.hidden || !$('.film').paused) return
  source()
  const current = ++action
  try { await video.play() } catch { if (current === action) syncButton() }
}
function pause() { ++action; video.pause(); syncButton() }
function choose(name) {
  if (!scenes[name]) return
  pause(); selected = name
  video.removeAttribute('src'); video.poster = `assets/${name}.webp`; video.load()
  video.setAttribute('aria-label', `${scenes[name].name}背景在 DSH 中的实际录屏`)
  $('#stage-name').textContent = scenes[name].name; $('#stage-kind').textContent = scenes[name].kind
  $('#stage-source').href = scenes[name].source
  document.querySelectorAll('[data-scene]').forEach(button => {
    const active = button.dataset.scene === name
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1
  })
  $('#showcase-panel').setAttribute('aria-labelledby', `scene-${name}`)
  void play()
}
function tabs(selector, attribute, select) {
  const buttons = [...document.querySelectorAll(selector)]
  buttons.forEach((button,index) => {
    button.addEventListener('click', () => select(button.dataset[attribute]))
    button.addEventListener('keydown', event => {
      let next
      if (event.key === 'ArrowRight') next=(index+1)%buttons.length
      if (event.key === 'ArrowLeft') next=(index+buttons.length-1)%buttons.length
      if (event.key === 'Home') next=0
      if (event.key === 'End') next=buttons.length-1
      if (next === undefined) return
      event.preventDefault(); buttons[next].focus(); select(buttons[next].dataset[attribute])
      buttons[next].scrollIntoView({block:'nearest',inline:'nearest'})
    })
  })
}
tabs('[data-scene]','scene',choose)
toggle.addEventListener('click', () => { wanted=video.paused; if(wanted) void play(); else pause() })
video.addEventListener('play', syncButton); video.addEventListener('pause',syncButton)
video.addEventListener('error', () => { pause(); toast('演示暂时无法加载，可切换作品或稍后重试。') })
new IntersectionObserver(entries => {inView=entries[0].isIntersecting;if(inView) void play();else pause()},{threshold:.15}).observe(video)
document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenPause=true;pause()}else if(hiddenPause){hiddenPause=false;void play()}})
reduced.addEventListener('change',()=>{if(reduced.matches){wanted=false;pause()}})
$('.film').addEventListener('play',pause)
$('.film').addEventListener('pause',()=>void play())

const code = {
  image: `void mainImage(out vec4 color,
               in vec2 pixel) {
  vec2 uv = pixel / iResolution.xy;
  float t = iTime;

  color = vec4(
    0.5 + 0.5 * cos(t + uv.xyx
      + vec3(0.0, 2.0, 4.0)), 1.0);
}`,
  sound: `vec2 mainSound(float time) {
  // A quiet stereo tone.
  float tone = sin(6.2831853 * 220.0 * time);
  float pulse = exp(-4.0 * fract(time));

  return vec2(tone * pulse * 0.12);
}`,
  common: `// Shared by Image and Buffer passes.
// Add files with + in the DSH editor.

vec3 palette(float t) {
  return 0.5 + 0.5 * cos(
    6.2831853 * t + vec3(0.0, 2.0, 4.0)
  );
}`,
}
tabs('[data-code]','code',name=>{
  $('#code-content').textContent=code[name]
  $('#code-panel').setAttribute('aria-labelledby',`code-${name}`)
  document.querySelectorAll('[data-code]').forEach(button=>{const active=button.dataset.code===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1})
})
function toast(message) { clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200) }
async function copy(text) {
  if (navigator.clipboard?.writeText) { try {await navigator.clipboard.writeText(text);return true} catch {} }
  const input=document.createElement('textarea');input.value=text;input.style.cssText='position:fixed;top:0;left:-9999px';document.body.append(input);input.select()
  let copied=false;try {copied=document.execCommand('copy')} catch {} finally {input.remove()}
  return copied
}
document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{
  const content=document.getElementById(button.dataset.copy).textContent.trim()
  toast(await copy(content)?'已复制，去 DSH 里开始吧。':'复制未成功，请选中文字手动复制。')
}))
$('#open-credits').addEventListener('click',()=>$('#credits').showModal())
$('#close-credits').addEventListener('click',()=>$('#credits').close())
$('#credits').addEventListener('click',event=>{if(event.target===$('#credits')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close()}})
