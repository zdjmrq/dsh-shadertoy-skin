// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

#define KEY_FORWARDS 87
#define KEY_BACKWARDS 83
#define KEY_LEFT 65
#define KEY_RIGHT 68
#define KEY_JUMP 32
#define KEY_SNEAK 16
#define KEY_PLACE 81
#define KEY_DESTROY 69
#define KEY_DECREASE_RESOLUTION 34
#define KEY_INCREASE_RESOLUTION 33
#define KEY_INCREASE_TIME_SCALE 80
#define KEY_DECREASE_TIME_SCALE 79
#define KEY_INVENTORY_NEXT 88
#define KEY_INVENTORY_PREVIOUS 90
#define KEY_INVENTORY_ABSOLUTE_START 49

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
	return textureLod(iChannel0, vec2((floor(coord) + 0.5) / iChannelResolution[1].xy), 0.0);
}

bool inBox(vec2 coord, vec4 bounds) {
	return coord.x >= bounds.x && coord.y >= bounds.y && coord.x < (bounds.x + bounds.z) && coord.y < (bounds.y + bounds.w);
}

vec2 currentCoord;
vec4 outValue;
bool store4(vec2 coord, vec4 value) {
	if (inBox(currentCoord, vec4(coord, 1., 1.))) {
    	outValue = value;
        return true;
    }
    else return false;
}
bool store3(vec2 coord, vec3 value) { return store4(coord, vec4(value, 1)); }
bool store2(vec2 coord, vec2 value) { return store4(coord, vec4(value, 0, 1)); }
bool store1(vec2 coord, float value) { return store4(coord, vec4(value, 0, 0, 1)); }

float keyDown(int keyCode) {
	return textureLod(iChannel2, vec2((float(keyCode) + 0.5) / 256., .5/3.), 0.0).r;   
}

float keyPress(int keyCode) {
	return textureLod(iChannel2, vec2((float(keyCode) + 0.5) / 256., 1.5/3.), 0.0).r;   
}

float keySinglePress(int keycode) {
	bool now = bool(keyDown(keycode));
    bool previous = bool(textureLod(iChannel0, vec2(256. + float(keycode) + 0.5, 0.5) / iResolution.xy, 0.0).r);
    return float(now && !previous);
}

const vec2 packedChunkSize = vec2(12,7);
const float heightLimit = packedChunkSize.x * packedChunkSize.y;

float calcLoadDist(void) {
	vec2 chunks = floor(iResolution.xy / packedChunkSize);
    float gridSize = min(chunks.x, chunks.y);
    return floor((gridSize - 1.) / 2.);
}

vec4 calcLoadRange(vec2 pos) {
	vec2 d = calcLoadDist() * vec2(-1,1);
    return floor(pos).xxyy + d.xyxy;
}

vec2 swizzleChunkCoord(vec2 chunkCoord) {
    vec2 c = chunkCoord;
    float dist = max(abs(c.x), abs(c.y));
    vec2 c2 = floor(abs(c - 0.5));
    float offset = max(c2.x, c2.y);
    float neg = step(c.x + c.y, 0.) * -2. + 1.;
    return (neg * c) + offset;
}

float rectangleCollide(vec2 p1, vec2 p2, vec2 s) {
	return float(all(lessThan(abs(p1 - p2), s)));   
}

float horizontalPlayerCollide(vec2 p1, vec2 p2, float h) {
    vec2 s = (vec2(1) + vec2(.6, h)) / 2.;
    p2.y += h / 2.;
    return rectangleCollide(p1, p2, s);
}

