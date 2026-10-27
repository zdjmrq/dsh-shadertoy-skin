// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

#define MARCHSTEPS 160
#define MAX_DIST 120.0
#define SURF_DIST 0.01
#define LIGHTINTENSITY 4.0

float hash(float n) { return fract(sin(n) * 687.3123); }

float noise(in vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + p.y * 157.0;
    return mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
               mix(hash(n + 157.0), hash(n + 158.0), f.x), f.y);
}

const mat2 m2 = mat2(0.80, -0.60, 0.60, 0.80);
float fbm(vec2 p) {
    float f = 0.0;
    f += 0.5000 * noise(p); p = m2 * p * 2.02;
    f += 0.2500 * noise(p); p = m2 * p * 2.03;
    f += 0.1250 * noise(p); p = m2 * p * 2.01;
    return f / 0.8750;
}

vec2 getCurve(float z) {
    return vec2(
        sin(z * 0.04) * 8.0 + sin(z * 0.015) * 4.0, 
        sin(z * 0.02) * 2.5
    );
}

float terrainH(float cx, float z) {
    if (cx >= -1.0 && cx <= 3.0) return 0.0; 
    
    float h = 0.0;
    if (cx > 3.0) {
        h = (cx - 3.0) * 0.15; 
        h += (fbm(vec2(cx * 3.0, z * 3.0)) - 0.5) * 0.3 * smoothstep(3.0, 4.0, cx);
    } 
    else if (cx < -1.0 && cx >= -2.0) {
        h = (fbm(vec2(cx * 4.0, z * 4.0)) - 0.5) * 0.15 * smoothstep(-1.0, -1.5, cx);
    } 
    else if (cx < -2.0) {
        float slope = smoothstep(-2.0, -6.5, cx);
        h = mix(0.0, -0.7, slope); 
        float noiseVal = fbm(vec2(cx, z) * 0.8);
        h += (noiseVal - 0.5) * 0.6 * smoothstep(-2.0, -3.0, cx) * smoothstep(-7.5, -4.0, cx);
    }
    return h;
}

float smin(float a, float b, float k) { return -log(exp(-k * a) + exp(-k * b)) / k; }

float mapCar(in vec3 p0) { 
    p0.z = -p0.z; 
    vec3 p = p0 + vec3(0.0, 1.24, 0.0);
    float r = length(p.yz);
    float d = length(max(vec3(abs(p.x) - 0.35, r - 1.92, -p.y + 1.4), 0.0)) - 0.05;
    d = max(d, p.z - 1.0);
    p = p0 + vec3(0.0, -0.22, 0.39);
    p.xz = abs(p.xz) - vec2(0.5300, 0.9600); p.x = abs(p.x);
    r = length(p.yz);
    d = smin(d, length(max(vec3(p.x - 0.08, r - 0.25, -p.y - 0.08), 0.0)) - 0.04, 8.0);
    d = max(d, -max(p.x - 0.165, r - 0.24));
    float d2 = length(vec2(max(p.x - 0.13, 0.0), r - 0.2)) - 0.02;
    return min(d, d2);
}

float beamDist(vec3 p, vec3 origin) {
    vec3 pa = p - origin;
    vec3 dir = normalize(vec3(0.0, -0.06, 1.0)); 
    
    float h = dot(pa, dir);
    if (h < 0.0) return length(pa); 
    
    float ortho = length(pa - dir * h);
    float spread = 1.0 + h * 2.8; 
    
    return (ortho / spread) + (h * 0.025);
}

float getTrail(vec3 p, vec2 offset) {
    float tz = clamp(p.z, -5.0, -1.05); 
    float fade = smoothstep(-1.05, -5.0, tz);
    return length(p - vec3(offset, tz)) - 0.008 + fade * 0.35; 
}

float mapWall(float cx, float cy, float z) {
    vec2 wLocal = vec2(cx + 2.2, cy - 0.1);
    float mainBox = max(abs(wLocal.x) - 0.16, abs(wLocal.y) - 0.32);
    float chamfer = max(abs(wLocal.x) + wLocal.y - 0.40, abs(wLocal.x) - 0.16);
    float wallShape = max(mainBox, chamfer);
    float joint = abs(fract(z * 0.2 + 0.5) - 0.5) * 5.0 - 0.015;
    return max(wallShape, -joint);
}

