// 造山 — Rune Skovbo Johansen (runevision); Fewes; Clay John
// Source: https://www.shadertoy.com/view/sf23W1
// Bundled under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Existing component licences and author notices below remain in force.

// Adaptation: sample each input at its actual size, decode finite material pairs,
// and initialize/use the surface normal before calculating reflections.

/*
=====================================================================================

See Buffer B for information on the erosion technique.

The Image buffer handles raymarched terrain rendering based on the eroded heightmap
from Buffer B (which again is based on the raw heightmap from Buffer A) and the
noise texture from Buffer C.

Terrain rendering derived from https://www.shadertoy.com/view/7ljcRW by Fewes.

A few of the changes implemented:

 - Normals are calculated here rather than in Buffer B, so we only have to sample the
   buffer multiple times per pixel, rather than running the whole heightmap function.

 - The raymarching runs a cheaper map function which only returns the height, whereas
   the full map function is only called once, when the data for shading is needed.

 - Multiple different data layers are transferred from Buffer B, using packing.
 
 - Rendering of drainage patterns and trees, plus various material pattern tweaks.
 
 - Fix for rendering of cut-off of water at the far end.
 
 - Support for more debug buffers being displayed.

=====================================================================================
*/


// -----------------------------------------------------------------------------
// Functions for retrieving map data from Buffer B and C
// -----------------------------------------------------------------------------

// Get the map channels from Buffer B, except the packed data.
// This is cheaper for usages that don't need the packed data anyway.
vec3 GetChannel0(vec2 uv) {
    uv *= BUFFER_SIZE / iChannelResolution[0].xy;
    return texture(iChannel0, uv).xyz;
}

// Get detail texture from Buffer C.
vec4 GetChannel1(vec2 uv) {
    uv *= BUFFER_SIZE / iChannelResolution[1].xy;
    return texture(iChannel1, uv);
}

// Get map channels from Buffer B, including the packed data.
vec3 GetChannel0Data(vec2 uv, out vec4 data) {
    vec2 p = uv * BUFFER_SIZE - 0.5;
    
    ivec2 i = ivec2(p);
    vec2 b = fract(p);
    vec2 a = 1.0 - b;
    
    // Get the four texels directly, rather than an interpolated result.
    vec4 AA = texelFetch(iChannel0, i, 0);
    vec4 AB = texelFetch(iChannel0, i + ivec2(0, 1), 0);
    vec4 BA = texelFetch(iChannel0, i + ivec2(1, 0), 0);
    vec4 BB = texelFetch(iChannel0, i + ivec2(1, 1), 0);
    // Only x is a height; packed yz must be decoded before interpolation.
    vec4 ret = (AA * a.y + AB * b.y) * a.x + (BA * a.y + BB * b.y) * b.x;
    
    // Unpack each of the four samples into a vec4.
    vec4 AAdata = unpack4(AA.yz);
    vec4 ABdata = unpack4(AB.yz);
    vec4 BAdata = unpack4(BA.yz);
    vec4 BBdata = unpack4(BB.yz);
    // Interpolate the four vec4s so each piece of data is correctly interpolated.
    data = (AAdata * a.y + ABdata * b.y) * a.x + (BAdata * a.y + BBdata * b.y) * b.x;
    
    return ret.xyz;
}

vec2 GetUV(vec3 p) {
    vec2 pixel = vec2(1.0) / BUFFER_SIZE;
    vec2 uv = p.xz * (1.0 - pixel * 2.0) + vec2(0.5);
    uv = clamp(uv, pixel, vec2(1.0) - pixel);
    uv += TIME_SCROLL_OFFSET_FRAC;
    return uv;
}

// Get just the map height. This is faster for ray marching.
float mapHeight(vec2 uv) {
    return GetChannel0(uv).x;
}

