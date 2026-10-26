// Dev fixture: a tone that dies out after ~1 s, i.e. a finite ShaderToy piece.
// The music loop wraps the audio clock at 音乐时长 (audioSeconds) and fades the seam,
// so this file only has to be loud at the start of a cycle and silent later:
// if "loop" works the piece becomes audible again after every wrap.
float mainSound( in int samp, float time ) {
  return 0.4 * sin( 6.2831853 * 440.0 * time ) * clamp( 1.0 - time, 0.0, 1.0 );
}
