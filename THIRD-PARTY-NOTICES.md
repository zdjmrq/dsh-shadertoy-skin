# Third-party notices

This repository and the npm package `dsh-shadertoy-skin` contain code under two
different licences:

- **The plugin itself** (`index.js`, `client.js`, `native-dist/player.html`,
  `native-dist/panel.html`, `native-dist/defaults.json`, `tools/`, and the
  self-written presets `aurora` / `flow` / `pulse`) is **MIT** — see `LICENSE`.
- **Two bundled ShaderToy works** are **CC BY-NC-SA 3.0** and are **not MIT**.
  They are included as ready-to-use presets, with attribution, because the
  upstream licences allow redistribution (non-commercially, share-alike).

## Bundled presets with third-party licences

| preset id | work | author | source | licence | changes |
|---|---|---|---|---|---|
| `seascape` | "Seascape" (2014) | Alexander Alekseev aka TDM | <https://www.shadertoy.com/view/Ms2SD1> | [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) | desktop-background modifications plus verifiable performance work and fixes: sky early-out, bounded regula-falsi tracing (32→16 steps), integer-hash noise, `pow(max(color, 0.0))` NaN fix, specular base clamp, dithering. Details in the file header. |
| `mario` + `mario-sound` | "Mario" (2014) | Inigo Quilez (iq) | <https://www.shadertoy.com/user/iq> | [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) | bundled as a preset as-is (pixel art + one music piece). |

What **CC BY-NC-SA 3.0** means for these two files:

- **Attribution** — credit the authors (TDM / Inigo Quilez) and keep the licence notice.
- **NonCommercial** — you may not use these two shaders for commercial purposes.
  If you want to use this plugin commercially, delete `native-dist/presets/seascape.glsl`,
  `native-dist/presets/mario.glsl` and `native-dist/presets/mario-sound.glsl`
  (or ship your own MIT shaders only).
- **ShareAlike** — if you redistribute modified versions of these shaders, they
  must stay under CC BY-NC-SA 3.0.

Everything you import yourself from ShaderToy stays on your machine
(`$DSH_HOME/shader-skin.json` / `$DSH_HOME/shader-skin/presets/`); it is never
uploaded and never shipped in this package. ShaderToy works are CC BY-NC-SA 3.0
unless the author states otherwise.
