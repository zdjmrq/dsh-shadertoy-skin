// Dev fixture: plain image pass that goes with the mono-sound fixture.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = vec4(uv.x, 0.35, uv.y, 1.0);
}
