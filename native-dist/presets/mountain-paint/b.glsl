// 造山 — Rune Skovbo Johansen (runevision); Fewes; Clay John
// Source: https://www.shadertoy.com/view/sf23W1
// Bundled under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Existing component licences and author notices below remain in force.
// PhacelleNoise / ErosionFilter sections: Mozilla Public License 2.0,
// copyright (c) 2025 Rune Skovbo Johansen; see licenses/MPL-2.0.txt.

// Adaptation: guard the no-erosion magnitude before deriving packed material data.

/*
=====================================================================================

Advanced terrain erosion filter based on stacked faded gullies,
with controls for erosion strength, detail, ridge and crease rounding,
and producing a ridge map output useful for e.g. water drainage.

For more on the technique, see:
https://blog.runevision.com/2026/03/fast-and-gorgeous-erosion-filter.html

This buffer has three parts:

 - Phacelle Nose function (used by the erosion function)
 - Erosion function
 - Demonstration

For explanations of the erosion parameters, see the demonstration section.

This erosion technique was originally derived from versions by
Clay John (https://www.shadertoy.com/view/MtGcWh)
and Fewes (https://www.shadertoy.com/view/7ljcRW)
and my own cleaned up version (https://www.shadertoy.com/view/33cXW8),
but at this point has little in common with them, apart from the high level concept.

Also see "Advanced Terrain Erosion Filter" variation with animated parameters.
https://www.shadertoy.com/view/wXcfWn

The raymarched terrain rendering is largely based on Fewes' Shadertoy;
see the Image buffer for more info on that.

=====================================================================================
*/


// -----------------------------------------------------------------------------
// PHACELLE NOISE FUNCTION
// -----------------------------------------------------------------------------

// NOTE: Phacelle Noise depends on the 'hash' function defined in the Common tab.

#define TAU 6.28318530717959

// The Simple Phacelle Noise function produces a stripe pattern aligned with the input vector.
// The name Phacelle is a portmanteau of phase and cell, since the function produces a phase by
// interpolating cosine and sine waves from multiple cells.
//  - p is the input point being evaluated.
//  - normDir is the direction of the stripes at this point. It must be a normalized vector.
//  - freq is the freqency of the stripes within each cell. It's best to keep it close to 1.0, as
//    high values will produce distortions and other artifacts.
//  - offset is the phase offset of the stripes, where 1.0 is a full cycle.
//  - normalization is the degree of normalization applied, between 0 and 1. With e.g. a value of
//    0.4, raw output with a magnitude below 0.6 won't get fully normalized to a magnitude of 1.0.
// Phacelle Noise function copyright (c) 2025 Rune Skovbo Johansen
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
vec4 PhacelleNoise(in vec2 p, vec2 normDir, float freq, float offset, float normalization) {
    // Get a vector orthogonal to the input direction, with a
    // magnitude proportional to the frequency of the stripes.
    vec2 sideDir = normDir.yx * vec2(-1.0, 1.0) * freq * TAU;
    offset *= TAU;

    // Iterate over 4x4 cells, calculating a stripe pattern for each and blending between them.
    // pInt is the integer part of the current coordinate p, pFrac is the remainder.
    //
    // o   o   o   o
    //
    // o   o   o   o
    //       p
    // o   i   o   o
    //
    // o   o   o   o
    //
    // p: current coordinate    i: integer part of p    o: grid points for 4x4 cells
    //
    vec2 pInt = floor(p);
    vec2 pFrac = fract(p);
    vec2 phaseDir = vec2(0.0);
    float weightSum = 0.0;
    for (int i = -1; i <= 2; i++) {
        for (int j = -1; j <= 2; j++) {
            vec2 gridOffset = vec2(i, j);

            // Calculate a cell point by starting off with a point in the integer grid.
            vec2 gridPoint = pInt + gridOffset;

            // Calculate a random offset for the cell point between -0.5 and 0.5 on each axis.
            vec2 randomOffset = hash(gridPoint) * 0.5;

            // The final cell point (we don't store it) is the gridPoint plus the randomOffset.
            // Calculate a vector representing the input point relative to this cell point:
            // p - (gridPoint + randomOffset)
            // = (pFrac + pInt) - ((pInt + gridOffset) + randomOffset)
            // = pFrac + pInt - pInt - gridOffset - randomOffset
            // = pFrac - gridOffset - randomOffset
            vec2 vectorFromCellPoint = pFrac - gridOffset - randomOffset;

            // Bell-shaped weight function which is 1 at dist 0 and nearly 0 at dist 1.5.
            // Due to the random offsets of up to 0.5, the closest a cell point not in the 4x4
            // grid can be to the current point p is 1.5 units away.
            float sqrDist = dot(vectorFromCellPoint, vectorFromCellPoint);
            float weight = exp(-sqrDist * 2.0);
            // Subtract 0.01111 to make the function actually 0 at distance 1.5, which avoids
            // some (very subtle) grid line artefacts.
            weight = max(0.0, weight - 0.01111);

            // Keep track of the total sum of weights.
            weightSum += weight;

            // The waveInput is a gradient which increases in value along sideDir. Its rate of
            // change is the freq times tau, due to the multiplier pre-applied to sideDir.
            float waveInput = dot(vectorFromCellPoint, sideDir) + offset;

            // Add this cell's cosine and sine wave contributions to the interpolated value.
            phaseDir += vec2(cos(waveInput), sin(waveInput)) * weight;
        }
    }

    // Get the raw interpolated value.
    vec2 interpolated = phaseDir / weightSum;
    // Interpret the value as a vector whose length represents the magnitude of both waves.
    float magnitude = sqrt(dot(interpolated, interpolated));
    // Apply a lower threshold to show small magnitudes we're going to fully normalize.
    magnitude = max(1.0 - normalization, magnitude);
    // Return a vector containing the normalized cosine and sine waves, as well as the direction
    // vector, which can be multiplied onto the sine to get the derivatives of the cosine.
    return vec4(interpolated / magnitude, sideDir);
}


