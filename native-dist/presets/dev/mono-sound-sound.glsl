// Dev fixture: ShaderToy's mono + sample-index sound signature.
// `float mainSound(in int samp, float time)` must be accepted too (many ShaderToy
// audio passes use it); the player duplicates the mono sample into both channels.
float mainSound( in int samp, float time ) {
  return 0.3 * sin( 6.2831853 * 440.0 * time );
}
