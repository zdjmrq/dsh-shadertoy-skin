// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

/**
 * ============================================================================
 * TINYSHADE CINEMATIC CONDUCTOR
 * ============================================================================
 */
const int NUM_OF_SEQ = 22;
const vec3 s[22] = vec3[](
    vec3( 5000.0,      0.0, 4.0), // 00s-05s: Establishing Bird's Eye (ID 4)
    vec3(10000.0,   5000.0, 1.0), // 05s-15s: Classic High Follow (ID 1)
    vec3(15000.0,  15000.0, 7.0), // 15s-30s: Wide Sea Tracking (ID 7)
    vec3(15000.0,  30000.0, 3.0), // 30s-45s: Fixed Side Mount (ID 3)
    vec3( 2500.0,  45000.0, 8.0), // 45.0s-47.5s: Reverse Overtake (ID 8)
    vec3( 2500.0,  47500.0, 19.0),// 47.5s-50.0s: Dutch Tire Cam with Trails (ID 9, flag 1)
    vec3( 2500.0,  50000.0, 5.0), // 50.0s-52.5s: Roof Cam (ID 5)
    vec3( 2500.0,  52500.0, 4.0), // 52.5s-55.0s: Low Bird's Eye Slam (ID 4)
    vec3(15000.0,  55000.0, 2.0), // 55s-70s: Sea LookAt Pan (ID 2)
    vec3(20000.0,  70000.0, 6.0), // 70s-90s: Wall Steady-Cam (ID 6)
    vec3( 2500.0,  90000.0, 7.0), // 90.0s-92.5s: Wide Sea Tracking (ID 7)
    vec3( 2500.0,  92500.0, 8.0), // 92.5s-95.0s: Reverse Overtake (ID 8)
    vec3( 2500.0,  95000.0, 19.0),// 95.0s-97.5s: Dutch Tire Cam with Trails (ID 9, flag 1)
    vec3( 2500.0,  97500.0, 5.0), // 97.5s-100s: Roof Cam (ID 5)
    vec3( 5000.0, 100000.0, 10.0),// 100s-105s: Low Rear-Quarter Side Mount (ID 10)
    vec3( 3500.0, 105000.0, 3.0), // 105s-108.5s: Quick Side Mount Glance (ID 3)
    vec3( 4000.0, 108500.0, 9.0), // 108.5s-112.5s: Low Dutch Wheel Slam (ID 9)
    vec3( 7500.0, 112500.0, 8.0), // 112.5s-120s: Reverse Overtake Chase (ID 8)
    vec3(10000.0, 120000.0, 10.0),// 120s-130s: Low Rear-Quarter Side Mount (ID 10)
    vec3(15000.0, 130000.0, 6.0), // 130s-145s: Low Wall Steady-Cam (ID 6)
    vec3(15000.0, 145000.0, 3.0), // 145s-160s: Close Fender Mount (ID 3)
    vec3(20000.0, 160000.0, 1.0)  // 160s-180s: High Chase Outro (ID 1)
);

struct SceneContext {
    int id;
    int flags;
    float t;
    float localTime;
    bool state;
};

SceneContext evaluateConductor(float globalTime, int count) {
    SceneContext ctx;
    ctx.id = 0; ctx.flags = 0; ctx.t = 0.0; ctx.localTime = 0.0; ctx.state = false;

    float totalDuration = 0.0;
    for (int i = 0; i < NUM_OF_SEQ; i++) {
        if (i >= count) break;
        totalDuration += s[i].x;
    }

    float p = mod(globalTime * 1000.0, totalDuration);

    for (int i = 0; i < NUM_OF_SEQ; i++) {
        if (i >= count + 1) break;
        vec3 v = s[i];

        if (p >= v.y && p < v.y + v.x) {
            ctx.t = (p - v.y) / v.x;
            ctx.localTime = (p - v.y) / 1000.0; 
            ctx.id = int(v.z) % 10;
            ctx.flags = int(v.z) / 10;
            ctx.state = true;
            break;
        }
    }
    return ctx;
}

vec4 evaluateConductorPacked(float time, int count) {
    float totalTime = 0.0;
    for (int i = 0; i < NUM_OF_SEQ; i++) {
        if (i >= count) break;
        totalTime += s[i].x * 0.001;
    }

    float p = mod(time, totalTime);
    vec4 ctx = vec4(0.0, 0.0, 0.0, 0.0);

    for (int i = 0; i < NUM_OF_SEQ; i++) {
        vec3 t = s[i];

        float startSec = t.y * 0.001;
        float endSec = startSec + (t.x * 0.001);

        if (p >= startSec && p < endSec) {
            ctx.x = (p - startSec) / (endSec - startSec); 
            ctx.y = float(int(t.z) % 10); 
            ctx.z = float(int(t.z) / 10); 
            ctx.w = p - startSec; 
            break;
        }
    }
    return ctx;
}

const float PI = acos(-1.0);

mat3 calcViewMatrix(vec3 ro, vec3 ta, float roll) {
    vec3 cw = normalize(ta - ro);
    vec3 cp = vec3(sin(roll), cos(roll), 0.0);
    vec3 cu = normalize(cross(cw, cp));
    vec3 cv = normalize(cross(cu, cw));
    return mat3(cu, cv, cw);
}

mat3 camFollow(vec3 targetPos, vec3 targetForward, vec3 armOffset, vec3 lookAtTarget, out vec3 out_ro) {
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 localForward = normalize(targetForward);
    vec3 localRight = normalize(cross(worldUp, localForward));
    vec3 localUp = cross(localForward, localRight);

    vec3 worldOffset = (localRight * armOffset.x) + (localUp * armOffset.y) + (localForward * armOffset.z);

    out_ro = targetPos + worldOffset;
    return calcViewMatrix(out_ro, lookAtTarget, 0.0);
}

mat3 camLookAt(vec3 eyePos, vec3 lookAtTarget, out vec3 out_ro) {
    out_ro = eyePos;
    return calcViewMatrix(out_ro, lookAtTarget, 0.0);
}

float getHandheldRoll(float time, float speed, float amplitude) {
    return sin(time * speed) * (amplitude * PI / 180.0);
}


vec4 transSlowShutter(vec2 uv, float localTime, float duration, sampler2D texCur, sampler2D texPrev) {
    vec4 cur = texture(texCur, uv);
    vec4 prev = texture(texPrev, uv);
    float feedback = 0.85 * (1.0 - smoothstep(0.0, duration, localTime));
    vec3 ghostedColor = mix(cur.rgb, prev.rgb, feedback);
    return vec4(ghostedColor, cur.a);
}