float mapArch(float cx, float cy, float z) {
    float localZ = mod(z + 100.0, 200.0) - 100.0;
    if (abs(localZ) > 3.0) return 100.0;
    
    float poleL = max(length(vec2(cx - (-1.4), localZ)) - 0.05, max(cy - 2.6, -cy));
    float poleR = max(length(vec2(cx - 3.4, localZ)) - 0.05, max(cy - 2.6, -cy));
    
    float truss = max(max(abs(cx - 1.0) - 2.4, length(vec2(cy - 2.55, localZ)) - 0.04), -cy);
    float banner = max(max(abs(cx - 1.0) - 2.0, abs(cy - 2.25) - 0.18), abs(localZ) - 0.015);
    
    float beaconL = length(vec3(cx - (-1.4), cy - 2.65, localZ)) - 0.08;
    float beaconR = length(vec3(cx - 3.4,    cy - 2.65, localZ)) - 0.08;
    
    return min(min(poleL, poleR), min(min(truss, banner), min(beaconL, beaconR)));
}

float dFrontGlo; 
float dRearGlo;  
float dBeaconGlo; 
int currentFlags = 0; 

float map(vec3 p) {
    vec2 curve = getCurve(p.z);
    float cx = p.x + curve.x; 
    float cy = p.y + curve.y;
    
    float dGround = cy - terrainH(cx, p.z);
    float wall = mapWall(cx, cy, p.z);
    float dWater = cy - (-0.6);
    float arch = mapArch(cx, cy, p.z);
    float environment = min(min(dGround, wall), min(dWater, arch));

    float carScale = 1.6; 
    
    float z1 = p.z - iTime * 22.0;
    vec3 p1 = p; p1.x = cx - 2.0; p1.y = cy; p1.z = mod(z1, 40.0) - 20.0;
    
    float z2 = p.z - iTime * 32.0 + 15.0;
    vec3 p2 = p; p2.x = cx - 0.0; p2.y = cy; p2.z = mod(z2, 45.0) - 22.5;
    
    float car1 = mapCar(p1 * carScale) / carScale;
    float car2 = mapCar(p2 * carScale) / carScale;

    dFrontGlo = 100.0;
    dRearGlo = 100.0;
    dBeaconGlo = 100.0;

    float archZ = mod(p.z + 100.0, 200.0) - 100.0;
    if (abs(archZ) < 15.0) {
        float bL = length(vec3(cx - (-1.4), cy - 2.65, archZ));
        float bR = length(vec3(cx - 3.4,    cy - 2.65, archZ));
        dBeaconGlo = min(bL, bR);
    }

    vec3 t1L = p1 - vec3(-0.25, 0.26, -1.05);
    vec3 t1R = p1 - vec3( 0.25, 0.26, -1.05);
    vec3 t1B = p1 - vec3( 0.0,  0.26, -1.06);
    float rear1 = min(length(t1L) - 0.02, length(t1R) - 0.02); 
    rear1 = min(rear1, length(max(abs(t1B) - vec3(0.18, 0.006, 0.005), 0.0))); 

    vec3 t2L = p2 - vec3(-0.25, 0.26, -1.05);
    vec3 t2R = p2 - vec3( 0.25, 0.26, -1.05);
    vec3 t2B = p2 - vec3( 0.0,  0.26, -1.06);
    float rear2 = min(length(t2L) - 0.02, length(t2R) - 0.02);
    rear2 = min(rear2, length(max(abs(t2B) - vec3(0.18, 0.006, 0.005), 0.0)));
    
    if (currentFlags == 1) {
        rear1 = min(rear1, getTrail(p1, vec2(-0.25, 0.26)));
        rear1 = min(rear1, getTrail(p1, vec2( 0.25, 0.26)));
        rear2 = min(rear2, getTrail(p2, vec2(-0.25, 0.26)));
        rear2 = min(rear2, getTrail(p2, vec2( 0.25, 0.26)));
    }
    
    dRearGlo = min(dRearGlo, min(rear1, rear2));
    
    vec3 h1L = vec3(-0.26, 0.22, 1.10); vec3 h1R = vec3( 0.26, 0.22, 1.10);
    vec3 h2L = vec3(-0.26, 0.22, 1.10); vec3 h2R = vec3( 0.26, 0.22, 1.10);
    
    dFrontGlo = min(dFrontGlo, beamDist(p1, h1L));
    dFrontGlo = min(dFrontGlo, beamDist(p1, h1R));
    dFrontGlo = min(dFrontGlo, beamDist(p2, h2L));
    dFrontGlo = min(dFrontGlo, beamDist(p2, h2R));
    
    return min(environment, min(car1, car2));
}

