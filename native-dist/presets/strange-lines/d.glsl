// 诡异的线条 — wyatt; morimea (stability fix)
// Source: https://www.shadertoy.com/view/fsjyR3
// Bundled under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Existing component licences and author notices below remain in force.


Main 
    Q = vec4(0);
    for (float y = -30.; y <= 30.; y++)
        Q += G1(y,10.)*C(U+vec2(0,y)).w;
        
    Q = mix(Q,D(U),.5);
}