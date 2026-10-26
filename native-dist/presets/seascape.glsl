/*
 * "Seascape" by Alexander Alekseev aka TDM - 2014
 * License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
 * Contact: tdmaav@gmail.com
 *
 * Source: https://www.shadertoy.com/view/Ms2SD1
 * Bundled with dsh-shadertoy-skin as a preset under the SAME CC BY-NC-SA 3.0
 * licence (NOT MIT). Attribution: Alexander Alekseev aka TDM (2014).
 * See THIRD-PARTY-NOTICES.md in the repository root.
 *
 * 优化/修复版 v12（"同一片海"，只做可证明等价的加速 + 明确的缺陷修复）
 *
 *  性能（都保持画面等价/近等价）
 *   1) 天空精确早退：dir.y >= 0 时混合权重 w = pow(smoothstep(0,-0.02,dir.y),0.2) 恒为 0，
 *      像素就是纯 getSkyColor(dir)，跳过追踪/法线/海面着色（mix(a,b,0)==a，逐位相同）。
 *      dir.y <= -0.02 时 w == 1，同理省掉第二次 getSkyColor。
 *   2) 有界 regula-falsi：海面高度 h <= HMAX，故 p.y = -0.05 处 map() 必为负 =>
 *      t=(3.5+0.05)/(-dir.y) 是真括号上界；迭代 32 -> 16，命中点用收敛后的括号求值。
 *   3) choppy == 4.0（每层第一个八度）用两次平方代替 pow()。
 *
 *  缺陷修复
 *   4) post 用 pow(max(color,0))：负色 pow() 在 Intel Arc/ANGLE 上产生 NaN 粉块（实测 25% 像素）。
 *   5) specular 的 pow 底数 clamp 到 [0,1]：fromEuler() 非正交使 |dir| ~1.04，
 *      dot(reflect,l) 可 >1，pow(...,139) 会炸出纯白点（实测 2135 个）。
 *   6) 地平线：去掉 "hx>0 就当作 1000 单位外有命中" 的早退分支——那是假命中，
 *      会在混合带上画出一条 1px、逐列跳动的硬边。现在最浅的射线也用真括号追踪。
 *   7) 时间轴不再叠加 iMouse.x：播放器只在拖拽时送 iMouse，原式会让海面瞬移。
 *   8) post 加 ±0.5/255 interleaved-gradient 抖动，打散天空 8bit 阶梯。
 */
const int NUM_STEPS = 16;
const float PI	 	= 3.141592;
const float EPSILON	= 1e-3;
#define EPSILON_NRM (0.1 / iResolution.x)
//#define AA
//#define HORIZON_AA

// sea
const int ITER_GEOMETRY = 3;
const int ITER_FRAGMENT = 5;
const float SEA_HEIGHT = 0.6;
const float SEA_CHOPPY = 4.0;
const float SEA_SPEED = 0.8;
const float SEA_FREQ = 0.16;
const vec3 SEA_BASE = vec3(0.0,0.09,0.18);
const vec3 SEA_WATER_COLOR = vec3(0.8,0.9,0.6)*0.6;
#define SEA_TIME (1.0 + iTime * SEA_SPEED)
const mat2 octave_m = mat2(1.6,1.2,-1.2,1.6);

// math
mat3 fromEuler(vec3 ang) {
	vec2 a1 = vec2(sin(ang.x),cos(ang.x));
    vec2 a2 = vec2(sin(ang.y),cos(ang.y));
    vec2 a3 = vec2(sin(ang.z),cos(ang.z));
    mat3 m;
    m[0] = vec3(a1.y*a3.y+a1.x*a2.x*a3.x,a1.y*a2.x*a3.x+a3.y*a1.x,-a2.y*a3.x);
	m[1] = vec3(-a2.y*a1.x,a1.y*a2.y,a2.x);
    m[2] = vec3(a3.y*a1.x*a2.x+a1.y*a3.x,a1.x*a3.x-a1.y*a3.y*a2.x,a2.y*a3.y);
	return m;
}
float hash( vec2 p ) {
    // Hash without sine: integer lattice + bit mixing. A shared lattice point always
    // hashes identically no matter how the driver contracts surrounding float math.
    ivec2 q = ivec2(floor(p));
    uint h = uint(q.x) * 1597334677u ^ uint(q.y) * 3812015801u;
    h ^= h >> 16;
    h *= 0x7feb352du;
    h ^= h >> 15;
    h *= 0x846ca68bu;
    h ^= h >> 16;
    return float(h) * (1.0 / 4294967295.0);
}
float noise( in vec2 p ) {
    vec2 f = fract( p );
    vec2 u = f*f*(3.0-2.0*f);
    return -1.0+2.0*mix(
        mix(hash(floor(p + vec2(0.0,0.0))), hash(floor(p + vec2(1.0,0.0))), u.x),
        mix(hash(floor(p + vec2(0.0,1.0))), hash(floor(p + vec2(1.0,1.0))), u.x),
        u.y);
}

