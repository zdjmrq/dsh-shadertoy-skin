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


The story behind the shader
---------------------------

This experiment is about whether it's possible to recreate a real hit song,
like a-ha's Take On Me, in a Shadertoy shader.

The answer turned out to be, no, not really.

So, I did it anyway... :P


How it was NOT done
-------------------

None of the normal sensible approaches to playing this music work in
Shadertoy. For example, we can't store the whole song as a compressed audio
sample, even at very low quality and high compression it's too long and there
is no support for external data.

Storing a sample of each instrument and playing them back as notes is the next
sensible approach, but that also fails. The song uses more than 20
instruments, and storing them each as samples in a decent quality would 
still make the source code blow up. Especially as many of the instruments 
linger for a very long time, and combine with others in unpredictable ways.

One way that could work is converting an existing MIDI song. But... The MIDI
versions I could find sound terrible and lack the vocals. Besides you would 
still need to convert those MIDI instruments.


How it was done
---------------

There was no magic AI shortcut here, I systematically recreated every single
instrument used in the original by hand, as algorithms. That is the whole
trick, an algorithm takes almost no space and has unlimited fidelity.

That meant reading countless music blogs, interviews where the members of a-ha
went into detail about how the song was created, and digging deep into the
specifications of the equipment they used.

a-ha did not use any preset instruments. All of them were tweaked and
programmed to achieve the exact result they were looking for. So I had to
reverse engineer their process.

Most of the instruments have layers and layers of effects, generators and
tweaks. And I had to make a custom vocoder for the vocals too. At some point
it became more a "why did I do this to myself" and not a how to do it. Lol

Well, I consider this a fan tribute, and also, it was a great learning
experience. :)

The next step was to fit the individual notes, it was much easier than
recreating the instruments. Here AI actually did help a bit, as I split the
song into individual stems using the demucs model, and wrote a program that
detected the timing and pitch of each note in each stem. That only got about
60% right though. The model made a lot of mistakes and many instruments bled
through to where they did not belong, so again, the answer was patience and
manual correction.


Compression and optimization
----------------------------

The next Shadertoy specific issue was compilation time. My first version took
45 minutes to compile on my RTX 6000 Pro, not ideal.

I attacked this in two ways. First reducing the data needed, for example by
detecting repeated patterns such as repeated drum beats, and storing them once
rather than as individual notes. Secondly shader compiler tricks. Preventing
unwanted unrolling of methods and arrays, and generally compressing all the
data, sharing common code and so on.

Basically all the stuff that makes the code impossible to read, sorry about
that. But at least now it compiles in about 12s. Not fast, but acceptable
after all.


The visuals
-----------

After spending way too long on making the music sound authentic, I thought it
needed a fitting visual companion. I looked at the original video and tried a
few variants where I compressed parts of it for an authentic mood, but even
heavily compressed video is just too heavy to store in source code. So, in the
end I thought to myself, what did the artists try to express rather than exactly
how did they express it.

My interpretation is the song and original music-video are about boundaries
between people, and how you need to be brave to break through.

So, instead of recreating the music video, I came up with the motorcycle idea.
The video opens on a race, so it felt like the right vehicle to borrow. A long
ride through the boundaries, and on the other side, your soulmate is waiting. <3

Send a like and comment if you enjoyed, thanks :)

