// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

// ============================================================================
// TRACK INFO: D & D - Moottoritie - Coastal Synthwave stuff?
// Arranged by PCrush & Mr Laine
// Tempo: 120 BPM | Length: 180 Seconds | Key: F Minor / Eb Major
// Instrumentation: Analog Moog Sub-Bass, TR-909/808 Hybrid Rhythm Section,
// Polyphonic Dual-Finger Piano, Warm Triple-Saw Strings, Coastal Lead Synth,
// Environmental Shoreline Breeze & Dynamic Sidechain Compressor.
// ============================================================================
#define TAU (2. * acos(-1.0))
#define FREQ(nn) (440. * exp2((nn - 9.) / 12.))

#define BPM 120.0                     
#define BEAT      (60.0 / BPM)       
#define BAR       (BEAT * 4.0)       
#define EIGHTH    (BEAT * 0.5)       
#define SIXTEENTH (BEAT * 0.25)      
#define TIME_SCALE (BPM / 120.0)     

#define STEP(nn, dur) if (t < (dur)) { return vec3(nn, t, dur); } t -= dur;

struct Waveform { vec2 wave; vec2 env; };
const Waveform SILENCE = Waveform(vec2(0), vec2(0));

Waveform MakeWave(vec2 w) { return Waveform(w, vec2(1)); }
Waveform MakeWave(float w) { return Waveform(vec2(w), vec2(1)); }

void AddAudio(inout Waveform a, in Waveform b) { 
    a = Waveform(a.wave + b.wave, a.env + b.env); 
}

Waveform ApplyEnv(Waveform a, vec2 env) { return Waveform(a.wave * env, a.env * env * env); }
Waveform ApplyEnv(Waveform a, float env) { return Waveform(a.wave * env, a.env * env * env); }
Waveform ApplyEnv(vec2 a, float env) { return ApplyEnv(MakeWave(a), vec2(env)); }
Waveform ApplyEnv(float a, float env) { return ApplyEnv(MakeWave(a), vec2(env)); }
Waveform ApplyEnv(float a, vec2 env) { return ApplyEnv(MakeWave(a), env); }

float envAD(float tenv, float atk, float dec) {
    return smoothstep(0.0, atk, tenv) * exp(-max(0.0, tenv - atk) * dec);
}

float lfo(float speed, float t) {
    return sin(TAU * speed * t);
}

float softClip(float wave, float drive) {
    return tanh(wave * drive) / tanh(drive);
}

float antiClick(float t, float dur, float fadeTime) {
    return 1.0 - smoothstep(dur - fadeTime, dur, t);
}

float antiClick(float t, float dur) {
    return 1.0 - smoothstep(dur - 0.05, dur, t);
}

float analogSawBase(float x, float fc) {
    float tau = min(0.5, 0.75 / fc);
    x -= round(x);
    return mix(-1. - 2. * x, 1. - 2. * x, smoothstep(-tau, tau, x));
}

float rand(float p) {
    p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p);
}

float noise(float s) {
    int si = int(floor(s)); float sf = fract(s); sf = sf * sf * (3. - 2. * sf);
    return mix(rand(float(si)), rand(float(si + 1)), sf) * 2. - 1.;
}

float bandpassNoise(float t, float centerFreq, float bandwidth) {   
    return sin(TAU * centerFreq * fract(t)) * noise(t * bandwidth);
}

Waveform tr909Kick(float t, float tenv, float decay, float tune) {
    float env = envAD(tenv, 0.001, decay);
    float pitchEnv = exp(-tenv * 40.0) * 2.5; 
    float realPhase = TAU * tune * (t + pitchEnv * 0.015);
    float click = noise(t * 1000.0) * envAD(tenv, 0.001, 50.0);
    return ApplyEnv(MakeWave(softClip(sin(realPhase) + click * 0.5, 1.5)), env);
}

