// pulse.glsl — MIT licensed, self-written for dsh-shadertoy-skin (no third-party code).
// Image pass paired with pulse-sound.glsl: a slow breathing light field, low GPU cost.
void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime;
    float r = length(p);
    float a = atan(p.y, p.x);

    // soft concentric rings + a wandering core
    float ring = sin(r * 11.0 - t * 2.2 + sin(a * 3.0 + t * 0.7) * 1.6);
    vec3 col = vec3(0.015, 0.025, 0.055);
    col += vec3(0.10, 0.45, 0.95) * smoothstep(0.15, 0.95, ring) * exp(-r * 1.6) * 0.55;
    col += vec3(0.85, 0.20, 0.55) * pow(max(0.0, 1.0 - r * 1.15), 3.0) * (0.55 + 0.45 * sin(t * 1.6));
    col += vec3(0.35, 0.55, 0.90) * 0.06 * (0.5 + 0.5 * sin(p.x * 7.0 + t * 0.9));
    col = col / (1.0 + col * 0.55);            // gentle tone map
    col *= 1.0 - 0.35 * smoothstep(0.2, 1.1, r);
    fragColor = vec4(col, 1.0);
}
