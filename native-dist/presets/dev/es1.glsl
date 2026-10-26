// ES 1.00 only construct (gl_FragData): forces the ES3 attempt to fail and
// verifies the ES 1.00 fallback path. (dev fixture, excluded from the npm package)
void main() {
  gl_FragData[0] = vec4(0.12, 0.30, 0.55, 1.0);
}
