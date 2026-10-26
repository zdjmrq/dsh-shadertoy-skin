// pulse-sound.glsl — MIT licensed, self-written for dsh-shadertoy-skin (no third-party code).
// Sound pass for pulse.glsl: a small self-playing arpeggio + bass + kick/hat.
// ShaderToy contract: vec2 mainSound(float time) -> (left, right), -1..1.
#define TAU 6.28318530718

float hash11(float n)
{
    return fract(sin(n * 12.9898) * 43758.5453123);
}

vec2 mainSound(float time)
{
    float t = max(time, 0.0);

    // 8-step arpeggio, one step per 0.25 s, rolling through a minor-ish scale.
    float stepLen = 0.25;
    float stepIndex = floor(t / stepLen);
    float stepPhase = fract(t / stepLen);
    float semitone = 12.0 + mod(stepIndex, 8.0) * 3.0;
    float freq = 220.0 * exp2(semitone / 12.0);

    float lead = sin(TAU * freq * t) * exp(-stepPhase * 7.0) * 0.22;
    lead += sin(TAU * freq * 2.0 * t) * exp(-stepPhase * 10.0) * 0.05;

    // Bass changes every bar (2 steps).
    float bassSemitone = mod(floor(t / 0.5), 4.0) * 3.0;
    float bassFreq = 55.0 * exp2(bassSemitone / 12.0);
    float bass = sin(TAU * bassFreq * t) * 0.16;

    // Kick on every half second, hat on every eighth.
    float beat = fract(t / 0.5);
    float kick = sin(TAU * (150.0 - 95.0 * beat) * t) * exp(-beat * 16.0) * 0.24;
    float hat = (hash11(floor(t * 22050.0)) * 2.0 - 1.0) * exp(-fract(t / 0.125) * 32.0) * 0.035;

    vec2 mix = vec2(lead + bass + kick, lead + bass + hat);
    mix = tanh(mix * 1.1) * 0.85;      // soft limit, keeps decoded peak below 1.0
    return mix;
}
