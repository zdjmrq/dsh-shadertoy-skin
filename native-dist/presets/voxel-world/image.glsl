// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

/* 
Voxel Game
fb39ca4's SH16C Entry

This was an attempt to make something like Minecraft entirely in
Shadertoy. The world around the player is saved in a buffer, and as long
as an an area is loaded, changes remain. However, if you go too far
away, blocks you have modified will reset. To load more blocks, go to 
fullscreen to increase the size of the buffers. I tried to implement
many of the features from Minecraft's Creative mode, but at this point,
this shader is more of a tech demo to prove that interactive voxel games
are possible.

Features:
    Semi-persistent world
    Flood-fill sky and torch lighting
    Smooth lighting and ambient occlusion
    Day/Night cycle
    Movement with collision detection
    Flying and sprinting mode
    Block placment and removal
    Hotbar to choose between: Stone, Dirt, Grass, Cobblestone, Glowstone, 
        Brick, Gold, Wood
    
Controls:
    Click and drag mouse to look, select blocks
    WASD to move
    Space to jump
    Double-tap space to start flying, use space and shift to go up and down.
    Q + mouse button to place block
    E + mouse button to destroy blocks
    Z/X to cycle through available blocks for placement
    0-8 to choose a block type for placement
    Page Up/Down to increase or decrease render resolution
    O,P to decrease/increase speed of day/night cycles

	There are #defines in Buffer A to change the controls.

TODO:
âœ“ Voxel Raycaster
âœ“ Free camera controls
âœ“ Store map in texture
âœ“ Infinite World
âœ“ Persistent World
âœ“ Sky Lighting
âœ“ Torch Lighting
âœ“ Smooth Lighting, Ambient Occlusion
âœ“ Vertical Collision Detection
âœ“ Walking, Jumping
âœ“ Horizontal collision detection
âœ“ Textures
âœ“ Proper world generation
âœ“ Block picking
âœ“ Adding/Removing blocks
âœ“ GUI for block selection
âœ“ Sun, Moon, Sky
âœ“ Day/Night Cycle
âœ“ Double jump to fly, double tap forwards to run
*/

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

float keyToggled(int keyCode) {
	return textureLod(iChannel1, vec2((float(keyCode) + 0.5) / 256., 2.5/3.), 0.0).r;   
}


// ---- 8< ---- GLSL Number Printing - @P_Malin ---- 8< ----
// Creative Commons CC0 1.0 Universal (CC-0) 
// https://www.shadertoy.com/view/4sBSWW

float DigitBin(const in int x)
{
    return x==0?480599.0:x==1?139810.0:x==2?476951.0:x==3?476999.0:x==4?350020.0:x==5?464711.0:x==6?464727.0:x==7?476228.0:x==8?481111.0:x==9?481095.0:0.0;
}

float PrintValue(const in vec2 fragCoord, const in vec2 vPixelCoords, const in vec2 vFontSize, const in float fValue, const in float fMaxDigits, const in float fDecimalPlaces)
{
    vec2 vStringCharCoords = (fragCoord.xy - vPixelCoords) / vFontSize;
    if ((vStringCharCoords.y < 0.0) || (vStringCharCoords.y >= 1.0)) return 0.0;
	float fLog10Value = log2(abs(fValue)) / log2(10.0);
	float fBiggestIndex = max(floor(fLog10Value), 0.0);
	float fDigitIndex = fMaxDigits - floor(vStringCharCoords.x);
	float fCharBin = 0.0;
	if(fDigitIndex > (-fDecimalPlaces - 1.01)) {
		if(fDigitIndex > fBiggestIndex) {
			if((fValue < 0.0) && (fDigitIndex < (fBiggestIndex+1.5))) fCharBin = 1792.0;
		} else {		
			if(fDigitIndex == -1.0) {
				if(fDecimalPlaces > 0.0) fCharBin = 2.0;
			} else {
				if(fDigitIndex < 0.0) fDigitIndex += 1.0;
				float fDigitValue = (abs(fValue / (pow(10.0, fDigitIndex))));
                float kFix = 0.0001;
                fCharBin = DigitBin(int(floor(mod(kFix+fDigitValue, 10.0))));
			}		
		}
	}
    return floor(mod((fCharBin / pow(2.0, floor(fract(vStringCharCoords.x) * 4.0) + (floor(vStringCharCoords.y * 5.0) * 4.0))), 2.0));
}

float getInventory(float slot) {
	return slot + 1. + step(2.5, slot);  
}

vec4 getTexture(float id, vec2 c) {
    vec2 gridPos = vec2(mod(id, 16.), floor(id / 16.));
	return textureLod(iChannel2, 16. * (c + gridPos) / iChannelResolution[2].xy, 0.0);
}

