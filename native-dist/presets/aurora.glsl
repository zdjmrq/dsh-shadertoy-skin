// Aurora — self-written for dsh-shadertoy-skin, MIT licensed.
// Pure procedural single pass. Calm, dark, low GPU cost: good default background.

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
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
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = p * 2.07 + vec2(3.1, 7.7);
    amp *= 0.5;
  }
  return sum;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime * 0.05;

  // night sky, a little lighter towards the horizon
  vec3 col = vec3(0.007, 0.010, 0.022);
  col += vec3(0.020, 0.034, 0.058) * smoothstep(-0.85, 0.55, p.y);

  // the ribbon's centre line, snaking slowly
  float y0 = 0.02 + 0.15 * sin(p.x * 1.35 + t * 1.9) + 0.07 * sin(p.x * 0.50 - t * 1.1);
  float d = p.y - y0;
  float glow = exp(-pow(d * 2.9, 2.0));   // soft band
  float core = exp(-pow(d * 8.0, 2.0));   // thin bright spine

  // vertical rays + slow horizontal patchiness
  float rayA = fbm(vec2(p.x * 6.5 + t * 1.5, 0.5 + t * 0.12));
  float rayB = noise(vec2(p.x * 31.0 - t * 2.1, 0.5));
  float rays = 0.30 + 0.70 * rayA + 0.22 * rayB;
  float plume = smoothstep(0.22, 0.88, fbm(vec2(p.x * 2.1 - t * 0.9, p.y * 0.7 + t * 0.3)));
  float aurora = glow * rays * (0.30 + 1.00 * plume);

  // colour ramp: green core -> cyan -> violet towards the upper edge
  vec3 green = vec3(0.10, 0.92, 0.52);
  vec3 cyan = vec3(0.14, 0.76, 0.88);
  vec3 violet = vec3(0.50, 0.24, 0.94);
  vec3 tint = mix(green, cyan, smoothstep(-0.10, 0.16, d));
  tint = mix(tint, violet, smoothstep(0.12, 0.42, d));

  col += tint * aurora * 0.62;
  col += vec3(0.62, 0.95, 0.82) * core * 0.40;

  // sparse stars
  float star = hash(floor(fragCoord * 0.55) + 0.37);
  col += smoothstep(0.9986, 1.0, star) * vec3(0.70, 0.82, 1.0) * 0.5;

  col *= 1.0 - 0.32 * dot(p * 0.85, p * 0.85);
  fragColor = vec4(col, 1.0);
}
