// 造山 — Rune Skovbo Johansen (runevision); Fewes; Clay John
// Source: https://www.shadertoy.com/view/sf23W1
// Bundled under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Existing component licences and author notices below remain in force.


/*
====================================================================================

Supplemental noise texture used to add diffuse/normal detail.

Derived from https://www.shadertoy.com/view/7ljcRW by Fewes.

====================================================================================
*/

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    if (DISCARD_MAP) {
        return;
    }

    vec2 uv = fragCoord / BUFFER_SIZE;
    uv += TIME_SCROLL_OFFSET_INT;
    
    vec3 color = vec3(0.0);
    
    float a = 0.5;
    float f = 2.0;
    for (int i = 0; i < 8; i++) {
        color += noised(uv * f) * a;
        a *= 0.95;
        f *= 2.0;
    }

    fragColor = vec4(color, 1.0);
}