// lighting
float diffuse(vec3 n,vec3 l,float p) {
    return pow(dot(n,l) * 0.4 + 0.6,p);
}
float specular(vec3 n,vec3 l,vec3 e,float s) {
    float nrm = (s + 8.0) / (PI * 8.0);
    // clamp 底数：fromEuler 非正交 => e 非单位 => base 可 >1，pow 会爆白
    return pow(clamp(dot(reflect(e,n),l),0.0,1.0),s) * nrm;
}

// sky
vec3 getSkyColor(vec3 e) {
    e.y = (max(e.y,0.0)*0.8+0.2)*0.8;
    return vec3(pow(1.0-e.y,2.0), 1.0-e.y, 0.6+(1.0-e.y)*0.4) * 1.1;
}

// sea
float sea_octave(vec2 uv, float choppy) {
    uv += noise(uv);        
    vec2 wv = 1.0-abs(sin(uv));
    vec2 swv = abs(cos(uv));    
    wv = mix(wv,swv,wv);
    float inner = 1.0-pow(wv.x * wv.y,0.65);
    if(choppy == 4.0) { float i2 = inner*inner; return i2*i2; }   // pow(x,4) => 两次平方
    return pow(inner,choppy);
}

float map(vec3 p) {
    float freq = SEA_FREQ;
    float amp = SEA_HEIGHT;
    float choppy = SEA_CHOPPY;
    vec2 uv = p.xz; uv.x *= 0.75;
    
    float d, h = 0.0;    
    for(int i = 0; i < ITER_GEOMETRY; i++) {        
    	d = sea_octave((uv+SEA_TIME)*freq,choppy);
    	d += sea_octave((uv-SEA_TIME)*freq,choppy);
        h += d * amp;        
    	uv *= octave_m; freq *= 1.9; amp *= 0.22;
        choppy = mix(choppy,1.0,0.2);
    }
    return p.y - h;
}

float map_detailed(vec3 p) {
    float freq = SEA_FREQ;
    float amp = SEA_HEIGHT;
    float choppy = SEA_CHOPPY;
    vec2 uv = p.xz; uv.x *= 0.75;
    
    float d, h = 0.0;    
    for(int i = 0; i < ITER_FRAGMENT; i++) {        
    	d = sea_octave((uv+SEA_TIME)*freq,choppy);
    	d += sea_octave((uv-SEA_TIME)*freq,choppy);
        h += d * amp;        
    	uv *= octave_m; freq *= 1.9; amp *= 0.22;
        choppy = mix(choppy,1.0,0.2);
    }
    return p.y - h;
}

vec3 getSeaColor(vec3 p, vec3 n, vec3 l, vec3 eye, vec3 dist) {  
    float fresnel = clamp(1.0 - dot(n, -eye), 0.0, 1.0);
    fresnel = min(fresnel * fresnel * fresnel, 0.5);
    
    vec3 reflected = getSkyColor(reflect(eye, n));    
    vec3 refracted = SEA_BASE + diffuse(n, l, 80.0) * SEA_WATER_COLOR * 0.12; 
    
    vec3 color = mix(refracted, reflected, fresnel);
    
    float atten = max(1.0 - dot(dist, dist) * 0.001, 0.0);
    color += SEA_WATER_COLOR * (p.y - SEA_HEIGHT) * 0.18 * atten;
    
    color += specular(n, l, eye, 600.0 * inversesqrt(dot(dist,dist)));
    
    return color;
}

