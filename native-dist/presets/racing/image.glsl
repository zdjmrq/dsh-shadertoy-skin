// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

/*
** ██████╗        ██╗  ██╗    ██████╗ 
** ██╔══██╗       ╚██╗██╔╝    ██╔══██╗
** ██║  ██║        ╚███╔╝     ██║  ██║
** ██║  ██║        ██╔██╗     ██║  ██║
** ██████╔╝       ██╔╝ ██╗    ██████╔╝
** ╚═════╝        ╚═╝  ╚═╝    ╚═════╝ 
** D & D - Outrun Homage 2026
** 180 seconds of raymarched nostalgia pretending to be art.
**
** Based on a series of old & new shader work,
** and a never-released demoscene idea from way back.
**
** Made with love during a beer session and demoscene week,
** where we also do other shit... but this was much more fun.
** (Also, dathor went absolutely bananas with the camera ideas.)
**
** Authors: dathor            - https://www.shadertoy.com/user/dathor
**          diatribes         - https://www.shadertoy.com/user/diatribes  
**          Reinder & Effie   - Car SDF Models
**          PCrush & Mr Laine - Idea & Music
**
** [ IMPORTANT AUDIO NOTE ]:
** Since this shader features 124 BPM audio-synced visual glitches and
** camera impacts, we highly recommend rewinding / pressing play to sync
** the track — browsers do not play audio without user interaction.
*/
float printChar(vec2 charUV, int c, sampler2D fontTex) {
    if (charUV.x < 0.0 || charUV.x > 1.0 || charUV.y < 0.0 || charUV.y > 1.0) return 0.0;
    int col = c % 16;
    int row = 15 - (c / 16);
    vec2 atlasUV = (charUV + vec2(float(col), float(row))) / 16.0;
    float d = textureLod(fontTex, atlasUV, 0.0).x;
    return smoothstep(0.38, 0.62, d);
}
#define DRAW_TEXT(POS, SIZE, ALIGN, CHARS, LEN, FONT_TEX)                        \
    {                                                                            \
        float width = float(LEN) * 0.5 * SIZE;                                   \
        float startX = POS.x - width * (ALIGN * 0.5 + 0.5);                      \
        vec2 p = textUV - vec2(startX, POS.y - SIZE * 0.5);                      \
        p /= SIZE;                                                               \
        if (p.y >= 0.0 && p.y <= 1.0 && p.x >= 0.0 && p.x <= float(LEN) * 0.5) { \
            int idx = int(p.x / 0.5);                                            \
            vec2 charUV = vec2(mod(p.x, 0.5) / 0.5, p.y);                        \
            charUV.x = charUV.x * 0.6 + 0.2;                                     \
            finalMask = max(finalMask, printChar(charUV, CHARS[idx], FONT_TEX)); \
        }                                                                        \
    }

float getTextFade(float time, float start, float hold, float fade) {
    float fadeIn = smoothstep(start, start + fade, time);
    float fadeOut = 1.0 - smoothstep(start + fade + hold, start + fade + hold + fade, time);
    return fadeIn * fadeOut;
}

