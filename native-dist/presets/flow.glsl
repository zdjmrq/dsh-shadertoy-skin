// Flow — self-written for dsh-shadertoy-skin, MIT licensed.
// Pure procedural single pass: drifting colour bands with a soft central glow.

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = p * 2.11 + vec2(3.1, 7.7);
    amp *= 0.5;
  }
  return sum;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime * 0.10;
  float r = length(p);
  float a = atan(p.y, p.x);

  vec2 warp = vec2(
    fbm(p * 1.8 + vec2(t, -t * 0.7)),
    fbm(p * 1.8 + vec2(-t * 0.6, t * 1.1) + 4.3)
  );
  float w = fbm(p * 2.2 + warp * 1.6 + t * 0.4);
  float bands = 0.5 + 0.5 * sin((r * 7.5 - t * 3.0 + w * 4.0) * 1.6 + a * 2.0);

  vec3 deep = vec3(0.05, 0.10, 0.22);
  vec3 teal = vec3(0.10, 0.42, 0.55);
  vec3 plum = vec3(0.42, 0.22, 0.48);

  vec3 col = mix(deep, teal, smoothstep(0.15, 0.85, bands));
  col = mix(col, plum, smoothstep(0.55, 1.0, w) * 0.75);
  col += vec3(0.25, 0.55, 0.70) * pow(max(0.0, 1.0 - r * 1.4), 4.0) * 0.5;
  col *= 1.0 - 0.35 * dot(p, p);

  fragColor = vec4(col, 1.0);
}