float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0; float sca = 1.0;
    for(int i = 0; i < 4; i++) {
        float hr = 0.02 + 0.15 * float(i) / 3.0;
        vec3 aopos = nor * hr + pos;
        float dd = map(aopos);
        occ += -(dd - hr) * sca;
        sca *= 0.85;
    }
    return clamp(1.0 - 2.5 * occ, 0.0, 1.0);    
}

float calcShadow(vec3 ro, vec3 rd) {
    float res = 1.0; float t = 0.05;
    for(int i = 0; i < 20; i++) {
        float h = map(ro + rd * t);
        res = min(res, 8.0 * h / t);
        t += clamp(h, 0.02, 0.2);
        if(h < 0.001 || t > 15.0) break;
    }
    return clamp(res, 0.1, 1.0); 
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(1.0, -1.0) * 0.5773 * 0.005; 
    vec3 n = normalize(
        e.xyy * map(p + e.xyy) + 
        e.yyx * map(p + e.yyx) + 
        e.yxy * map(p + e.yxy) + 
        e.xxx * map(p + e.xxx)
    );    
    vec2 curve = getCurve(p.z);
    float cx = p.x + curve.x; float cy = p.y + curve.y;
    
    if (cy < -0.55 && cx < -4.0) {
        float t = iTime * 1.5;
        vec3 xn = 0.4 * vec3(fbm(p.xz * 2.0 + t) - 0.5, 0.0, fbm(p.zx * 2.0 - t * 0.8) - 0.5);
        n = normalize(n + xn);
    }
    else if (cy < 0.02 && cx >= -1.0 && cx <= 3.0) {
        vec3 asphBump = vec3(fbm(p.xz * 8.0) - 0.5, 0.0, fbm(p.zx * 8.0) - 0.5) * 0.03;
        n = normalize(n + asphBump);
    }
    else if (abs(cx + 2.2) <= 0.22 && cy > -0.3 && cy < 0.5) {
        vec3 concreteBump = vec3(fbm(p.zy * 20.0) - 0.5, fbm(p.xz * 20.0) - 0.5, fbm(p.yz * 20.0) - 0.5) * 0.08;
        n = normalize(n + concreteBump);
    }
    else if (cy < 0.5 && (cx > 3.0 || (cx < -1.0 && cx >= -2.0))) {
        vec3 dirtBump = vec3(fbm(p.xz * 15.0) - 0.5, 0.0, fbm(p.zx * 15.0) - 0.5) * 0.1;
        n = normalize(n + dirtBump);
    }
    return n;
}

