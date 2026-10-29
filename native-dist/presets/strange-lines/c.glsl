// 诡异的线条 — wyatt; morimea (stability fix)
// Source: https://www.shadertoy.com/view/fsjyR3
// Bundled under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Existing component licences and author notices below remain in force.


Main 
    Q = vec4(0);
    for (float x = -30.; x <= 30.; x++)
        Q += G1(x,10.)*B(U+vec2(x,0)).w;
}