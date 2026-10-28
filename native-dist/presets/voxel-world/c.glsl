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
	return texture(iChannel0, vec2((floor(coord) + 0.5) / iChannelResolution[0].xy));
}


#define HASHSCALE1 .1031
#define HASHSCALE3 vec3(.1031, .1030, .0973)
#define HASHSCALE4 vec4(1031, .1030, .0973, .1099)

vec4 noiseTex(vec2 c) {
	return texture(iChannel1, c / iChannelResolution[1].xy);   
}

float hash12(vec2 p)
{
	vec3 p3  = fract(vec3(p.xyx) * HASHSCALE1);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p)
{
	vec3 p3 = fract(vec3(p.xyx) * HASHSCALE3);
    p3 += dot(p3, p3.yzx+19.19);
    return fract(vec2((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y));
}

float signed(float x) {
	return x * 2. - 1.;   
}


//From https://www.shadertoy.com/view/4djGRh
float tileableWorley(in vec2 p, in float numCells)
{
	p *= numCells;
	float d = 1.0e10;
	for (int xo = -1; xo <= 1; xo++)
	{
		for (int yo = -1; yo <= 1; yo++)
		{
			vec2 tp = floor(p) + vec2(xo, yo);
			tp = p - tp - hash22(256. * mod(tp, numCells));
			d = min(d, dot(tp, tp));
		}
	}
	return sqrt(d);
	//return 1.0 - d;// ...Bubbles.
}

float crackingAnimation(vec2 p, float t) {
    t = ceil(t * 8.) / 8.;
	float d = 1.0e10;
    //t *= ;
    for (float i = 0.; i < 25.; i++) {
    	vec2 tp = texture(iChannel1, vec2(4, i) / 256.).xy - 0.5;
        tp *= max(0., (length(tp) + clamp(t, 0., 1.) - 1.) / length(tp));
        d = min(d, length(tp + 0.5 - p));
    }
    return pow(mix(clamp(1. - d * 3., 0., 1.), 1., smoothstep(t - 0.3, t + 0.3, max(abs(p.x - 0.5), abs(p.y - 0.5)) * 2.)), .6) * 1.8 - 0.8;
}

float brickPattern(vec2 c) {
	float o = 1.;
    if (mod(c.y, 4.) < 1.) o = 0.;
    if (mod(c.x - 4. * step(4., mod(c.y, 8.)), 8.) > 7.) o = 0.;
    return o;
}
float woodPattern(vec2 c) {
	float o = 1.;
    if (mod(c.y, 4.) < 1.) o = 0.;
    if (mod(c.x + 2. - 6. * step(4., mod(c.y, 8.)), 16.) > 15.) o = 0.;
    return o;
}

//From https://github.com/hughsk/glsl-hsv2rgb
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec4 getTexture(float id, vec2 c) {
    vec2 gridPos = vec2(mod(id, 16.), floor(id / 16.));
	return texture(iChannel2, (c + gridPos * 16.) / iChannelResolution[3].xy);
}



void mainImage( out vec4 o, in vec2 fragCoord )
{
    
    vec2 gridPos = floor(fragCoord / 16.);
    vec2 c = mod(fragCoord, 16.);
    int id = int(gridPos.x + gridPos.y * 16.);
    o.a = 1.;
    if (id == 0) {
    	o = vec4(1,0,1,1);
    }
    if (id == 1) {
        o.rgb = 0.45 + 0.2 * vec3(noiseTex(c * vec2(.5, 1.) + vec2(floor(hash12(c + vec2(27,19)) * 3. - 1.), 0.)).b);
    }
    if (id == 2) {
    	o.rgb = vec3(0.55,0.4,0.3) * (1. + 0.3 * signed(noiseTex(c + 37.).r));
        if (hash12(c * 12.) > 0.95) o.rgb = vec3(0.4) + 0.2 * noiseTex(c + 92.).g;
    }
    if (id == 3) {
    	o.rgb = getTexture(2., c).rgb;
        if (noiseTex(vec2(0, c.x) + 12.).a * 3. + 1. > 16. - c.y) o.rgb = getTexture(4., c).rgb;
    }
    if (id == 4) {
    	o.rgb = hsv2rgb(vec3(0.22, .8 - 0.3 * noiseTex(c + 47.).b, 0.6 + 0.1 * noiseTex(c + 47.).b));
    }
    if (id == 5) {
    	o.rgb = vec3(clamp(pow(1. - tileableWorley(c / 16., 4.), 2.), 0.2, 0.6) + 0.2 * tileableWorley(c / 16., 5.));
    }
    if (id == 6) {
        float w = 1. - tileableWorley(c / 16., 4.);
        float l = clamp(0.7 * pow(w, 4.) + 0.5 * w, 0., 1.);
        o.rgb = mix(vec3(.3, .1, .05), vec3(1,1,.6), l);
        if (w < 0.2) o.rgb = vec3(0.3, 0.25, 0.05);
    }
    if (id == 7) {
    	o.rgb = -0.1 * hash12(c) + mix(vec3(.6,.3,.2) + 0.1 * (1. - brickPattern(c + vec2(-1,1)) * brickPattern(c)), vec3(0.8), 1. - brickPattern(c));
    }
    if (id == 8) {
    	o.rgb = mix(vec3(1,1,.2), vec3(1,.8,.1), sin((c.x - c.y) / 3.) * .5 + .5);
        if (any(greaterThan(abs(c - 8.), vec2(7)))) o.rgb = vec3(1,.8,.1);
    }
    if (id == 9) {
        o.rgb = vec3(0.5,0.4,0.25)*(0.5 + 0.5 * woodPattern(c)) * (1. + 0.2 * noiseTex(c * vec2(.5, 1.) + vec2(floor(hash12(c + vec2(27,19)))) * 3. - 1.).b);
    }
    if (id == 16) {
      	o.rgb = (-1. + 2. * getTexture(1., c).rgb) * 2.5;
    }
    if (id == 32) {
    	o.rgb = vec3(crackingAnimation(c / 16., load(_pickTimer).r));
    }
    if (id == 48) {
    	o = vec4(vec3(0.2), 0.7);
        vec2 p = c - 8.;
        float d = max(abs(p.x), abs(p.y));
        if (d > 6.) {
            o.rgb = vec3(0.7);
            o.rgb += 0.05 * hash12(c);
            o.a = 1.;
            if ((d < 7. && p.x < 6.)|| (p.x > 7. && abs(p.y) < 7.)) o.rgb -= 0.3;
        }
        o.rgb += 0.05 * hash12(c);
        
    }
    
}