float evaluateCredits(vec2 textUV, float time, sampler2D fontTex) {
    float totalMask = 0.0;
    float loopTime = mod(time, 180.0);

    float aspect = iResolution.x / iResolution.y;
    float targetAspect = 2.35;
    float barHeight = max(0.0, (1.0 - (aspect / targetAspect)) / 2.0);

    float leftX = 0.5 - 0.5 * aspect + 0.04 * aspect; 
    float topY = (1.0 - barHeight) - 0.06;           
    vec2 pos = vec2(leftX, topY);
    float textSize = 0.048;

    float a1 = getTextFade(loopTime, 2.0, 4.0, 1.0);
    if (a1 > 0.0) {
        float finalMask = 0.0; 
        int l1[25] = int[25](77,79,79,84,84,79,82,73,84,73,69,32,40,79,85,84,82,85,78,41,32,50,48,50,54);
        DRAW_TEXT(pos, textSize, -1.0, l1, 25, fontTex);
        totalMask = max(totalMask, finalMask * a1);
    }

    float a2 = getTextFade(loopTime, 12.0, 4.0, 1.0);
    if (a2 > 0.0) {
        float finalMask = 0.0;
        int l2[18] = int[18](65,32,68,32,38,32,68,32,80,82,79,68,85,67,84,73,79,78);
        DRAW_TEXT(pos, textSize, -1.0, l2, 18, fontTex);
        totalMask = max(totalMask, finalMask * a2);
    }

    float a3 = getTextFade(loopTime, 24.0, 5.0, 1.0);
    if (a3 > 0.0) {
        float finalMask = 0.0;
        int l3[26] = int[26](67,79,68,73,78,71,58,32,68,65,84,72,79,82,32,38,32,68,73,65,84,82,73,66,69,83);
        DRAW_TEXT(pos, textSize, -1.0, l3, 26, fontTex);
        totalMask = max(totalMask, finalMask * a3);
    }

    float a4 = getTextFade(loopTime, 38.0, 5.0, 1.0);
    if (a4 > 0.0) {
        float finalMask = 0.0;
        int l4[26] = int[26](77,73,83,83,196,32,79,78,32,83,69,85,82,65,85,86,65,32,80,73,73,82,65,75,75,65);
        DRAW_TEXT(pos, textSize, -1.0, l4, 26, fontTex);
        totalMask = max(totalMask, finalMask * a4);
    }

    float a5 = getTextFade(loopTime, 52.0, 6.0, 1.0);
    if (a5 > 0.0) {
        float finalMask = 0.0;
        int l5[24] = int[24](77,85,83,73,67,58,32,80,67,82,85,83,72,32,38,32,77,82,32,76,65,73,78,69);
        DRAW_TEXT(pos, textSize, -1.0, l5, 24, fontTex);
        totalMask = max(totalMask, finalMask * a5);
    }

    float a6 = getTextFade(loopTime, 68.0, 5.0, 1.0);
    if (a6 > 0.0) {
        float finalMask = 0.0;
        int l6[24] = int[24](79,76,69,77,77,69,75,79,32,74,79,32,74,89,86,196,83,75,89,76,196,83,83,196);
        DRAW_TEXT(pos, textSize, -1.0, l6, 24, fontTex);
        totalMask = max(totalMask, finalMask * a6);
    }

    float a7 = getTextFade(loopTime, 85.0, 5.0, 1.0);
    if (a7 > 0.0) {
        float finalMask = 0.0;
        int l7[22] = int[22](69,73,32,75,65,76,74,65,65,32,73,76,77,65,78,32,75,79,79,68,73,65);
        DRAW_TEXT(pos, textSize, -1.0, l7, 22, fontTex);
        totalMask = max(totalMask, finalMask * a7);
    }

    float a8 = getTextFade(loopTime, 110.0, 10.0, 1.0);
    if (a8 > 0.0) {
        float finalMask = 0.0;
        int l8[25] = int[25](84,69,82,86,69,73,83,69,84,32,77,83,77,48,49,32,74,65,32,77,85,73,76,76,69);
        DRAW_TEXT(pos, textSize, -1.0, l8, 25, fontTex);
        totalMask = max(totalMask, finalMask * a8);
    }

    float a9 = getTextFade(loopTime, 162.0, 8.0, 1.0);
    if (a9 > 0.0) {
        float finalMask = 0.0;
        int l9[18] = int[18](75,73,73,84,79,83,32,74,65,32,78,196,75,69,77,73,73,78);
        DRAW_TEXT(pos, textSize, -1.0, l9, 18, fontTex);
        totalMask = max(totalMask, finalMask * a9);
    }

    return clamp(totalMask, 0.0, 1.0);
}

float getGrain(vec2 uv, float time) {
    return fract(sin(dot(uv, vec2(12.9898, 78.233)) + time) * 43758.5453) - 0.5;
}

vec4 fxaa(sampler2D tex, vec2 uv, vec2 texelSize) {
    const float span_max = 8.0;
    const float reduce_min = (1.0 / 128.0);
    const float reduce_mul = (1.0 / 32.0);
    const vec3 luma = vec3(0.299, 0.587, 0.114);
    
    vec3 rgbCC = texture(tex, uv).rgb;
    vec3 rgb00 = texture(tex, uv + vec2(-0.5, -0.5) * texelSize).rgb;
    vec3 rgb10 = texture(tex, uv + vec2(+0.5, -0.5) * texelSize).rgb;
    vec3 rgb01 = texture(tex, uv + vec2(-0.5, +0.5) * texelSize).rgb;
    vec3 rgb11 = texture(tex, uv + vec2(+0.5, +0.5) * texelSize).rgb;
    
    float lumaCC = dot(rgbCC, luma);
    float luma00 = dot(rgb00, luma);
    float luma10 = dot(rgb10, luma);
    float luma01 = dot(rgb01, luma);
    float luma11 = dot(rgb11, luma);
    
    vec2 dir;
    dir.x = (luma01 + luma11) - (luma00 + luma10);
    dir.y = (luma00 + luma01) - (luma10 + luma11);
    
    float dirReduce = max((luma00 + luma10 + luma01 + luma11) * reduce_mul, reduce_min);
    float rcpDir = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = clamp(dir * rcpDir, -span_max, span_max) * texelSize;
    
    vec4 sampleA = 0.5 * (
        texture(tex, uv - dir * (1.0 / 6.0)) +
        texture(tex, uv + dir * (1.0 / 6.0))
    );
    vec4 sampleB = sampleA * 0.5 + 0.25 * (
        texture(tex, uv - dir * 0.5) +
        texture(tex, uv + dir * 0.5)
    );
    
    float lumaMin = min(lumaCC, min(min(luma00, luma10), min(luma01, luma11)));
    float lumaMax = max(lumaCC, max(max(luma00, luma10), max(luma01, luma11)));
    float lumaB = dot(sampleB.rgb, luma);
    
    if (lumaB < lumaMin || lumaB > lumaMax) return sampleA;
    else return sampleB;
}

