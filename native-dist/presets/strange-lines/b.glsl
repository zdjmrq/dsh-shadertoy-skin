// 诡异的线条 — wyatt; morimea (stability fix)
// Source: https://www.shadertoy.com/view/fsjyR3
// Bundled under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Existing component licences and author notices below remain in force.


void XY (vec2 U, inout vec4 Q, vec4 q) {
    if (length(U-particle(q.x).xy)<length(U-particle(Q.x).xy)) Q.x = particleIndex(q.x);
}
void ZW (vec2 U, inout vec4 Q, vec4 q) {
    if (length(U-particle(q.y).xy)<length(U-particle(Q.y).xy)) Q.y = particleIndex(q.y);
}
Main
    Q = B(U);
    for (int x=-1;x<=1;x++)
    for (int y=-1;y<=1;y++) {
        XY(U,Q,B(U+vec2(x,y)));
    }
    XY(U,Q,vec4(Q.x-3.));
    XY(U,Q,vec4(Q.x+3.));
    XY(U,Q,vec4(Q.x-7.));
    XY(U,Q,vec4(Q.x+7.));
    if (I%12==0) 
        Q.y = particleIndex(_12(U));
    else
    {
        float k = exp2(float(11-(I%12)));
        ZW(U,Q,B(U+vec2(0,k)));
        ZW(U,Q,B(U+vec2(k,0)));
        ZW(U,Q,B(U-vec2(0,k)));
        ZW(U,Q,B(U-vec2(k,0)));
    }
    XY(U,Q,Q.yxzw);
    if (I<1) Q = vec4(particleIndex(_12(U)));
    
    vec4 a1 = particle(Q.x);
    vec4 a2 = particle(Q.x+1.);
    vec4 a3 = particle(Q.x-1.);
    float l1 = sg(U,a1.xy,a2.xy);
    float l2 = sg(U,a1.xy,a3.xy);
    float l = min(l1,l2);
    Q.z = Q.w = 1.0-smoothstep(1.,2.,l);
    Q.w -= .2*heart(U);
    
}
