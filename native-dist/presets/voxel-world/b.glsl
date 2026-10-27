// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

#define var(name, x, y) const vec2 name = vec2(x, y)
#define varRow 0.
var(_pos, 0, varRow);
var(_angle, 2, varRow);
var(_mouse, 3, varRow);
var(_loadRange, 4, varRow);
var(_inBlock, 5, varRow);
var(_vel, 6, varRow);
var(_pick, 7, varRow);
var(_pickTimer, 8, varRow);
var(_renderScale, 9, varRow);
var(_selectedInventory, 10, varRow);
var(_flightMode, 11, varRow);
var(_sprintMode, 12, varRow);
var(_time, 13, varRow);
var(_old, 0, 1);


vec4 load(vec2 coord) {
	return texture(iChannel0, vec2((floor(coord) + 0.5) / iChannelResolution[1].xy));
}

#define HASHSCALE1 .1031
#define HASHSCALE3 vec3(.1031, .1030, .0973)
#define HASHSCALE4 vec4(1031, .1030, .0973, .1099)

float hash13(vec3 p3)
{
	p3  = fract(p3 * HASHSCALE1);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 hash33(vec3 p3)
{
	p3 = fract(p3 * HASHSCALE3);
    p3 += dot(p3, p3.yxz+19.19);
    return fract(vec3((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
}

vec4 hash44(vec4 p4)
{
	p4 = fract(p4  * HASHSCALE4);
    p4 += dot(p4, p4.wzxy+19.19);
    return fract(vec4((p4.x + p4.y)*p4.z, (p4.x + p4.z)*p4.y, (p4.y + p4.z)*p4.w, (p4.z + p4.w)*p4.x));
}

//
// Description : Array and textureless GLSL 2D,3D simplex noise function.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
//
vec2 mod289(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec3 permute(vec3 x) {
  return mod289(((x*34.0)+1.0)*x);
}
vec4 permute(vec4 x) {
     return mod289(((x*34.0)+1.0)*x);
}
vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v)
  { 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}
float snoise(vec2 v)
  {
  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                      0.024390243902439); // 1.0 / 41.0
// First corner
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);

// Other corners
  vec2 i1;
  //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
  //i1.y = 1.0 - i1.x;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  // x0 = x0 - 0.0 + 0.0 * C.xx ;
  // x1 = x0 - i1 + 1.0 * C.xx ;
  // x2 = x0 - 1.0 + 2.0 * C.xx ;
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

// Permutations
  i = mod289(i); // Avoid truncation effects in permutation
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
		+ i.x + vec3(0.0, i1.x, 1.0 ));

  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;

// Gradients: 41 points uniformly over a line, mapped onto a diamond.
// The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

// Normalise gradients implicitly by scaling m
// Approximation of: m *= inversesqrt( a0*a0 + h*h );
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

// Compute final noise value at P
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}


const vec2 packedChunkSize = vec2(12,7);
const float heightLimit = packedChunkSize.x * packedChunkSize.y;

vec2 unswizzleChunkCoord(vec2 storageCoord) {
 	vec2 s = floor(storageCoord);
    float dist = max(s.x, s.y);
    float offset = floor(dist / 2.);
    float neg = step(0.5, mod(dist, 2.)) * 2. - 1.;
    return neg * (s - offset);
}

vec2 swizzleChunkCoord(vec2 chunkCoord) {
    vec2 c = chunkCoord;
    float dist = max(abs(c.x), abs(c.y));
    vec2 c2 = floor(abs(c - 0.5));
    float offset = max(c2.x, c2.y);
    float neg = step(c.x + c.y, 0.) * -2. + 1.;
    return (neg * c) + offset;
}

float calcLoadRange(void) {
	vec2 chunks = floor(iResolution.xy / packedChunkSize);
    float gridSize = min(chunks.x, chunks.y);
    return floor((gridSize - 1.) / 2.);
}

vec4 readMapTex(vec2 pos) {
 	return texture(iChannel1, (floor(pos) + 0.5) / iChannelResolution[0].xy);   
}

vec3 texToVoxCoord(vec2 textelCoord, vec3 offset) {
	vec3 voxelCoord = offset;
    voxelCoord.xy += unswizzleChunkCoord(textelCoord / packedChunkSize);
    voxelCoord.z += mod(textelCoord.x, packedChunkSize.x) + packedChunkSize.x * mod(textelCoord.y, packedChunkSize.y);
    return voxelCoord;
}

vec2 voxToTexCoord(vec3 voxCoord) {
    vec3 p = floor(voxCoord);
    return swizzleChunkCoord(p.xy) * packedChunkSize + vec2(mod(p.z, packedChunkSize.x), floor(p.z / packedChunkSize.x));
}

struct voxel {
	float id;
    float sunlight;
    float torchlight;
    float hue;
};

voxel decodeTextel(vec4 textel) {
	voxel o;
    o.id = textel.r;
    o.sunlight = floor(mod(textel.g, 16.));
    o.torchlight = floor(mod(textel.g / 16., 16.));
    o.hue = textel.b;
    return o;
}

vec4 encodeVoxel(voxel v) {
	vec4 o;
    o.r = v.id;
    o.g = clamp(floor(v.sunlight), 0., 15.) + 16. * clamp(floor(v.torchlight), 0., 15.);
    o.b = v.hue;
    o.a = 1.;
    return o;
}

bool inRange(vec2 p, vec4 r) {
	return (p.x > r.x && p.x < r.y && p.y > r.z && p.y < r.w);
}

voxel getVoxel(vec3 p) {
    return decodeTextel(readMapTex(voxToTexCoord(p)));
}

bool overworld(vec3 p) {
	float density = 48. - p.z;
    density += mix(0., 40., pow(.5 + .5 * snoise(p.xy /557. + vec2(0.576, .492)), 2.)) * snoise(p / 31.51 + vec3(0.981, .245, .497));
    return density > 0.;
}

float getInventory(float slot) {
	return slot + 1. + step(2.5, slot);  
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 textelCoord = floor(fragCoord);
    vec3 offset = floor(vec3(load(_pos).xy, 0.));
    vec3 oldOffset = floor(vec3(load(_old+_pos).xy, 0.));
    vec3 voxelCoord = texToVoxCoord(textelCoord, offset);            
    
    voxel vox;
    vec4 range = load(_old+_loadRange);
    vec4 pick = load(_pick);
    if (!inRange(voxelCoord.xy, range) || iFrame == 0 ) {
    	bool solid = overworld(voxelCoord);
        if (solid) {
            vox.id = 3.;
            if (overworld(voxelCoord + vec3(0,0,1))) vox.id = 2.;
            if (overworld(voxelCoord + vec3(0,0,3))) vox.id = 1.;
    		if (hash13(voxelCoord) > 0.98 && !overworld(voxelCoord + vec3(0,0,-1))) vox.id = 6.;
        }
        if (snoise(voxelCoord / 27.99 + vec3(0.981, .245, .497).yzx * 17.) > 1. - (smoothstep(0., 5., voxelCoord.z) - 0.7 * smoothstep(32., 48., voxelCoord.z))) vox.id = 0.;
        if (voxelCoord.z < 1.) vox.id = 16.;
        vox.hue = fract(hash13(voxelCoord));
        vox.sunlight = 0.;
        vox.torchlight = 0.;
    }
    else {
    	vox = getVoxel(voxelCoord - oldOffset);
    }

    if (voxelCoord == pick.xyz) {
        if (pick.a == 1. && load(_pickTimer).r > 1. && vox.id != 16.) vox.id = 0.;
        if (pick.a == 2.) vox.id = getInventory(load(_selectedInventory).r);
    }
    
    voxel temp;
    if (voxelCoord.z == heightLimit - 1.) {
    	vox.sunlight = 15.;   
    }
    else vox.sunlight = 0.;
    vox.torchlight = 0.;
    //if (length(voxelCoord + .5 - load(_pos).xyz) < 1.) vox.torchlight = 15.;
    if (voxelCoord.z < heightLimit - 1.) {
    	temp = getVoxel(voxelCoord + vec3(0,0,1) - oldOffset);
        vox.sunlight = max(vox.sunlight, temp.sunlight);
        vox.torchlight = max(vox.torchlight, temp.torchlight - 1.);
    }
    if (voxelCoord.z > 1.) {
    	temp = getVoxel(voxelCoord + vec3(0,0,-1) - oldOffset);
        vox.sunlight = max(vox.sunlight, temp.sunlight - 1.);
        vox.torchlight = max(vox.torchlight, temp.torchlight - 1.);
    }
    if (voxelCoord.x > range.x + 1.) {
    	temp = getVoxel(voxelCoord + vec3(-1,0,0) - oldOffset);
        vox.sunlight = max(vox.sunlight, temp.sunlight - 1.);
        vox.torchlight = max(vox.torchlight, temp.torchlight - 1.);
    }
    if (voxelCoord.x < range.y - 1.) {
    	temp = getVoxel(voxelCoord + vec3(1,0,0) - oldOffset);
        vox.sunlight = max(vox.sunlight, temp.sunlight - 1.);
        vox.torchlight = max(vox.torchlight, temp.torchlight - 1.);
    }
    if (voxelCoord.y > range.z + 1.) {
    	temp = getVoxel(voxelCoord + vec3(0,-1,0) - oldOffset);
        vox.sunlight = max(vox.sunlight, temp.sunlight - 1.);
        vox.torchlight = max(vox.torchlight, temp.torchlight - 1.);
    }
    if (voxelCoord.y < range.w - 1.) {
    	temp = getVoxel(voxelCoord + vec3(0,1,0) - oldOffset);
        vox.sunlight = max(vox.sunlight, temp.sunlight - 1.);
        vox.torchlight = max(vox.torchlight, temp.torchlight - 1.);
    }
    
    if (vox.id > 0.) {
        vox.sunlight = 0.;
        vox.torchlight = 0.;
    }
    
    if (vox.id == 6.) {
    	vox.torchlight = 15.;   
    }
    fragColor = encodeVoxel(vox);
}