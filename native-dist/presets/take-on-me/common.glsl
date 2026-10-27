// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

/*

Created by Tonny Espeset, 2026
https://www.shadertoy.com/view/fXc3RB

80s hits: Take On Me

Feel free to use this code, but please keep this credit and link.

Check my other shaders at

https://www.shadertoy.com/user/Espeset

*/
#define PI 3.141592653589793
#define TAU (PI*2.)
// Riding speed in metres per second, and the song tempo the bike bobs to.
const float RIDE_SPEED=24.;
const float SONG_BPM=169.1;
const float BEAT_W=TAU*SONG_BPM/60.0;
float sat(float x) { return clamp(x, 0.0, 1.0); }
float sq(float x) { return x*x; }
float h1(float p) { p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float h2(vec2 p) { vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float noise2(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p) { return .57*noise2(p)+.28*noise2(p*2.07+8.3)+.15*noise2(p*4.19-5.1); }
mat2 rotate2(float a) { float c=cos(a),s=sin(a); return mat2(c,s,-s,c); }
float sdBox(vec3 p,vec3 b) { vec3 q=abs(p)-b; return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0); }
float sdRoundBox(vec3 p,vec3 b,float r) { return sdBox(p,b)-r; }
float sdEllipsoid(vec3 p,vec3 r) { float a=length(p/r), b=length(p/(r*r)); return a*(a-1.0)/max(b,1e-6); }
float sdCapsule(vec3 p,vec3 a,vec3 b,float r) { vec3 q=p-a,v=b-a; return length(q-v*clamp(dot(q,v)/dot(v,v),0.0,1.0))-r; }
float sdTaper(vec3 p,vec3 a,vec3 b,float ra,float rb) { vec3 q=p-a,v=b-a; float t=clamp(dot(q,v)/dot(v,v),0.0,1.0); return length(q-v*t)-mix(ra,rb,t); }
float sdCylinderX(vec3 p,float r,float w) { vec2 d=abs(vec2(length(p.yz),p.x))-vec2(r,w); return min(max(d.x,d.y),0.0)+length(max(d,0.0)); }
float sdCylinderZ(vec3 p,float r,float w) { vec2 d=abs(vec2(length(p.xy),p.z))-vec2(r,w); return min(max(d.x,d.y),0.0)+length(max(d,0.0)); }
float sdTorusX(vec3 p,float major,float minor) { return length(vec2(length(p.yz)-major,p.x))-minor; }
vec2 nearer(vec2 a,vec2 b) { return a.x<b.x?a:b; }
float softMin(float a,float b,float k) { float h=sat(.5+.5*(b-a)/k); return mix(b,a,h)-k*h*(1.0-h); }
const float roadWidth=5.6, blockSize=12.0, lampStep=23.0, lampHeight=6.6;
const vec3 skyTint=vec3(.020,.042,.073)*.36, lampTint=vec3(1.,.55,.21), accentTint=vec3(.58,.72,.88), paperTint=vec3(.66,.77,.83);
// Common is also compiled into the Sound tab, which has no iTime or iResolution, so each mainImage sets these first.
float sceneTime, sceneAspect;
float roadX(float z) { return 6.0*sin(z*.010)+3.5*sin(z*.021+1.0)+1.1*sin(z*.043-.8); }
float roadSlope(float z) { return .06*cos(z*.010)+.0735*cos(z*.021+1.)+.0473*cos(z*.043-.8); }
float rideDistance(float t) { return t*RIDE_SPEED+7.5*sin(t*.26)-2.7*sin(t*.63); }
vec3 bikeOrigin(float t) {
    float z=rideDistance(t);
    float lane=.95+.5*sin(z*.024)+.28*sin(z*.041);
    return vec3(roadX(z)+lane,.024*sin(t*7.6)+.011*sin(t*BEAT_W)+.006*sin(t*29.0),z);
}
float bikeHeading(float t) { float z=rideDistance(t); return atan(roadSlope(z)+.015*cos(z*.024)+.014*cos(z*.041)+.005*sin(t*1.8)); }
float bikeLean(float t) { float z=rideDistance(t); return clamp((roadSlope(z+5.)-roadSlope(z-5.))*-4.1,-.36,.36)+.026*sin(t*.87)+.011*sin(t*2.3)+.008*cos(t*1.6); }
vec3 bikeLocal(vec3 p) { p-=bikeOrigin(sceneTime); p.xz=rotate2(bikeHeading(sceneTime))*p.xz; p.xy=rotate2(bikeLean(sceneTime))*p.xy; return p; }
vec3 fromBike(vec3 p) { p.xy=rotate2(-bikeLean(sceneTime))*p.xy; p.xz=rotate2(-bikeHeading(sceneTime))*p.xz; return p+bikeOrigin(sceneTime); }
void camera(out vec3 ro,out mat3 basis) {
    float t=sceneTime,z=rideDistance(t);
    ro=vec3(roadX(z-7.6)-.90+.30*sin(t*.31),2.23+.09*sin(t*.41)+.018*sin(t*2.1),z-7.6);
    vec3 target=vec3(roadX(z+12.)+.38,1.42+.020*sin(t*1.9),z+12.);
    vec3 f=normalize(target-ro),r=normalize(cross(vec3(0,1,0),f));
    vec3 up=cross(f,r); float roll=bikeLean(t)*.11;
    basis=mat3(r*cos(roll)+up*sin(roll),up*cos(roll)-r*sin(roll),f);
}
vec3 cameraRay(vec2 uv,mat3 basis) { return normalize(basis*vec3((uv-.5)*vec2(sceneAspect,1.0),1.32)); }
float boundaryWave(vec3 p) { return sin((p.z+24.0+(p.x-roadX(p.z))*2.7)*PI/190.0); }
float worldMask(vec3 p) { return smoothstep(-.075,.075,-boundaryWave(p)); }
// Her fade spans about 40 m of road centred on the boundary.
float passengerPresence() { return smoothstep(-.33,.33,boundaryWave(fromBike(vec3(0,1.4,-.45)))); }
float passengerOpacity(float presence) { return smoothstep(.13,.88,presence); }
float passengerTrace(float presence) { return 4.*presence*(1.-presence); }
// Passenger alpha packs two depths in one exact 24-bit integer: front 12 bits at 1/256 m, back 10 log bits + 2 material flags; a road back-layer is analytic, not quantised.
float sceneDepth(float encoded) {
    if(encoded>=0.) return encoded;
    if(encoded> -256.) return -encoded;
    return floor(-encoded/4096.)/256.;
}
float backKind(float encoded) { return encoded< -256.?mod(-encoded,4.):(encoded<0.?1.:0.); }
float backDepth(float encoded,vec3 ro,vec3 rd) {
    if(encoded> -256.) return abs(encoded);
    float kind=backKind(encoded);
    if(kind>1.5 && kind<2.5) return -ro.y/min(rd.y,-.00001);
    if(kind>2.5) return 180.;
    return exp2(floor(mod(-encoded,4096.)/4.)/128.)-1.;
}
vec3 lampPosition(float index,float side) {
    float z=index*lampStep+(side>0.?lampStep*.5:0.);
    return vec3(roadX(z)+side*(roadWidth+.2),lampHeight,z);
}
vec3 lightColour(float index,float side) {
    return mix(lampTint,accentTint,step(.93,h1(index*.77+side*2.1))*.28);
}