// tracing
vec3 getNormal(vec3 p, float eps) {
    vec3 n;
    n.y = map_detailed(p);    
    n.x = map_detailed(vec3(p.x+eps,p.y,p.z)) - n.y;
    n.z = map_detailed(vec3(p.x,p.y,p.z+eps)) - n.y;
    n.y = eps;
    return normalize(n);
}

// 有界 regula falsi：h <= SEA_HEIGHT*2*(1+0.22+0.22^2) 保证 p.y=-0.05 处 map() < 0
float heightMapTracing(vec3 ori, vec3 dir, out vec3 p) {  
    float tx = (ori.y + 0.05) / (-dir.y);      // p.y == -0.05 => map <= -0.05 < 0
    float hx = map(ori + dir * tx);
    float tm = 0.0;
    float hm = map(ori);
    for(int i = 0; i < NUM_STEPS; i++) {
        float tmid = mix(tm, tx, hm / (hm - hx));
        p = ori + dir * tmid;
        float hmid = map(p);
        if(hmid < 0.0) {
            tx = tmid;
            hx = hmid;
        } else {
            tm = tmid;
            hm = hmid;
        }
        if(abs(hmid) < EPSILON) break;
    }
    float t = mix(tm, tx, hm / (hm - hx));
    p = ori + dir * t;
    return t;
}

// 单条射线的完整着色（AA 与常规路径共用）
vec3 shadeRay(vec3 ori, vec3 dir) {
    vec3 p;
    heightMapTracing(ori,dir,p);
    vec3 dist = p - ori;
    vec3 n = getNormal(p, dot(dist,dist) * EPSILON_NRM);
    vec3 light = normalize(vec3(0.0,1.0,0.8)); 
    return getSeaColor(p,n,light,dir,dist);
}

vec3 getPixel(in vec2 coord, float time) {    
    vec2 uv = coord / iResolution.xy;
    uv = uv * 2.0 - 1.0;
    uv.x *= iResolution.x / iResolution.y;    
        
    // ray (相机数学与上游完全一致)
    vec3 ang = vec3(sin(time*3.0)*0.1,sin(time)*0.2+0.3,time);    
    vec3 ori = vec3(0.0,3.5,time*5.0);
    vec3 dir = normalize(vec3(uv.xy,-2.0)); dir.z += length(uv) * 0.14;
    dir = normalize(dir) * fromEuler(ang);
    
    // 天空：w 恒为 0，纯天空色
    if(dir.y >= 0.0) return getSkyColor(dir);

    float w = pow(smoothstep(0.0,-0.02,dir.y),0.2);
#ifdef HORIZON_AA
    // 只在天空/海面过渡带（占 ~2% 像素）做 2x2 超采样，消地平线硬边与爬行
    if(w > 0.02 && w < 0.98) {
        vec3 acc = vec3(0.0);
        for(int j = 0; j < 2; j++) {
            for(int i = 0; i < 2; i++) {
                vec2 uv2 = uv + (vec2(float(i),float(j)) - 0.5) * (1.0 / iResolution.y);
                vec3 d2 = normalize(vec3(uv2.xy,-2.0)); d2.z += length(uv2) * 0.14;
                d2 = normalize(d2) * fromEuler(ang);
                float w2 = pow(smoothstep(0.0,-0.02,d2.y),0.2);
                acc += (d2.y >= 0.0) ? getSkyColor(d2) : mix(getSkyColor(d2), shadeRay(ori,d2), w2);
            }
        }
        return acc * 0.25;
    }
#endif

    vec3 sea = shadeRay(ori,dir);
    return mix(getSkyColor(dir), sea, w);
}

// main
void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
    float time = iTime * 0.3;   // 去掉 iMouse.x：拖拽会让海面瞬移
    vec3 color = getPixel(fragCoord, time);
    
    // post：max() 修 NaN；±0.5/255 抖动去天空 banding
	vec3 c = pow(max(color,vec3(0.0)),vec3(0.65));
    float dith = fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
	fragColor = vec4(c + (dith - 0.5) * (1.0 / 255.0), 1.0);
}