vec4 readMapTex(vec2 pos) {
 	return textureLod(iChannel1, (floor(pos) + 0.5) / iChannelResolution[0].xy, 0.0);   
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

voxel getVoxel(vec3 p) {
    return decodeTextel(readMapTex(voxToTexCoord(p)));
}

bool getHit(vec3 c) {
	vec3 p = vec3(c) + vec3(0.5);
	float d = readMapTex(voxToTexCoord(p)).r;
	return d > 0.5;
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

    
rayCastResults rayCast(vec3 rayPos, vec3 rayDir, vec3 offset) {
	vec3 mapPos = floor(rayPos);
    vec3 deltaDist = abs(vec3(length(rayDir)) / rayDir);
    vec3 rayStep = sign(rayDir);
    vec3 sideDist = (sign(rayDir) * (mapPos - rayPos) + (sign(rayDir) * 0.5) + 0.5) * deltaDist; 
    vec3 mask;
    bool hit = false;
    for (int i = 0; i < 9; i++) {
		mask = step(sideDist.xyz, sideDist.yzx) * step(sideDist.xyz, sideDist.zxy);
		sideDist += vec3(mask) * deltaDist;
		mapPos += vec3(mask) * rayStep;
		
        if (mapPos.z < 0. || mapPos.z >= packedChunkSize.x * packedChunkSize.y) break;
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


void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    currentCoord = fragCoord;
    vec2 texCoord = floor(fragCoord);
    if (texCoord.x < 512.) {
        if (texCoord.y == varRow) {
            if (texCoord.x >= 256.) {
            	fragColor.r = texture(iChannel2, (fragCoord - 256.) / vec2(256,3)).r;
                vec4 old = texture(iChannel0, (_old + fragCoord) / iResolution.xy);
                if (fragColor.r != old.r) old.a = 0.;
                fragColor.a = old.a + iTimeDelta;
        	}
            else {
                vec3 pos = load(_pos).xyz;
                vec3 oldPos = pos;
                vec3 offset = vec3(floor(pos.xy), 0.);
                vec2 angle = load(_angle).xy;
                vec4 oldMouse = load(_mouse);
                vec3 vel = load(_vel).xyz;
                vec4 mouse = iMouse / length(iResolution.xy);
				float renderScale = load(_renderScale).r;
                vec2 time = load(_time).rg;
                vec2 flightMode = load(_flightMode).rg;
                vec2 sprintMode = load(_sprintMode).rg;
                float selected = load(_selectedInventory).r;
                float dt = min(iTimeDelta, .05);

                if (iFrame == 0) {
                    pos = vec3(0,0,52);
                    angle = vec2(-0.75,2.5);
                    oldMouse = vec4(-1);
                    vel = vec3(0);
                    renderScale = 0.;
                    time = vec2(0,4);
                    selected = 0.;
                }
                if (oldMouse.z > 0. && iMouse.z > 0.) {
                    angle += 5.*(mouse.xy - oldMouse.xy) * vec2(-1,-1);
                    angle.y = clamp(angle.y, 0.1, PI - 0.1);
                }
                vec3 dir = vec3(sin(angle.y) * cos(angle.x), sin(angle.y) * sin(angle.x), cos(angle.y));
                vec3 dirU = vec3(normalize(vec2(dir.y, -dir.x)), 0);
                vec3 dirV = cross(dirU, dir);
                vec3 move = vec3(0);

                vec3 dirFwd = vec3(cos(angle.x), sin(angle.x), 0);;
                vec3 dirRight = vec3(dirFwd.y, -dirFwd.x, 0);
                vec3 dirUp = vec3(0,0,1);
                /*move += dir * (keyDown(87)-keyDown(83));
                move += dirU * (keyDown(68) - keyDown(65));
                move += vec3(0,0,1) * (keyDown(82) - keyDown(70));*/

                float inBlock = 0.;
                float minHeight = 0.;
                vec3 vColPos, hColPos;
                for (float i = 0.; i < 4.; i++) {
                    vColPos = vec3(floor(pos.xy - 0.5), floor(pos.z - 1. - i));
                    if (getVoxel(vColPos - offset + vec3(0,0,0)).id * rectangleCollide(vColPos.xy + vec2(0.5,0.5), pos.xy, vec2(.8))
                        + getVoxel(vColPos - offset + vec3(0,1,0)).id * rectangleCollide(vColPos.xy + vec2(0.5,1.5), pos.xy, vec2(.8)) 
                        + getVoxel(vColPos - offset + vec3(1,0,0)).id * rectangleCollide(vColPos.xy + vec2(1.5,0.5), pos.xy, vec2(.8))
                        + getVoxel(vColPos - offset + vec3(1,1,0)).id * rectangleCollide(vColPos.xy + vec2(1.5,1.5), pos.xy, vec2(.8))
                        > .5) {
                        minHeight = vColPos.z + 1.001; 
                        inBlock = 1.;
                        break;
                    }
                }
                float maxHeight = heightLimit - 1.8;
                vColPos = vec3(floor(pos.xy - 0.5), floor(pos.z + 1.8 + 1.));
                if (getVoxel(vColPos - offset + vec3(0,0,0)).id * rectangleCollide(vColPos.xy + vec2(0.5,0.5), pos.xy, vec2(.8))
                    + getVoxel(vColPos - offset + vec3(0,1,0)).id * rectangleCollide(vColPos.xy + vec2(0.5,1.5), pos.xy, vec2(.8)) 
                    + getVoxel(vColPos - offset + vec3(1,0,0)).id * rectangleCollide(vColPos.xy + vec2(1.5,0.5), pos.xy, vec2(.8))
                    + getVoxel(vColPos - offset + vec3(1,1,0)).id * rectangleCollide(vColPos.xy + vec2(1.5,1.5), pos.xy, vec2(.8))
                    > .5) {
                    maxHeight = vColPos.z - 1.8 - .001; 
                    inBlock = 1.;
                }
                float minX = pos.x - 1000.;
                hColPos = vec3(floor(pos.xy - vec2(.3, .5)) + vec2(-1,0), floor(pos.z));
                if (getVoxel(hColPos - offset + vec3(0,0,0)).id * horizontalPlayerCollide(hColPos.yz + vec2(0.5, 0.5), pos.yz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,1,0)).id * horizontalPlayerCollide(hColPos.yz + vec2(1.5, 0.5), pos.yz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,0,1)).id * horizontalPlayerCollide(hColPos.yz + vec2(0.5, 1.5), pos.yz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,1,1)).id * horizontalPlayerCollide(hColPos.yz + vec2(1.5, 1.5), pos.yz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,0,2)).id * horizontalPlayerCollide(hColPos.yz + vec2(0.5, 2.5), pos.yz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,1,2)).id * horizontalPlayerCollide(hColPos.yz + vec2(1.5, 2.5), pos.yz, 1.8)
                    > .5) {
                    minX = hColPos.x + 1.301;
                }
                float maxX = pos.x + 1000.;
                hColPos = vec3(floor(pos.xy - vec2(-.3, .5)) + vec2(1,0), floor(pos.z));
                if (getVoxel(hColPos - offset + vec3(0,0,0)).id * horizontalPlayerCollide(hColPos.yz + vec2(0.5, 0.5), pos.yz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,1,0)).id * horizontalPlayerCollide(hColPos.yz + vec2(1.5, 0.5), pos.yz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,0,1)).id * horizontalPlayerCollide(hColPos.yz + vec2(0.5, 1.5), pos.yz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,1,1)).id * horizontalPlayerCollide(hColPos.yz + vec2(1.5, 1.5), pos.yz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,0,2)).id * horizontalPlayerCollide(hColPos.yz + vec2(0.5, 2.5), pos.yz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,1,2)).id * horizontalPlayerCollide(hColPos.yz + vec2(1.5, 2.5), pos.yz, 1.8)
                    > .5) {
                    maxX = hColPos.x - .301;
                }
                            float minY = pos.y - 1000.;
                hColPos = vec3(floor(pos.xy - vec2(.5, .3)) + vec2(0,-1), floor(pos.z));
                if (getVoxel(hColPos - offset + vec3(0,0,0)).id * horizontalPlayerCollide(hColPos.xz + vec2(0.5, 0.5), pos.xz, 1.8)
                    + getVoxel(hColPos - offset + vec3(1,0,0)).id * horizontalPlayerCollide(hColPos.xz + vec2(1.5, 0.5), pos.xz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,0,1)).id * horizontalPlayerCollide(hColPos.xz + vec2(0.5, 1.5), pos.xz, 1.8)
                    + getVoxel(hColPos - offset + vec3(1,0,1)).id * horizontalPlayerCollide(hColPos.xz + vec2(1.5, 1.5), pos.xz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,0,2)).id * horizontalPlayerCollide(hColPos.xz + vec2(0.5, 2.5), pos.xz, 1.8)
                    + getVoxel(hColPos - offset + vec3(1,0,2)).id * horizontalPlayerCollide(hColPos.xz + vec2(1.5, 2.5), pos.xz, 1.8)
                    > .5) {
                    minY = hColPos.y + 1.301;
                }
                float maxY = pos.y + 1000.;
                hColPos = vec3(floor(pos.xy - vec2(.5, -.3)) + vec2(0,1), floor(pos.z));
                if (getVoxel(hColPos - offset + vec3(0,0,0)).id * horizontalPlayerCollide(hColPos.xz + vec2(0.5, 0.5), pos.xz, 1.8)
                    + getVoxel(hColPos - offset + vec3(1,0,0)).id * horizontalPlayerCollide(hColPos.xz + vec2(1.5, 0.5), pos.xz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,0,1)).id * horizontalPlayerCollide(hColPos.xz + vec2(0.5, 1.5), pos.xz, 1.8)
                    + getVoxel(hColPos - offset + vec3(1,0,1)).id * horizontalPlayerCollide(hColPos.xz + vec2(1.5, 1.5), pos.xz, 1.8)
                    + getVoxel(hColPos - offset + vec3(0,0,2)).id * horizontalPlayerCollide(hColPos.xz + vec2(0.5, 2.5), pos.xz, 1.8)
                    + getVoxel(hColPos - offset + vec3(1,0,2)).id * horizontalPlayerCollide(hColPos.xz + vec2(1.5, 2.5), pos.xz, 1.8)
                    > .5) {
                    maxY = hColPos.y - .301;
                }
                                
                if (abs(pos.z - minHeight) < 0.01) flightMode.r = 0.;
                if (bool(keySinglePress(KEY_JUMP))) {
                    if (flightMode.g > 0.) {
                        flightMode.r = 1.- flightMode.r;
                        sprintMode.r = 0.;
                    }
                    flightMode.g = 0.3;
                }
                flightMode.g = max(flightMode.g - dt, 0.);
                    
                if (bool(keySinglePress(KEY_FORWARDS))) {
					if (sprintMode.g > 0.) sprintMode.r = 1.;
                    sprintMode.g = 0.3;
                }
                if (!bool(keyDown(KEY_FORWARDS))) {
                    if (sprintMode.g <= 0.) sprintMode.r = 0.;
                }
                sprintMode.g = max(sprintMode.g - dt, 0.);
				
                if (bool(flightMode.r)) {
                    if (length(vel) > 0.) vel -= min(length(vel), 25. * dt) * normalize(vel);
                    vel += 50. * dt * dirFwd * sign(keyDown(KEY_FORWARDS)-keyDown(KEY_BACKWARDS)+keyDown(38)-keyDown(40));
                    vel += 50. * dt * dirRight * sign(keyDown(KEY_RIGHT)-keyDown(KEY_LEFT)+keyDown(39)-keyDown(37));
                    vel += 50. * dt * dirUp * sign(keyDown(KEY_JUMP) - keyDown(KEY_SNEAK));
                    if (length(vel) > 20.) vel = normalize(vel) * 20.;
                }
                else {
                    // dsh-shadertoy: zero velocity must not divide by zero and
                    // poison the persistent position/voxel buffers with NaNs.
                    float horizontalSpeed = length(vel.xy);
                    vel.xy *= horizontalSpeed > 0.0 ? max(0.0, 1.0 - 25.0 * dt / horizontalSpeed) : 0.0;
                    vel += 50. * dt * dirFwd * sign(keyDown(KEY_FORWARDS)-keyDown(KEY_BACKWARDS)+keyDown(38)-keyDown(40));
                    vel += 50. * dt * dirFwd * 0.4 * sprintMode.r;
                    vel += 50. * dt * dirRight * sign(keyDown(KEY_RIGHT)-keyDown(KEY_LEFT)+keyDown(39)-keyDown(37));
                    if (abs(pos.z - minHeight) < 0.01) {
                        vel.z = 9. * keyDown(32);
                    }
                    else {
                        vel.z -= 32. * dt;
                        vel.z = clamp(vel.z, -80., 30.);
                    }
                    if (length(vel.xy) > 4.317 * (1. + 0.4 * sprintMode.r)) vel.xy = normalize(vel.xy) * 4.317 * (1. + 0.4 * sprintMode.r);
                }
				
                
                pos += dt * vel; 
                if (pos.z < minHeight) {
                    pos.z = minHeight;
                    vel.z = 0.;
                }
                if (pos.z > maxHeight) {
                    pos.z = maxHeight;
                    vel.z = 0.;
                }
                if (pos.x < minX) {
                    pos.x = minX;
                    vel.x = 0.;
                }
                if (pos.x > maxX) {
                    pos.x = maxX;
                    vel.x = 0.;
                }
                if (pos.y < minY) {
                    pos.y = minY;
                    vel.y = 0.;
                }
                if (pos.y > maxY) {
                    pos.y = maxY;
                    vel.y = 0.;
                }

                float timer = load(_old+_pickTimer).r;
                vec4 oldPick = load(_old+_pick);
                vec4 pick;
                float pickAction;
                if (iMouse.z > 0.) {
                    vec3 cameraDir = vec3(sin(angle.y) * cos(angle.x), sin(angle.y) * sin(angle.x), cos(angle.y));
                    vec3 cameraPlaneU = vec3(normalize(vec2(cameraDir.y, -cameraDir.x)), 0);
                    vec3 cameraPlaneV = cross(cameraPlaneU, cameraDir) * iResolution.y / iResolution.x;
                    vec2 screenPos = iMouse.xy / iResolution.xy * 2.0 - 1.0;
                    vec3 rayDir = cameraDir + screenPos.x * cameraPlaneU + screenPos.y * cameraPlaneV;
                    rayCastResults res = rayCast(pos + vec3(0,0,1.6), rayDir, offset);
                    if (res.dist <= 5.) {
                        pick.xyz = res.mapPos;
                        if (bool(keyDown(KEY_DESTROY))) {
                            pick.a = 1.;
                            store1(vec2(0,9),pick.a);
                            timer += dt / 0.25;
                        }
                        else if (bool(keySinglePress(KEY_PLACE))) {
                            pick.a = 2.;
                            pick.xyz += res.normal;
                            timer += dt / 0.3;
                        }
                		if (oldPick != pick) timer = 0.;
                    }
                    else {
                        pick = vec4(-1,-1,-1,0);
                        timer = 0.;
                    }
                }
                else {
                    pick = vec4(-1,-1,-1,0);
                    timer = 0.;
                }
				
                const int numItems = 8;
                selected += keyPress(KEY_INVENTORY_NEXT) - keyPress(KEY_INVENTORY_PREVIOUS);
                for (int i = 0; i < 9; i++) {
                	if (bool(keyPress(KEY_INVENTORY_ABSOLUTE_START + i))) selected = float(i);   
                }
				selected = mod(selected, float(numItems));
                
                renderScale = clamp(renderScale + keySinglePress(KEY_DECREASE_RESOLUTION) - keySinglePress(KEY_INCREASE_RESOLUTION), 0., 4.);
				time.g = clamp(time.g + keySinglePress(KEY_INCREASE_TIME_SCALE) - keyPress(KEY_DECREASE_TIME_SCALE), 0., 8.);
				time.r = mod(time.r + dt * sign(time.g) * pow(2., time.g - 1.), 1200.);

                store3(_pos, pos);
                store2(_angle, angle);
                store4(_loadRange, calcLoadRange(pos.xy));
                store4(_mouse, mouse);
                store1(_inBlock, inBlock);
                store3(_vel, vel);
                store4(_pick, pick);
                store1(_pickTimer, timer);
                store1(_renderScale, renderScale);
                store1(_selectedInventory, selected);
                store2(_flightMode, flightMode);
                store2(_sprintMode, sprintMode);
                store2(_time, time);
                fragColor = outValue;
            }
        }
        else fragColor = texture(iChannel0, (fragCoord - _old) / iResolution.xy);
    }
    else fragColor.rgb = vec3(0,0,0);
}


