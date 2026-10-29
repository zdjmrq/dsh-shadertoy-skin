# Third-party notices

This repository and the npm package `dsh-shadertoy-skin` contain code under two
different licences:

- **The plugin itself** (`index.js`, `client.js`, `native-dist/player.html`,
  `native-dist/panel.html`, `native-dist/defaults.json`, `tools/`, and the
  self-written presets `aurora` / `flow` / `pulse`) is **MIT** — see `LICENSE`.
- **Eleven bundled ShaderToy works and the no-lightning rain variant** are **CC BY-NC-SA 3.0** and are **not MIT**.
  They are included as ready-to-use presets, with attribution, because the
  upstream licences allow redistribution (non-commercially, share-alike).

## Bundled presets with third-party licences

| preset id | work | author | source | licence | changes |
|---|---|---|---|---|---|
| `seascape` | "Seascape" (2014) | Alexander Alekseev aka TDM | <https://www.shadertoy.com/view/Ms2SD1> | [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) | desktop-background modifications plus verifiable performance work and fixes: sky early-out, bounded regula-falsi tracing (32→16 steps), integer-hash noise, `pow(max(color, 0.0))` NaN fix, specular base clamp, dithering. Details in the file header. |
| `mario` + `mario-sound` | "Mario" (2014) | Inigo Quilez (iq) | <https://www.shadertoy.com/user/iq> | [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) | bundled as a preset as-is (pixel art + one music piece). |

## Projects added in 0.4.0

The contributor supplied these ShaderToy sources and confirmed CC BY-NC-SA 3.0
for the works. Original file headers, authors, links and embedded component
licence notices remain intact. These assets are not covered by the plugin MIT
licence. Where the source export did not contain a work URL, the author's profile
or the source platform is recorded instead of inventing a shader ID.

| directory | displayed name | original credits / source | adaptation |
|---|---|---|---|
| `take-on-me` | Take On Me | Tonny Espeset, <https://www.shadertoy.com/view/fXc3RB> | Common / Buffer A / Image / Sound preserved separately; offline font input; image 209 s, music 180 s. |
| `never-gonna-give-you-up` | Never Gonna Give You Up | Tonny Espeset, <https://www.shadertoy.com/view/fXdXR7> | Common / Image / Sound; 177 s duration. |
| `rain-window` | 下雨的窗户 (Heartfelt) | Martijn Steinrucken aka BigWings, <https://www.shadertoy.com/user/BigWings> | Plugin-written procedural city texture replaces the missing external photograph. Continuous desktop rain: disable HAS_HEART (the story freezes drops and progressively fogs out the scene), and remove the 102 s replay period; retain natural rain, normal fog/refraction, mouse controls, colour grading and lightning. |
| `rain-window-no-lightning` | 下雨的窗户（无闪电） | Same Heartfelt author/source and CC BY-NC-SA 3.0 licence as `rain-window` | Same continuous-rain adaptation as the ordinary version, with only the three lightning flicker/flash/compositing statements removed. |
| `racing` | 赛车 | dathor / diatribes; Reinder & Effie (car models); PCrush & Mr Laine (music), <https://www.shadertoy.com/user/dathor> | Common / Buffer A / Buffer B / Image / Sound, feedback and font channels; remove an overwritten texture read in Buffer B. |
| `voxel-world` | 我的世界 (Voxel Game) | fb39ca4, <https://www.shadertoy.com/user/fb39ca4> | Buffers A–D / Image; full precision state textures; guard zero-speed friction against NaN. Keyboard is forwarded only in explicit preview/interaction mode. |
| `tree-in-wind` | 风中的树 | Original author ASCII credit (Maurrourgilk), <https://www.shadertoy.com> | Common / shadow Buffer A / feedback Buffer B / Image; offline 2D and 3D noise inputs. |

Each new shader file carries the CC BY-NC-SA 3.0 notice and licence URL:
<https://creativecommons.org/licenses/by-nc-sa/3.0/>. Musical compositions and
other embedded content retain their original owners; the plugin does not claim
ownership of them. The separately provided “云海” source was excluded at the
contributor's request and is not part of this repository or npm package.

## Projects added in 0.4.5

