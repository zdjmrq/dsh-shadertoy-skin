// Dev fixture image pass for the music-loop test (see decay-sound-sound.glsl).
void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
  vec2 p = fragCoord / iResolution.xy;
  fragColor = vec4(0.1 + 0.2 * p.x, 0.2, 0.3 + 0.2 * p.y, 1.0);
}
