// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

const float PI = 3.14159265359;

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
	return textureLod(iChannel0, vec2((floor(coord) + 0.5) / iChannelResolution[0].xy), 0.0);
}

vec2 unswizzleChunkCoord(vec2 storageCoord) {
 	vec2 s = storageCoord;
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


const vec2 packedChunkSize = vec2(12,7);

vec4 readMapTex(vec2 pos) {
 	return textureLod(iChannel1, (floor(pos) + 0.5) / iChannelResolution[0].xy, 0.0);   
}

vec2 voxToTexCoord(vec3 p) {
 	p = floor(p);
    return swizzleChunkCoord(p.xy) * packedChunkSize + vec2(mod(p.z, packedChunkSize.x), floor(p.z / packedChunkSize.x));
}

bool getHit(vec3 c) {
	vec3 p = vec3(c) + vec3(0.5);
	float d = readMapTex(voxToTexCoord(p)).r;
	return d > 0.5;
}

vec2 rotate2d(vec2 v, float a) {
	float sinA = sin(a);
	float cosA = cos(a);
	return vec2(v.x * cosA - v.y * sinA, v.y * cosA + v.x * sinA);	
}

//From https://github.com/hughsk/glsl-hsv2rgb
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec4 getTexture(float id, vec2 c) {
    vec2 gridPos = vec2(mod(id, 16.), floor(id / 16.));
	return textureLod(iChannel2, 16. * (c + gridPos) / iChannelResolution[3].xy, 0.0);
}


bool inRange(vec2 p, vec4 r) {
	return (p.x > r.x && p.x < r.y && p.y > r.z && p.y < r.w);
}

struct voxel {
	float id;
    vec2 light;
    float hue;
};

voxel decodeTextel(vec4 textel) {
	voxel o;
    o.id = textel.r;
    o.light.s = floor(mod(textel.g, 16.));
    o.light.t = floor(mod(textel.g / 16., 16.));
    o.hue = textel.b;
    return o;
}

voxel getVoxel(vec3 p) {
    return decodeTextel(readMapTex(voxToTexCoord(p)));
}

vec2 max24(vec2 a, vec2 b, vec2 c, vec2 d) {
	return max(max(a, b), max(c, d));   
}

float lightLevelCurve(float t) {
    t = mod(t, 1200.);
	return 1. - ( smoothstep(400., 700., t) - smoothstep(900., 1200., t));
}

vec3 lightmap(vec2 light) {
    light = 15. - light;
    return clamp(mix(vec3(0), mix(vec3(0.11, 0.11, 0.21), vec3(1), lightLevelCurve(load(_time).r)), pow(.8, light.s)) + mix(vec3(0), vec3(1.3, 1.15, 1), pow(.75, light.t)), 0., 1.);   
}

float vertexAo(float side1, float side2, float corner) {
	return 1. - (side1 + side2 + max(corner, side1 * side2)) / 5.0;
}

float opaque(float id) {
	return id > .5 ? 1. : 0.;   
}

vec3 calcLightingFancy(vec3 r, vec3 s, vec3 t, vec2 uv) {
	voxel v1, v2, v3, v4, v5, v6, v7, v8, v9;
    //uv = (floor(uv * 16.) + .5) / 16.;
    v1 = getVoxel(r - s + t);
    v2 = getVoxel(r + t);
    v3 = getVoxel(r + s + t);
    v4 = getVoxel(r - s);
    v5 = getVoxel(r);
    v6 = getVoxel(r + s);
    v7 = getVoxel(r - s - t);
    v8 = getVoxel(r - t);
    v9 = getVoxel(r + s - t);
    
    //return vec3(uv, 0.) - .5 * opaque(v6.id);
    
    vec2 light1, light2, light3, light4, light;
    light1 = max24(v1.light, v2.light, v4.light, v5.light);
    light2 = max24(v2.light, v3.light, v5.light, v6.light);
    light3 = max24(v4.light, v5.light, v7.light, v8.light);
    light4 = max24(v5.light, v6.light, v8.light, v9.light);
    
    float ao1, ao2, ao3, ao4, ao;
    ao1 = vertexAo(opaque(v2.id), opaque(v4.id), opaque(v1.id));
    ao2 = vertexAo(opaque(v2.id), opaque(v6.id), opaque(v3.id));
    ao3 = vertexAo(opaque(v8.id), opaque(v4.id), opaque(v7.id));
    ao4 = vertexAo(opaque(v8.id), opaque(v6.id), opaque(v9.id));
    
    light = mix(mix(light3, light4, uv.x), mix(light1, light2, uv.x), uv.y);
    ao = mix(mix(ao3, ao4, uv.x), mix(ao1, ao2, uv.x), uv.y);
    
    return lightmap(light) * pow(ao, 1. / 1.);
}

vec3 calcLightingFast(vec3 r, vec3 s, vec3 t, vec2 uv) {
    return lightmap(min(getVoxel(r).light + 0.2, 15.));
}

struct rayCastResults {
	bool hit;
    vec3 rayPos;
    vec3 mapPos;
    vec3 normal;
    vec2 uv;
    vec3 tangent;
    vec3 bitangent;
    float dist;
};

rayCastResults rayCast(vec3 rayPos, vec3 rayDir, vec3 offset, vec4 range) {
	vec3 mapPos = floor(rayPos);
    vec3 deltaDist = abs(vec3(length(rayDir)) / rayDir);
    vec3 rayStep = sign(rayDir);
    vec3 sideDist = (sign(rayDir) * (mapPos - rayPos) + (sign(rayDir) * 0.5) + 0.5) * deltaDist; 
    vec3 mask;
    bool hit = false;
    for (int i = 0; i < 384; i++) {
		mask = step(sideDist.xyz, sideDist.yzx) * step(sideDist.xyz, sideDist.zxy);
		sideDist += vec3(mask) * deltaDist;
		mapPos += vec3(mask) * rayStep;
		
        if (!inRange(mapPos.xy, range) || mapPos.z < 0. || mapPos.z >= packedChunkSize.x * packedChunkSize.y) break;
        if (getHit(mapPos - offset)) { 
            hit = true; 
            break;
        }

	}
    vec3 endRayPos = rayDir / dot(mask * rayDir, vec3(1)) * dot(mask * (mapPos + step(rayDir, vec3(0)) - rayPos), vec3(1)) + rayPos;
   	vec2 uv;
    vec3 tangent1;
    vec3 tangent2;
    if (abs(mask.x) > 0.) {
        uv = endRayPos.yz;
        tangent1 = vec3(0,1,0);
        tangent2 = vec3(0,0,1);
    }
    else if (abs(mask.y) > 0.) {
        uv = endRayPos.xz;
        tangent1 = vec3(1,0,0);
        tangent2 = vec3(0,0,1);
    }
    else {
        uv = endRayPos.xy;
        tangent1 = vec3(1,0,0);
        tangent2 = vec3(0,1,0);
    }
    uv = fract(uv);
    rayCastResults res;
    res.hit = hit;
    res.uv = uv;
    res.mapPos = mapPos;
    res.normal = -rayStep * mask;
    res.tangent = tangent1;
    res.bitangent = tangent2;
    res.rayPos = endRayPos;
    res.dist = length(rayPos - endRayPos);
    return res;
}


vec3 skyColor(vec3 rayDir) {
    float t = load(_time).r;
    float lightLevel = lightLevelCurve(t);
    float sunAngle = (t * PI * 2. / 1200.) + PI / 4.;
    vec3 sunDir = vec3(cos(sunAngle), 0, sin(sunAngle));
    
    vec3 daySkyColor = vec3(.5,.75,1);
    vec3 dayHorizonColor = vec3(0.8,0.8,0.9);
    vec3 nightSkyColor = vec3(0.1,0.1,0.2) / 2.;
    
    vec3 skyColor = mix(nightSkyColor, daySkyColor, lightLevel);
    vec3 horizonColor = mix(nightSkyColor, dayHorizonColor, lightLevel);
    float sunVis = smoothstep(.99, 0.995, dot(sunDir, rayDir));
    float moonVis = smoothstep(.999, 0.9995, dot(-sunDir, rayDir));
    return mix(mix(mix(horizonColor, skyColor, clamp(dot(rayDir, vec3(0,0,1)), 0., 1.)), vec3(1,1,0.95), sunVis), vec3(0.8), moonVis);
    
}

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
    float scaleFactor = pow(sqrt(2.), load(_renderScale).r);
    vec2 renderResolution = ceil(iResolution.xy / scaleFactor); 
    if (any(greaterThan(fragCoord, renderResolution))) {
        fragColor = vec4(0);
        return;
    }
    vec2 screenPos = (fragCoord.xy / renderResolution.xy) * 2.0 - 1.0;
	vec3 rayPos = load(_pos).xyz + vec3(0,0,1.6);
    vec2 angle = load(_angle).xy;
    vec4 range = load(_loadRange);
    vec3 cameraDir = vec3(sin(angle.y) * cos(angle.x), sin(angle.y) * sin(angle.x), cos(angle.y));
    vec3 cameraPlaneU = vec3(normalize(vec2(cameraDir.y, -cameraDir.x)), 0);
    vec3 cameraPlaneV = cross(cameraPlaneU, cameraDir) * renderResolution.y / renderResolution.x;
	vec3 rayDir = normalize(cameraDir + screenPos.x * cameraPlaneU + screenPos.y * cameraPlaneV);
	
	vec3 mapPos = vec3(floor(rayPos));
    vec3 offset = vec3(floor(load(_pos).xy), 0.);
	vec3 deltaDist = abs(vec3(length(rayDir)) / rayDir);
	
	vec3 rayStep = vec3(sign(rayDir));

	vec3 sideDist = (sign(rayDir) * (vec3(mapPos) - rayPos) + (sign(rayDir) * 0.5) + 0.5) * deltaDist; 
	
	vec3 mask;
    
    mapPos;
    
    rayCastResults res = rayCast(rayPos, rayDir, offset, range);
	
	vec3 color = vec3(0);
    voxel vox = getVoxel(res.mapPos - offset);
    if (res.hit) {
        
        color = calcLightingFancy(res.mapPos - offset + res.normal, res.tangent, res.bitangent, res.uv);
        //color *= hsv2rgb(vec3(getVoxel(mapPos + .5 - offset).hue, .1, 1));
        float textureId = vox.id;
        if (textureId == 3.) textureId += res.normal.z;
        color *= getTexture(textureId, res.uv).rgb;
        vec4 pick = load(_pick);
        if (res.mapPos == pick.xyz) {
            if (pick.a == 1.) color *= getTexture(32., res.uv).r;
            else color = mix(color, vec3(1), 0.2);
        }
        //color.rgb = res.uv.xyx;
    }
    //else color = mix(lightmap(vec2(0)) / 2., skyColor(rayDir), vox.light.s / 15.);
    else color = skyColor(rayDir);
    fragColor.rgb = pow(color, vec3(1.));
    
}