*/
vec3 filmic(vec3 x) { return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0); }
vec4 fetchScene(vec2 uv) { return texture(iChannel0,clamp(uv,vec2(0),vec2(1))); }
vec4 fetchSurface(vec2 uv) {
    ivec2 size=textureSize(iChannel0,0);
    return texelFetch(iChannel0,clamp(ivec2(uv*vec2(size)),ivec2(0),size-1),0);
}
float luminance(vec3 c) { return dot(c,vec3(.2126,.7152,.0722)); }
float stripe(float phase,float width) {
    float aa=max(fwidth(phase)*.65,.005);
    float line=1.-smoothstep(width-aa,width+aa,abs(fract(phase)-.5));
    return mix(line,width*2.,smoothstep(.55,1.4,aa));
}
float rainLayer(vec2 uv,float scale,float seed) {
    vec2 p=vec2(uv.x+uv.y*.085,uv.y)*vec2(210.,27.)*scale;
    p+=vec2(iTime*.8,iTime*33.)*sqrt(scale)+seed;
    vec2 cell=floor(p),q=fract(p);
    float alive=step(.88,h2(cell+seed));
    float x=abs(q.x-.5),aa=fwidth(p.x);
    float line=1.-smoothstep(.012-aa*.4,.025+aa*.6,x);
    float trail=smoothstep(.08,.35,q.y)*(1.-smoothstep(.40,.98,q.y));
    return line*trail*alive;
}
vec3 drawn(vec3 lit,vec3 p,vec3 n,float edge,float detail,vec2 uv,float onBike) {
    float lum=luminance(filmic(lit*1.45));
    float shadow=1.-pow(sat(lum*1.75),.72);
    vec3 local=onBike>.5?bikeLocal(p):p;
    vec3 an=abs(n);
    bool isGround=an.y>max(an.x,an.z);
    vec2 c=isGround?local.xz:(an.x>an.z?local.zy:local.xy);
    float grain=h2(floor(uv*iResolution.xy*.55));
    float paperNoise=fbm(uv*vec2(18.,13.))*0.7+fbm(uv*vec2(47.,41.))*0.3;
    vec3 paper=mix(vec3(.965,.972,.982),vec3(.905,.926,.945),paperNoise*.16);
    float contour=sat(edge*1.40+detail*.56);
    float ridge=pow(sat(1.-abs(dot(n,normalize(vec3(.28,.62,.73))))),3.5)*0.19;
    float hatchFreq=mix(isGround?6.5:8.5,15.5,onBike);
    vec2 hatch=c*hatchFreq;
    float wobble=(noise2(c*2.4)-.5)*.16;
    float hatchA=stripe(hatch.x+hatch.y*.82+wobble,.020+.042*shadow);
    float hatchB=stripe(hatch.x-hatch.y*.58+wobble*.7,.016+.024*shadow);
    float hatchInk=hatchA*smoothstep(.46,.92,shadow)*.15+hatchB*smoothstep(.74,.985,shadow)*.09;
    float roadMask=(isGround?1.:0.)*smoothstep(.05,.85,lum)*(1.-smoothstep(0.18,1.45,abs(local.y)));
    vec2 suv=uv*vec2(56.,122.);
    float scribPhase=suv.y+sin(suv.x*.72+p.z*.075)*.65+(noise2(vec2(suv.x*.14,p.z*.16))-.5)*1.2;
    float scribble=stripe(scribPhase,.070)*(.55+.45*noise2(vec2(floor(suv.x*.22),floor(suv.y*.11))));
    float puddle=scribble*roadMask*smoothstep(.18,.90,lum)*.42;
    float wallMask=(1.-(isGround?1.:0.))*smoothstep(.08,.75,shadow)*(1.-onBike*.5);
    float wallGuides=stripe(c.x*4.0+(noise2(c*1.8)-.5)*.08,.010)*wallMask*.05;
    float bikeBoost=onBike*(.24*contour+.09*smoothstep(.40,.95,shadow));
    float ink=sat(contour*.92+ridge+hatchInk+puddle+wallGuides+bikeBoost);
    vec3 inkColour=vec3(.24,.27,.31);
    vec3 result=mix(paper,inkColour,ink);
    return clamp(result*(.992+.024*grain),0.,1.);
}
const uvec2 kLines[29] = uvec2[] (uvec2(786432u,1024u),uvec2(1114124u,1028u),uvec2(1900573u,2312u),uvec2(2097210u,2577u),uvec2(720986u,1051u),uvec2(2228325u,2591u),uvec2(655495u,809u),uvec2(655505u,812u),uvec2(786587u,815u),uvec2(983207u,1330u),uvec2(983222u,1079u),uvec2(1114309u,1083u),uvec2(1835222u,2111u),uvec2(2031858u,2375u),uvec2(786705u,1104u),uvec2(2556189u,2900u),uvec2(655684u,863u),uvec2(655694u,866u),uvec2(786776u,869u),uvec2(983396u,1384u),uvec2(131443u,365u),uvec2(1573237u,1390u),uvec2(852365u,1139u),uvec2(1835418u,2167u),uvec2(2752950u,2687u),uvec2(1180128u,1417u),uvec2(2097650u,2702u),uvec2(655890u,920u),uvec2(655900u,923u));
const uvec2 kCues[158] = uvec2[] (uvec2(34412u,16777704u),uvec2(34944u,17039670u),uvec2(35298u,4718725u),uvec2(35476u,13173091u),uvec2(37249u,8388741u),uvec2(37426u,25297206u),uvec2(37781u,21496118u),uvec2(38136u,17629539u),uvec2(38845u,16777526u),uvec2(39200u,12845189u),uvec2(39377u,17236278u),uvec2(39731u,21692726u),uvec2(40086u,17826280u),uvec2(40618u,13893765u),uvec2(40795u,9896069u),uvec2(40973u,5833014u),uvec2(41327u,14287203u),uvec2(42746u,8388741u),uvec2(42923u,16908421u),uvec2(43101u,12976438u),uvec2(43455u,4784438u),uvec2(43810u,9044278u),uvec2(44165u,21758085u),uvec2(44342u,17891816u),uvec2(44874u,13959301u),uvec2(45051u,22544694u),uvec2(45406u,14483811u),uvec2(46115u,12583222u),uvec2(46470u,16974134u),uvec2(46825u,4653189u),uvec2(47002u,13107732u),uvec2(48775u,12583045u),uvec2(48953u,21168261u),uvec2(49130u,13107333u),uvec2(49307u,13303941u),uvec2(49485u,17694853u),uvec2(49662u,17956997u),uvec2(49839u,22413445u),uvec2(50017u,22741125u),uvec2(50194u,6291811u),uvec2(50726u,6357480u),uvec2(51435u,20972894u),uvec2(52854u,12911966u),uvec2(54272u,8914669u),uvec2(57110u,20972894u),uvec2(58528u,12911789u),uvec2(59770u,8914847u),uvec2(62784u,20972894u),uvec2(64203u,12911789u),uvec2(65444u,17303100u),uvec2(67395u,12583045u),uvec2(67572u,8585393u),uvec2(67927u,17105029u),uvec2(68104u,13173268u),uvec2(68813u,13373245u),uvec2(74133u,16777704u),uvec2(74665u,21233974u),uvec2(75020u,13172869u),uvec2(75197u,13369699u),uvec2(76793u,16777349u),uvec2(76971u,21233974u),uvec2(77325u,17367173u),uvec2(77503u,17630071u),uvec2(78567u,16777349u),uvec2(78744u,29622582u),uvec2(79099u,13304429u),uvec2(79808u,17695208u),uvec2(80340u,9568389u),uvec2(80517u,18088069u),uvec2(80695u,5767478u),uvec2(81049u,14221667u),uvec2(82645u,16777526u),uvec2(83000u,12845189u),uvec2(83177u,21430582u),uvec2(83532u,17563781u),uvec2(83709u,22020229u),uvec2(83886u,22348086u),uvec2(84241u,14286981u),uvec2(84418u,6095158u),uvec2(84773u,6160872u),uvec2(85482u,16777704u),uvec2(86014u,8651062u),uvec2(86369u,17170565u),uvec2(86546u,9045032u),uvec2(88497u,12583045u),uvec2(88674u,21168261u),uvec2(88852u,13107333u),uvec2(89029u,13303941u),uvec2(89206u,17694853u),uvec2(89384u,13762693u),uvec2(89561u,13959301u),uvec2(89738u,22544694u),uvec2(90093u,22872197u),uvec2(90270u,10617142u),uvec2(90625u,14942518u),uvec2(91157u,20972894u),uvec2(92576u,12911966u),uvec2(93994u,8914669u),uvec2(96832u,20972894u),uvec2(98250u,12911789u),uvec2(99491u,8914847u),uvec2(102506u,20972894u),uvec2(103925u,12911789u),uvec2(105166u,17303100u),uvec2(107117u,12583045u),uvec2(107294u,8585526u),uvec2(107649u,17105029u),uvec2(107826u,13173268u),uvec2(108535u,13373245u),uvec2(153045u,8388785u),uvec2(153621u,29360571u),uvec2(154109u,21430582u),uvec2(154464u,17563781u),uvec2(154641u,17826989u),uvec2(155882u,18088291u),uvec2(156414u,12583045u),uvec2(156592u,12779830u),uvec2(156946u,21365046u),uvec2(157301u,9109859u),uvec2(158010u,20971830u),uvec2(158365u,12910725u),uvec2(158542u,21496118u),uvec2(158897u,13435190u),uvec2(159251u,13631976u),uvec2(159783u,22217014u),uvec2(160138u,5767301u),uvec2(160315u,14221667u),uvec2(161911u,29360261u),uvec2(162089u,17236278u),uvec2(162443u,17498245u),uvec2(162621u,30343478u),uvec2(162975u,22413578u),uvec2(163330u,18546998u),uvec2(163685u,14614838u),uvec2(164039u,10616965u),uvec2(164217u,14942518u),uvec2(164571u,15139126u),uvec2(165103u,29360261u),uvec2(165281u,13041974u),uvec2(165635u,17432886u),uvec2(165990u,5111941u),uvec2(166167u,13566484u),uvec2(167852u,12583045u),uvec2(168029u,21168261u),uvec2(168207u,13107333u),uvec2(168384u,13303941u),uvec2(168561u,17694853u),uvec2(168739u,17956997u),uvec2(168916u,18219274u),uvec2(169271u,5898373u),uvec2(169448u,10158213u),uvec2(169625u,14483988u),uvec2(170601u,20972894u),uvec2(172019u,12911789u),uvec2(173261u,8914669u),uvec2(176186u,20972894u),uvec2(177605u,12911789u),uvec2(178846u,8914050u));
const uint kGlyphs[275] = uint[] (6357076u, 7012460u, 15597801u, 10485991u, 32964961u, 33096161u, 35652169u, 49218276u,44499694u, 44040948u, 57541483u, 58131311u, 66519840u, 65078248u, 71894004u, 74253351u,83100704u, 77595887u, 90244467u, 85984633u, 94832073u, 99354092u, 108201376u, 108594785u,115934752u, 111150836u, 124651361u, 142018553u, 142149729u, 149883092u, 157354340u, 153094521u,166922729u, 174131616u, 183438062u, 191368052u, 192023397u, 199494432u, 200870881u, 208931744u,203426927u, 216599782u, 216272110u, 226036896u, 225774959u, 233311699u, 241765881u, 241634926u,249630240u, 258019191u, 265228153u, 262148072u, 270995529u, 275517548u, 283250720u, 278925541u,292491619u, 300487021u, 300356078u, 308679072u, 309465711u, 318312992u, 318051055u, 312480498u,326046572u, 325391222u, 332337952u, 349443147u, 350950625u, 346035429u, 359535983u, 367858976u,374609381u, 376116833u, 371201637u, 384112365u, 393156256u, 399054702u, 401348519u, 396367852u,409278562u, 417798176u, 418257135u, 424220901u, 421534062u, 429922785u, 442571364u, 438311545u,452074223u, 460593824u, 460266359u, 467999694u, 467934181u, 476388460u, 477305971u, 485760032u,480255215u, 492903795u, 499719545u, 502078887u, 510598560u, 509877860u, 505421427u, 518921953u,513810148u, 527310693u, 527638372u, 536158146u, 530587636u, 543694964u, 544481377u, 544415783u,552411168u, 547365093u, 561258867u, 560800117u, 569123298u, 577643113u, 572531303u, 595010273u,595141473u, 602678227u, 603399151u, 611918956u, 619455520u, 618734821u, 619586802u, 627975529u,622863719u, 635971060u, 636757473u, 644621728u, 644228713u, 639641189u, 653469417u, 659498656u,676538315u, 679028833u, 685844512u, 695478502u, 695347557u, 703408416u, 709831141u, 706751080u,720644841u, 720579239u, 728640160u, 723528559u, 736439266u, 745810932u, 745679973u, 754199584u,748694767u, 761605474u, 770911520u, 770059745u, 765472229u, 778579572u, 778972769u, 787688992u,796012271u, 796471154u, 803286996u, 803549163u, 812593056u, 807415918u, 820326637u, 828453204u,828715371u, 837628192u, 832582117u, 846082671u, 849818313u, 854340332u, 862073504u, 857748325u,871314407u, 870659054u, 879637577u, 887174176u, 895759520u, 897135969u, 904869152u, 899692018u,913782388u, 919549551u, 928265960u, 929642344u, 929511278u, 924858227u, 937965556u, 938751969u,947468192u, 947206255u, 955463712u, 955857121u, 964245664u, 962672997u, 969488744u, 966801907u,980695657u, 988559904u, 988166889u, 983579365u, 997342063u, 1005927370u, 1005861875u, 1014250400u,1008745583u, 1022115056u, 1022967009u, 1030569120u, 1025523065u, 1039089143u, 1047674354u, 1046822505u,1042300531u, 1064779489u, 1064910689u, 1072644057u, 1067925493u, 1071988722u, 1080115104u, 1080836204u,1089749024u, 1088766184u, 1098137760u, 1097417064u, 1097285998u, 1092632947u, 1101480393u, 1105543670u,1114063264u, 1114915439u, 1123303968u, 1117799151u, 1130709874u, 1139098605u, 1147290605u, 1148339301u,1156531417u, 1151812853u, 1155876082u, 1165182112u, 1165575528u, 1173243369u, 1168131559u, 1190610529u,1190741729u, 1198016335u, 1204373280u, 1206667175u, 1201686508u, 1214597218u, 1222854688u, 1223510255u,1231964521u, 1226852711u, 1240418790u, 1235241458u, 1248807545u, 1243630197u, 1265519329u, 1274497913u,1274629089u, 1281444948u, 1281707115u, 1290751008u, 1285573870u, 1298484589u, 1306611156u, 1306873323u,1315786144u, 1310740069u, 1324240623u);
int lyricIndex(int timeMs) {
    int lo=0, hi=29;
    for(int stepIndex=0;stepIndex<6;stepIndex++) {
        if(lo>=hi) break;
        int mid=(lo+hi)/2;
        int startMs=int(kCues[int(kLines[mid].y&255u)].x);
        if(startMs<=timeMs) lo=mid+1; else hi=mid;
    }
    int current=lo-1;
    if(current>=0) {
        uvec2 line=kLines[current];
        int finalCue=int((line.y&255u)+(line.y>>8u)-1u);
        uvec2 last=kCues[finalCue];
        if(timeMs<int(last.x+(last.y&65535u))+300) return current;
    }
    if(lo<29 && timeMs>=int(kCues[int(kLines[lo].y&255u)].x)-1000) return lo;
    return -1;
}
// Why the music stops: Shadertoy caps a sound shader at three minutes.
const int END_LEN=33;
const uint END_MSG[9] = uint[] (1684105299u, 1869902437u, 1869815929u, 543452789u, 1935961701u, 544497952u, 1768759347u, 1702131054u, 538976371u);
vec3 karaokeInk(vec3 col,vec2 uv,float sketch) {
    // Pixels outside the lyric strip do no text lookups or timing searches.
    if(uv.y<.054 || uv.y>.188) return col;
    int timeMs=int(floor(iTime*1000.0+.5));
    float endFade=smoothstep(181.,182.5,iTime)*(1.-smoothstep(205.,209.,iTime));
    int lineIndex=lyricIndex(timeMs);
    if(lineIndex<0 && endFade<=0.) return col;
    bool endNote=lineIndex<0;
    uvec2 line=endNote?uvec2(0):kLines[lineIndex];
    int length=endNote?END_LEN:int(line.x>>16u), offset=endNote?0:int(line.x&65535u);
    float aspect=iResolution.x/iResolution.y;
    float height=min(.095,.86*aspect/(float(length)*.52));
    float advance=height*.52;
    float baseY=.127;
    // A restrained oblique baseline rests above the near road, away from the riders.
    vec2 pos=vec2((uv.x-.5)*aspect,uv.y-baseY);
    pos.x-=pos.y*.13;
    if(abs(pos.y)>height*.5) return col;
    float column=pos.x/advance+float(length)*.5;
    int charIndex=int(floor(column));
    if(charIndex<0 || charIndex>=length) return col;
    int glyphIndex=offset+charIndex;
    uint record=endNote?0u:(kGlyphs[glyphIndex/2]>>uint((glyphIndex&1)*16))&65535u;
    int code=endNote?int((END_MSG[charIndex>>2]>>uint((charIndex&3)*8))&255u):int(record&127u);
    int cueIndex=int(record>>7u);
    if(code==32) return col;
    vec2 glyphUv=vec2(.5+(fract(column)-.5)*.68,pos.y/height+.5);
    // Shadertoy Font: a 16 x 16 atlas; alpha is signed distance, < .5 inside.
    vec2 cell=vec2(float(code&15),float(15-(code>>4)));
    vec2 texUv=(cell+clamp(glyphUv,vec2(.008),vec2(.992)))/16.;
    float distanceToEdge=textureLod(iChannel1,texUv,0.).a-.5;
    // Analytic screen footprint: derivatives are not needed in this divergent branch.
    float aa=clamp(1.35/(height*iResolution.y),.004,.12);
    float fill=1.-smoothstep(-aa,aa,distanceToEdge);
    float outline=1.-smoothstep(.022-aa,.022+aa,distanceToEdge);
    float glow=exp2(-max(distanceToEdge,0.)*70.)*(1.-fill);
    uvec2 cue=kCues[cueIndex];
    float progress=clamp((float(timeMs)-float(cue.x))/max(float(cue.y&65535u),1.),0.,1.);
    float firstChar=float((cue.y>>16u)&63u);
    float charCount=float((cue.y>>22u)&63u);
    float sweep=firstChar+progress*charCount;
    float inked=1.-smoothstep(sweep-.055,sweep+.055,column);
    vec3 waiting=vec3(.77,.82,.86);
    vec3 finished=vec3(1.,.66,.22);
    vec3 lettering=endNote?mix(vec3(.90,.30,.26),vec3(.62,.09,.07),sketch):mix(waiting,finished,inked);
    float since=max(float(timeMs)-float(cue.x),0.);
    float activated=exp(-since*.012);
    float wordPulse=activated*smoothstep(-.35,.35,float(charIndex)-float((cue.y>>16u)&63u));
    lettering=mix(lettering,vec3(1.,.92,.58),endNote?0.:wordPulse*.78);
    lettering+=vec3(.20,.10,.025)*(endNote?0.:wordPulse);
    int firstCue=int(line.y&255u);
    uvec2 last=kCues[endNote?0:int((line.y&255u)+(line.y>>8u)-1u)];
    float entrance=smoothstep(float(kCues[firstCue].x)-1000.,float(kCues[firstCue].x)-760.,float(timeMs));
    float exit=1.-smoothstep(float(last.x+(last.y&65535u))+100.,float(last.x+(last.y&65535u))+300.,float(timeMs));
    float alpha=endNote?endFade*.62:entrance*exit;
    col=mix(col,mix(vec3(.018,.025,.034),paperTint,sketch),outline*alpha*.45);
    col=mix(col,lettering,fill*alpha);
    col+=vec3(.085,.044,.012)*glow*alpha*(1.-sketch);
    return col;
}
void mainImage(out vec4 fragColor,in vec2 fragCoord) {
    sceneTime=iTime; sceneAspect=iResolution.x/iResolution.y; vec2 uv=fragCoord/iResolution.xy,px=1./iResolution.xy;
    vec3 ro; mat3 basis; camera(ro,basis);
    vec3 rd=cameraRay(uv,basis);
    vec3 rdL=cameraRay(uv-vec2(px.x,0),basis),rdR=cameraRay(uv+vec2(px.x,0),basis),rdU=cameraRay(uv+vec2(0,px.y),basis),rdD=cameraRay(uv-vec2(0,px.y),basis);
    vec4 center=fetchSurface(uv),left=fetchSurface(uv-vec2(px.x,0)),right=fetchSurface(uv+vec2(px.x,0));
    vec4 up=fetchSurface(uv+vec2(0,px.y)),down=fetchSurface(uv-vec2(0,px.y));
    float onBike=center.a<0.?1.:0.;
    float isPassenger=center.a< -256.?1.:0.;
    float anyPassenger=min(min(center.a,left.a),min(right.a,min(up.a,down.a)))< -256.?1.:0.;
    float presence=passengerPresence(),opacity=passengerOpacity(presence),tracing=passengerTrace(presence);
    float backObject=backKind(center.a);
    float bcDepth=backDepth(center.a,ro,rd);
    float blDepth=backDepth(left.a,ro,rdL);
    float brDepth=backDepth(right.a,ro,rdR);
    float buDepth=backDepth(up.a,ro,rdU);
    float bdDepth=backDepth(down.a,ro,rdD);
    center.a=sceneDepth(center.a); left.a=sceneDepth(left.a); right.a=sceneDepth(right.a);
    up.a=sceneDepth(up.a); down.a=sceneDepth(down.a);
    vec3 p=ro+rd*center.a;
    vec3 lp=ro+rdL*left.a;
    vec3 rp=ro+rdR*right.a;
    vec3 upos=ro+rdU*up.a;
    vec3 dp=ro+rdD*down.a;
    vec3 normal=normalize(cross(rp-lp,upos-dp));
    if(dot(normal,rd)>0.) normal=-normal;
    float d2=max(abs(left.a+right.a-2.*center.a),abs(up.a+down.a-2.*center.a))/max(center.a,1.);
    float edge=smoothstep(.004,.045,d2);
    float silhouette=edge;
    // The background layer keeps its own geometry through the whole fade.
    float bd2=max(abs(blDepth+brDepth-2.*bcDepth),abs(buDepth+bdDepth-2.*bcDepth))/max(bcDepth,1.);
    float backgroundEdge=smoothstep(.004,.045,bd2);
    vec3 backgroundNormal=normal;
    if(anyPassenger>.5 && opacity<1.) {
        vec3 lpos=ro+rdL*blDepth;
        vec3 rpos=ro+rdR*brDepth;
        vec3 top=ro+rdU*buDepth;
        vec3 bottom=ro+rdD*bdDepth;
        backgroundNormal=normalize(cross(rpos-lpos,top-bottom));
        if(dot(backgroundNormal,rd)>0.) backgroundNormal=-backgroundNormal;
        if(isPassenger<.5) edge=mix(backgroundEdge,edge,opacity);
    }
    float lc=luminance(filmic(center.rgb));
    float ld=max(abs(luminance(filmic(left.rgb))+luminance(filmic(right.rgb))-2.*lc),abs(luminance(filmic(up.rgb))+luminance(filmic(down.rgb))-2.*lc));
    float detail=smoothstep(.055,.28,ld);
    float mask=worldMask(p);
    if(isPassenger>.5 && opacity<1.) {
        vec3 underPosition=ro+rd*bcDepth;
        float underMask=worldMask(underPosition);
        if(bcDepth>179.5) underMask=worldMask(vec3(roadX(ro.z+135.),5.,ro.z+135.));
        mask=mix(underMask,mask,opacity);
    }
    if(center.a>179.5) mask=worldMask(vec3(roadX(ro.z+135.),5.0,ro.z+135.));
    vec3 bloom=vec3(0);
    for(int i=0;i<8;i++) {
        float a=float(i)*TAU/8.; vec2 offset=vec2(cos(a),sin(a));
        bloom+=max(fetchScene(uv+offset*px*4.).rgb-.55,0.)*.039;
        bloom+=max(fetchScene(uv+offset*px*11.).rgb-.8,0.)*.013;
    }
    float contrast=max(max(luminance(left.rgb),luminance(right.rgb)),max(luminance(up.rgb),luminance(down.rgb)))-min(min(luminance(left.rgb),luminance(right.rgb)),min(luminance(up.rgb),luminance(down.rgb)));
    vec3 resolved=mix(center.rgb,(left.rgb+right.rgb+up.rgb+down.rgb)*.25,smoothstep(.10,.85,contrast)*.24);
    vec3 real=pow(filmic(resolved*1.65+bloom*.9),vec3(1./2.2));
    vec3 inkNormal=normalize(mix(backgroundNormal,normal,isPassenger>.5?1.:opacity));
    vec3 sketch=drawn(center.rgb,p,inkNormal,edge,detail,uv,onBike);
    if(isPassenger>.5 && opacity<1.) {
        vec3 under=drawn(center.rgb,ro+rd*bcDepth,backgroundNormal,backgroundEdge,detail,uv,backObject>.5 && backObject<1.5?1.:0.);
        sketch=mix(under,sketch,opacity);
    }
    float rain=rainLayer(uv,1.,0.)*.5+rainLayer(uv,.57,17.)*.34+rainLayer(uv,1.7,51.)*.30;
    vec3 rainTint=mix(vec3(.27,.36,.44),vec3(.66,.46,.23),sat((center.r-center.b)*3.));
    real+=rainTint*rain*(.16+lc*.85);
    sketch-=vec3(.13,.14,.16)*rain*.42;
    vec3 col=mix(real,sketch,mask);
    // Keep the transition spatial: a slim seam on the actual boundary sells driving into paper.
    float boundary=1.-smoothstep(.0,.10,abs(mask-.5));
    vec3 seamColour=mix(vec3(.88,.86,.80),vec3(.79,.85,.93),step(.5,mask));
    col=mix(col,seamColour,boundary*.12);
    // A short-lived line of warm light follows her actual silhouette. No particles/history.
    if(isPassenger>.5 && tracing>0.) {
        float grazing=pow(sat(1.-abs(dot(normal,rd))),1.65);
        float contour=max(silhouette*.88,grazing*.85);
        float fibre=.88+.12*noise2(bikeLocal(p).yz*31.);
        vec3 traceColour=mix(vec3(1.,.87,.61),vec3(.98,.83,.57),mask);
        col=mix(col,traceColour,tracing*contour*fibre*.90);
    }
    vec3 spray=fromBike(vec3(0,.37,-1.6)),delta=spray-ro;
    float along=dot(delta,rd); vec3 nearest=ro+rd*along-spray;
    float mist=exp(-sq(nearest.x/.43)-sq(nearest.y/.26)-sq(nearest.z/1.4));
    mist*=smoothstep(along-.1,along+.3,center.a)*(.5+.5*noise2(uv*180.+vec2(iTime*4.,-iTime*8.)));
    col+=mix(vec3(.043,.046,.046),vec3(.035),mask)*mist;
    float vignette=1.-.20*pow(length((uv-.5)*vec2(1.,.85))*1.25,2.);
    col*=vignette;
    float grain=(h2(fragCoord+vec2(3.7,1.1))-.5)/255.;
    col+=grain;
    col=karaokeInk(col,uv,mask);
    fragColor=vec4(clamp(col,0.,1.),1.);
}