const float numItems = 8.;

vec4 drawSelectionBox(vec2 c) {
	vec4 o = vec4(0.);
    float d = max(abs(c.x), abs(c.y));
    if (d > 6. && d < 9.) {
        o.a = 1.;
        o.rgb = vec3(0.9);
        if (d < 7.) o.rgb -= 0.3;
        if (d > 8.) o.rgb -= 0.1;
    }
    return o;
}

mat2 inv2(mat2 m) {
  return mat2(m[1][1],-m[0][1], -m[1][0], m[0][0]) / (m[0][0]*m[1][1] - m[0][1]*m[1][0]);
}

vec4 drawGui(vec2 c) {
	float scale = floor(iResolution.y / 128.);
    c /= scale;
    vec2 r = iResolution.xy / scale;
    vec4 o = vec4(0);
    float xStart = (r.x - 16. * numItems) / 2.;
    c.x -= xStart;
    float selected = load(_selectedInventory).r;
    vec2 p = (fract(c / 16.) - .5) * 3.;
    vec2 u = vec2(sqrt(3.)/2.,.5);
    vec2 v = vec2(-sqrt(3.)/2.,.5);
    vec2 w = vec2(0,-1);
    if (c.x < numItems * 16. && c.x >= 0. && c.y < 16.) {
        float slot = floor(c.x / 16.);
    	o = getTexture(48., fract(c / 16.));
        vec3 b = vec3(dot(p,u), dot(p,v), dot(p,w));
        vec2 texCoord;
        //if (all(lessThan(b, vec3(1)))) o = vec4(dot(p,u), dot(p,v), dot(p,w),1.);
        float top = 0.;
        float right = 0.;
        if (b.z < b.x && b.z < b.y) {
        	texCoord = inv2(mat2(u,v)) * p.xy;
            top = 1.;
        }
        else if(b.x < b.y) {
        	texCoord = 1. - inv2(mat2(v,w)) * p.xy;
            right = 1.;
        }
        else {
        	texCoord = inv2(mat2(u,w)) * p.xy;
            texCoord.y = 1. - texCoord.y;
        }
        if (all(lessThanEqual(abs(texCoord - .5), vec2(.5)))) {
            float id = getInventory(slot);
            if (id == 3.) id += top;
            o.rgb = getTexture(id, texCoord).rgb * (0.5 + 0.25 * right + 0.5 * top);
            o.a = 1.;
        }
    }
    vec4 selection = drawSelectionBox(c - 8. - vec2(16. * selected, 0));
    o = mix(o, selection, selection.a);
    return o;
}

// ---- 8< -------- 8< -------- 8< -------- 8< ----

const vec2 packedChunkSize = vec2(11,6);
void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
    float scaleFactor = pow(sqrt(2.), load(_renderScale).r);
    vec2 renderResolution = ceil(iResolution.xy / scaleFactor); 
    fragColor = texture(iChannel3, fragCoord * renderResolution / iResolution.xy / iResolution.xy);
    vec4 gui = drawGui(fragCoord);
    fragColor = mix(fragColor, gui, gui.a);
    
    vec3 pos = load(_pos).xyz;
        
    if (bool(keyToggled(114))) {
        if (fragCoord.x < 20.) fragColor.rgb = mix(fragColor.rgb, texture(iChannel0, fragCoord / iResolution.xy).rgb, texture(iChannel0, fragCoord / iResolution.xy).a);
        fragColor = mix( fragColor, vec4(1,1,0,1), PrintValue(fragCoord, vec2(0.0, 5.0), vec2(8,15), iTimeDelta, 4.0, 1.0));
        fragColor = mix( fragColor, vec4(1,0,1,1), PrintValue(fragCoord, vec2(0.0, 25.0), vec2(8,15), load(_time).r, 6.0, 1.0));
        fragColor = mix( fragColor, vec2(1,.5).xyyx, PrintValue(fragCoord, vec2(0., iResolution.y - 20.), vec2(8,15), pos.x, 4.0, 5.0));
        fragColor = mix( fragColor, vec2(1,.5).yxyx, PrintValue(fragCoord, vec2(0., iResolution.y - 40.), vec2(8,15), pos.y, 4.0, 5.0));
        fragColor = mix( fragColor, vec2(1,.5).yyxx, PrintValue(fragCoord, vec2(0., iResolution.y - 60.), vec2(8,15), pos.z, 4.0, 5.0));
        
    }
	
    //fragColor = texture(iChannel2, fragCoord / 3. / iResolution.xy);
}