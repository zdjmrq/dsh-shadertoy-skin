// Legacy (WebGL1 style) main(): verifies the ES3 rewrite path (gl_FragColor -> st_out).
void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  gl_FragColor = vec4(uv.x, 0.35, uv.y, 1.0);
}
