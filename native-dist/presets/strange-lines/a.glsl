// 诡异的线条 — wyatt; morimea (stability fix)
// Source: https://www.shadertoy.com/view/fsjyR3
// Bundled under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Existing component licences and author notices below remain in force.


#define keyClick(a)   ( texelFetch(iChannel2,ivec2(a,0),0).x > 0.)

#define k particleCount()
Main 
    float i = _12(U);
    if (i >= k) { Q = vec4(0.0); return; }
    if (iFrame < 1 || keyClick(32)) {
        Q = vec4(.5*R + .25*R.y * cos(6.28318530718*i/k + vec2(0,1.57079632679)), 0,0);
        return;
    }
    Q = particle(i);
    
    vec2 f = vec2(0);
    
    if ( i < k ) {
    for (float j = -20.; j <= 20.; j++) 
        if (j!=0.) {//  && j+i>=0. && j+i<R.x*R.y) {
        vec4 a = particle(i+j);
        //if (j!=0. && j+i>=0. && j+i<R.x*R.y) {
        //vec4 a = A(_21(i+j));
        vec2 r = a.xy-Q.xy;
        float l = length(r);
        f += 50.*r/sqrt(l)*(l-abs(j))*(G1(j,10.)+2.*G1(j,5.));
    }
    for (float x = -2.; x <= 2.; x++)
    for (float y = -2.; y <= 2.; y++) {
        vec2 u = vec2(x,y);
        vec4 d = D(Q.xy+u);
        f -= 100.*d.w*u;
    }
    if (length(f)>.1) f = .1*normalize(f);
    Q.zw += f-.03*Q.zw;
    Q.xy += f+1.5*Q.zw*inversesqrt(1.+dot(Q.zw,Q.zw));
    
    vec4 m = .5*(particle(i-1.) + particle(i+1.));
    Q.zw = mix(Q.zw,m.zw,0.1);
    Q.xy = mix(Q.xy,m.xy,0.01);
    if (Q.x>R.x)Q.y=.5*R.y,Q.z=-10.;
    if (Q.x<0.)Q.y=.5*R.y,Q.z=10.;
    }
    

}
