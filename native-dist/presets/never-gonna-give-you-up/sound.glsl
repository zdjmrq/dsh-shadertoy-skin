// Bundled under CC BY-NC-SA 3.0, as supplied by the contributor.
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://creativecommons.org/licenses/by-nc-sa/3.0/
// Original author credits and source text are preserved below.

/*

Created by Tonny Espeset, 2026
https://www.shadertoy.com/view/fXdXR7

Rickrolled

Feel free to use this code, but please keep this credit and link.

Check my other shaders at

https://www.shadertoy.com/user/Espeset

*/

// Levels of the singing voice and of the band.
const float VOICE_LEVEL = 0.25;
const float MUSIC_LEVEL = 1.0;
// The band as the build wrote it from the karaoke MIDI without its lead vocal, cut on bar lines to fit in 180 seconds: its sizes, bar length and loudness.
#define SEQ_NCH 15
#define SEQ_BACK 3
#define SEQ_PMAX 28
#define SEQ_BAR_INT 93663
#define SEQ_BAR_FRAC 6372
const float SEQ_LEVEL = 0.8587;
// The notes of every bar pattern; the build cut each part into bars and stored equal bars once.
const uvec4 SEQ_PN0[51] = uvec4[51](uvec4(244395008u,244395264u,244395520u,244395776u),uvec4(244395008u,244395264u,244395520u,143993856u),uvec4(110439680u,110439936u,110440192u,211365120u),uvec4(211627264u,211365632u,211627776u,211365120u),uvec4(211627264u,211616256u,211365632u,211627776u),uvec4(211603264u,211365120u,211627264u,211627584u),uvec4(211365632u,211627776u,178073408u,211627904u),uvec4(211627968u,211365120u,211627264u,211616256u),uvec4(211616320u,211603072u,211603136u,211365632u),uvec4(211365120u,211627264u,211365632u,211627776u),uvec4(211603264u,211365120u,211627264u,212910080u),uvec4(213443712u,179357952u,179364224u,212912640u),uvec4(213441152u,212910848u,179883904u,212910080u),uvec4(213443712u,179357952u,179888512u,212912640u),uvec4(213441152u,212910848u,179883904u,212910080u),uvec4(213443712u,179357952u,179888512u,212912640u),uvec4(213441152u,219474944u,184096768u,186163264u),uvec4(219458688u,122211456u,184081600u,219471040u),uvec4(217637184u,189313408u,150791552u,189314496u),uvec4(184086016u,122222208u,217633472u,217626432u),uvec4(150788992u,122215296u,184096768u,122211456u),uvec4(184081600u,217637184u,189313408u,150791552u),uvec4(189314496u,184086016u,122222208u,217633472u),uvec4(217626432u,189313920u,150788992u,189315008u),uvec4(184096768u,122211456u,184081600u,217637184u),uvec4(189313408u,217625984u,251180480u,189314496u),uvec4(251186688u,122222208u,251178688u,251194112u),uvec4(189313920u,150788992u,189315008u,184096768u),uvec4(122211456u,184081600u,217637184u,189313408u),uvec4(150791552u,189314496u,251186688u,217626240u),uvec4(122222208u,251178688u,251194112u,217637696u),uvec4(189313920u,150788992u,189315008u,184096768u),uvec4(122211456u,184081600u,217637184u,184070528u),uvec4(189313408u,189314496u,217628096u,217628224u),uvec4(217626240u,122222208u,217631424u,217632512u),uvec4(217632576u,217622400u,189313920u,217622464u),uvec4(189315008u,184096768u,122211456u,184081600u),uvec4(217637184u,189313408u,150791552u,189314496u),uvec4(184086016u,122222208u,217633472u,237550912u),uvec4(507035008u,236764736u,236764800u,505986752u),uvec4(505986816u,235978560u,202424192u,503365568u),uvec4(503364608u,470597376u,470597440u,201375616u),uvec4(201375680u,472432128u,473480768u,203996800u),uvec4(203210432u,470859520u,201375616u,202947968u),uvec4(202948032u,437829120u,437829184u,202161792u),uvec4(202161856u,437042944u,437043008u,201375616u),uvec4(167821248u,202948096u,202948160u,470597248u),uvec4(470597312u,201390848u,202948096u,470597184u),uvec4(470597248u,202161856u,202161920u,470597440u),uvec4(469811072u,167821248u,473480576u,473480640u),uvec4(203996672u,203996736u,471645824u,471645888u));
const uvec4 SEQ_PN1[51] = uvec4[51](uvec4(202439424u,202439488u,469826432u,469826496u),uvec4(469834624u,205606976u,471406720u,204555584u),uvec4(470328768u,470365696u,202963584u,436248256u),uvec4(436289280u,201924416u,202947968u,471383488u),uvec4(470597184u,470597248u,202161856u,202161920u),uvec4(470597440u,469811072u,167821248u,203985408u),uvec4(170454592u,437841536u,470605504u,469816064u),uvec4(473502848u,204012802u,473480576u,473480640u),uvec4(471645824u,471645888u,202439424u,202439488u),uvec4(469826432u,469826496u,204555584u,202963584u),uvec4(436248256u,234948608u,234948736u,234948800u),uvec4(237308224u,236784000u,236259840u,236259968u),uvec4(234949504u,236260288u,234948608u,234948736u),uvec4(234948800u,236783936u,236259712u,236259968u),uvec4(236260032u,236260096u,237046592u,236260288u),uvec4(234948608u,234948736u,234948800u,237308224u),uvec4(236784000u,236259840u,236259968u,236260224u),uvec4(236260288u,234948608u,234948736u,234948800u),uvec4(236783936u,236259712u,235735680u,235735808u),uvec4(235735872u,237046720u,236259328u,236259456u),uvec4(236259520u,237046080u,236784000u,235735552u),uvec4(236259968u,234949504u,236260288u,236259328u),uvec4(235735168u,236259520u,237046080u,236784000u),uvec4(234949504u,236260288u,235472896u,234948736u),uvec4(235473088u,236259648u,235997568u,234949120u),uvec4(235473536u,235473792u,235473856u,234948608u),uvec4(234948736u,234948800u,234948928u,236259712u),uvec4(236259968u,236260032u,235473792u,236260288u),uvec4(236259328u,235735168u,236259520u,237046080u),uvec4(236784000u,235735552u,236259968u,234949504u),uvec4(236260288u,235472896u,234948736u,235473088u),uvec4(236259648u,235997568u,234949504u,234949568u),uvec4(237570048u,237045888u,237570240u,238356800u),uvec4(238094720u,237046272u,237570688u,234949504u),uvec4(235736000u,235472896u,234948736u,235473088u),uvec4(236259648u,235997568u,235473792u,236260288u),uvec4(234948608u,234948736u,234948800u,236783936u),uvec4(236259712u,235735680u,168176640u,169225216u),uvec4(170011648u,204614656u,167941504u,168727936u),uvec4(203330944u,170562944u,203304960u,167916544u),uvec4(168702976u,170539008u,168726912u,169251200u),uvec4(170037632u,204640640u,204617728u,168180736u),uvec4(169229312u,170015744u,167940480u,168726912u),uvec4(203330944u,170562944u,167913472u,168699904u),uvec4(203304960u,170536960u,168726912u,169251200u),uvec4(170037632u,204641664u,204617728u,168180736u),uvec4(169229312u,170015744u,203312512u,167929216u),uvec4(168715648u,170550656u,201449344u,168681344u),uvec4(203284352u,204070784u,169942144u,201410688u),uvec4(171003008u,202199168u,167936256u,170033408u),uvec4(204636416u,168723712u,204393472u,167956480u));
const uvec4 SEQ_PN2[51] = uvec4[51](uvec4(169005056u,169791488u,203347968u,134405120u),uvec4(202300416u,170580992u,167957504u,169792512u),uvec4(204395520u,202561536u,201467904u,201992192u),uvec4(202779648u,203828224u,201493888u,202542464u),uvec4(203328896u,204639616u,204617728u,168180736u),uvec4(169229312u,170015744u,203324800u,170556800u),uvec4(167940480u,168726912u,201448448u,168680448u),uvec4(203283456u,204069888u,168730880u,170041600u),uvec4(167948544u,204648704u,167923701u,174215157u),uvec4(169758069u,176049525u,167907061u,174198517u),uvec4(169758709u,176050165u,168971637u,175263093u),uvec4(169684725u,175976181u,169160501u,175451957u),uvec4(168898421u,175189877u,167929781u,174221237u),uvec4(136203637u,142495093u,167958261u,174249717u),uvec4(169684725u,175976181u,169160501u,175451957u),uvec4(168898421u,175189877u,167929781u,174221237u),uvec4(134369275u,135417851u,136204283u,137252859u),uvec4(134381947u,135692667u,136741243u,137527675u),uvec4(134893563u,135679995u,136728571u,137515003u),uvec4(134381947u,135692667u,136479099u,137527675u),uvec4(134631419u,135679995u,136466427u,137515003u),uvec4(134906235u,135430523u,136216955u,137265531u),uvec4(134369275u,135417851u,136204283u,137252859u),uvec4(134380923u,135691643u,136740219u,137526651u),uvec4(134877051u,135663483u,136712059u,137498491u),uvec4(134398075u,135184507u,136495227u,137543803u),uvec4(101112827u,135715835u,136502267u,137550843u),uvec4(100850683u,135191547u,136240123u,137026555u),uvec4(134405115u,135453691u,136240123u,137288699u),uvec4(100850683u,135453691u,136240123u,137288699u),uvec4(100847611u,101635067u,102945787u,100849659u),uvec4(101636091u,102946811u,102407547u,103193979u),uvec4(104504699u,134369275u,135417851u,136204283u),uvec4(137252859u,134390139u,135700859u,136749435u),uvec4(137535867u,134877179u,135663611u,136712187u),uvec4(137498619u,134398203u,135184635u,136495355u),uvec4(137543931u,136346619u,137395195u,101112827u),uvec4(135715835u,134398203u,135184635u,136495355u),uvec4(137543931u,136346619u,137395195u,134631419u),uvec4(135679995u,134398203u,135184635u,136495355u),uvec4(137543931u,201361024u,238061184u,201377472u),uvec4(238077632u,201902848u,238603008u,202701632u),uvec4(239401792u,201893760u,238593920u,202701760u),uvec4(239401920u,204497408u,201363968u,204522048u),uvec4(201379392u,201364224u,204510976u,204517184u),uvec4(201376576u,238069696u,234928064u,201522176u),uvec4(204667904u,169188480u,172334208u,169712896u),uvec4(172858624u,169217408u,172363136u,168693376u),uvec4(171839104u,201515904u,204661632u,204497408u),uvec4(201363968u,204522048u,201379392u,201364224u),uvec4(204510976u,204517184u,201376576u,204517248u));
const uvec4 SEQ_PN3[51] = uvec4[51](uvec4(201376640u,238069696u,234928064u,137407552u),uvec4(134266944u,137405568u,134263936u,204497408u),uvec4(201363968u,204522048u,201379392u,169233408u),uvec4(171103232u,169758080u,167970560u,170209152u),uvec4(169684928u,167960576u,201460480u,202820608u),uvec4(201928512u,201427840u,137492480u,136445952u),uvec4(135136256u,135660544u,134382976u,135169408u),uvec4(136217984u,137005440u,167957504u,168481792u),uvec4(169268224u,170316800u,167959552u,168483840u),uvec4(169270272u,170318848u,201403392u,201927680u),uvec4(202714112u,203762688u,134265920u,134790208u),uvec4(135576640u,136625216u,100711552u,101235840u),uvec4(102022272u,103070848u,167849152u,168373440u),uvec4(169159872u,170208448u,134266112u,134790400u),uvec4(135576832u,136625408u,100711744u,101236032u),uvec4(102022464u,103071040u,168460672u,135430528u),uvec4(169771392u,170819968u,201403392u,201927680u),uvec4(202714112u,203762688u,100711488u,101235776u),uvec4(102022208u,103070784u,100711552u,101235840u),uvec4(102022272u,103070848u,201403584u,201927872u),uvec4(202714304u,203762880u,134266112u,134790400u),uvec4(135576832u,136625408u,100711744u,101236032u),uvec4(102022464u,103071040u,168460672u,135430528u),uvec4(169771392u,170819968u,167873536u,169185280u),uvec4(169179328u,167870656u,167928192u,168976768u),uvec4(169707520u,170760192u,169703616u,170754240u),uvec4(168942976u,170279296u,168373824u,167867008u),uvec4(169712512u,167881600u,167886848u,170250240u),uvec4(170540288u,168447232u,169741312u,170789888u),uvec4(168392960u,169705728u,168942976u,170279296u),uvec4(168373824u,167867008u,201953280u,203264000u),uvec4(204050432u,203263168u,204049600u,201954496u),uvec4(201446784u,202757504u,203806080u,134271099u),uvec4(170971264u,134260027u,170960192u,134276539u),uvec4(170976704u,134276731u,170976896u,134273851u),uvec4(170974016u,134269883u,170970048u,167812731u),uvec4(137404032u,167842491u,170987200u,167824960u),uvec4(168328832u,168368832u,169133824u,169680704u),uvec4(169683904u,167824960u,167804544u,167844544u),uvec4(168609536u,169156416u,169159616u,134331385u),uvec4(101826556u,136166400u,136688644u,134275257u),uvec4(101771452u,136097984u,136622276u,134266233u),uvec4(101765500u,136093056u,136618372u,134330873u),uvec4(101826044u,136166912u,136689156u,134275769u),uvec4(101769916u,136097472u,136622788u,134275961u),uvec4(101769084u,136104832u,136628100u,134312057u),uvec4(136672380u,135626880u,137983108u,135370105u),uvec4(136157564u,136679808u,137465220u,135642105u),uvec4(103137276u,134312057u,136672380u,135626880u),uvec4(137983108u,135370105u,136157564u,136679808u),uvec4(137465220u,0u,0u,0u));
uvec4 seqPagePn(int i) { uvec4 v0 = SEQ_PN0[clamp(i, 0, 50)]; uvec4 v1 = SEQ_PN1[clamp(i - 51, 0, 50)]; uvec4 v2 = SEQ_PN2[clamp(i - 102, 0, 50)]; uvec4 v3 = SEQ_PN3[clamp(i - 153, 0, 50)]; return i < 102 ? (i < 51 ? v0 : v1) : (i < 153 ? v2 : v3); }
// Where each bar pattern starts among the notes above and how many notes it has.
const uvec4 SEQ_PAT[14] = uvec4[14](uvec4(201592832u,269160455u,538253327u,337910813u),uvec4(539691049u,406528051u,944915521u,1081031776u),uvec4(680609919u,77866139u,413733029u,347678895u),uvec4(684073150u,617678032u,350430426u,217196776u),uvec4(687744245u,621880584u,488842522u,624108842u),uvec4(491070780u,492119372u,560077148u,561127786u),uvec4(830611834u,295051662u,295571866u,564797858u),uvec4(163193266u,700586428u,567284172u,568070616u),uvec4(569123300u,570171892u,302518788u,235934220u),uvec4(504761875u,572858909u,305472045u,709177913u),uvec4(709954127u,308752987u,443486827u,108398197u),uvec4(578424439u,310776450u,1923510922u,583539394u),uvec4(315755216u,652092118u,317928167u,452795127u),uvec4(1527057155u,589638427u,0u,0u));
// Each part bar by bar from its first note to its last: which pattern plays and over which lowest pitch, so a riff moved to another chord reuses its pattern.
const uvec4 SEQ_BAR0[44] = uvec4[44](uvec4(0u,0u,0u,0u),uvec4(0u,0u,0u,0u),uvec4(0u,0u,0u,0u),uvec4(0u,0u,0u,0u),uvec4(0u,0u,0u,0u),uvec4(0u,0u,0u,0u),uvec4(0u,0u,0u,0u),uvec4(0u,0u,0u,0u),uvec4(0u,0u,0u,0u),uvec4(0u,0u,0u,0u),uvec4(65536u,196610u,196611u,196611u),uvec4(196611u,196612u,196611u,196611u),uvec4(196611u,196611u,196611u,196613u),uvec4(196611u,196611u,196611u,196612u),uvec4(196611u,196611u,196611u,196611u),uvec4(196611u,196613u,196611u,196611u),uvec4(196611u,196612u,196611u,196611u),uvec4(196611u,196612u,196611u,196611u),uvec4(196611u,196614u,196613u,196611u),uvec4(196611u,196611u,196615u,196611u),uvec4(196611u,196611u,589832u,589834u),uvec4(589834u,589834u,589834u,589834u),uvec4(589834u,589834u,589834u,589834u),uvec4(589834u,589834u,589834u,589834u),uvec4(589834u,589834u,589834u,589834u),uvec4(589834u,589834u,589834u,589834u),uvec4(589834u,589834u,589834u,589834u),uvec4(589834u,589834u,589834u,589834u),uvec4(589834u,589834u,589834u,589834u),uvec4(589834u,589834u,589834u,589834u),uvec4(589834u,589834u,589834u,786443u),uvec4(786445u,786445u,786445u,786445u),uvec4(786445u,786445u,786445u,786445u),uvec4(786445u,786446u,786445u,786445u),uvec4(786445u,786445u,786445u,786445u),uvec4(786445u,786445u,786445u,786447u),uvec4(786445u,786445u,786445u,786445u),uvec4(786445u,786445u,786445u,786445u),uvec4(786445u,786445u,786445u,786445u),uvec4(786448u,786445u,786445u,786445u),uvec4(786445u,786445u,786445u,786445u),uvec4(1444020241u,33510931u,33489407u,33489407u),uvec4(1679032831u,33489407u,33489407u,33489407u),uvec4(1444217343u,33489407u,1578500607u,33489407u));
const uvec4 SEQ_BAR1[44] = uvec4[44](uvec4(33489407u,33489407u,1578566143u,33489407u),uvec4(33489407u,33489407u,1444217343u,33489407u),uvec4(1578631679u,33489407u,33489407u,33489407u),uvec4(1444479487u,33489407u,33489407u,33489407u),uvec4(1578566143u,33489407u,33489407u,33489407u),uvec4(1377526810u,1578893823u,33489407u,1578959359u),uvec4(33489407u,1444807167u,33489407u,1578959359u),uvec4(33489407u,1377763839u,975255072u,975386146u),uvec4(975255072u,975386146u,975518244u,908541990u),uvec4(975518244u,908541990u,975518244u,1076443688u),uvec4(975255072u,975386146u,975255072u,975386146u),uvec4(975518244u,908541990u,975518244u,908541990u),uvec4(975518244u,1076443688u,975255072u,975386146u),uvec4(975255072u,975386146u,975255072u,975386146u),uvec4(975255072u,975386146u,1076574762u,1076574762u),uvec4(1076574762u,1076574762u,1076443688u,975255072u),uvec4(975386146u,975255072u,975386146u,975255072u),uvec4(975386146u,975255072u,975975970u,1781426733u),uvec4(1781557807u,1781426733u,1781688881u,1781820467u),uvec4(1882614837u,1781820467u,1882614837u,33489407u),uvec4(33489407u,1781426733u,1781557807u,1781426733u),uvec4(1782082103u,1781820467u,1882614837u,1781820467u),uvec4(1882614837u,33489407u,33489407u,1781426733u),uvec4(1781557807u,1781426733u,1782082103u,1781426733u),uvec4(1781557807u,1781426733u,1782082103u,33489407u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(1781426733u,1781557807u,1781426733u,1782082103u),uvec4(1781426733u,1781557807u,1781426733u,1782082103u),uvec4(1882880569u,1883011643u,1882880573u,1883011643u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(33489407u,33489407u,1882880569u,1883011643u),uvec4(1882880573u,1883011643u,33489407u,33489407u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(1882880569u,1883011643u,1882880573u,1883011643u),uvec4(1882880569u,1883011643u,1882880573u,1883011643u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(33489407u,1882880569u,1883011643u,1882880573u),uvec4(1883011643u,1882880569u,1883011643u,1882880573u),uvec4(1883011643u,1715432510u,1715432000u,1715432513u),uvec4(1715628608u,1782868547u,33516613u,1782869062u),uvec4(33516613u,2018014279u,33518664u,1715432521u),uvec4(1715432000u,1715432513u,1716152896u,1782868555u),uvec4(33516613u,1782869062u,33516613u,2018014279u),uvec4(33518664u,1715432521u,1715432000u,1715432513u));
const uvec4 SEQ_BAR2[44] = uvec4[44](uvec4(1716152896u,1715432012u,1715432000u,1715432513u),uvec4(1716152896u,33516109u,33489407u,33489407u),uvec4(33489407u,33489407u,1715432510u,1715432000u),uvec4(1715432513u,1716152896u,1715432012u,1715432000u),uvec4(1715432513u,1716152896u,1884187213u,33489407u),uvec4(2454651391u,33489407u,33489407u,33489407u),uvec4(1951500368u,33489407u,1884160511u,33489407u),uvec4(1884160511u,33489407u,2454847999u,33526355u),uvec4(33489407u,33489407u,1951500368u,33489407u),uvec4(1884160511u,33489407u,1884160511u,33489407u),uvec4(2454847999u,33526355u,1884160511u,33489407u),uvec4(2454847999u,33526355u,33489407u,33489407u),uvec4(33489407u,33489407u,33489407u,1884160511u),uvec4(33489407u,2454847999u,33526355u,1884160511u),uvec4(33489407u,2454979071u,2186702933u,33489407u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(33489407u,33489407u,33489407u,1884750335u),uvec4(1884782168u,1884782168u,1884782168u,1784249944u),uvec4(33489407u,1784218111u,2119924314u,2052880986u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(33489407u,1784218111u,33489407u,1784218111u),uvec4(2119924314u,2052946522u,33489407u,33489407u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(33489407u,33489407u,2052946522u,2053081182u),uvec4(2120317536u,2053277790u,2120317536u,33489407u),uvec4(33489407u,33489407u,33489407u,33489407u),uvec4(33489407u,2053081182u,2120317536u,2053277790u),uvec4(2120317536u,2053081182u,2120317536u,2053277790u),uvec4(2120317536u,2120417791u,2120417791u,2120417791u),uvec4(2120417791u,33489407u,2053081182u,2120317536u),uvec4(2053277790u,2120317536u,2053081182u,2120317536u),uvec4(2053277790u,2120317536u,1482971236u,1482971236u),uvec4(33489407u,33489407u,33489407u,1885667839u),uvec4(33489407u,33489407u,33489407u,1885667839u),uvec4(1550274150u,1550274150u,1550274150u,1550274150u),uvec4(1482971236u,33489407u,33489407u,33489407u),uvec4(1885667839u,33489407u,33489407u,33489407u),uvec4(1885667839u,2053732968u,2053730410u,2053730410u),uvec4(2053730410u,33517675u,0u,0u));
uvec4 seqPageBar(int i) { uvec4 v0 = SEQ_BAR0[clamp(i, 0, 43)]; uvec4 v1 = SEQ_BAR1[clamp(i - 44, 0, 43)]; uvec4 v2 = SEQ_BAR2[clamp(i - 88, 0, 43)]; return i < 44 ? v0 : (i < 88 ? v1 : v2); }
// Where each part's bars sit in the table above, and how many bars its notes can ring on.
const int SEQ_CHAN[15] = int[15](167953,21665793,43421713,64917521,86415361,108171281,129667089,151162882,172660739,194410562,215078995,230537410,244969810,261190225,273173377);
// Each part's sound settings; the levels come from rendering every part alone and setting it to its role in the mix.
const vec4 SEQ_P[60] = vec4[60](vec4(2.0,-8.38,0.0,0.0),vec4(0.0,1.0,1.0,1.0),vec4(0.0,0.0,0.0,0.0),vec4(0.0,0.0,0.0,0.0),vec4(2.0,-8.12,0.0,0.0),vec4(0.0,1.0,1.0,1.0),vec4(0.0,0.0,0.0,0.0),vec4(0.0,0.0,0.0,0.0),vec4(2.0,-13.66,0.0,0.0),vec4(0.0,1.0,1.0,1.0),vec4(0.0,0.0,0.0,0.0),vec4(0.0,0.0,0.0,0.0),vec4(2.0,-13.59,0.0,0.0),vec4(0.0,1.0,1.0,1.0),vec4(0.0,0.0,0.0,0.0),vec4(0.0,0.0,0.0,0.0),vec4(3.0,-16.77,0.6,0.0),vec4(0.001,0.3,0.0,0.2),vec4(0.0,1.0,0.045,0.35),vec4(0.0,0.0,0.0,0.0),vec4(0.0,-15.93,0.0,0.0),vec4(0.003,0.3,0.45,0.05),vec4(4.0,2.4,0.08,1.4),vec4(0.0,0.0,4.0,0.0),vec4(4.0,-19.08,-0.25,0.0),vec4(0.002,1.2,0.0,0.2),vec4(1.6,0.45,2.2,0.0),vec4(0.0,0.0,6.0,0.0),vec4(0.0,-22.65,0.15,0.0),vec4(0.012,0.5,0.7,0.25),vec4(5.0,1.0,0.25,1.0),vec4(7.0,5.5,9.0,0.0),vec4(0.0,-26.65,0.3,0.0),vec4(0.09,1.0,0.85,0.4),vec4(3.5,0.3,0.5,0.8),vec4(4.0,5.0,14.0,0.0),vec4(0.0,-24.56,-0.1,0.0),vec4(0.006,0.3,0.6,0.12),vec4(2.5,2.2,0.15,1.3),vec4(0.0,0.0,7.0,0.0),vec4(1.0,-25.46,0.4,1.0),vec4(0.15,1.0,0.9,0.4),vec4(6.0,0.0,1.0,0.7),vec4(6.0,5.0,10.0,0.0),vec4(0.0,-27.98,-0.3,0.0),vec4(0.3,1.5,0.9,0.45),vec4(4.0,0.6,1.0,0.9),vec4(9.0,5.0,12.0,0.0),vec4(1.0,-19.71,-0.35,0.0),vec4(0.1,1.0,0.9,0.35),vec4(9.0,0.0,1.0,0.7),vec4(6.0,5.2,12.0,0.0),vec4(0.0,-19.49,0.5,0.0),vec4(0.002,0.1,0.0,0.05),vec4(3.5,1.8,0.03,1.1),vec4(0.0,0.0,0.0,7.0),vec4(0.0,-24.72,-0.5,0.0),vec4(0.002,0.8,0.0,0.15),vec4(6.0,1.0,0.1,1.0),vec4(0.0,0.0,5.0,2.0));
#define SEQ_HARM 40
// A cent's share of an octave in natural log units, which turns cents into a frequency ratio.
const float CENT = 0.000577623;
// Width without reverb: each harmonic is shifted in phase in the right channel by one of four fixed angles.
const vec2 SEQ_ROOM[4] = vec2[4](vec2(0.4536, -0.8912), vec2(0.9211, -0.3894), vec2(0.9211, 0.3894), vec2(0.4536, 0.8912));
float mRand(uint x) { return float(hash(x) >> 8) * (1.0 / 16777216.0); }
float mSmooth(float x, uint s) {
    float i = floor(x), f = x - i;
    uint k = uint(int(i));
    return mix(mRand(k * 0x9E3779B9u ^ s), mRand((k + 1u) * 0x9E3779B9u ^ s), f * f * (3.0 - 2.0 * f)) * 2.0 - 1.0;
}
float mHz(float midi) { return 440.0 * exp2((midi - 69.0) / 12.0); }
vec2 mPan(float p) { return vec2(cos((p + 1.0) * 0.7853982), sin((p + 1.0) * 0.7853982)); }
// One drum hit by its General MIDI note, after the sampled drum machines of the time.
float seqDrum(int note, float tau, int ns, uint seed) {
    // Noise in each drum's band, smooth noise against itself a few samples later: about 2 kHz for the clap, 5 for the snare, 8 for the hats, 10 for the shakers and 6 for clicks.
    float rate = note == 39 ? 0.12 : (note == 38 ? 0.3 : (note == 44 || note == 46 ? 0.5 : (note >= 69 ? 0.6 : 0.35)));
    float lag = rate * (note == 39 ? 3.0 : (note == 38 ? 2.0 : (note == 44 || note == 46 || note >= 69 ? 1.0 : 1.5)));
    float nz = 2.0 * (mSmooth(float(ns) * rate, seed) - mSmooth(float(ns) * rate - lag, seed));
    float w = mRand(uint(ns) * 0x9E3779B9u ^ seed) * 2.0 - 1.0;
    // Kick: a sine falling from 195 to 62 Hz with a click on top.
    if (note == 36) return sin(TAU * fract(62.0 * tau + 4.0 * (1.0 - exp(-tau / 0.03)))) * exp(-tau * 12.0) + 0.15 * nz * exp(-tau * 300.0);
    // Snare: two body tones under a burst of wire noise with a short room tail.
    if (note == 38) return 0.5 * sin(TAU * fract(190.0 * tau)) * exp(-tau * 22.0) + 0.2 * sin(TAU * fract(340.0 * tau)) * exp(-tau * 30.0) + (0.6 * nz + 0.25 * w) * (0.8 * exp(-tau * 18.0) + 0.12 * exp(-tau * 5.0));
    if (note == 39) {
        // Clap: three quick bursts of noise 11 ms apart and a fourth that rings on, starting 5 ms after the snare as a drum machine's clap does.
        float tc = tau - 0.005;
        float tb = tc - 0.011 * min(floor(tc / 0.011), 3.0);
        return 0.75 * nz * step(0.0, tc) * smoothstep(0.0, 0.0008, tb) * exp(-tb * (tc < 0.033 ? 260.0 : 11.0));
    }
    // Side stick: a short wooden click.
    if (note == 37) return 0.6 * sin(TAU * fract(1650.0 * tau)) * exp(-tau * 170.0) + 0.4 * sin(TAU * fract(480.0 * tau)) * exp(-tau * 55.0) + 0.25 * nz * exp(-tau * 400.0);
    // Closed hi-hat, and the open one until the next closed hat chokes it.
    if (note == 44) return 0.55 * nz * exp(-tau * 60.0);
    if (note == 46) return 0.45 * nz * exp(-tau * 8.0) * (1.0 - smoothstep(0.23, 0.27, tau));
    // Congas: a muted and an open slap of a tuned skin.
    if (note == 62) return 0.6 * sin(TAU * fract(370.0 * tau + 2.0 * (1.0 - exp(-tau / 0.01)))) * exp(-tau * 28.0) + 0.2 * nz * exp(-tau * 220.0);
    if (note == 63) return 0.6 * sin(TAU * fract(315.0 * tau + 2.0 * (1.0 - exp(-tau / 0.01)))) * exp(-tau * 9.0) + 0.12 * nz * exp(-tau * 200.0);
    // Cabasa, maracas and shaker: bursts of bright noise with soft attacks.
    return 0.45 * nz * smoothstep(0.0, note == 82 ? 0.012 : 0.003, tau) * exp(-tau * (note == 69 ? 45.0 : (note == 70 ? 65.0 : 28.0)));
}
// One note of a part, in one of five kinds of sound, in order: saw, sung vowel, drum kit, tom and electric piano.
vec2 seqVoice(int ns, float tau, float dur, float midi, float vel, float side, int c, uint seed, int zero) {
    vec4 P0 = SEQ_P[c * 4], P1 = SEQ_P[c * 4 + 1], P2 = SEQ_P[c * 4 + 2], P3 = SEQ_P[c * 4 + 3];
    int kind = int(P0.x);
    float rel = tau - dur;
    vec2 pan = mPan(P0.z * side);
    float gain = exp2(P0.y * 0.1660964) * pow(vel, 1.3);
    // Drums are saturated a little, which takes the edge off their peaks the way a drum machine's output stage does.
    if (kind == 2) return vec2(tanh(0.6 * seqDrum(int(midi), tau, ns, seed)) / 0.6) * gain * pan;
    float env = (P1.x > 0.0 ? smoothstep(0.0, P1.x, tau) : 1.0) * (P1.z + (1.0 - P1.z) * exp(-max(tau - P1.x, 0.0) / P1.y)) * (rel > 0.0 ? exp(-rel / P1.w) : 1.0);
    float g = env * gain;
    if (g < 3e-5) return vec2(0.0);
    float f0 = mHz(midi);
    if (kind == 3) {
        // A tom: a sine falling onto its note from above, a second mode a fifth up and a burst of noise at the stick.
        float cyc = f0 * (tau + 0.6931 * P2.y * P2.z * (1.0 - exp(-tau / max(P2.z, 1e-3))));
        float hit = P2.w * (mRand(uint(ns) * 0x9E3779B9u ^ seed) * 2.0 - 1.0) * exp(-tau * 90.0);
        return vec2(sin(TAU * fract(cyc)) + 0.25 * sin(TAU * fract(cyc * 1.5)) * exp(-tau * 18.0) + hit) * g * pan;
    }
    if (kind == 4) {
        // Two-operator FM like the digital pianos of the time: a modulator at the note's pitch whose depth dies away, a fast high one for the bell of the tine, the right channel detuned for width and a random start so chord notes do not peak together.
        vec2 cyc = f0 * tau * vec2(1.0, 1.0 + P3.z * CENT) + mRand(seed);
        vec2 m = P2.x * exp(-tau / max(P2.y, 1e-3)) * sin(TAU * fract(cyc)) + P2.z * exp(-tau * 25.0) * sin(TAU * fract(fract(cyc) * 14.0));
        return sin(TAU * fract(cyc) + m) * g * pan;
    }
    // The phase follows the vibrato-bent pitch exactly, so vibrato never clicks.
    float vd = P3.x * smoothstep(0.15, 0.6, tau);
    float wv = TAU * max(P3.y, 0.1);
    float cyc = f0 * (tau + CENT * vd * (1.0 - cos(wv * tau)) / wv);
    float p = fract(cyc);
    float fi = f0 * (1.0 + CENT * vd * sin(wv * tau));
    float fc = P2.x * f0 * exp2(P2.y * exp(-tau / max(P2.z, 1e-3)));
    float iq = 1.0 / max(P2.w, 0.3);
    float beat = f0 * P3.z * CENT;
    // Formants of the sung vowel, from aah to ooh.
    vec3 formant = mix(vec3(750.0, 1150.0, 2600.0), vec3(350.0, 800.0, 2400.0), P0.w);
    int nh = min(SEQ_HARM, int(min(fc * 5.0, 12000.0) / f0) + 1);
    vec2 acc = vec2(0.0);
    for (int h = 1; h <= SEQ_HARM + zero; h++) {
        if (h > nh) break;
        float hh = float(h);
        float fh = fi * hh;
        if (fh > 15000.0) break;
        uint r = hash(seed ^ (uint(h) * 0x85EBCA6Bu));
        float ph = float(r >> 8) * (1.0 / 16777216.0);
        float x = fh / max(fc, 1.0);
        float q = fh * fh * 0.0004;
        // A resonant low-pass per harmonic, a high-pass at 50 Hz, below which records of the time carry almost nothing, and for a sung vowel three formants on top.
        float a = q * q / ((q * q + 1.0) * hh * ((1.0 - x * x) * (1.0 - x * x) + x * x * iq * iq));
        if (kind == 1) {
            vec3 d = (fh - formant) / vec3(160.0, 190.0, 260.0);
            a *= 0.08 + dot(exp(-d * d), vec3(1.0, 0.7, 0.3));
        }
        a *= exp(-tau * P3.w * (hh - 1.0)) * (P3.z > 0.0 ? 1.0 + 0.5 * cos(TAU * (beat * hh * tau + ph)) : 1.0);
        float ang = TAU * (fract(hh * p) + ph);
        vec2 room = SEQ_ROOM[int(r & 3u)];
        float s = sin(ang);
        acc += a * vec2(s, s * room.x + cos(ang) * room.y);
    }
    return acc * g * pan;
}
// Above the knee, peaks are squeezed into a little more headroom instead of clipping.
vec2 softKnee(vec2 x, float knee) {
    vec2 over = max(abs(x) - knee, 0.0);
    return sign(x) * (min(abs(x), knee) + 0.15 * tanh(min(over / 0.15, 10.0)));
}
// A bar's first sample from integers alone, a bar being a whole number of samples plus ten-thousandths, so every GPU agrees on it to the sample.
int seqBarStart(int b) { return b * SEQ_BAR_INT + (b * SEQ_BAR_FRAC + 5000) / 10000; }
vec2 music(int n, float t, int zero) {
    if (t > FADE_OUT.y) return vec2(0.0);
    // The bar from a division, corrected where its rounding put the sample across a bar line.
    int b = int(float(n) / (float(SEQ_BAR_INT) + float(SEQ_BAR_FRAC) * 0.0001));
    if (n < seqBarStart(b)) b--;
    if (n >= seqBarStart(b + 1)) b++;
    vec2 acc = vec2(0.0);
    for (int c = 0; c < SEQ_NCH + zero; c++) {
        // This bar and the earlier ones whose notes may still be sounding, within the span of bars the part plays.
        int ch = SEQ_CHAN[c];
        for (int db = 0; db <= SEQ_BACK + zero; db++) {
            int bb = b - db, r = bb - ((ch >> 4) & 127);
            if (db > (ch & 15) || r < 0) break;
            if (r >= ((ch >> 11) & 127)) continue;
            int i = (ch >> 18) + r;
            uint e = PAGED16(seqPageBar, i);
            if ((e & 511u) == 511u) continue;
            int pi = int(e & 511u);
            uint pe = PACKED16(SEQ_PAT, pi);
            int first = int(pe & 1023u), cnt = int(pe >> 10);
            // Time is counted in whole samples from the bar's start, so notes late in the song keep exact phases.
            int nb = n - seqBarStart(bb);
            float base = float(e >> 9);
            for (int k = 0; k < SEQ_PMAX + zero; k++) {
                if (k >= cnt) break;
                uint w = PAGED(seqPagePn, first + k);
                int p = int(w & 1023u);
                int ns = nb - ((p * SEQ_BAR_INT + (p * SEQ_BAR_FRAC + 5000) / 10000 + 512) >> 10);
                if (ns < 0) break;
                acc += seqVoice(ns, float(ns) * (1.0 / 44100.0), 0.02 * exp(0.025 * float((w >> 10) & 255u)), base + float((w >> 18) & 127u), float(((w >> 25) & 7u) + 1u) * 0.125, ((w >> 28) & 1u) == 1u ? -1.0 : 1.0, c, uint(bb * 64 + k) * 0x9E3779B9u + uint(c) * 0x632BE5ABu, zero);
            }
        }
    }
    // The knee keeps the band's rare peaks, drum hits landing on bass notes, under 0.55 and leaves the top of the range to the voice.
    return softKnee(acc * SEQ_LEVEL * (1.0 - smoothstep(FADE_OUT.x, FADE_OUT.y, t)), 0.4);
}
vec2 mainSound(int samp, float time) {
    // Half a sample of margin keeps the floor away from GPU division error, so the sample index is exact at 44100 Hz.
    int n = int(floor((float(samp) + 0.5) * (44100.0 / iSampleRate)));
    int zero = int(min(iSampleRate, 0.0));
    float t = float(n) * (1.0 / 44100.0);
    // The knee catches the rare moment a voice peak meets a band peak; the output never reaches full scale.
    return softKnee(vec2(voiceAt(n, zero) * VOICE_LEVEL) + music(n, t, zero) * MUSIC_LEVEL, 0.85);
}