These three projects were supplied as local ShaderToy exports by the contributor.
Existing comments and component notices are retained. Project-level labels follow
the contributor-confirmed CC BY-NC-SA 3.0 terms; those labels do not replace the
MPL 2.0 notices in the terrain erosion / Phacelle Noise implementations.

| directory | displayed name | original credits / source | adaptation |
|---|---|---|---|
| `strange-lines` | 诡异的线条 | wyatt, Lover, <https://www.shadertoy.com/view/fsjyR3>; morimea (stability fix noted in supplied Common) | Common / Buffers A–D / Image; confirm connections against the archived original export. Space resets. Guard degenerate segments; wrap all particle neighbours around an integer-sized closed curve; sample discrete state without interpolation and render antialiased segments at output resolution. The exact supplied fork URL was absent, so the original work URL is recorded. |
| `mountain-paint` | 造山 | Rune Skovbo Johansen (runevision), Mouse-Paint Eroded Mountains, <https://www.shadertoy.com/view/sf23W1>; Fewes / Clay John and helper links remain in source | Common / Buffers A–C / Image; keyboard, self-feedback and offline noise inputs. Fix brush-centre normalization and zero erosion magnitude; use actual input dimensions under the memory cap, correct reflection normals, retain material bytes in finite integer pairs, and reuse the static detail map. |
| `dungeon-game` | 地牢游戏 | Krzysztof Narkowicz (knarkowicz), [SH17B] Pixel Shader Dungeon, <https://www.shadertoy.com/view/Xs2fWD>; based on Pixel Dungeon by Oleg Dolya (Watabou), <http://pixeldungeon.watabou.ru/> | Buffers A–D / Image, float32 nearest-filtered state, keyboard and offline font atlas. Composite Image at actual Buffer D resolution to preserve alignment under the memory cap. No external music stream is downloaded or bundled. |

The two algorithm sections in `mountain-paint/b.glsl` retain their original
copyright (c) 2025 Rune Skovbo Johansen and **Mozilla Public License 2.0** notices.
The source of those sections remains included in the distributed package; the
complete licence text is shipped as [`licenses/MPL-2.0.txt`](licenses/MPL-2.0.txt).
The plugin adaptation changes to this file are identified in its header. The
original author explains the technique and links the interactive project at
<https://blog.runevision.com/2026/03/fast-and-gorgeous-erosion-filter.html>.
The rest of the terrain export retains its existing source/component credits.

### Component notices retained within the supplied projects

- Voxel noise functions: Copyright (C) 2011 Ashima Arts / Ian McEwan, maintained
  by stegu; MIT, <https://github.com/ashima/webgl-noise> and
  <https://github.com/stegu/webgl-noise>. The MIT terms also appear in LICENSE;
  the copyright and permission notice apply to these component functions.
- HSV conversion references remain in the source: <https://github.com/hughsk/glsl-hsv2rgb>.
- Tree SDF helpers credit mercury / hg_sdf: <http://mercury.sexy/hg_sdf/>.
- Tree “Hash without Sine” functions credit David Hoskins and explicitly retain
  their **CC BY-SA 4.0** component notice. The project-level CC BY-NC-SA 3.0 label
  does not replace this component's own notice.

The font atlas, noise textures and city backdrop generated by
`native-dist/textures.js` are original plugin code under MIT, generated offline
without downloading third-party image/font files.

What **CC BY-NC-SA 3.0** means for these third-party works:

- **Attribution** — credit the authors listed above and keep the licence notice.
- **NonCommercial** — you may not use these third-party shaders for commercial purposes.
  If you want to use this plugin commercially, delete `native-dist/presets/seascape.glsl`,
  `native-dist/presets/mario.glsl` and `native-dist/presets/mario-sound.glsl`, plus the project and variant directories listed above
  (or ship your own MIT shaders only).
- **ShareAlike** — if you redistribute modified versions of these shaders, they
  must stay under CC BY-NC-SA 3.0.

Everything you import yourself from ShaderToy stays on your machine
(`$DSH_HOME/shader-skin.json` / `$DSH_HOME/shader-skin/presets/`); it is never
uploaded and never shipped in this package. ShaderToy works are CC BY-NC-SA 3.0
unless the author states otherwise.
