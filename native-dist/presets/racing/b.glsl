// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

// ==========================================================================
// BUFFER B: SCENE TRANSITIONS, MIXER & PING-PONG EFFECTS
// ==========================================================================
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    
    float cycleTime = mod(iTime, 120.0);
    
    vec4 ctxPacked = evaluateConductorPacked(cycleTime, NUM_OF_SEQ);
    float normTime   = ctxPacked.x; 
    int sceneId      = int(ctxPacked.y); 
    float localTime  = ctxPacked.w;    

    float sceneLength = (sceneId == 1) ? 10.0 : ((sceneId == 9) ? 25.0 : 15.0);
    
    // dsh-shadertoy: avoid the overwritten first texture sample.
    vec4 outData = transSlowShutter(uv, localTime, 2.5, iChannel0, iChannel1);
   
    fragColor = outData;
}