Waveform tr808Snare(float t, float tenv) {
    float bodyWave = (sin(TAU * 180.0 * t) + 0.4 * sin(TAU * 330.0 * t)) * envAD(tenv, 0.001, 40.0);
    float snapWave = bandpassNoise(t, 5500.0, 3500.0) * envAD(tenv, 0.001, 25.0);
    Waveform track = MakeWave(bodyWave + snapWave * 0.85);
    track.wave = vec2(softClip(track.wave.x, 1.3));
    return ApplyEnv(track, envAD(tenv, 0.001, 1.0));
}

Waveform closedHat(float t, float tenv) {
    float noiseSig = bandpassNoise(t, 10000.0, 3000.0);
    float env = exp(-tenv * 60.0);
    vec2 stereo = vec2(noiseSig * 0.7, noiseSig * 1.0);
    return ApplyEnv(MakeWave(stereo * 0.1), env);
}

Waveform openHat(float t, float tenv) {
    float sizzle = bandpassNoise(t, 13000.0, 4000.0);
    float env = exp(-tenv * 12.0);
    vec2 stereo = vec2(sizzle * 1.0, sizzle * 0.7);
    return ApplyEnv(MakeWave(stereo * 0.18), env);
}

Waveform moogBass(float f, float t, float tenv) {
    float saw1 = analogSawBase(fract(f * t), 3000.0 / f);
    float saw2 = analogSawBase(fract(f * 1.01 * t), 3000.0 / f);
    return ApplyEnv(MakeWave(softClip((saw1 + saw2) * 0.5, 2.5)), envAD(tenv, 0.01, 4.0));
}

Waveform dreamPiano(float f, float t, float tenv, float vel) {
    float core = sin(TAU * f * t) + 0.2 * sin(TAU * f * 2.0 * t);
    float strings = analogSawBase(fract(f * t), 1500.0 / f) * exp(-tenv * 15.0);
    return ApplyEnv((core * 0.8) + (strings * 0.5), envAD(tenv, 0.005, 2.0) * vel);
}

Waveform dreamStrings(float f, float t, float tenv) {
    float v1 = analogSawBase(fract(f * t), 3000.0 / f);
    float v2 = analogSawBase(fract(f * 1.002 * t), 3000.0 / f);
    float v3 = analogSawBase(fract(f * 0.998 * t), 3000.0 / f);
    float wave = (v1 + v2 + v3) * 0.33;
    return ApplyEnv(MakeWave(wave), envAD(tenv, 0.4, 0.3)); 
}

Waveform coastalLead(float f, float t, float tenv) {
    float vibrato = lfo(5.0, t) * 0.008;
    float phase1 = fract(f * t + vibrato);
    float phase2 = fract(f * 1.002 * t - vibrato);
    float saw1 = analogSawBase(phase1, 3500.0 / f);
    float saw2 = analogSawBase(phase2, 3500.0 / f);
    float subSine = sin(TAU * f * t) * 0.4;
    float wave = (saw1 + saw2) * 0.35 + subSine;
    float ampEnv = envAD(tenv, 0.02, 1.2);
    return ApplyEnv(MakeWave(wave), ampEnv);
}

vec4 getOutrunChordsA(float t) {
    t = mod(t, BAR * 4.0);
    if (t < BAR * 1.0) return vec4(-7., -4., 0., 3.);   
    if (t < BAR * 2.0) return vec4(-9., -5., -2., 3.);  
    if (t < BAR * 3.0) return vec4(-11., -7., -4., 1.); 
    return vec4(-9., -5., -2., 3.);                     
}

vec3 outrunMelodyA(float t_in) {
    if (t_in < 0.0) return vec3(-100., 0., 0.);
    float t = mod(t_in, BAR * 2.0); 
    STEP( 12., EIGHTH) STEP( 15., EIGHTH) STEP( 17., EIGHTH)
    STEP( 19., EIGHTH + BEAT) 
    STEP( 17., EIGHTH) STEP( 15., EIGHTH) STEP( 12., EIGHTH) STEP( 10., EIGHTH)
    STEP( 12., BEAT * 2.0)
    return vec3(-100., 0., 0.);
}