// Get all map channels. This is needed for texturing and shading.
vec4 map(vec2 uv, out float erosion, out float ridgemap, out float trees, out float debug) {
    vec4 data;
    vec3 tex = GetChannel0Data(uv, data);
    
    float height = tex.x;
    
    // Calculate an accurate normal from the neighbouring points.
    vec2 uv1 = uv + vec2(1.0 / BUFFER_SIZE.x, 0.0);
    vec2 uv2 = uv + vec2(0.0, 1.0 / BUFFER_SIZE.y);
    float h1 = GetChannel0(uv1).x;
    float h2 = GetChannel0(uv2).x;
    vec3 v1 = vec3(uv1 - uv, (h1 - height));
    vec3 v2 = vec3(uv2 - uv, (h2 - height));
    vec3 normal = normalize(cross(v1, v2)).xzy;
    
    erosion = data.x * 2.0 - 1.0;
    ridgemap = data.y;
    trees = data.z;
    debug = data.w;
    
    return vec4(height, normal);
}


// -----------------------------------------------------------------------------
// Ray marching the terrain height function
// -----------------------------------------------------------------------------

// The box size the terrain is contained inside.
vec3 boxSize = vec3(0.5, 1.0, 0.5);

float march(vec3 ro, vec3 rd, out vec3 normal, out int material, out float s_t) {
    s_t = 9999.0;
    
    vec3 boxNormal;
    vec2 box = boxIntersection(ro, rd, boxSize, boxNormal);
    
    float tStart = max(0.0, box.x) + 1e-2;
    float tEnd = box.y - 1e-2;
    
    material = M_GROUND;

    float stepSize = 0.0;
    float stepScale = 1.0 / RAYMARCH_QUALITY;
    int samples = int(48.0 * RAYMARCH_QUALITY);
    float t = tStart;
    float altitude = 0.0;
    for (int i = 0; i < samples; i++) {
        vec3 pos = ro + rd * t;
        
        float h = mapHeight(GetUV(pos));
        altitude = pos.y - h;
        
        s_t = max(0.0, min(s_t, altitude / t));
        
        if (altitude < 0.0) {
            if (i < 1) { // Sides
                if (pos.y < 0.35) { // Flat bottom
                    s_t = 9999.0;
                    return -1.0;
                }
                normal = boxNormal;
                material = M_STRATA;
                break;
            }
        }
        
        if (altitude < 0.0) {
            // Step back (contact/edge refinement).
            stepScale *= 0.5;
            t -= stepSize * stepScale;
        }
        else {
            // Step forward
            // Accelerate the ray by distance to terrain.
            // This would result in horrible aliasing if we didn't do refinement above.
            //stepSize = abs(altitude) + 1e-2;
            stepSize = abs(altitude) + min(1e-2, abs(altitude) * 0.01);
            //stepSize = (tEnd - tStart) / float(stepCount);
            t += stepSize * stepScale;
        }
    }
    
    #ifdef WATER
        vec3 waterNormal;
        vec2 water = boxIntersection(ro, rd, vec3(boxSize.x, WATER_HEIGHT, boxSize.z), waterNormal);
        if ((water.y > 0.0 && (water.x < t || t < 0.0)) && material != M_STRATA) {
            t = max(0.0, water.x);
            normal = waterNormal;
            material = M_WATER;
        }
    #endif    

    if (box.y < 0.0) {
        s_t = 9999.0;
        return -1.0;
    }
    
    if (t > tEnd) {
        return -1.0;
    }

    return t;
}

vec3 GetReflection(vec3 p, vec3 r, vec3 sun, float smoothness) {
    vec3 refl = SkyColor(r, sun) * 4.0;
    vec3 foo;
    float r_t;
    int r_material;
    march(p, r, foo, r_material, r_t);
    return refl * (1.0 - exp(-r_t * 10.0 * sq(smoothness)));
}


