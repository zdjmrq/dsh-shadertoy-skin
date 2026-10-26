// Deliberately broken shader used to verify the player's error panel.
// (dev fixture, excluded from the npm package)
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = fragCoord / iResolution.xy
  fragColor = vec4(p, 0.0, 1.0);
}