vec4 dualPianoPattern(float t_in) {
    if (t_in < 0.0) return vec4(-100., -100., 0., 0.);
    float t = mod(t_in, BAR * 1.0);
    
    if (t < EIGHTH) return vec4(12., 15., t, EIGHTH); t -= EIGHTH;
    if (t < EIGHTH) return vec4(7.,  12., t, EIGHTH); t -= EIGHTH;
    if (t < EIGHTH) return vec4(3.,   7., t, EIGHTH); t -= EIGHTH;
    if (t < EIGHTH) return vec4(7.,  12., t, EIGHTH); t -= EIGHTH;
    
    if (t < EIGHTH) return vec4(10., 14., t, EIGHTH); t -= EIGHTH;
    if (t < EIGHTH) return vec4(7.,  12., t, EIGHTH); t -= EIGHTH;
    if (t < EIGHTH) return vec4(3.,   7., t, EIGHTH); t -= EIGHTH;
    if (t < EIGHTH) return vec4(7.,  12., t, EIGHTH); 
    
    return vec4(-100., -100., 0., 0.);
}

Waveform oceanBreeze(float t) {
    float swell = 0.5 + 0.5 * sin(TAU * t / 16.0); 
    float windFreq = 250.0 + swell * 900.0;
    float wind = bandpassNoise(t, windFreq, 800.0);
    float surf = noise(t * 3000.0) * smoothstep(0.1, 1.0, swell) * 0.15; 
    return ApplyEnv(MakeWave(wind * 0.35 + surf), 1.0); 
}

Waveform clubDrums(float t) {
    Waveform track = SILENCE;
    float tKick = mod(t, BEAT);
    AddAudio(track, ApplyEnv(tr909Kick(tKick, tKick * TIME_SCALE, 3.5, 42.0), 0.75));
    
    float currentBeat = mod(floor(t / BEAT + 0.005), 4.0);
    if (currentBeat == 1.0 || currentBeat == 3.0) {
        float tSnare = mod(t, BEAT);
        AddAudio(track, ApplyEnv(tr808Snare(tSnare, tSnare * TIME_SCALE), 0.38));
    }
    
    float tHat = mod(t, SIXTEENTH);
    AddAudio(track, ApplyEnv(closedHat(tHat, tHat * TIME_SCALE), 1.0));
    
    float tOpen = mod(t + EIGHTH, BEAT);
    if (mod(floor((t + EIGHTH) / BEAT), 1.0) == 0.0) {
        AddAudio(track, ApplyEnv(openHat(tOpen, tOpen * TIME_SCALE), 1.0));
    }
    return track;
}