// -----------------------------------------------------------------------------
// EROSION FUNCTION
// -----------------------------------------------------------------------------

// First a few utility functions.

float pow_inv(float t, float power) {
    // Flip, raise to the specified power, and flip back.
    return 1.0 - pow(1.0 - clamp01(t), power);
}

float ease_out(float t) {
    // Flip by subtracting from one.
    float v = 1.0 - clamp01(t);
    // Raise to a power of two and flip back.
    return 1.0 - v * v;
}

float smooth_start(float t, float smoothing) {
    if (t >= smoothing)
        return t - 0.5 * smoothing;
    return 0.5 * t * t / smoothing;
}

vec2 safe_normalize(vec2 n) {
 	// A div-by-zero-safe replacement for normalize.
    float l = length(n);
	return (abs(l) > 1e-10) ? (n / l) : n;	
}

// Advanced Terrain Erosion Filter copyright (c) 2025 Rune Skovbo Johansen
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
vec4 ErosionFilter(
    // Input parameters that vary per pixel.
    in vec2 p, vec3 heightAndSlope, float fadeTarget,
    // Stylistic parameters that may vary per pixel.
    float strength, float gullyWeight, float detail, vec4 rounding, vec4 onset, vec2 assumedSlope,
    // Scale related parameters that do not support variation per pixel.
    float scale, int octaves, float lacunarity,
    // Other parameters.
    float gain, float cellScale, float normalization,
    // Output parameters.
    out float ridgeMap, out float debug
) {
    strength *= scale;
    fadeTarget = clamp(fadeTarget, -1.0, 1.0);
    
    vec3 inputHeightAndSlope = heightAndSlope;
    float freq = 1.0 / (scale * cellScale);
    float slopeLength = max(length(heightAndSlope.yz), 1e-10);
    float magnitude = 0.0;
    float roundingMult = 1.0;
    
    float roundingForInput = mix(rounding.y, rounding.x, clamp01(fadeTarget + 0.5)) * rounding.z;
    // The combined accumulating mask, based first on initial slope, and later on slope of each octave too.
    float combiMask = ease_out(smooth_start(slopeLength * onset.x, roundingForInput * onset.x));

    // Initialize the ridgeMap fadeTarget and mask.
    float ridgeMapCombiMask = ease_out(slopeLength * onset.z);
    float ridgeMapFadeTarget = fadeTarget;
    
    // Deteriming the strength of the initial slope used for gully directions
    // based on the specified mix of the actual slope and an assumed slope.
    vec2 gullySlope = mix(heightAndSlope.yz, heightAndSlope.yz / slopeLength * assumedSlope.x, assumedSlope.y);
    
    for (int i = 0; i < octaves; i++) {
        // Calculate and add gullies to the height and slope.
        vec4 phacelle = PhacelleNoise(p * freq, safe_normalize(gullySlope), cellScale, 0.25, normalization);
        // Multiply with freq since p was multiplied with freq.
        // Negate since we use slope directions that point down.
        phacelle.zw *= -freq;
        // Amount of slope as value from 0 to 1.
        float sloping = abs(phacelle.y);
        
        // Add non-masked, normalized slope to gullySlope, for use by subsequent octaves.
        // It's normalized to use the steepest part of the sine wave everywhere.
        gullySlope += sign(phacelle.y) * phacelle.zw * strength * gullyWeight;
        
        // Handle height offset and approximate output slope.
        
        // Gullies has height offset (from -1 to 1) in x and derivative in yz.
        vec3 gullies = vec3(phacelle.x, phacelle.y * phacelle.zw);
        // Fade gullies towards fadeTarget based on combiMask.
        vec3 fadedGullies = mix(vec3(fadeTarget, 0.0, 0.0), gullies * gullyWeight, combiMask);
        // Apply height offset and derivative (slope) according to strength of current octave.
        heightAndSlope += fadedGullies * strength;
        magnitude += strength;
        
        // Update fadeTarget to include the new octave.
        fadeTarget = fadedGullies.x;
        
        // Update the mask to include the new octave.
        float roundingForOctave = mix(rounding.y, rounding.x, clamp01(phacelle.x + 0.5)) * roundingMult;
        float newMask = ease_out(smooth_start(sloping * onset.y, roundingForOctave * onset.y));
        combiMask = pow_inv(combiMask, detail) * newMask;
        
        // Update the ridgeMap fadeTarget and mask.
        ridgeMapFadeTarget = mix(ridgeMapFadeTarget, gullies.x, ridgeMapCombiMask);
        float newRidgeMapMask = ease_out(sloping * onset.w);
        ridgeMapCombiMask = ridgeMapCombiMask * newRidgeMapMask;

        // Prepare the next octave.
        strength *= gain;
        freq *= lacunarity;
        roundingMult *= rounding.w;
    }
    
    ridgeMap = ridgeMapFadeTarget * (1.0 - ridgeMapCombiMask);
    debug = fadeTarget;
    
    vec3 heightAndSlopeDelta = heightAndSlope - inputHeightAndSlope;
    return vec4(heightAndSlopeDelta, magnitude);
}