vec3 applyCinematicLens(sampler2D tex, vec2 uv, vec2 vUV, vec2 texelSize) {
    float distSq = dot(vUV, vUV);
    vec2 caOffset = vUV * 0.015 * distSq;
    
    float focusDepth = clamp(texture(tex, vec2(0.5, 0.35)).a, 0.05, 0.4);
    
    vec4 cR = fxaa(tex, uv - caOffset, texelSize);
    vec4 cG = fxaa(tex, uv, texelSize);
    vec4 cB = fxaa(tex, uv + caOffset, texelSize);
    
    vec3 centerCol = vec3(cR.r, cG.g, cB.b);
    float depth = cG.a; 
    
    float coc = clamp(abs(depth - focusDepth) * 5.0, 0.0, 1.0);
    
    if (coc < 0.02) return centerCol; 
    
    vec3 color = vec3(0.0);
    float tot = 0.0;
    
    float radius = 0.0;
    float angle = 0.0;
    const int TAPS = 24;
    
    for(int i = 0; i < TAPS; i++) {
        vec2 offset = vec2(cos(angle), sin(angle)) * radius * coc * 0.02; 
        offset.x *= iResolution.y / iResolution.x; 
        
        float r = texture(tex, uv - caOffset + offset).r;
        float g = texture(tex, uv + offset).g;
        float b = texture(tex, uv + caOffset + offset).b;
        
        color += vec3(r, g, b);
        tot += 1.0;
        
        radius += 1.0 / float(TAPS);
        angle += 2.39996323;
    }
    
    float blend = smoothstep(0.02, 0.06, coc);
    return mix(centerCol, color / tot, blend);
}

void mainImage(out vec4 fragColor, vec2 fragCoord) {
    vec2 texelSize = 1.0 / iResolution.xy;
    vec2 uv = fragCoord * texelSize;
    
    float targetAspect = 2.35;
    float screenAspect = iResolution.x / iResolution.y;
    float barHeight = max(0.0, (1.0 - (screenAspect / targetAspect)) / 2.0);

    if (uv.y < barHeight || uv.y > 1.0 - barHeight) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return; 
    }

    vec2 vUV = uv - 0.5;
    
    vec3 finalColor = applyCinematicLens(iChannel0, uv, vUV, texelSize);
    finalColor = max(finalColor, 0.0);

    vec2 textUV = uv;
    textUV.x = (textUV.x - 0.5) * (iResolution.x / iResolution.y) + 0.5;
    float bpm = 124.0 / 60.0; 
    float beatPulse = exp(-fract(iTime * bpm) * 6.0); 
    
    float blockY = floor(textUV.y * 25.0);
    float glitchNoise = fract(sin(blockY * 12.9898 + iTime) * 43758.5453) - 0.5;
    textUV.x += glitchNoise * 0.03 * beatPulse; 
    
    float textMask = evaluateCredits(textUV, iTime, iChannel3);
    
    if (textMask > 0.0) {
        float shadowMask = 0.0;
        float sOff = 0.003;
        shadowMask = max(shadowMask, evaluateCredits(textUV + vec2(sOff, sOff), iTime, iChannel3));
        shadowMask = max(shadowMask, evaluateCredits(textUV + vec2(-sOff, sOff), iTime, iChannel3));
        shadowMask = max(shadowMask, evaluateCredits(textUV + vec2(sOff, -sOff), iTime, iChannel3));
        shadowMask = max(shadowMask, evaluateCredits(textUV + vec2(-sOff, -sOff), iTime, iChannel3));

        finalColor = mix(finalColor, vec3(0.0), shadowMask * 0.8);
        finalColor = mix(finalColor, vec3(0.98, 0.99, 1.0), textMask);
    }

    finalColor *= 1.1; 
    finalColor = (finalColor * (1.0 + finalColor * 0.05)) / (1.0 + finalColor * 0.2); 

    finalColor = pow(finalColor, vec3(0.4545)); 

    finalColor = finalColor * finalColor * (3.0 - 2.0 * finalColor);
    
    float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
    finalColor = mix(vec3(luminance), finalColor, 1.25); 
    finalColor *= vec3(1.05, 0.98, 0.95); 

    float vignette = smoothstep(1.5, 0.3, length(vUV)); 
    finalColor *= mix(1.0, vignette, 0.4); 
    
    float grain = getGrain(uv, iTime);
    finalColor += grain * 0.04; 

    fragColor = vec4(finalColor, 1.0);
}