Waveform fullArrangement(float t_in) {
    Waveform masterOut = SILENCE;
    float t = max(t_in, 0.);

    float masterEnv = smoothstep(0., BAR * 1.0, t) * smoothstep(180.0, 174.0, t);
    float breezeVol = mix(0.15, 0.45, smoothstep(15.0, 0.0, t) + smoothstep(165.0, 180.0, t));
    AddAudio(masterOut, ApplyEnv(oceanBreeze(t), breezeVol));
    
    float pump = mix(0.5, 1.0, smoothstep(0.0, 0.22, mod(t, BEAT)));
    vec4 c = getOutrunChordsA(t);

    if (t >= 5.0 && t < 172.0) {
        float drumFade = smoothstep(172.0, 165.0, t);
        AddAudio(masterOut, ApplyEnv(clubDrums(t), drumFade));
    }

    if (t < 45.0) {
        float chordTime = mod(t, BAR); 
        Waveform pad1 = dreamStrings(FREQ(c.y), chordTime, chordTime * TIME_SCALE);
        Waveform pad2 = dreamStrings(FREQ(c.z), chordTime, chordTime * TIME_SCALE);
        AddAudio(masterOut, ApplyEnv(pad1, antiClick(chordTime, BAR, 0.1) * 0.15));
        AddAudio(masterOut, ApplyEnv(pad2, antiClick(chordTime, BAR, 0.1) * 0.15));

        float beatTime = mod(t, EIGHTH);
        float bassVol = smoothstep(0.0, 5.0, t) * 0.45; 
        Waveform bass = moogBass(FREQ(c.x), beatTime, beatTime * TIME_SCALE);
        AddAudio(masterOut, ApplyEnv(bass, antiClick(beatTime, EIGHTH, 0.02) * (t >= 5.0 ? pump : 1.0) * bassVol));

        if (t >= 15.0) {
            vec4 pNote = dualPianoPattern(t);
            if (pNote.x != -100.) {
                Waveform p1 = dreamPiano(FREQ(pNote.x), pNote.z, pNote.z * TIME_SCALE, 0.65);
                Waveform p2 = dreamPiano(FREQ(pNote.y), pNote.z, pNote.z * TIME_SCALE, 0.55);
                AddAudio(masterOut, ApplyEnv(p1, antiClick(pNote.z, pNote.w, 0.03) * pump * 0.3));
                AddAudio(masterOut, ApplyEnv(p2, antiClick(pNote.z, pNote.w, 0.03) * pump * 0.3));
            }
        }

        if (t >= 30.0) {
            vec3 note = outrunMelodyA(t - 30.0);
            if (note.x != -100.) {
                Waveform lead = coastalLead(FREQ(note.x), note.y, note.y * TIME_SCALE);
                AddAudio(masterOut, ApplyEnv(lead, antiClick(note.y, note.z, 0.03) * 0.45));
            }
        }
    }

    if (t >= 45.0 && t < 55.0) {
        float beatTime = mod(t, EIGHTH);
        Waveform bass = moogBass(FREQ(c.x), beatTime, beatTime * TIME_SCALE);
        AddAudio(masterOut, ApplyEnv(bass, antiClick(beatTime, EIGHTH, 0.02) * pump * 0.45));

        vec4 pNote = dualPianoPattern(t);
        if (pNote.x != -100.) {
            Waveform p1 = dreamPiano(FREQ(pNote.x), pNote.z, pNote.z * TIME_SCALE, 0.55);
            AddAudio(masterOut, ApplyEnv(p1, antiClick(pNote.z, pNote.w, 0.03) * pump * 0.25));
        }
    }

    if (t >= 55.0 && t < 90.0) {
        float chordTime = mod(t, BAR); 
        Waveform pad1 = dreamStrings(FREQ(c.y), chordTime, chordTime * TIME_SCALE);
        Waveform pad2 = dreamStrings(FREQ(c.z), chordTime, chordTime * TIME_SCALE);
        AddAudio(masterOut, ApplyEnv(pad1, antiClick(chordTime, BAR, 0.1) * 0.18));
        AddAudio(masterOut, ApplyEnv(pad2, antiClick(chordTime, BAR, 0.1) * 0.18));

        float beatTime = mod(t, EIGHTH);
        Waveform bass = moogBass(FREQ(c.x), beatTime, beatTime * TIME_SCALE);
        AddAudio(masterOut, ApplyEnv(bass, antiClick(beatTime, EIGHTH, 0.02) * pump * 0.45));

        vec4 pNote = dualPianoPattern(t);
        if (pNote.x != -100.) {
            Waveform p1 = dreamPiano(FREQ(pNote.x), pNote.z, pNote.z * TIME_SCALE, 0.6);
            Waveform p2 = dreamPiano(FREQ(pNote.y), pNote.z, pNote.z * TIME_SCALE, 0.5);
            AddAudio(masterOut, ApplyEnv(p1, antiClick(pNote.z, pNote.w, 0.03) * pump * 0.28));
            AddAudio(masterOut, ApplyEnv(p2, antiClick(pNote.z, pNote.w, 0.03) * pump * 0.28));
        }

        vec3 note = outrunMelodyA(t - 55.0);
        if (note.x != -100.) {
            Waveform lead = coastalLead(FREQ(note.x + 12.0), note.y, note.y * TIME_SCALE);
            AddAudio(masterOut, ApplyEnv(lead, antiClick(note.y, note.z, 0.03) * 0.42));
        }
    }

    if (t >= 90.0 && t < 100.0) {
        float beatTime = mod(t, EIGHTH);
        Waveform bass = moogBass(FREQ(c.x), beatTime, beatTime * TIME_SCALE);
        AddAudio(masterOut, ApplyEnv(bass, antiClick(beatTime, EIGHTH, 0.02) * pump * 0.45));

        vec4 pNote = dualPianoPattern(t);
        if (pNote.x != -100.) {
            Waveform p1 = dreamPiano(FREQ(pNote.x), pNote.z, pNote.z * TIME_SCALE, 0.55);
            AddAudio(masterOut, ApplyEnv(p1, antiClick(pNote.z, pNote.w, 0.03) * pump * 0.25));
        }
    }

    if (t >= 100.0 && t < 160.0) {
        float chordTime = mod(t, BAR); 
        Waveform pad1 = dreamStrings(FREQ(c.y), chordTime, chordTime * TIME_SCALE);
        Waveform pad2 = dreamStrings(FREQ(c.z), chordTime, chordTime * TIME_SCALE);
        AddAudio(masterOut, ApplyEnv(pad1, antiClick(chordTime, BAR, 0.1) * 0.2));
        AddAudio(masterOut, ApplyEnv(pad2, antiClick(chordTime, BAR, 0.1) * 0.2));

        float beatTime = mod(t, EIGHTH);
        Waveform bass = moogBass(FREQ(c.x), beatTime, beatTime * TIME_SCALE);
        AddAudio(masterOut, ApplyEnv(bass, antiClick(beatTime, EIGHTH, 0.02) * pump * 0.48));

        vec4 pNote = dualPianoPattern(t);
        if (pNote.x != -100.) {
            Waveform p1 = dreamPiano(FREQ(pNote.x), pNote.z, pNote.z * TIME_SCALE, 0.65);
            Waveform p2 = dreamPiano(FREQ(pNote.y), pNote.z, pNote.z * TIME_SCALE, 0.55);
            AddAudio(masterOut, ApplyEnv(p1, antiClick(pNote.z, pNote.w, 0.03) * pump * 0.3));
            AddAudio(masterOut, ApplyEnv(p2, antiClick(pNote.z, pNote.w, 0.03) * pump * 0.3));
        }

        if (t >= 115.0 && t < 155.0) {
            vec3 note = outrunMelodyA(t - 115.0);
            if (note.x != -100.) {
                Waveform lead = coastalLead(FREQ(note.x), note.y, note.y * TIME_SCALE);
                AddAudio(masterOut, ApplyEnv(lead, antiClick(note.y, note.z, 0.03) * 0.45));
            }
        }
    }

    if (t >= 160.0) {
        float outroFade = smoothstep(180.0, 168.0, t);
        
        float padClock = mod(t, BAR * 2.0);
        Waveform outroPad = dreamStrings(FREQ(c.y), padClock, padClock * TIME_SCALE);
        AddAudio(masterOut, ApplyEnv(outroPad, antiClick(padClock, BAR * 2.0, 0.1) * outroFade * 0.22));

        float bassFade = smoothstep(175.0, 165.0, t);
        float beatTime = mod(t, EIGHTH);
        Waveform bass = moogBass(FREQ(c.x), beatTime, beatTime * TIME_SCALE);
        AddAudio(masterOut, ApplyEnv(bass, antiClick(beatTime, EIGHTH, 0.02) * pump * 0.4 * bassFade));

        vec4 pNote = dualPianoPattern(t);
        if (pNote.x != -100.) {
            Waveform p1 = dreamPiano(FREQ(pNote.x), pNote.z, pNote.z * TIME_SCALE, 0.55);
            Waveform p2 = dreamPiano(FREQ(pNote.y), pNote.z, pNote.z * TIME_SCALE, 0.45);
            AddAudio(masterOut, ApplyEnv(p1, antiClick(pNote.z, pNote.w, 0.03) * pump * outroFade * 0.25));
            AddAudio(masterOut, ApplyEnv(p2, antiClick(pNote.z, pNote.w, 0.03) * pump * outroFade * 0.25));
        }
    }

    masterOut.wave = clamp(masterOut.wave, -1.0, 1.0);
    return ApplyEnv(masterOut, masterEnv * 0.85);
}

vec2 mainSound(int samp, float t) {
    return fullArrangement(t).wave;
}