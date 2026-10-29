// 造山 — Rune Skovbo Johansen (runevision); Fewes; Clay John
// Source: https://www.shadertoy.com/view/sf23W1
// Bundled under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Existing component licences and author notices below remain in force.

// Adaptation: keep the exact brush centre finite.

/*
====================================================================================

Raw height map painted with the mouse. Used by the eroded height map in Buffer B.

====================================================================================
*/

vec3 GetBrushDelta(vec2 mapPos, vec2 cursorPos, float brushSize) {
    // Find the distance and direction to the mouse cursor.
    float dist = (distance(cursorPos, mapPos));
    vec2 dir = (cursorPos - mapPos) / max(dist, 1e-6);

    // Calculate the brush value.
    float freq = 1.0 / brushSize;
    float x = clamp(1.0 - freq * dist, 0.0, 1.0);
    return vec3(
        x * x * (3.0 - 2.0 * x),
        dir * 6.0 * x * (1.0 - x) * freq
    );
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    
    vec2 mapPos = fragCoord.xy / iResolution.xy;

    // Set the output to the same value as in the last frame.
    fragColor = texture(iChannel0, fragCoord.xy / iResolution.xy);
    
    // Reset in first frame, or if pressing Backspace.
    if (iFrame < 2 || texelFetch(iChannel1, ivec2(8, 0), 0).x > 0.0) {
        // Initialize with a bump in the middle.
        fragColor = vec4(DEFAULT_HEIGHT, 0.0, 0.0, 0.0);
        fragColor.xyz += GetBrushDelta(mapPos, vec2(0.5), 0.35) * 0.1;
    }
    
    // If the mouse is pressed...
    if(iMouse.z > 0.0) {
    
        vec3 ro;
        vec3 rd; // Ray direction for current pixel
        vec3 mrd; // Ray direction for mouse cursor
        GetRay(ro, rd, iTime, iMouse, iResolution, fragCoord, 0.0); // pixel ray
        GetRay(ro, mrd, iTime, iMouse, iResolution, iMouse.xy, 0.0); // mouse ray
        vec3 cursor = GetMouseWorldPos(ro, mrd, DEFAULT_HEIGHT);
    
        vec2 cursorPos = cursor.xz + 0.5;
        vec3 v = GetBrushDelta(mapPos, cursorPos, BRUSH_SIZE);
        
        // Set the sign based on the Shift key state.
        if (texelFetch(iChannel1, ivec2(16, 0), 0).x > 0.0)
            v = -v;
        
        // Lerp towards the brush value.
        fragColor.xyz += v * 0.05 / iFrameRate;
        fragColor.x = clamp(fragColor.x, 0.0, 1.0);
    }
}
