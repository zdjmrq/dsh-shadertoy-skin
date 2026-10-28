// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

/*

Created by Tonny Espeset, 2026
https://www.shadertoy.com/view/fXc3RB

80s hits: Take On Me

Feel free to use this code, but please keep this credit and link.

Check my other shaders at

https://www.shadertoy.com/user/Espeset

*/
vec3 atmosphere(vec3 rd) {
    float h=exp(-max(rd.y,0.0)*5.);
    vec3 col=skyTint*(.65+1.8*h);
    float cloud=fbm(rd.xz/max(.1,rd.y+.18)*1.5+vec2(iTime*.006,0));
    col*=.65+.55*cloud;
    vec3 moon=normalize(vec3(-.55,.45,.72)); float disk=dot(rd,moon);
    col+=vec3(.44,.59,.65)*pow(max(disk,0.),800.0)*.16;
    if(rd.y>0.) {
        float angle=atan(rd.x,rd.z);
        float elevation=rd.y/max(length(rd.xz),.001);
        float column=floor(angle*32.);
        float cell=fract(angle*32.);
        float seed=h1(column+139.7);
        float roof=.025+.105*seed*seed;
        float silhouette=(1.-smoothstep(roof,roof+.0018,elevation));
        silhouette*=smoothstep(.035,.062,cell)*(1.-smoothstep(.92,.955,cell));
        vec2 pane=vec2(cell*4.,elevation*550.);
        vec2 f=fract(pane);
        float window=smoothstep(.18,.30,f.x)*(1.-smoothstep(.66,.78,f.x));
        window*=smoothstep(.25,.36,f.y)*(1.-smoothstep(.63,.76,f.y));
        window*=step(.74,h2(floor(pane)+vec2(column*7.,31.)));
        vec3 tower=skyTint*1.20+mix(vec3(.11,.20,.26),vec3(.24,.15,.064),seed)*window*.10;
        col=mix(col,tower,silhouette*.48);
    }
    return col;
}
vec2 city(vec3 p) {
    float x=p.x-roadX(p.z), ax=abs(x), side=sign(x);
    vec2 d=vec2(1000.0,-1.0);
    float curb=sdBox(vec3(ax-roadWidth-.68,p.y-.08,0),vec3(.75,.16,1000));
    d=nearer(d,vec2(curb,1));
    float id=floor(p.z/blockSize+.5), z=p.z-id*blockSize;
    float seed=h1(id+side*41.3);
    float height=9.0+floor(seed*5.0)*3.0;
    float setback=.9+.6*h1(id*2.13+side*13.);
    vec3 q=vec3(ax-roadWidth-setback-3.4,p.y-height*.5,z);
    float building=sdBox(q,vec3(3.4,height*.5,blockSize*.465));
    if(mod(id+side*2.,7.)<.9) building=sdBox(q-vec3(10,1,0),vec3(3.4,height*.5+1.,blockSize*.42));
    d=nearer(d,vec2(building,2));
    if(ax>roadWidth) {
        vec3 qc=vec3(ax-roadWidth-setback-.1,p.y-height+.18,z);
        d=nearer(d,vec2(sdBox(qc,vec3(.28,.20,blockSize*.47)),1));
    }
    float lampId=floor((p.z-(side>0.?lampStep*.5:0.))/lampStep+.5);
    vec3 lp=lampPosition(lampId,side), pl=p-lp;
    float pole=sdCapsule(pl,vec3(side*.45,-lampHeight,0),vec3(side*.45,.1,0),.055);
    pole=min(pole,sdCapsule(pl,vec3(side*.45,.08,0),vec3(-side*.85,.08,0),.04));
    d=nearer(d,vec2(pole,3));
    d=nearer(d,vec2(sdRoundBox(pl-vec3(-side*.25,-.035,0),vec3(.47,.045,.12),.025),5));
    return d;
}
vec2 motorcycle(vec3 p,float includeWoman) {
    vec2 d=vec2(100.,20.);
    float rearZ=-.79,frontZ=.85;
    for(int wheel=0;wheel<2;wheel++) {
        vec3 q=p-vec3(0,.355,wheel==0?rearZ:frontZ);
        float tire=sdTorusX(q,.265,.093);
        d=nearer(d,vec2(tire,20));
        d=nearer(d,vec2(sdTorusX(q,.245,.023),21));
        d=nearer(d,vec2(sdCylinderX(q,.065,.105),21));
        float ang=atan(q.y,q.z)+rideDistance(iTime)/.355;
        float spoke=max(length(q.yz)-.247,.062-length(q.yz));
        spoke=max(spoke,abs(sin(ang*5.))*length(q.yz)-.011);
        spoke=max(spoke,abs(q.x)-.022);
        d=nearer(d,vec2(spoke,21));
        float brake=sdCylinderX(q-vec3(.068,0,0),.176,.006);
        d=nearer(d,vec2(brake,21));
        float fender=max(abs(length(q.yz)-.386)-.016,.19-q.y);
        fender=max(fender,abs(q.x)-.13);
        d=nearer(d,vec2(fender,22));
    }
    vec3 a=p; a.x=abs(a.x);
    float frame=sdCapsule(a,vec3(.11,.37,-.75),vec3(.11,.60,.20),.035);
    frame=min(frame,sdCapsule(a,vec3(.11,.60,.2),vec3(.14,.91,-.48),.032));
    frame=min(frame,sdCapsule(a,vec3(.14,.91,-.48),vec3(.11,.37,-.75),.030));
    frame=min(frame,sdCapsule(a,vec3(.12,.42,.82),vec3(.21,1.05,.60),.034));
    frame=min(frame,sdCapsule(a,vec3(.12,.355,.85),vec3(.17,.63,.73),.044));
    frame=min(frame,sdCapsule(a,vec3(.15,.38,-.73),vec3(.18,.86,-.48),.032));
    d=nearer(d,vec2(frame,21));
    float engine=sdRoundBox(p-vec3(0,.51,.03),vec3(.19,.17,.24),.045);
    d=nearer(d,vec2(engine,21));
    vec3 tank=p-vec3(0,.96,.29); tank.yz=rotate2(.20)*tank.yz;
    d=nearer(d,vec2(sdEllipsoid(tank,vec3(.245,.23,.38)),22));
    d=nearer(d,vec2(sdRoundBox(p-vec3(0,.98,-.30),vec3(.194,.057,.36),.035),23));
    d=nearer(d,vec2(sdRoundBox(p-vec3(0,1.036,-.62),vec3(.172,.048,.18),.025),23));
    vec3 tail=p-vec3(0,.897,-.72); tail.yz=rotate2(-.20)*tail.yz;
    d=nearer(d,vec2(sdEllipsoid(tail,vec3(.205,.14,.34)),22));
    d=nearer(d,vec2(sdRoundBox(p-vec3(0,.886,-.998),vec3(.139,.039,.026),.014),28));
    vec3 plate=p-vec3(0,.71,-1.); plate.yz=rotate2(-.20)*plate.yz;
    d=nearer(d,vec2(sdBox(plate,vec3(.108,.069,.012)),29));
    d=nearer(d,vec2(sdCylinderZ(p-vec3(.265,.43,-.62),.075,.35),21));
    d=nearer(d,vec2(sdCylinderZ(p-vec3(.265,.43,-.973),.057,.005),20));
    float bars=sdCapsule(p,vec3(-.35,1.125,.61),vec3(.35,1.125,.61),.019);
    d=nearer(d,vec2(bars,21));
    d=nearer(d,vec2(sdCapsule(a,vec3(.29,1.125,.62),vec3(.37,1.41,.57),.012),21));
    d=nearer(d,vec2(sdEllipsoid(vec3(a.x-.37,a.y-1.41,a.z-.57),vec3(.085,.044,.02)),27));
    vec3 fair=p-vec3(0,1.06,.79); fair.yz=rotate2(.3)*fair.yz;
    d=nearer(d,vec2(sdEllipsoid(fair,vec3(.255,.23,.21)),22));
    d=nearer(d,vec2(sdEllipsoid(p-vec3(0,1.26,.80),vec3(.205,.14,.025)),27));
    d=nearer(d,vec2(sdEllipsoid(p-vec3(0,1.064,.995),vec3(.16,.077,.014)),11));
    vec3 torso=p-vec3(0,1.37,-.055); torso.yz=rotate2(.34)*torso.yz;
    float body=sdEllipsoid(torso,vec3(.235,.35,.148));
    body=softMin(body,sdEllipsoid(p-vec3(0,1.08,-.23),vec3(.23,.15,.21)),.07);
    d=nearer(d,vec2(body,24));
    float arm=sdTaper(a,vec3(.205,1.58,.04),vec3(.345,1.28,.28),.085,.071);
    arm=softMin(arm,sdTaper(a,vec3(.345,1.28,.28),vec3(.335,1.125,.60),.071,.052),.035);
    d=nearer(d,vec2(arm,24));
    d=nearer(d,vec2(sdEllipsoid(a-vec3(.337,1.124,.60),vec3(.071,.05,.08)),23));
    float leg=sdTaper(a,vec3(.17,1.04,-.23),vec3(.29,.73,.27),.12,.088);
    leg=softMin(leg,sdTaper(a,vec3(.29,.73,.27),vec3(.28,.43,-.14),.088,.062),.04);
    d=nearer(d,vec2(leg,25));
    d=nearer(d,vec2(sdEllipsoid(a-vec3(.28,.39,-.02),vec3(.089,.081,.173)),23));
    vec3 head=p-vec3(0,1.84,.20); head.yz=rotate2(.13)*head.yz;
    d=nearer(d,vec2(sdEllipsoid(head,vec3(.189,.225,.208)),26));
    float visor=sdEllipsoid(head-vec3(0,.015,.022),vec3(.194,.125,.198));
    visor=max(visor,.065-head.z);
    d=nearer(d,vec2(visor,27));
    if(includeWoman>0.) {
        vec3 w=p-vec3(.085,1.41,-.54); w.yz=rotate2(.20)*w.yz;
        float wb=sdEllipsoid(w,vec3(.188,.33,.151));
        wb=softMin(wb,sdEllipsoid(p-vec3(.04,1.15,-.58),vec3(.196,.145,.175)),.07);
        d=nearer(d,vec2(wb,30));
        vec3 wa=p; wa.x=abs(wa.x-.085);
        float arms=sdTaper(wa,vec3(.16,1.60,-.40),vec3(.30,1.36,-.16),.069,.059);
        arms=softMin(arms,sdTaper(wa,vec3(.30,1.36,-.16),vec3(.14,1.30,.17),.058,.045),.03);
        d=nearer(d,vec2(arms,30));
        d=nearer(d,vec2(sdEllipsoid(wa-vec3(.13,1.3,.175),vec3(.057,.048,.060)),33));
        float legs=sdTaper(wa,vec3(.155,1.125,-.58),vec3(.30,.81,-.25),.10,.073);
        legs=softMin(legs,sdTaper(wa,vec3(.30,.81,-.25),vec3(.32,.51,-.64),.073,.051),.03);
        d=nearer(d,vec2(legs,31));
        d=nearer(d,vec2(sdEllipsoid(wa-vec3(.32,.475,-.54),vec3(.075,.075,.145)),33));
        vec3 wh=p-vec3(.245,1.91,-.39); wh.yz=rotate2(.16)*wh.yz;
        d=nearer(d,vec2(sdEllipsoid(wh,vec3(.178,.215,.193)),32));
        float wv=sdEllipsoid(wh-vec3(0,.02,.024),vec3(.184,.12,.188));
        wv=max(wv,.07-wh.z);
        d=nearer(d,vec2(wv,34));
        vec3 s=p-vec3(.13,1.665,-.77); float along=sat(-s.z/.46);
        s.y-=sin(along*4.+iTime*7.)*.018*along;
        d=nearer(d,vec2(sdBox(s-vec3(0,0,-.13),vec3(.055,.012,.24)),30));
    }
    return d;
}
vec3 cityNormal(vec3 p,float dist) {
    vec2 e=vec2(1,-1)*max(.002,.00013*dist);
    vec3 n=vec3(0);
    for(int k=0;k<4+min(iFrame,0);k++) {
        vec3 o=k==0?e.xyy:k==1?e.yyx:k==2?e.yxy:e.xxx;
        n+=o*city(p+o).x;
    }
    return normalize(n);
}
vec2 boxHit(vec3 ro,vec3 rd,vec3 halfSize) {
    vec3 inv=1.0/rd, n=inv*ro, k=abs(inv)*halfSize;
    vec3 a=-n-k,b=-n+k;
    return vec2(max(max(a.x,a.y),a.z),min(min(b.x,b.y),b.z));
}
vec2 traceCity(vec3 ro,vec3 rd,float maxDist,int steps) {
    float planeT=rd.y<-.00005?-ro.y/rd.y:maxDist;
    bool hasGround=planeT>.015 && planeT<maxDist;
    float end=hasGround?planeT:maxDist;
    float t=.04;
    for(int i=0;i<110;i++) {
        if(i>=steps || t>end) break;
        vec3 pos=ro+rd*t;
        vec2 hit=city(pos);
        if(hit.x<max(.0016,t*.00014)) return vec2(t,hit.y);
        float advance=max(.008,hit.x*.73);
        float cell=floor(pos.z/blockSize+.5);
        float boundary=(cell+(rd.z>=0.?.5:-.5))*blockSize;
        float limit=(boundary-pos.z)/(abs(rd.z)>.00001?rd.z:.00001);
        advance=min(advance,max(.018,limit+.012));
        t+=advance;
    }
    return hasGround?vec2(planeT,0.):vec2(maxDist,-1.);
}
vec3 material(vec3 p,vec3 n,float id,out vec3 emission,out float roughness,out float metal,out float wetness) {
    emission=vec3(0); roughness=.7; metal=0.; wetness=0.;
    vec3 albedo=vec3(.08);
    float x=p.x-roadX(p.z),side=sign(x),z=p.z;
    if(id<.5) {
        float grain=noise2(p.xz*72.);
        albedo=vec3(.021,.024,.027)*(.70+.48*grain);
        // Broad shallow puddles and finer exposed asphalt share the same field.
        float puddleField=fbm(p.xz*vec2(.42,.74))*.74+noise2(p.xz*vec2(1.55,.34)+9.)*.26;
        wetness=smoothstep(.26,.62,puddleField);
        float gutter=smoothstep(roadWidth-1.8,roadWidth-.1,abs(x));
        wetness=max(wetness,gutter*.86);
        roughness=mix(.29,.070,wetness);
        float center=(1.-smoothstep(.045,.09,abs(x)))*step(.3,fract(z/8.));
        float edge=1.-smoothstep(.03,.07,abs(abs(x)-(roadWidth-.32)));
        float crossId=floor(z/blockSize+.5);
        float crossing=(1.-smoothstep(1.8,2.3,abs(z-crossId*blockSize)))*step(.25,fract((x+10.)*1.05))*step(mod(crossId,7.),.8);
        float mark=max(max(center,edge),crossing);
        albedo=mix(albedo,vec3(.49,.50,.46),mark*.82);
        roughness=mix(roughness,.23,mark*.8);
        vec2 hole=vec2(x+1.7,mod(z+22.,44.)-22.);
        float manhole=1.-smoothstep(.43,.47,length(hole));
        albedo=mix(albedo,vec3(.075,.076,.067)*(.65+.35*step(.5,fract(hole.x*22.)+fract(hole.y*22.))),manhole);
        roughness=mix(roughness,.42,manhole);
        float drain=(1.-smoothstep(.07,.14,abs(abs(x)-roadWidth+.12)))*(1.-smoothstep(.27,.35,abs(mod(z+4.,8.)-4.)));
        albedo*=1.-drain*(.65+.25*step(.3,fract(z*22.)));
    } else if(id<1.5) {
        vec2 tile=fract(vec2(x+floor(z*1.6)*.25,z)*vec2(1.9,1.6));
        float mortar=step(.05,min(min(tile.x,1.-tile.x),min(tile.y,1.-tile.y)));
        albedo=vec3(.072,.072,.068)*(.42+.58*mortar); roughness=mix(.38,.19,mortar); wetness=.65;
    } else if(id<2.5) {
        float seed=h1(floor(z/blockSize+.5)+side*41.3);
        albedo=mix(vec3(.078,.060,.045),vec3(.040,.045,.051),seed);
        vec2 coords=abs(n.x)>.55?p.zy:p.xy;
        vec2 brick=fract(vec2(coords.x*1.9+floor(coords.y*5.)*.5,coords.y*5.));
        float joint=smoothstep(.035,.075,min(brick.x,brick.y));
        float weather=fbm(coords*vec2(2.3,.31));
        float stain=noise2(vec2(floor(coords.x*7.),coords.y*.2));
        albedo*=(.49+.51*joint)*(.64+.43*weather)*(.80+.20*stain);
        wetness=smoothstep(.29,.74,weather);
        roughness=mix(.62,.46,wetness)*mix(1.1,1.,joint);
        // Frames, recesses and interior planes are material masks, not raymarched boxes; unequal mullions break the grid.
        vec2 cell=vec2(coords.x/2.9,coords.y/3.05);
        vec2 f=fract(cell),win=abs(f-.5);
        float opening=(1.-smoothstep(.31,.34,win.x))*(1.-smoothstep(.33,.36,win.y));
        opening*=smoothstep(2.8,3.3,p.y);
        float mullion=step(.014,abs(f.x-.48))*step(.011,abs(f.y-.34));
        float glass=opening*mullion;
        float roomSeed=h2(floor(cell)+side*23.);
        float lit=step(.73,roomSeed);
        float wallShade=.28+.42*smoothstep(.20,.87,f.y);
        float reveal=smoothstep(.15,.22,f.x)*smoothstep(.15,.23,f.y);
        float blindAmount=step(.63,h2(floor(cell)+13.));
        float blinds=mix(1.,.43+.57*smoothstep(.26,.50,fract(coords.y*6.4)),blindAmount);
        float lamp=(1.-smoothstep(.014,.029,abs(f.y-.78)))*step(.26,f.x)*(1.-step(.71,f.x));
        vec3 wc=mix(vec3(1.,.55,.22),vec3(.72,.84,.97),step(.91,h2(floor(cell)+6.)));
        emission=glass*lit*wc*((.12+.10*roomSeed)*wallShade*blinds*reveal+lamp*.22);
        albedo=mix(albedo,vec3(.007,.012,.016),glass);
        albedo=mix(albedo,vec3(.018),opening*(1.-mullion));
        roughness=mix(roughness,.21,glass);
        float shop=(1.-smoothstep(2.8,3.0,p.y))*smoothstep(.25,.44,p.y);
        float shopCell=coords.x/3.8;
        float shopId=floor(shopCell),shopSeed=h2(vec2(shopId,side*23.+4.));
        vec2 shopUV=vec2(fract(shopCell),coords.y/3.0);
        float frame=step(.025,shopUV.x)*step(shopUV.x,.975)*step(.014,abs(shopUV.x-.50));
        float shutter=step(shopSeed,.32);
        float ribs=.54+.46*smoothstep(.60,.88,fract(p.y*14.));
        vec3 shutterCol=vec3(.035,.039,.042)*ribs;
        albedo=mix(albedo,mix(vec3(.010,.017,.023),shutterCol,shutter),shop*frame);
        float shelves=step(.58,shopUV.y)*step(.79,fract(shopUV.y*7.))*step(.14,shopUV.x)*step(shopUV.x,.88);
        float backWall=(.24+.51*shopUV.y)*(1.-shelves*.74);
        float strip=(1.-smoothstep(.009,.019,abs(shopUV.y-.85)))*step(.13,shopUV.x)*step(shopUV.x,.88);
        vec3 shopColor=mix(vec3(1.,.56,.24),vec3(.62,.80,1.),step(.92,shopSeed));
        emission+=shop*frame*step(.60,shopSeed)*shopColor*(.032*backWall+strip*.25);
        roughness=mix(roughness,mix(.16,.40,shutter),shop*frame);
    } else if(id<3.5) { albedo=vec3(.075,.087,.099); metal=.7; roughness=.32; }
    else if(id<5.5) { albedo=vec3(.4); emission=lampTint*6.0; roughness=.2; }
    else if(id<11.5) { albedo=vec3(.5); emission=vec3(.73,.89,1.)*8.; }
    else if(id<20.5) {
        albedo=vec3(.016,.018,.021); roughness=.89;
        vec3 b=bikeLocal(p); float tread=.5+.5*cos(atan(b.y-.355,b.z+(b.z<0.?.79:-.85))*54.+rideDistance(iTime)*90.+b.x*57.);
        albedo*=.85+.25*tread;
    } else if(id<21.5) {
        albedo=vec3(.27,.30,.33); metal=.92; roughness=.23;
        vec3 b=bikeLocal(p); if(abs(b.z)<.3 && b.y<.72) albedo*=.6+.25*step(.3,fract(b.y*44.));
    } else if(id<22.5) {
        albedo=vec3(.12,.17,.18);
        metal=.55; roughness=.18;
    } else if(id<23.5) { albedo=vec3(.025,.021,.023); roughness=.61; }
    else if(id<24.5) {
        albedo=vec3(.018,.022,.026); roughness=.30;
        vec3 b=bikeLocal(p); float seam=1.-smoothstep(.004,.012,abs(abs(b.x)-(.15+.04*sin(b.y*6.))));
        albedo*=1.+seam*.26;
        albedo*=.88+.12*noise2(vec2(b.y*47.,b.z*37.));
    }
    else if(id<25.5) { albedo=vec3(.035,.048,.070); roughness=.8; }
    else if(id<26.5) { albedo=vec3(.038,.054,.061); roughness=.19; metal=.25; }
    else if(id<27.5) { albedo=vec3(.028,.038,.045); roughness=.08; metal=.65; }
    else if(id<28.5) { albedo=vec3(.20,.012,.005); emission=vec3(1.,.012,.002)*6.5; }
    else if(id<29.5) {
        vec3 b=bikeLocal(p); albedo=vec3(.57,.55,.43);
        float marks=step(.30,fract((b.x+.12)*36.))*step(abs(b.y-.71),.028); albedo*=1.-marks*.8; roughness=.42;
    } else if(id<30.5) {
        albedo=vec3(.028,.021,.018); roughness=.29;
        vec3 b=bikeLocal(p);
        float seam=1.-smoothstep(.003,.01,abs(abs(b.x-.04)-(.12+.033*cos(b.y*11.))));
        albedo*=.83+seam*.25+.14*noise2(b.yz*51.);
        if(b.y>1.64 && b.z<-.24) albedo=vec3(.21,.17,.13);
    }
    else if(id<31.5) { albedo=vec3(.025,.034,.048); roughness=.77; }
    else if(id<32.5) {
        albedo=vec3(.32,.29,.24); roughness=.19;
        vec3 b=bikeLocal(p)-vec3(.245,1.91,-.39); b.yz=rotate2(.16)*b.yz;
        float trim=1.-smoothstep(.01,.018,abs(b.y+.13));
        float centre=1.-smoothstep(.017,.023,abs(b.x));
        albedo=mix(albedo,vec3(.031,.040,.047),max(trim,centre));
    }
    else if(id<33.5) { albedo=vec3(.032,.027,.030); roughness=.61; }
    else { albedo=vec3(.02,.029,.035); metal=.7; roughness=.07; }
    return albedo;
}
vec3 brdf(vec3 n,vec3 v,vec3 l,vec3 base,float rough,float metal) {
    float nl=max(dot(n,l),0.),nv=max(dot(n,v),.001); vec3 h=normalize(v+l);
    float nh=max(dot(n,h),0.),vh=max(dot(v,h),0.);
    float a=max(.045,rough*rough),a2=a*a,den=nh*nh*(a2-1.)+1.;
    float D=a2/(PI*den*den);
    float gv=nl*sqrt(nv*nv*(1.-a2)+a2),gl=nv*sqrt(nl*nl*(1.-a2)+a2);
    float visibility=.5/max(gv+gl,.0001);
    vec3 f0=mix(vec3(.04),base,metal),F=f0+(1.-f0)*pow(1.-vh,5.);
    return ((1.-F)*(1.-metal)*base/PI+D*visibility*F)*nl;
}
vec3 surface(vec3 ro,vec3 rd,vec3 p,vec3 n,float id,float dist,bool reflectionAllowed) {
    vec3 emit; float rough,metal,wet; vec3 base=material(p,n,id,emit,rough,metal,wet);
    if(id<.5 || (id<1.5 && n.y>.6 && p.y<.3)) {
        // Uneven roughness breaks reflections into short, wet highlights.
        vec2 b=vec2(noise2(p.xz*vec2(34.,57.)+3.),noise2(p.xz*vec2(42.,63.)+45.))-.5;
        float detail=1.-smoothstep(18.,72.,dist);
        float ripple=(sin(p.x*49.+p.z*31.+iTime*5.)+sin(p.x*27.-p.z*22.+iTime*3.))* .0048*wet;
        float amplitude=mix(.135,.052,wet)*(.38+.62*detail);
        n=normalize(n+vec3(b.x*amplitude+ripple,0.,b.y*amplitude));
    } else if(id>1.5 && id<2.5) {
        // Very small wet-brick relief; no extra city normal evaluations.
        vec2 c=abs(n.x)>.55?p.zy:p.xy;
        vec2 b=fract(vec2(c.x*1.9+floor(c.y*5.)*.5,c.y*5.));
        vec2 relief=(sin(b*TAU))*.010;
        if(abs(n.x)>.55) n=normalize(n+vec3(0.,relief.y,relief.x));
        else n=normalize(n+vec3(relief.x,relief.y,0.));
    }
    vec3 v=-rd;
    vec3 col=base*(skyTint*2.4+vec3(.038,.044,.051))*(.45+.55*max(n.y,0.));
    if(id>=20.) {
        col+=base*(.12+.50*pow(sat(1.-dot(n,v)),3.))*vec3(.26,.36,.45);
    }
    float lightIndex=floor(p.z/lampStep);
    for(int i=-1;i<=2;i++) {
        float li=lightIndex+float(i);
        for(int j=0;j<2;j++) {
            float side=j==0?-1.:1.; vec3 lp=lampPosition(li,side),delta=lp-p;
            float d2=dot(delta,delta); vec3 l=delta*inversesqrt(max(.01,d2));
            float downLight=.055+.945*smoothstep(-.12,.68,l.y);
            float wallGain=id>1.5 && id<2.5?.50:1.;
            vec3 lc=lightColour(li,side)*76.*downLight*wallGain;
            col+=brdf(n,v,l,base,rough,metal)*lc/(1.+d2);
        }
    }
    vec3 head=fromBike(vec3(0,1.04,1.02));
    vec3 hp=p-head; float forward=dot(normalize(hp),normalize(fromBike(vec3(0,.3,18.))-head));
    float spot=smoothstep(.94,.985,forward);
    vec3 toHead=head-p; col+=brdf(n,v,normalize(toHead),base,rough,metal)*vec3(.75,.87,1.)*44.*spot/(1.+dot(toHead,toHead));
    vec3 tail=fromBike(vec3(0,.84,-1.04)); vec3 toTail=tail-p;
    vec3 rearward=normalize(fromBike(vec3(0,.84,-3.))-tail);
    float rearCone=smoothstep(.08,.52,dot(-normalize(toTail),rearward));
    col+=brdf(n,v,normalize(toTail),base,rough,metal)*vec3(1.,.019,.006)*6.*rearCone/(.6+dot(toTail,toTail));
    if(id<.5) {
        vec3 b=bikeLocal(p);
        float sh=exp(-sq(b.x/.43)-sq(b.z/1.13));
        sh=max(sh,.8*exp(-sq(b.x/.25)-sq((b.z+.79)/.32)));
        col*=1.-.80*sh;
    }
    if(reflectionAllowed && id<.5) {
        vec3 rr=reflect(rd,n),start=p+n*.035;
        vec2 rh=traceCity(start,rr,105.,36);
        vec3 rc=atmosphere(rr);
        if(rh.y>=0.) {
            vec3 rp=start+rr*rh.x,re; float rrough,rmetal,rwet;
            vec3 rb=material(rp,vec3(-sign(rp.x-roadX(rp.z)),0,0),rh.y,re,rrough,rmetal,rwet);
            rc=rb*skyTint*2.+re;
        }
        float li=floor(p.z/lampStep);
        for(int i=0;i<5;i++) {
            for(int j=0;j<2;j++) {
                float side=j==0?-1.:1.; vec3 lp=lampPosition(li+float(i)-1.,side);
                vec3 delta=lp-start; float travel=dot(delta,rr);
                vec3 miss=delta-rr*max(0.,travel);
                float footprint=.18+rough*max(travel,0.)*.054;
                float longitudinal=footprint*(1.9+1.2*wet);
                float flare=exp(-sq(miss.x/footprint)-(sq(miss.y)+sq(miss.z))/sq(longitudinal))*step(0.,travel);
                rc+=lightColour(li+float(i)-1.,side)*flare*5.2;
            }
        }
        vec3 tr=tail-start; float tt=dot(tr,rr);
        vec3 tm=tr-rr*max(tt,0.);
        float tailWidth=.22+.040*max(tt,0.);
        float tailReflection=exp(-sq(tm.x/tailWidth)-(sq(tm.y)+sq(tm.z))/sq(tailWidth*3.4))*step(0.,tt);
        rc+=vec3(1.,.009,.002)*5.8*tailReflection;
        float fresnel=.045+.54*pow(1.-max(dot(n,v),0.),5.);
        col+=rc*fresnel*mix(.54,1.05,wet);
    }
    if(id>=20.) {
        vec3 ref=reflect(rd,n);
        vec3 env=atmosphere(ref)*1.2;
        float cap=pow(sat(dot(ref,normalize(vec3(-.5,.5,-.3)))),18.);
        float cap2=pow(sat(dot(ref,normalize(vec3(.6,.3,.2)))),36.);
        env+=(lampTint*cap+accentTint*cap2)*.7;
        vec3 F=mix(vec3(.04),base,metal)+(1.-mix(vec3(.04),base,metal))*pow(1.-sat(dot(n,v)),5.);
        col+=env*F*(1.-rough*.65);
    }
    col+=emit;
    return col;
}
vec3 lightAir(vec3 ro,vec3 rd,float depth) {
    vec3 col=vec3(0);
    float base=floor(ro.z/lampStep);
    for(int i=0;i<7;i++) {
        for(int j=0;j<2;j++) {
            float side=j==0?-1.:1.,li=base+float(i)-1.;
            vec3 lp=lampPosition(li,side),delta=lp-ro;
            float t=dot(delta,rd); float miss=length(delta-rd*max(0.,t));
            float vis=step(0.,t)*smoothstep(t-.5,t+.4,depth);
            vec3 c=lightColour(li,side);
            float glare=exp(-miss*miss/.060)*3.2+exp(-miss*2.6)*.14;
            col+=c*glare*vis;
            float at=clamp(t,0.,depth),y=(ro+rd*at).y;
            float shaft=exp(-sq(miss/1.7))*.014*sat(1.-abs(y-lp.y+1.8)/4.4);
            col+=c*shaft*vis;
        }
    }
    vec3 tail=fromBike(vec3(0,.87,-1.06)); vec3 delta=tail-ro; float t=dot(delta,rd);
    float miss=length(delta-rd*t);
    col+=vec3(1.,.01,.002)*(.35*exp(-sq(miss/.09))+.023*exp(-sq(miss/.32)))*step(0.,t)*smoothstep(t-.16,t+.06,depth);
    return col;
}
void mainImage(out vec4 fragColor,in vec2 fragCoord) {
    sceneTime=iTime; sceneAspect=iResolution.x/iResolution.y; vec2 uv=fragCoord/iResolution.xy;
    vec3 ro; mat3 basis; camera(ro,basis); vec3 rd=cameraRay(uv,basis);
    vec2 cityHit=traceCity(ro,rd,180.,86);
    vec2 hit=cityHit;
    vec3 bro=bikeLocal(ro),brd=bikeLocal(ro+rd)-bro;
    float woman=passengerPresence();
    float opacity=passengerOpacity(woman);
    vec2 bh=vec2(0.,-1.),behind=vec2(0.); bool isBike=false,ib=false,seeThrough=false;
    vec3 bikeN0=vec3(0),bikeN1=vec3(0);
    for(int k=0;k<2+min(iFrame,0);k++) {
        if(k==1 && !seeThrough) break;
        float wo=k==0?woman:0.;
        vec2 bounds=boxHit(bro-vec3(0,1.,0),brd,vec3(.58,1.25,1.28));
        vec2 r=vec2(cityHit.x,-1.); vec3 nrm=vec3(0);
        if(bounds.y>=max(bounds.x,0.)) {
            float t=max(.01,bounds.x), end=min(bounds.y,cityHit.x);
            vec2 e=vec2(1,-1)*.0016; int step=0,tap=0; bool found=false;
            // March to the hit, then take the four normal taps there, all through one motorcycle() site.
            for(int i=0;i<92+min(iFrame,0);i++) {
                if(found ? tap>=4 : (step>=88 || t>end)) break;
                vec3 o=tap==0?e.xyy:tap==1?e.yyx:tap==2?e.yxy:e.xxx;
                vec2 h=motorcycle(found?(bro+brd*r.x)+o:bro+brd*t,wo);
                if(found) { nrm+=o*h.x; tap++; }
                else if(h.x<.0018) { r=vec2(t,h.y); found=r.x<cityHit.x; if(!found) break; }
                else { t+=max(.001,h.x*.82); step++; }
            }
        }
        if(k==0) { bh=r; isBike=bh.y>=0. && bh.x<hit.x; if(isBike) hit=bh; seeThrough=hit.y>=30. && opacity<1.; bikeN0=nrm; }
        else { behind=r; ib=behind.y>=0. && behind.x<cityHit.x; if(!ib) behind=cityHit; bikeN1=nrm; }
    }
    vec2 underHit=hit; bool underBike=isBike;
    vec3 p=ro+rd*hit.x, col=atmosphere(rd);
    if(hit.y>=0.) {
        vec3 layer[2]; layer[0]=vec3(0); layer[1]=col;
        for(int k=0;k<2+min(iFrame,0);k++) {
            if(k==1 && !(seeThrough && behind.y>=0.)) break;
            vec2 h=k==0?hit:behind;
            bool bike=k==0?isBike:ib;
            float wo=k==0?woman:0.;
            vec3 pp=k==0?p:ro+rd*behind.x,nn;
            if(bike) { nn=normalize(k==0?bikeN0:bikeN1); nn.xy=rotate2(-bikeLean(iTime))*nn.xy; nn.xz=rotate2(-bikeHeading(iTime))*nn.xz; }
            else nn=h.y<.5?vec3(0,1,0):cityNormal(pp,h.x);
            layer[k]=surface(ro,rd,pp,nn,h.y,h.x,true);
        }
        col=layer[0];
        if(seeThrough) {
            col=mix(layer[1],col,opacity);
            underHit=behind; underBike=ib;
        }
    }
    vec3 air=lightAir(ro,rd,hit.x);
    if(isBike && hit.y>=30. && opacity<1.) air=mix(lightAir(ro,rd,underHit.x),air,opacity);
    col+=air;
    float encodedDepth=hit.x;
    if(isBike) encodedDepth=-hit.x;
    if(isBike && hit.y>=30.) {
        float kind=underBike?1.:(underHit.y<0.?3.:(underHit.y<.5?2.:0.));
        float backCode=clamp(floor(log2(underHit.x+1.)*128.+.5),0.,1023.);
        encodedDepth=-(floor(hit.x*256.+.5)*4096.+backCode*4.+kind);
    }
    fragColor=vec4(max(col,vec3(0)),encodedDepth);
}