// -----------------------------------------------------------------------------
// Main image output
// -----------------------------------------------------------------------------

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    #ifdef SHOW_BUFFER
        float debugCount = 4.0;
        if (SHOW_BUFFER_NR > 0)
            debugCount = 1.0;
        float debugWidth = iResolution.y / debugCount;
    #else
        float debugCount = 0.0;
        float debugWidth = 0.0;
    #endif
    
    
    // ------------------------------------------------------------------------
    // Set up camera
    // ------------------------------------------------------------------------
    
    vec3 ro;
    vec3 rd;
    vec3 mrd;
    GetRay(ro, rd, iTime, iMouse, iResolution, fragCoord, debugWidth);
    GetRay(ro, mrd, iTime, iMouse, iResolution, iMouse.xy, debugWidth); // mouse ray
    vec3 cursor = GetMouseWorldPos(ro, mrd, 0.45);
    
    
    // ------------------------------------------------------------------------
    // Ray march
    // ------------------------------------------------------------------------
    
    vec4 foo;
    vec3 normal = vec3(0.0, 1.0, 0.0);
    int material;
    float t = march(ro, rd, normal, material, foo.w);
    
    
    // ------------------------------------------------------------------------
    // Coloring and shading
    // ------------------------------------------------------------------------
    
    #ifdef FIXED_SUN
        vec3 sun = normalize(vec3(-1.0, 0.4, 0.05));
    #else
        vec3 sun = rot * normalize(vec3(-1.0, 0.15, 0.25));
    #endif
    
    vec3 fogColor = 1.0 - exp(-SkyColor(rd, sun) * 2.0);
    
    vec3 color;
    
    if (t < 0.0) {
        // Sky
        color = fogColor * (1.0 + pow(fragCoord.y / iResolution.y, 3.0) * 3.0) * 0.5;
        #ifdef SHOW_NORMALS
            color = vec3(0.5, 0.5, 1.0);
        #endif
    }
    else {
        vec3 pos = ro + rd * t;
        
        float erosion;
        float ridgemap;
        float trees;
        float debug;
        vec4 mapData = map(GetUV(pos), erosion, ridgemap, trees, debug);
        if (material == M_GROUND) normal = mapData.yzw;
        float drainage = clamp01((1.0 - clamp01(ridgemap / DRAINAGE_WIDTH)) * 1.5);
        float diff = pos.y - mapData.x;
        
        float breakup = 0.0;
        #ifdef DETAIL_TEXTURE
            vec4 breakupTex = GetChannel1(GetUV(pos));
            breakup = breakupTex.x;
            if (material == M_WATER) {
                normal.xz += breakupTex.zy * 0.1;
                normal = normalize(normal);
            }            
        #endif

        vec3 f0 = vec3(0.04);
        float smoothness = 0.0;
        float reflAmount = 0.0;
        float occlusion = 1.0;
        
        vec3 r = reflect(rd, normal);
        
        // Color used when grayscale debug option is used:
        vec3 diffuseColor = vec3(0.5);
        
        if (material == M_GROUND) {
            normal = mapData.yzw;
            
            #ifndef GREYSCALE
                occlusion = clamp01(erosion + 0.5);

                // Cliffs / Dirt
                diffuseColor = CLIFF_COLOR * smoothstep(0.4, 0.52, pos.y);
                diffuseColor = mix(diffuseColor, DIRT_COLOR, smoothstep(0.6, 0.0, occlusion + breakup * 1.5));

                // Snow
                diffuseColor = mix(diffuseColor, vec3(1.0), smoothstep(0.53, 0.6, pos.y + breakup * 0.1));
                #ifdef WATER
                    // Sand (beach)
                    diffuseColor = mix(diffuseColor, SAND_COLOR, smoothstep(WATER_HEIGHT + 0.005, WATER_HEIGHT, pos.y + breakup * 0.01));
                #endif

                // Grass
                vec3 grassMix = mix(GRASS_COLOR1, GRASS_COLOR2, smoothstep(0.4, 0.6, pos.y - erosion * 0.05 + breakup * 0.3));
                diffuseColor = mix(diffuseColor, grassMix,
                    smoothstep(GRASS_HEIGHT + 0.05, GRASS_HEIGHT + 0.02, pos.y + 0.01 + (occlusion - 0.8) * 0.05 - breakup * 0.02)
                    * smoothstep(0.8, 1.0, 1.0 - (1.0 - normal.y) * (1.0 - trees) + breakup * 0.1));

                // Trees
                float tree = max(0.0, trees * 2.0 - 1.0);
                diffuseColor = mix(diffuseColor, TREE_COLOR * pow(trees, 8.0), clamp01(trees * 2.2 - 0.8) * 0.6);

                diffuseColor *= 1.0 + breakup * 0.5;
            #endif
            
            // Drainage (rivers, creeks, debris flow)
            #if defined(DRAINAGE)
                #if defined(GREYSCALE)
                    diffuseColor = mix(diffuseColor, vec3(0.0, 2.5, 2.5), drainage);
                #else
                    diffuseColor = mix(diffuseColor, vec3(1.0), drainage);
                #endif
            #endif
        }
        else if (material == M_STRATA) {
            #ifndef GREYSCALE
                vec3 strata = smoothstep(0.0, 1.0, cos(diff * vec3(130.0, 190.0, 250.0)));
                diffuseColor = vec3(0.3);
                diffuseColor = mix(diffuseColor, vec3(0.50), strata.x);
                diffuseColor = mix(diffuseColor, vec3(0.55), strata.y);
                diffuseColor = mix(diffuseColor, vec3(0.60), strata.z);

                diffuseColor *= exp(diff * 10.0) * vec3(1.0, 0.9, 0.7);
            #endif
        }
        else if (material == M_WATER) {
            float shore = normal.y > 1e-2 ? exp(-diff * 60.0) : 0.0;
            float foam = normal.y > 1e-2 ? smoothstep(0.005, 0.0, diff + breakup * 0.005) : 0.0;
        
            diffuseColor = mix(WATER_COLOR, WATER_SHORE_COLOR, shore);
            
            diffuseColor = mix(diffuseColor, vec3(1.0), foam);
            
            //f0 = vec3(0.2);
            smoothness = 0.95;
        }
        
        // Brush radius indicator
        if (iMouse.z > 0.0 && material != M_STRATA) {
            float cursorDist = distance(pos.xz, cursor.xz);
            float val = 1.0 - clamp01(min(200.0 * abs(cursorDist - BRUSH_SIZE * 0.2), 0.5 + 200.0 * abs(cursorDist - BRUSH_SIZE)));
            diffuseColor = mix(diffuseColor, vec3(0.0, 1.0, 1.0), val);
        }
        
        float shadow = 1.0;
        
        #ifdef SHADOWS
            if (material != M_STRATA) {
                // Shadow ray
                float s_t;
                int s_material;
                march(pos + vec3(0.0, 1.0, 0.0) * 1e-4, sun, foo.xyz, s_material, s_t);
                shadow = 1.0 - exp(-s_t * 20.0);
                
                // Debug shadows
                //fragColor = vec4(shadow, shadow, shadow, 1.0);
                //return;
            }
        #endif

        // Ambient
        color = diffuseColor * SkyColor(normal, sun) * Fd_Lambert();
        color *= occlusion;
        // Direct
        color += Shade(diffuseColor, f0, smoothness, normal, -rd, sun, SUN_COLOR * shadow);
        // Bounce
        color += diffuseColor * SUN_COLOR
            * (dot(normal, sun * vec3(1.0,-1.0, 1.0)) * 0.5 + 0.5)
            * Fd_Lambert() / PI;
        // Reflection
        color += GetReflection(pos, r, sun, smoothness)
            * F_Schlick(f0, dot(-rd, normal));

        #ifdef SHOW_DIFFUSE
            color = pow(diffuseColor, vec3(1.0 / 2.2));
        #elif defined(SHOW_NORMALS)
            color = normal.xzy * 0.5 + 0.5;
        #elif defined(SHOW_RIDGEMAP)
            if (material == M_GROUND) {
                color = vec3(ridgemap * ridgemap);
            }
        #endif
    }
    
    
    // ------------------------------------------------------------------------
    // Atmosphere rendering
    // ------------------------------------------------------------------------
    
    vec3 boxNormal;
    vec2 box = boxIntersection(ro, rd, boxSize, boxNormal);
    
    float costh = dot(rd, sun);
    float phaseR = PhaseRayleigh(costh);
    float phaseM = PhaseMie(costh, 0.6);
    
    vec2 od = vec2(0.0);
    vec3 tsm;
    vec3 sct = vec3(0.0);
    float rayLength = (t > 0.0 ? t : box.y) - box.x;
    float stepSize = rayLength / 16.0;
    for (float i = 0.0; i < 16.0; i++) {
        vec3 p = ro + rd * (box.x + (i + 0.5) * stepSize);
        
        float h = max(0.0, p.y - 0.35);
        float d = 1.0 - clamp01(h / 0.2);
        
        if (p.y < 0.35) {
            d = 0.0;
        }
        
        float densityR = d * 1e5;
        float densityM = d * 1e5;
        
        od += stepSize * vec2(densityR, densityM);
        
        tsm = exp(-(od.x * C_RAYLEIGH + od.y * C_MIE));
        
        sct += tsm * C_RAYLEIGH * phaseR * densityR * stepSize;
        sct += tsm * C_MIE * phaseM * densityM * stepSize;
    }
    
    color = color * tsm + sct * 10.0;
    
    
    // ------------------------------------------------------------------------
    // Tone mapping and dithering
    // ------------------------------------------------------------------------

    #if !defined(SHOW_NORMALS) && !defined(SHOW_DIFFUSE)
        color = Tonemap_ACES(color);
        color = pow(color, vec3(1.0 / 2.2));
    #endif

    // Dither
    vec2 channel2Res = iChannelResolution[2].xy;
    vec2 channel2Tiled = mod(fragCoord.xy, channel2Res) / channel2Res;
    color += texture(iChannel2, channel2Tiled).xxx / 255.0;

    
    // ------------------------------------------------------------------------
    // Debug buffer display
    // ------------------------------------------------------------------------
    
    #ifdef SHOW_BUFFER
        vec3 annotationColor = vec3(0.2,0.8,0.2);
        vec2 uv = fragCoord / debugWidth;
        uv.x = 1.0 - uv.x;
        uv.y += max(0.0, float(SHOW_BUFFER_NR - 1));
        int view = int(uv.y);
        uv.y = fract(uv.y);
        if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
            uv += TIME_SCROLL_OFFSET_FRAC;
            float erosion;
            float ridgemap;
            float trees;
            float debug;
            vec4 heightAndNormal = map(uv, erosion, ridgemap, trees, debug);
            
            vec4 data;
            vec3 tex = GetChannel0Data(uv, data);

            // Normal.
            if (view == 3)
                color = heightAndNormal.ywz * 0.5 + 0.5;
            // Terrain height.
            else if (view == 2)
                color = mix(heightAndNormal.xxx, vec3(DEFAULT_HEIGHT), 1.0 - 4.0);
            // Erosion height offset.
            else if (view == 1)
                color = vec3(erosion * 0.5 + 0.5);
            // Ridge map.
            else if (view == 0)
                color = vec3(ridgemap);
            // Debug.
            else
                color = vec3(debug);

            // Separate debug maps by thin lines.
            if (debugCount > 1.0) {
                float diff = max(abs(uv.y - 0.5), abs(uv.x - 0.5))
                    - (0.5 - debugCount / iResolution.y);
                color *= mix(0.6, 1.0, clamp01(- diff * iResolution.y * 0.5));
            }
        }
    #endif
    
    fragColor = vec4(color, 1.0);
}