// -----------------------------------------------------------------------------
// DEMONSTRATION
// -----------------------------------------------------------------------------

// Used for tree coverage on the height map.
float GetTreesAmount(float height, float normalY, float occlusion, float ridgeMap) {
    return ((
        smoothstep(
            GRASS_HEIGHT + 0.05,
            GRASS_HEIGHT + 0.01,
            height + 0.01 + (occlusion - 0.8) * 0.05
        )
        * smoothstep(
            0.0,
            0.4,
            occlusion
        )
        * smoothstep(0.95, 1.0, normalY)
        * smoothstep(-1.4, 0.0, ridgeMap)
        #if defined(WATER)
            * smoothstep(
                WATER_HEIGHT + 0.000,
                WATER_HEIGHT + 0.007,
                height
            )
        #endif
    ) - 0.5) / 0.6;
}

vec4 Heightmap(vec2 p) {
    
    // ------------------------------------------------------------------------
    // Erosion parameters.
    // ------------------------------------------------------------------------
    
    // The scale of the erosion effect, affecting it both horizontally and vertically.
    float EROSION_SCALE = 0.15;
    
    // The strength of the erosion effect, affecting the magnitude of all octaves,
    // and indirectly affecting the directions of the gullies as a result.
    float EROSION_STRENGTH = 0.22;
    
    // The magnitude of the gullies as a weight value from 0 to 1.
    // A value of 0 can sharpen peaks and valleys but feature virtually no gullies.
    // A value of 1 produces full gullies but may leave peaks and valleys rounded.
    // Adjusting erosion gully weight while inversely adjusting erosion scale can be
    // used to control the sharpness of peaks and valleys while leaving gully
    // magnitudes largely untocuhed.
    float EROSION_GULLY_WEIGHT = 0.5;
    
    // The overall detail of the erosion. Lower values restrict the effect of higher
    // frequency gullies to steeper slopes.
    float EROSION_DETAIL = 1.5;
    
    float ridgeRounding = 0.1;
    float creaseRounding = 0.0;
    // Separate rounding control of ridges and creases.
    //  x: Rounding of ridges.
    //  y: Rounding of creases.
    //  z: Multiplier applied to the initial height function.
    //     E.g. if the height function has noise of 5 times lower frequency
    //     than the largest gullies, a value of 0.2 can compensate for that.
    //  w: Multiplier applied to each subsequent gully octave after the first.
    //     Setting it to the same value as the erosion lacunarity will produce
    //     consistent rounding of all octaves.
    vec4 EROSION_ROUNDING = vec4(ridgeRounding, creaseRounding, 0.1, 2.0);
    
    // Control over how far away from ridges/creases the erosion takes effect.
    //  x: Onset used on the initial height function.
    //  y: Onset used on each gully octave.
    //  z: RidgeMap-specific onset used on the initial height function.
    //  w: RidgeMap-specific onset used on each gully octave.
    vec4 EROSION_ONSET = vec4(0.7, 1.25, 2.8, 1.5);
    
    // Control over the assumed slope of the initial height function.
    // In practise, assuming a slope can work better than using the input slope,
    // since the final terrain can be shaped quite differently than the input.
    //  x: An assumed slope value to override the actual slope.
    //  y: The amount (from 0 to 1) to override the actual slope.
    vec2 EROSION_ASSUMED_SLOPE = vec2(0.7, 1.0);
    
    // Gullies are based on stripes within Voronoi-like cells in the Phacelle noise
    // function. The cell scale parameter controls the sizes of the cells relative
    // to the overall erosion scale, while keeping the stripe widths unaffected.
    // Values close to 1 usually produce good results. Smaller values produce more
    // grainy gullies while larger values produce longer unbroken gullies, but too
    // large values produce chaotic curved gullies that are not aligned with the
    // slopes. Value changes can cause abrupt changes in output, especially far away
    // from the origin, so this parameter is not well suited for animation or for
    // modulation by other functions.
    float EROSION_CELL_SCALE = 0.7;
    // The degree of normalization applied in the Phacelle noise, between 0 and 1.
    // The erosion filter depends on a certain consistency in magnitude of the
    // Phacelle output. However, high values can create loopy results where ridges
    // and creases meet up at a point, which produces unnatural looking results.
    float EROSION_NORMALIZATION = 0.5;
    
    // Control over the erosion octaves, with each successive octave layering
    // smaller gullies onto the terrain.
    int EROSION_OCTAVES = 5;
    // The lacunarity controls the frequency (the inverse
    // horizontal scale) of each octave relative to the last.
    float EROSION_LACUNARITY = 2.0;
    // The gain controls the magnitude (the vertical
    // scale) of each octave relative to the last.
    float EROSION_GAIN = 0.5;
    
    
    // ------------------------------------------------------------------------
    // Terrain parameters not used in the erosion function itself.
    // ------------------------------------------------------------------------
    
    // Control over whether the erosion effect raises or lowers the terrain.
    //  x: An offset value between -1 and 1, where a value of -1 only lowers, while
    //     1 only raises. The offset is proportional to the erosion strength
    //     parameter, so if that parameter is the same for the entire terrain, the
    //     effect of the height offset will move the entire terrain surface up or
    //     down by the same emount.
    //  y: A value between 0 and 1 which is the degree to which the offset value is
    //     replaced by the negated erosion fade target value. This has the effect
    //     of only raising at valleys and only lowering at peaks, which, due to how
    //     the erosion filter works, has the effect of largely preserving the minima
    //     and maxima of the terrain.
    vec2 TERRAIN_HEIGHT_OFFSET = vec2(0.0, 0.0);
    
    
    // ------------------------------------------------------------------------
    // Logic for whether erosion is enabled or not.
    // ------------------------------------------------------------------------
    
    bool erosion = true;
    
    // Toggle erosion with Enter key toggle.
    if (texelFetch(iChannel1, ivec2(13, 2), 0).x > 0.0)
        erosion = false;
    
    #ifdef COMPARISON_SLIDER
        // Animated slider that displays terrain with/without erosion.
        if (1.0 - p.y > 0.5 - cos(iTime))
            erosion = false;
    #endif
    
    
    // ------------------------------------------------------------------------
    // Heightmap implementation.
    // ------------------------------------------------------------------------

    // Get height and slope from painted values in Buffer A.
    vec3 n = texture(iChannel0, p).xyz;

    // Define the erosion fade target based on the altitude of the pre-eroded terrain.
    // The fade target should strive to be -1 at valleys and 1 at peaks, but overshooting is ok.
    float fadeTarget = clamp((n.x - DEFAULT_HEIGHT) / 0.15, -1.0, 1.0);

    // Store erosion in h (x : height delta, yz : slope delta, w : magnitude).
    // The output ridge map is -1 on creases and 1 on ridges.
    // The output debug value can be set to various values inside the erosion function.
    float ridgeMap, debug;
    vec4 h = ErosionFilter(
        p, n, fadeTarget,
        EROSION_STRENGTH, EROSION_GULLY_WEIGHT, EROSION_DETAIL,
        EROSION_ROUNDING, EROSION_ONSET, EROSION_ASSUMED_SLOPE,
        EROSION_SCALE, EROSION_OCTAVES, EROSION_LACUNARITY,
        EROSION_GAIN, EROSION_CELL_SCALE, EROSION_NORMALIZATION,
        ridgeMap, debug);
    
    if (!erosion) {
        h = vec4(0.0);
        ridgeMap = 1.0;
    }
    
    // Offset according to the height offset parameter by multiplying it with the magnitude.
    float offset = mix(TERRAIN_HEIGHT_OFFSET.x, -fadeTarget, TERRAIN_HEIGHT_OFFSET.y) * h.w;
    float eroded = n.x + h.x + offset;
    
    // Add trees to terrain.
    float trees = -1.0;
    #if defined(TREES)
        vec2 deriv = n.yz + h.yz;
        float normalY = 1.0 / sqrt(1.0 + dot(deriv, deriv));
        float treesAmount = GetTreesAmount(eroded, normalY, h.x / max(h.w, 1e-8) + 0.5, ridgeMap);
        trees = (1.0 - pow(noised((p + 0.5) * 200.0).x * 0.5 + 0.5, 2.0) - 1.0 + 1.0 * treesAmount) * 1.5;
        if (trees > 0.0) {
            eroded += trees / 300.0;
        }
    #endif

    // Pack four bytes into two finite, exactly represented integer pairs.
    vec2 packed = pack4(vec4(
        clamp01(h.x / max(h.w, 1e-8) * 0.5 + 0.5), // Erosion delta as [0, 1] value.
        clamp01(ridgeMap * 0.5 + 0.5),  // Ridge map as [0, 1] value.
        clamp01(trees * 0.5 + 0.5),     // Tree value as [0, 1] value.
        clamp01(debug * 0.5 + 0.5)      // Debug value.
    ));
    
    return vec4(eroded, packed, 0.0);
    
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    if (DISCARD_MAP) {
        fragColor = vec4(0.0);
        return;
    }
    vec2 uv = fragCoord / BUFFER_SIZE;    
    uv += TIME_SCROLL_OFFSET_INT;

    // Get the map data.
    fragColor = Heightmap(uv);
}