vec3 getSky(vec3 rd) {
    vec3 skyBase = vec3(0.01, 0.03, 0.06); 
    vec3 fogColor = vec3(0.04, 0.08, 0.20); 
    
    vec3 skyColor = mix(skyBase, fogColor, exp(-max(rd.y, 0.0) * 3.5));
    
    vec3 sodiumLight = vec3(1.0, 0.45, 0.12); 
    
    if (rd.y > 0.0) {
        vec2 skyPlane = rd.xz / max(rd.y, 0.001);
        
        skyPlane += vec2(iTime * 0.04, -iTime * 0.015);
        
        float cNoise = fbm(skyPlane * 0.3);
        float cloudShape = smoothstep(0.4, 0.8, cNoise);
        
        vec3 cloudCol = mix(vec3(0.02, 0.03, 0.06), sodiumLight * 0.5, exp(-rd.y * 4.0));
        
        float cloudFade = smoothstep(0.02, 0.25, rd.y);
        
        skyColor = mix(skyColor, cloudCol, cloudShape * cloudFade * 0.9);
    }
    
    float coreGlow = smoothstep(0.12, -0.02, rd.y) * smoothstep(-0.05, 0.05, rd.y); 
    float halo = smoothstep(0.35, 0.0, rd.y) * 0.4;
    float glowMask = coreGlow + halo;
    
    float mistNoise = fbm(vec2(rd.x * 1.5, iTime * 0.02)); 
    skyColor += sodiumLight * glowMask * (0.7 + 0.3 * mistNoise) * 1.2; 
    
    vec3 moonDir = normalize(vec3(-0.55, 0.28, 0.8));
    float moonDot = dot(rd, moonDir);
    float moonCore = smoothstep(0.9990, 0.9998, moonDot); 
    float moonGlow = pow(max(moonDot, 0.0), 150.0) * 0.4; 
    skyColor += vec3(0.8, 0.88, 1.0) * moonCore * 1.5 + vec3(0.6, 0.75, 0.9) * moonGlow;
    
    float mnt = 0.0;
    mnt += fbm(vec2(rd.x * 4.0, 1.0)) * 0.1;
    mnt += fbm(vec2(rd.x * 8.0, 2.0)) * 0.05;
    mnt = max(0.0, mnt + 0.02);

    float cityHeight = 0.0;
    float cityCluster = smoothstep(0.2, 0.8, fbm(vec2(rd.x * 3.0, 15.0)));
    
    float cx1 = rd.x * 40.0;
    float h1 = fract(sin(floor(cx1) * 12.9898) * 43758.5453);
    if (fract(cx1) > 0.15) cityHeight = max(cityHeight, h1 * 0.15); 

    float cx2 = rd.x * 90.0;
    float h2 = fract(sin(floor(cx2) * 78.233) * 43758.5453);
    if (fract(cx2) > 0.25) cityHeight = max(cityHeight, h2 * 0.25); 

    float cx3 = rd.x * 300.0;
    float h3 = fract(sin(floor(cx3) * 45.164) * 43758.5453);
    if (fract(cx3) > 0.6 && h3 > 0.8) cityHeight = max(cityHeight, h3 * 0.35); 
    
    cityHeight *= cityCluster; 
    
    float skyline = max(mnt, cityHeight);

    if (rd.y < skyline && rd.y > 0.0) {
        vec3 mntColor = vec3(0.01, 0.015, 0.02);
        float hFog = exp(-rd.y * 25.0); 
        mntColor = mix(mntColor, fogColor, hFog); 
        
        mntColor += sodiumLight * glowMask * hFog * 0.9; 
        
        if (cityHeight > mnt && rd.y < cityHeight) {
            float winNoise = fract(sin(floor(rd.x * 600.0) * 12.3 + floor(rd.y * 300.0) * 45.6) * 78.9);
            float isWin = step(0.90, winNoise); 
            
            mntColor += sodiumLight * isWin * 0.4 * hFog * cityCluster;
        }
        
        skyColor = mix(skyColor, mntColor, smoothstep(skyline, skyline - 0.005, rd.y));
    }
    return skyColor;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    SceneContext ctx = evaluateConductor(iTime, 22);
    int camID = ctx.id;
    currentFlags = ctx.flags; 
    
    float c1_Z = iTime * 22.0 + 20.0; 
    vec2 c1_curve = getCurve(c1_Z);
    vec3 h1Pos = vec3(2.0 - c1_curve.x, -c1_curve.y, c1_Z);
    vec3 h1Fwd = normalize(vec3(2.0 - getCurve(c1_Z+1.0).x, -getCurve(c1_Z+1.0).y, c1_Z+1.0) - h1Pos);
    vec3 h1Right = normalize(cross(vec3(0,1,0), h1Fwd));

    float c2_Z = iTime * 32.0 + 7.5;
    vec2 c2_curve = getCurve(c2_Z);
    vec3 h2Pos = vec3(0.0 - c2_curve.x, -c2_curve.y, c2_Z);
    vec3 h2Fwd = normalize(vec3(0.0 - getCurve(c2_Z+1.0).x, -getCurve(c2_Z+1.0).y, c2_Z+1.0) - h2Pos);
    vec3 h2Right = normalize(cross(vec3(0,1,0), h2Fwd));

    vec3 ro;
    mat3 view;
    float customRoll = 0.0;

    if (camID == 4) {
        float height = (ctx.localTime < 5.0 && iTime > 50.0) ? 9.0 : 18.0; 
        vec3 arm = vec3(sin(iTime*0.8)*4.0, height, -6.0);
        view = camFollow(h1Pos, h1Fwd, arm, h1Pos + h1Fwd * 12.0, ro);
    }
    else if (camID == 1 || camID == 0) {
        vec3 arm = vec3(-1.5 + sin(iTime)*0.5, 2.0 + cos(iTime*1.2)*0.2, -12.0);
        view = camFollow(h1Pos, h1Fwd, arm, h1Pos + vec3(0.0, 1.0, 10.0), ro);
    }
    else if (camID == 7) {
        vec3 arm = vec3(-12.0 + ctx.localTime * 0.5, 1.8, 15.0);
        view = camFollow(h1Pos, h1Fwd, arm, h1Pos, ro);
    }
    else if (camID == 3) {
        vec3 arm = vec3(3.8, 0.8, -1.5);
        view = camFollow(h2Pos, h2Fwd, arm, h2Pos + h2Fwd * 8.0, ro);
        customRoll = getHandheldRoll(iTime, 1.5, 1.0); 
    }
    else if (camID == 10) {
        vec3 arm = vec3(-2.8, 0.65, -3.0);
        view = camFollow(h1Pos, h1Fwd, arm, h2Pos + vec3(0.0, 0.8, 5.0), ro);
        customRoll = getHandheldRoll(iTime, 2.0, 0.8);
    }
    else if (camID == 8) {
        vec3 arm = vec3(-0.5, 1.2, 12.0); 
        view = camFollow(h2Pos, h2Fwd, arm, h1Pos, ro); 
    }
    else if (camID == 2) {
        float startZ = (iTime - ctx.localTime) * 22.0 + 20.0 + 80.0; 
        vec2 seaC = getCurve(startZ);
        vec3 seaPos = vec3(-15.0 - seaC.x, 1.5 - seaC.y, startZ);
        view = camLookAt(seaPos, h1Pos, ro);
    }
    else if (camID == 5) {
        vec3 arm = vec3(0.0, 1.1 + sin(iTime * 8.0)*0.02, 0.5);
        view = camFollow(h1Pos, h1Fwd, arm, h1Pos + h1Fwd * 15.0, ro);
    }
    else if (camID == 9) {
        vec3 arm = vec3(-1.8, 0.5, 0.0); 
        ro = h1Pos + h1Right * arm.x + vec3(0.0, arm.y, 0.0) + h1Fwd * arm.z;
        view = calcViewMatrix(ro, h1Pos + h1Fwd * 12.0, 0.0); 
        customRoll = 0.15; 
    }
    else {
        float wZ = (iTime - ctx.localTime) * 32.0 + 7.5 + 120.0; 
        vec2 wC = getCurve(wZ);
        vec3 wallPos = vec3(-2.2 - wC.x, 0.8 - wC.y, wZ);
        customRoll = getHandheldRoll(iTime, 2.5, 1.5);
        view = calcViewMatrix(wallPos, h2Pos, 0.0);
        ro = wallPos;
    }

    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    if (customRoll != 0.0) {
        float s = sin(customRoll), c = cos(customRoll);
        uv *= mat2(c, -s, s, c);
    }

    float beatFraction = fract(iTime * (124.0 / 60.0));
    float kickPulse = exp(-beatFraction * 5.0); 

    float driftX = sin(iTime * 1.1) * 0.02;
    float driftY = cos(iTime * 1.3) * 0.02;
    float fov = 1.8 - (kickPulse * 0.04); 

    vec3 rd = view * normalize(vec3(uv + vec2(driftX, driftY), fov)); 

    vec3 skyColor = getSky(rd);
    vec3 col = skyColor;

    float dO = 0.0; 
    float mldFront = 100.0; 
    float mldRear = 100.0; 
    
    float id1 = floor((ro.z + rd.z * MAX_DIST - iTime * 22.0) / 40.0); 
    float id2 = floor((ro.z + rd.z * MAX_DIST - iTime * 32.0 + 15.0) / 45.0);
    
    for(int i = 0; i < MARCHSTEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = map(p);
        
        if (dFrontGlo < mldFront) mldFront = dFrontGlo;
        if (dRearGlo < mldRear) mldRear = dRearGlo;
        
        if(dO > MAX_DIST || abs(dS) < SURF_DIST) break;
        dO += dS * 0.6; 
    }

    if(dO < MAX_DIST) {
        vec3 p = ro + rd * dO;
        vec3 n = getNormal(p);
        vec2 curve = getCurve(p.z);
        float cx = p.x + curve.x; float cy = p.y + curve.y;
        
        vec3 albedo = vec3(0.1); float roughness = 0.5;
        vec3 moonDir = normalize(vec3(-0.55, 0.28, 0.8));
        vec3 viewDir = normalize(ro - p);
        
        float carScale = 1.6;
        
        float z1 = p.z - iTime * 22.0; id1 = floor(z1 / 40.0);
        vec3 p1 = p; p1.x = cx - 2.0; p1.y = cy; p1.z = mod(z1, 40.0) - 20.0;
        
        float z2 = p.z - iTime * 32.0 + 15.0; id2 = floor(z2 / 45.0);
        vec3 p2 = p; p2.x = cx - 0.0; p2.y = cy; p2.z = mod(z2, 45.0) - 22.5;
        
        float c1Dist = mapCar(p1 * carScale) / carScale;
        float c2Dist = mapCar(p2 * carScale) / carScale;
        float isCar = min(c1Dist, c2Dist);
        float dArch = mapArch(cx, cy, p.z);
        
        if (isCar < 0.02) {
            float carId = (c1Dist < c2Dist) ? id1 : id2;
            float carHash = hash(carId * 12.34);
            
            if (carHash < 0.35) albedo = vec3(0.04, 0.04, 0.05); 
            else if (carHash < 0.55) albedo = vec3(0.12, 0.02, 0.03); 
            else if (carHash < 0.7) albedo = vec3(0.02, 0.25, 0.08); 
            else if (carHash < 0.85) albedo = vec3(0.12, 0.13, 0.15); 
            else albedo = vec3(0.02, 0.1, 0.2); 
            
            roughness = 0.2;
        }
        else if (dArch < 0.02) {
            if (cy > 2.05 && cy < 2.45 && abs(cx - 1.0) <= 2.0) {
                float check = floor((cx - 1.0) * 5.0) + floor((cy - 2.05) * 8.0);
                float fabricNoise = fbm(p.xy * 25.0) * 0.15;
                
                if (mod(check, 2.0) < 1.0) albedo = vec3(0.08, 0.08, 0.09) + fabricNoise * 0.2; 
                else albedo = vec3(0.70, 0.72, 0.75) - fabricNoise; 
                
                roughness = 0.65; 
            } else {
                albedo = vec3(0.04, 0.04, 0.05); 
                roughness = 0.05; 
            }
        }
        else if (abs(cx + 2.2) <= 0.22 && cy > -0.3 && cy < 0.5) {
            float cNoise = fbm(p.zy * 8.0);
            albedo = vec3(0.14, 0.15, 0.16) * (0.75 + 0.25 * cNoise); 
            float dampness = smoothstep(0.2, -0.2, cy);
            albedo = mix(albedo, vec3(0.04, 0.05, 0.06), dampness * 0.6);
            float streaks = smoothstep(0.4, 0.7, fbm(vec2(p.z * 1.5, 0.0)));
            albedo = mix(albedo, vec3(0.08, 0.07, 0.06), streaks * 0.3);
            roughness = 0.75;
        } 
        else if (cy < -0.58 && cx < -4.0) {
            vec3 ref = reflect(rd, n); vec3 refSky = getSky(ref);
            float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
            albedo = mix(vec3(0.01, 0.02, 0.05), refSky, fresnel * 0.8 + 0.1); 
            roughness = 0.1;
        } 
        else if (cx >= -1.0 && cx <= 3.0 && cy < 0.05) {
            float roadNoise = fbm(p.xz * 12.0); 
            albedo = vec3(0.06) * (0.8 + 0.2 * roadNoise);
            
            float wearNoise = fbm(p.xz * 3.0);
            float lineWear = smoothstep(0.1, 0.9, wearNoise) * 0.8 + 0.2; 
            
            if (abs(cx - 1.0) < 0.08 && fract(p.z * 0.25) > 0.5) albedo = mix(albedo, vec3(0.6, 0.5, 0.05), lineWear); 
            if (abs(cx - 2.9) < 0.05 || abs(cx + 0.9) < 0.05) albedo = mix(albedo, vec3(0.6), lineWear); 
            roughness = 0.6; 
            
            float c1Shadow = length(p1 * vec3(1.0, 0.0, 0.3));
            float c2Shadow = length(p2 * vec3(1.0, 0.0, 0.3));
            albedo *= smoothstep(0.3, 1.2, min(c1Shadow, c2Shadow));
            
            float c1Brake = exp(-length(p1 - vec3(0.0, 0.1, -1.0)) * 1.8);
            float c2Brake = exp(-length(p2 - vec3(0.0, 0.1, -1.0)) * 1.8);
            albedo += vec3(1.0, 0.05, 0.02) * max(c1Brake, c2Brake) * 0.4;
        } 
        else {
            float tNoise = fbm(p.xz * 10.0);
            vec3 coolGrass = vec3(0.04, 0.06, 0.05) * (0.6 + 0.4 * tNoise);
            vec3 warmDirt  = vec3(0.12, 0.10, 0.06) * (0.6 + 0.4 * tNoise);
            
            float lightExposure = smoothstep(5.0, 0.5, mldFront);
            albedo = mix(coolGrass, warmDirt, lightExposure * 0.6);
            roughness = 0.9;
            
            if (cx < -3.0 && cy < -0.3) {
                albedo = vec3(0.08, 0.08, 0.09) * (0.7 + 0.3 * tNoise);
            }
            
            if (cx > 3.0) {
                vec3 lushGrass = vec3(0.03, 0.07, 0.03) * (0.6 + 0.4 * tNoise);
                vec3 drySand   = vec3(0.14, 0.12, 0.08) * (0.7 + 0.3 * tNoise);

                albedo = mix(lushGrass, drySand, smoothstep(0.1, 0.7, cy));
                
                float heightMask = smoothstep(0.5, 0.1, cy);
                float wetMask = smoothstep(0.3, 0.7, fbm(p.xz * 3.0)) * heightMask;
                
                roughness = mix(0.9, 0.15, wetMask); 
                
                if (wetMask > 0.0) {
                    vec3 ref = reflect(rd, n); 
                    vec3 refSky = getSky(ref);
                    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
                    albedo = mix(albedo, refSky, fresnel * wetMask * 0.8);
                }
            }
        }

        float ao = calcAO(p, n);
        float shadow = calcShadow(p, moonDir);
        float dif = max(dot(n, moonDir), 0.0) * shadow;
        float amb = 0.05 * ao;
        vec3 ref = reflect(-moonDir, n);
        float spec = pow(max(dot(viewDir, ref), 0.0), 32.0) * (1.0 - roughness) * shadow;
        
        col = albedo * (dif + amb) * vec3(0.5, 0.6, 0.8) + spec * vec3(0.7, 0.8, 0.9);
        
        float fogDistFactor = smoothstep(MAX_DIST * 0.20, MAX_DIST * 0.95, dO);
        float fogHeightFactor = exp(-max(p.y, 0.0) * 0.4); 
        float fogDrift = fbm(vec2(p.xz * 0.05 + vec2(iTime * 0.1, 0.0))) * 0.3 + 0.7;
        
        vec3 darkFog = vec3(0.03, 0.06, 0.10);
        vec3 scatterFog = vec3(0.18, 0.16, 0.14);
        vec3 dynFogColor = mix(darkFog, scatterFog, exp(-mldFront * 6.0));
        
        col = mix(col, dynFogColor, clamp(fogDistFactor * fogHeightFactor * fogDrift, 0.0, 0.80));
    }

    if(mldFront < 100.0)  col += vec3(1.0, 0.92, 0.80) * exp(-mldFront * 18.0) * 1.2; 
    
    if(mldRear < 100.0)   col += vec3(0.9, 0.08, 0.04) * exp(-mldRear * 30.0) * 0.8; 
    
    if(dBeaconGlo < 100.0) {
        float blink = 0.55 + 0.45 * sin(iTime * 12.0);
        col += vec3(0.7, 0.05, 1.0) * exp(-dBeaconGlo * 8.0) * 2.5 * blink;
    }

    fragColor = vec4(col, clamp(dO / MAX_DIST, 0.0, 1.0));
}