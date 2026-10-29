// 诡异的线条 — wyatt; morimea (stability fix)
// Source: https://www.shadertoy.com/view/fsjyR3
// Bundled under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Existing component licences and author notices below remain in force.


// Fork of "Lover" by wyatt. https://shadertoy.com/view/fsjyR3
// 2022-02-07 18:41:05

Main
    // Render the actual segments at output resolution. Buffer B carries ids,
    // not a full-resolution colour image; upscaling its mask blurred the line.
    vec2 uv = U / iResolution.xy;
    R = iChannelResolution[0].xy;
    U = uv * R;
    vec2 idSize = iChannelResolution[1].xy;
    ivec2 cell = clamp(ivec2(uv * idSize), ivec2(0), ivec2(idSize)-1);
    float id = texelFetch(iChannel1, cell, 0).x;
    vec2 a = particle(id).xy;
    float l = min(sg(U, a, particle(id+1.).xy), sg(U, a, particle(id-1.).xy));
    float aa = max(length(fwidth(U)), 1e-3);
    Q = vec4(vec3(1.0-smoothstep(1.5-0.5*aa, 1.5+0.5*aa, l)), 1.0);
}
