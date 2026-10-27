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

// The song fades out over these seconds; the picture turns grey with it, then stands still.
const vec2 FADE_OUT = vec2(175.0, 177.0);
// SAM's tables: phoneme recipes, the noise of the voiced fricatives and the amplitude rescale.
const uvec4 T_PH[21] = uvec4[21](uvec4(0u,5980947u,5980947u,5980947u),uvec4(5980947u,7230474u,6113294u,5980690u),uvec4(5783064u,5842970u,5712918u,5774868u),uvec4(5383184u,5843988u,6113294u,4075538u),uvec4(5383182u,5774866u,4076050u,7218192u),uvec4(5250060u,6112270u,5904394u,3944978u),uvec4(7216654u,5904394u,7229960u,5320198u),uvec4(7943686u,6641158u,7943686u,5980945u),uvec4(4049815814u,3798617862u,3545307654u,3145286150u),uvec4(2086488334u,2505188624u,22885129u,40321546u),uvec4(55322632u,56438538u,6639366u,1919241990u),uvec4(7946758u,40193797u,7958022u,0u),uvec4(5916690u,5776922u,5774868u,5777946u),uvec4(5774866u,5382668u,5315078u,5315078u),uvec4(5315078u,7946758u,7946758u,7946758u),uvec4(7368198u,7237126u,7237126u,6181894u),uvec4(6181894u,6181894u,5315078u,458299910u),uvec4(5315078u,7946758u,427377158u,7946758u),uvec4(6647046u,6641162u,7367946u,6181894u),uvec4(6181894u,6181894u,556844u,98067u),uvec4(0u,0u,0u,0u));
const uvec4 T_PHA[21] = uvec4[21](uvec4(0u,35778560u,35778560u,35778560u),uvec4(35778560u,71313581u,71313341u,71313630u),uvec4(71313647u,71311839u,71311823u,71311567u),uvec4(71311807u,71311516u,71325629u,71325116u),uvec4(71311823u,71344335u,53487309u,36733325u),uvec4(71323789u,71325646u,36745357u,36742572u),uvec4(36737421u,36733069u,36735149u,18481212u),uvec4(18907289u,19956585u,18968576u,17952768u),uvec4(19996672u,19996672u,19996672u,19996672u),uvec4(17948672u,17948672u,36782139u,36782427u),uvec4(36782139u,18956363u,2191360u,20017152u),uvec4(2203649u,20029787u,122528u,84005154u),uvec4(89139694u,89137631u,89137359u,89137631u),uvec4(71311567u,71311501u,35758082u,118804u),uvec4(18984960u,35758082u,118804u,20033536u),uvec4(35758081u,118804u,21082112u,35758081u),uvec4(118804u,20033536u,35745792u,118784u),uvec4(35745792u,35745792u,118784u,18968576u),uvec4(53571584u,120748u,36794368u,53571584u),uvec4(120224u,36794368u,94991u,94223u),uvec4(0u,0u,0u,0u));
const uvec4 T_SAMPLE[48] = uvec4[48](uvec4(426476600u,2249745350u,2982582387u,2352073244u),uvec4(3263705543u,826710064u,204850712u,3322687946u),uvec4(1763971105u,338805266u,1242067396u,1789610274u),uvec4(1363782824u,2287129906u,580152467u,634541077u),uvec4(2773537942u,2231902534u,1673795691u,409718288u),uvec4(2350477708u,3322688867u,1825347891u,2577551029u),uvec4(2183668038u,820194965u,2620442012u,1738322338u),uvec4(1499891761u,2216186668u,3821686887u,816557066u),uvec4(2351981228u,1653870691u,679644337u,3600298902u),uvec4(694308021u,2629126821u,3591647686u,3024854072u),uvec4(2920834438u,1671830631u,421762585u,2785547140u),uvec4(583707730u,430665353u,3291767436u,1669732706u),uvec4(1478738968u,1112581078u,1252870740u,1684738341u),uvec4(962808457u,707863434u,1151967978u,1120735941u),uvec4(409111604u,1209099148u,1151152486u,826678579u),uvec4(212977308u,3297260237u,1938167923u,1482937864u),uvec4(4041244935u,2424768316u,3339680828u,2096152768u),uvec4(2155874078u,1886919680u,3223308273u,521993740u),uvec4(2047479327u,2213704128u,252642191u,4168679436u),uvec4(256106593u,4179158915u,3923383233u,2198835043u),uvec4(532907907u,3790630972u,3095913441u,3810528881u),uvec4(477644941u,3778054035u,2028257729u,3280175905u),uvec4(3845719687u,235374531u,4100987932u,912301169u),uvec4(1008649010u,1007587315u,2412241776u,1007554319u),uvec4(2279862392u,132378630u,260544961u,1886418968u),uvec4(2970678268u,2083622028u,1015472496u,3786435684u),uvec4(2401439715u,943595023u,2407217212u,4097576455u),uvec4(2017205783u,1232248562u,943072739u,3739367768u),uvec4(3782768700u,3789644231u,3287347376u,3224899271u),uvec4(1936969456u,3786421272u,1008504519u,3790616824u),uvec4(2407959489u,4033902620u,2410785912u,953889081u),uvec4(235848545u,393443384u,941504798u,3253854564u),uvec4(2722107214u,2173682946u,135462049u,574414948u),uvec4(2382841312u,4035981836u,3762888735u,4032826616u),uvec4(2856393239u,311283876u,52305538u,201539320u),uvec4(1148223603u,3777233702u,72221758u,3423191324u),uvec4(119640222u,3227796368u,2626733583u,3791870913u),uvec4(1591771421u,3095659293u,2977959724u,1093722243u),uvec4(2206810910u,774175824u,2096202515u,231287884u),uvec4(2192945283u,2617698532u,496607239u,2407677447u),uvec4(1081356400u,3907260618u,1058312719u,2290415622u),uvec4(873103683u,3821420857u,2953004828u,3255440312u),uvec4(4179163236u,1707127648u,2359713824u,807436739u),uvec4(941366822u,649069011u,3272340544u,847585090u),uvec4(3376439334u,300679627u,83509288u,1282465844u),uvec4(1762073996u,80221699u,2596726819u,3758299659u),uvec4(3473213046u,827898910u,4160775793u,217842751u),uvec4(2156537716u,641385073u,85966854u,2923468815u));
const uvec2 T_RESCALE = uvec2(0x43322210u, 0xfdb98654u);
// SAM's speed, as the data was built with: not a knob.
#define SAM_SPEED 72
#define N_SING 76
// When each sung phrase starts, at 22050 Hz, and which stored phrase it is: repeated lines of the song are stored once.
const uvec4 D_SING[19] = uvec4[19](uvec4(431782u,4713895u,8960383u,13197576u),uvec4(17419775u,21631243u,25872743u,30108274u),uvec4(34350570u,38602026u,42854143u,47078671u),uvec4(51302015u,55543151u,59784287u,64019800u),uvec4(68266558u,72507694u,76748830u,80996051u),uvec4(85248679u,89489186u,93730916u,97972027u),uvec4(102214597u,106435637u,110647936u,114889763u),uvec4(119107718u,123324524u,127560748u,131865570u),uvec4(136077915u,140287676u,52238651u,56479787u),uvec4(60720923u,64956437u,69203195u,73444330u),uvec4(77685466u,81932688u,52613306u,56854442u),uvec4(61095578u,65331091u,69577849u,73818985u),uvec4(78060121u,82307342u,145320425u,145414088u),uvec4(149661842u,153873708u,145507752u,149755505u),uvec4(153967371u,145601416u,45008407u,49232934u),uvec4(53456278u,57697414u,61938550u,66174063u),uvec4(70420822u,74661957u,78903093u,83150315u),uvec4(53830933u,58072069u,62313204u,66548718u),uvec4(70795476u,75036612u,79277748u,83524969u));
// The song's distinct phrases, each pointing at its phonemes and snapshots below, with how long it sounds.
const uvec4 D_LINE[28] = uvec4[28](uvec4(1835008u,393216u,70673u,1638428u),uvec4(393222u,49568u,458805u,131084u),uvec4(32705u,1114172u,327694u,36054u),uvec4(655437u,131091u,16883u,1245271u),uvec4(196629u,40234u,1638506u,393240u),uvec4(42219u,1048707u,327710u,44827u),uvec4(1573011u,393251u,57828u,1179819u),uvec4(262185u,42888u,917693u,262189u),uvec4(25635u,1048779u,196657u,30369u),uvec4(1442011u,458804u,49755u,1769713u),uvec4(458811u,53344u,1442060u,458818u),uvec4(47981u,1245474u,262217u,50375u),uvec4(1638709u,458829u,49101u,1900878u),uvec4(458836u,52008u,1376619u,458843u),uvec4(50917u,983424u,196706u,38697u),uvec4(1048975u,327781u,37091u,852383u),uvec4(196714u,47365u,2032044u,393325u),uvec4(39904u,1638859u,393331u,44028u),uvec4(1442276u,327801u,33252u,655866u),uvec4(131198u,15948u,786948u,196736u),uvec4(40080u,1049104u,262275u,28196u),uvec4(590368u,131207u,12386u,1180201u),uvec4(262281u,42338u,2556475u,589965u),uvec4(101257u,1180258u,196758u,21901u),uvec4(459380u,131225u,13022u,1114747u),uvec4(196763u,29524u,787084u,196766u),uvec4(29494u,983704u,327841u,20666u),uvec4(983719u,327846u,23058u,0u));
// The sung phonemes with their lengths and notes, timed so every vowel lands on its note; each word is spelled the way speech recognizers understood it best when sung.
const uvec4 D_REC0[58] = uvec4[58](uvec4(3913089817u,3913091471u,3896181532u,3896182836u),uvec4(3896180884u,2277835040u,3888447660u,3888447639u),uvec4(3888448688u,3888447637u,3888447772u,3888448387u),uvec4(3888447801u,3888447674u,3888447675u,3888447783u),uvec4(3888449423u,3888448038u,3874226629u,3874226502u),uvec4(3874226375u,3874228240u,3874226580u,3896181528u),uvec4(3896185610u,3913090570u,3932075530u,3932062504u),uvec4(3913089818u,3913090832u,3913089667u,3913089820u),uvec4(3913090833u,3913089589u,3913089300u,3896181289u),uvec4(3896183181u,3888448279u,3888450741u,3913090869u),uvec4(3913089428u,3913089555u,3913089830u,3913091075u),uvec4(3932062367u,3932063880u,3932061852u,3932061881u),uvec4(3932061882u,3932061883u,1697612064u,3845098164u),uvec4(3845095828u,3845096249u,3845095610u,3845095611u),uvec4(3845098640u,3874238001u,3874226581u,3874226949u),uvec4(3913090954u,3913089155u,3913089314u,3913091084u),uvec4(3913089299u,3896181320u,3896180937u,3896181066u),uvec4(3896183306u,3888448283u,3888449414u,3888448069u),uvec4(3913089819u,3913092494u,3913089820u,3913089695u),uvec4(3913089312u,3888448281u,3888449546u,3888447941u),uvec4(3888447814u,3888447687u,3874226719u,3874228913u),uvec4(3874226581u,3874226949u,3874226971u,3896181027u),uvec4(3896182918u,3896181021u,3913089215u,3913089216u),uvec4(3913089217u,3913089224u,3913089225u,3913089226u),uvec4(3913089542u,3913089309u,3913089468u,3913089213u),uvec4(3913089214u,3913090563u,3913089311u,3913092237u),uvec4(3932071437u,3932062504u,3913089818u,3913090832u),uvec4(3913089667u,3913089817u,3913091980u,3896181022u),uvec4(3896182670u,3896181148u,3896181023u,3888447932u),uvec4(3888447677u,3888447678u,3888449415u,3888447941u),uvec4(3888447814u,3888447687u,3913089577u,3913090566u),uvec4(1228734752u,3913089539u,1784578338u,3932061847u),uvec4(3932065034u,3932063242u,3932062491u,3874226847u),uvec4(3874228359u,3874226435u,3874226972u,3874228101u),uvec4(3874226819u,3874226847u,3874228365u,3861545769u),uvec4(3861547023u,3874227007u,3874226368u,3874226497u),uvec4(3874235441u,3874226581u,3874226949u,3888460721u),uvec4(3888447893u,3888448261u,3874226873u,3874226362u),uvec4(3874226363u,3874226983u,3874228234u,1726742816u),uvec4(3874226361u,3874226362u,3874226363u,3861545113u),uvec4(3861547403u,3888448284u,3888449677u,3874227013u),uvec4(3874226502u,3874226503u,3874227719u,3874226707u),uvec4(3874226563u,3874226970u,3874228240u,3874226469u),uvec4(3874228232u,3874226741u,3874226452u,3861545375u),uvec4(3861547057u,3861545109u,3861545093u,3861545115u),uvec4(2800484642u,3874229381u,3932064389u,3932062227u),uvec4(3932069126u,3932062365u,3932062524u,3932061885u),uvec4(3932062014u,3913089855u,3913089216u,3913089345u),uvec4(3913091593u,3896181407u,3896183181u,3888448283u),uvec4(3888449584u,3888447637u,3888447947u,3888447692u),uvec4(3888447821u,3913089434u,3913091472u,3874226847u),uvec4(3874228237u,3874226588u,3861545529u,3861545146u),uvec4(3861545147u,3861547023u,2250932512u,3874226361u),uvec4(3874226362u,3874226363u,3874233352u,3874226844u),uvec4(3874227001u,3874226362u,3874226363u,3932062492u),uvec4(3932062471u,3913089704u,3913090063u,3888447932u),uvec4(3888447677u,3888447678u,3888448394u,3913089692u),uvec4(3913090061u,3861545407u,3861545152u,3861545153u));
const uvec4 D_REC1[58] = uvec4[58](uvec4(3861546886u,3861545768u,3861545859u,3861545754u),uvec4(3861549712u,3874234762u,3874227010u,3874226499u),uvec4(3874226500u,3932062492u,3932062471u,3913089704u),uvec4(3913090063u,3896181180u,3896180925u,3896180926u),uvec4(3896181642u,3913089692u,3913090061u,3874226840u),uvec4(3874228231u,3874226757u,3874226502u,3874226503u),uvec4(3874227203u,3874226970u,3874230032u,3888448313u),uvec4(3888447674u,3888447675u,3888452489u,3896182281u),uvec4(3913092361u,3913089845u,3913089428u,3913089820u),uvec4(3932062492u,3932062471u,3913089704u,3913090063u),uvec4(3888447932u,3888447677u,3888447678u,3888448394u),uvec4(3913089692u,3913090061u,3888448151u,3888452621u),uvec4(3888448284u,3874226847u,3874228874u,3874226706u),uvec4(3896183987u,3913092275u,3913089428u,3913089845u),uvec4(3913089428u,3913089820u,3932062367u,3932063240u),uvec4(3932062364u,3932062521u,3932061882u,3932061883u),uvec4(3932064131u,3932062393u,3932061882u,3932061883u),uvec4(3932063886u,3874226982u,3874230410u,3874226706u),uvec4(3874226757u,3874226502u,3874226503u,3888448282u),uvec4(3888457872u,3932062492u,3932062471u,3913089704u),uvec4(3913090063u,3888447932u,3888447677u,3888447678u),uvec4(3888448394u,3913089692u,3913090061u,3861545627u),uvec4(3861546416u,3861545237u,3861545547u,3861545164u),uvec4(3861545421u,3861546371u,3861545498u,3861548048u),uvec4(3874226891u,3874226380u,3874226637u,3874226839u),uvec4(3874234762u,3874226949u,3932062492u,3932062471u),uvec4(3913089704u,3913090063u,3896181180u,3896180925u),uvec4(3896180926u,3896181642u,3913089692u,3913090061u),uvec4(1697612064u,3845099440u,3845095829u,3845096197u),uvec4(3896181567u,3896180928u,3896181057u,3896182796u),uvec4(3896181049u,3896180922u,3896180923u,3888447926u),uvec4(3888447671u,3888447672u,3888452401u,3896182449u),uvec4(3913092401u,3913089429u,3913089797u,3932062492u),uvec4(3932062471u,3913089704u,3913090063u,3888447932u),uvec4(3888447677u,3888447678u,3888448394u,3913089692u),uvec4(3913090189u,3888447813u,3888447814u,3888447687u),uvec4(3888453511u,3888448019u,3874228618u,3896181528u),uvec4(3896185610u,3913090570u,3932064906u,3932062469u),uvec4(3932062367u,3932063624u,3932061852u,3932062009u),uvec4(3932061882u,3932061883u,3874226468u,3874229391u),uvec4(3888448399u,3888447941u,3888447814u,3888447687u),uvec4(3888448771u,3888448026u,3888457872u,3888448281u),uvec4(3888448517u,3888448168u,3888448259u,3888448156u),uvec4(3888449588u,3888447892u,3888448284u,3913089797u),uvec4(3913089322u,3913089323u,3913090435u,3888447775u),uvec4(3888449677u,3874226985u,3874232207u,3896181026u),uvec4(3896182671u,3913089312u,3913089844u,3913089428u),uvec4(3913090307u,3913089816u,3913092235u,3932074507u),uvec4(3932062365u,3932062524u,3932061885u,3932062014u),uvec4(3913089818u,3913090577u,3913089554u,3913089539u),uvec4(3913089316u,3913090953u,3913089170u,3913089221u),uvec4(1228734790u,3913089223u,1228734752u,3896180918u),uvec4(3896180919u,3896180920u,3896182790u,3896181404u),uvec4(3888448031u,3888449584u,3888447765u,3913089611u),uvec4(3913089228u,3913089357u,3913090950u,3913089565u),uvec4(3932062262u,3932061879u,3932061880u,3932065162u),uvec4(3932062277u,3932062022u,3932062023u,3845096218u),uvec4(3845096460u,3845095826u,3845096323u,3845096005u));
const uvec4 D_REC2[58] = uvec4[58](uvec4(3845095750u,3845095623u,3845097488u,3874226465u),uvec4(3874230577u,3874226581u,3874226949u,3861545541u),uvec4(3861545286u,3861545287u,3861546896u,3861545108u),uvec4(3337355552u,3874228400u,3874226581u,3874226949u),uvec4(3888449926u,3888448069u,3888447814u,3888447815u),uvec4(3888449414u,3888447644u,3888447619u,3351576864u),uvec4(3888449417u,3888447877u,3888447801u,3888447674u),uvec4(3888447675u,3913089433u,3913091077u,3888448310u),uvec4(3888447671u,3888447800u,3888449553u,3888447669u),uvec4(3888447636u,3351576867u,3913089180u,3913092497u),uvec4(3913089845u,3913089428u,3888447780u,3888448281u),uvec4(3888449549u,3888447647u,1740964128u,3874226358u),uvec4(3874226359u,3874226360u,3874228870u,3874226972u),uvec4(3896181567u,3896180928u,3896181057u,3896183604u),uvec4(3896181140u,3913089798u,3913089692u,3913090307u),uvec4(3913089567u,3913092241u,3932071441u,3932062492u),uvec4(3913089817u,3913090821u,3913089667u,3913089820u),uvec4(3913090833u,3913089589u,3913089300u,3896181289u),uvec4(3896182797u,3888448316u,3888447677u,3888447806u),uvec4(3888449968u,3888447893u,3888448261u,3888448283u),uvec4(3913089695u,3913090184u,3913089308u,3913089465u),uvec4(3913089210u,3913089211u,3913089795u,3932062105u),uvec4(3932063887u,3874227004u,3874226365u,3874226494u),uvec4(3874228618u,3861545756u,3861546509u,3861545475u),uvec4(3861545410u,3861545283u,3861545156u,3861545368u),uvec4(3861550128u,3861545365u,3861545733u,3874233862u),uvec4(3874226757u,3874226502u,3874226503u,3888448159u),uvec4(3888461576u,3888448156u,3888448313u,3888447674u),uvec4(3888447675u,3874226847u,3874228102u,3874226466u),uvec4(3861545114u,3861547536u,3874226847u,3874229000u),uvec4(3874226464u,3874226751u,3874226368u,3874226369u),uvec4(3874227203u,3874226715u,3874228229u,3874226691u),uvec4(3874226469u,3874228232u,3874226741u,3874226452u),uvec4(3861545375u,3861546929u,3861545109u,3861545093u),uvec4(3861545115u,2800484642u,3874229381u,3932064517u),uvec4(3932062227u,3932069126u,3932062365u,3932062524u),uvec4(3932061885u,3932062014u,3932062521u,3932061882u),uvec4(3932061883u,3932063668u,3932061844u,3932061877u),uvec4(3932061844u,3932061852u,3932061893u,3395191110u),uvec4(3932061895u,3913089221u,3913089350u,3913089223u),uvec4(3913090951u,3913089555u,3896181531u,3896184581u),uvec4(3888448282u,3888449548u,3888447890u,3913089605u),uvec4(3913089350u,3913089223u,3913091472u,3874226998u),uvec4(3874226359u,3874226488u,3874226968u,3874228105u),uvec4(3874226437u,3874226332u,3874226489u,3874226362u),uvec4(3874226363u,3861545157u,3861545286u,3861545159u),uvec4(3861546896u,3861545108u,3337355552u,3874233349u),uvec4(3861545791u,3861545152u,3861545281u,3861546758u),uvec4(3861545768u,3861545987u,3861545754u,3861549712u),uvec4(3874229642u,3874227010u,3874226499u,3874226500u),uvec4(3932062492u,3932062471u,3913089704u,3913090063u),uvec4(3888447932u,3888447677u,3888447678u,3888448394u),uvec4(3913089692u,3913090061u,3861545407u,3861545152u),uvec4(3861545153u,3861547142u,3861545768u,3932062492u),uvec4(3932062471u,3913089704u,3913090063u,3888447932u),uvec4(3888447677u,3888447678u,3888448394u,3913089692u),uvec4(3913090061u,3861545407u,3861545152u,3861545153u),uvec4(3861548422u,3861545768u,0u,0u));
uvec4 pageRec(int i) { uvec4 v0 = D_REC0[clamp(i, 0, 57)]; uvec4 v1 = D_REC1[clamp(i - 58, 0, 57)]; uvec4 v2 = D_REC2[clamp(i - 116, 0, 57)]; return i < 58 ? v0 : (i < 116 ? v1 : v2); }
// A snapshot of SAM at each syllable's first glottal pulse, everything the replay needs to start there.
const uvec4 D_ANCH0[43] = uvec4[43](uvec4(1207959552u,0u,805603842u,51200u),uvec4(1208593834u,102401u,990733018u,145408u),uvec4(890380749u,196992u,924214626u,248192u),uvec4(1207959552u,0u,755272710u,51200u),uvec4(889795043u,104467u,1091402037u,151792u),uvec4(1109060524u,303680u,1210081771u,361025u),uvec4(1207959552u,0u,990251146u,67584u),uvec4(1207959552u,0u,1208247544u,36865u),uvec4(1208458348u,73728u,1007448739u,129024u),uvec4(1007735509u,180224u,1207959552u,0u),uvec4(1157938389u,57344u,1207959552u,0u),uvec4(990168146u,43008u,1074393754u,102400u),uvec4(1207959552u,0u,755272710u,51200u),uvec4(805944402u,110592u,1175296338u,155648u),uvec4(1158806732u,208896u,1209478746u,258257u),uvec4(1207959552u,0u,1040467368u,49152u),uvec4(1074323040u,102400u,1124909469u,147456u),uvec4(1058093339u,192992u,1207959552u,0u),uvec4(1075026394u,229376u,1142590054u,299440u),uvec4(907949690u,340400u,1159869332u,387504u),uvec4(1109863423u,446896u,1207959552u,0u),uvec4(1124399088u,49152u,1208619947u,98305u),uvec4(1024652305u,200704u,1207959552u,0u),uvec4(1208300112u,59392u,873038904u,108544u),uvec4(1091473690u,167936u,1207959552u,0u),uvec4(1090798728u,49152u,1208572775u,98305u),uvec4(1207959552u,0u,1006775125u,24595u),uvec4(755287277u,51472u,822533459u,76048u),uvec4(1057564555u,102672u,957325900u,170736u),uvec4(1075278906u,258800u,1207959552u,0u),uvec4(1006775125u,24595u,755287454u,51472u),uvec4(1141299517u,76048u,1024012683u,102672u),uvec4(1108316247u,178448u,991294251u,252176u),uvec4(1207959552u,0u,1006775125u,24595u),uvec4(755287277u,51472u,822533459u,76048u),uvec4(1107895939u,102672u,1007818765u,207120u),uvec4(974613129u,268560u,1207959552u,0u),uvec4(1158195967u,100352u,1192029094u,149524u),uvec4(1041640831u,254368u,1207959552u,0u),uvec4(1006775125u,24595u,755287277u,51472u),uvec4(822533459u,76048u,990456477u,102672u),uvec4(1125115389u,178448u,1041564659u,235792u),uvec4(1207959552u,0u,1006775125u,24595u));
const uvec4 D_ANCH1[43] = uvec4[43](uvec4(755287454u,51472u,1141299517u,76048u),uvec4(1208617978u,106769u,1007770906u,188688u),uvec4(1058440378u,248080u,1207959552u,0u),uvec4(1006775125u,24595u,755287277u,51472u),uvec4(822533459u,76048u,789143511u,104720u),uvec4(1158869963u,219408u,957766045u,258320u),uvec4(1207959552u,0u,1208306998u,55298u),uvec4(1074634128u,153600u,1207959552u,0u),uvec4(1040494975u,51520u,1208609243u,112960u),uvec4(923676042u,155968u,1209103991u,194880u),uvec4(1207959552u,0u,1208350039u,38913u),uvec4(805923959u,77824u,1207959552u,0u),uvec4(1208322745u,57346u,1208582309u,102401u),uvec4(873321165u,151552u,1192338719u,196608u),uvec4(1041650179u,249856u,1207959552u,0u),uvec4(1208246292u,49152u,1208616264u,100354u),uvec4(1158784095u,188416u,1209489756u,241665u),uvec4(1209791518u,294912u,1207959552u,0u),uvec4(1208255423u,38913u,940074623u,83968u),uvec4(990628192u,122880u,1209117857u,182273u),uvec4(1207959552u,0u,1208338832u,55297u),uvec4(1207959552u,0u,973477860u,69632u),uvec4(1124717709u,112640u,1207959552u,0u),uvec4(755272710u,51200u,889795043u,104467u),uvec4(906819148u,145648u,1207959552u,0u),uvec4(1191499534u,55296u,1207959552u,0u),uvec4(1124399133u,57344u,1174993328u,102400u),uvec4(974350033u,221184u,1207959552u,0u),uvec4(1058432490u,262144u,1209758220u,307201u),uvec4(1025461182u,350208u,1143491601u,438272u),uvec4(1210947484u,491521u,1127317722u,536576u),uvec4(1211526846u,583681u,1128233118u,688128u),uvec4(1207959552u,0u,755325626u,63488u),uvec4(1040794128u,110592u,1207959552u,0u),uvec4(1157915920u,51200u,1207959552u,0u),uvec4(872847600u,75776u,1208715999u,120833u),uvec4(1207959552u,0u,1007107872u,76272u),uvec4(1125060829u,164336u,1207959552u,0u),uvec4(1006775125u,24595u,755287277u,51472u),uvec4(822533459u,76048u,1057564555u,102672u),uvec4(1207959552u,0u,1006775125u,24595u),uvec4(755287277u,51472u,822533459u,76048u),uvec4(1057564555u,102672u,0u,0u));
uvec4 pageAnch(int i) { uvec4 v0 = D_ANCH0[clamp(i, 0, 42)]; uvec4 v1 = D_ANCH1[clamp(i - 43, 0, 42)]; return i < 43 ? v0 : v1; }
// Fitted so the voice matches Kokoro reading speech: gain, formant bandwidth, two high formants, a low body resonance, attack, nasal damping, breath and each consonant kind's noise level in dB.
const float FILTER_GAIN = 0.42;
const float BANDWIDTH_SHARE = 0.06;
const vec2 F45 = vec2(3056.0, 3850.0);
const vec2 G45 = vec2(-0.302, 0.229);
const vec3 GLOT = vec3(252.0, 250.0, 0.3125);
const float ATTACK = 0.0012;
const vec2 NASAL = vec2(0.48, 0.48);
const float BREATH_GAIN = 0.048;
const int HOLD_UNITS = 22050;
const int BURST_UNITS = 11025;
const float KIND_DB[9] = float[9](-9.0, -6.0, -15.5, -8.5, -8.0, -20.0, -13.25, -8.5, -17.5);
const float VOICED_BURST_DB = -6.0;
const vec4 BREATH_FIR[8] = vec4[8](vec4(0.0, 0.6860952, 0.72247463, 0.36626124),vec4(-0.01565711, -0.21108936, -0.21189292, -0.11755284),vec4(-0.023236945, 0.030397126, 0.04682788, 0.04291045),vec4(0.029965928, 0.012680881, -0.0049997466, -0.017472837),vec4(-0.020279566, -0.013614859, -0.0024458552, 0.0068199364),vec4(0.010195192, 0.007750158, 0.0024833796, -0.002142499),vec4(-0.0041502886, -0.003406516, -0.0013409122, 0.00023938154),vec4(0.0006891614, 0.00044016537, 0.00012603738, 6.0778234e-06));
#define RING 6
#define PULSES 10
#define TAPS 80
#define BREATH_TAPS 32
#define TAIL_SAMPLES 1400
const float PI = 3.14159265;
const float TAU = 6.2831853;
// Converts SAM's formant units to Hz, from the length of its sine table and of its glottal step.
const float HZ_PER_UNIT = 22050.0 / 3.24 / 256.0;
struct Frame { int period; ivec3 f; ivec3 a; int flags; };
// Always 0, unknown to the compiler: loops over big tables add it so they stay loops, while loops over the ring unroll.
int gZero;
// The replay's place in the phrase, and for each recent phoneme boundary where its blend runs and the phonemes at its two ends.
int gLine, gRecFirst, gRecCount, gP, gFo, gY, gL, gBfEnd;
uint gRec;
bool gEnded, gSteady;
ivec4 gGeo[RING];
uvec2 gRecs[RING];
uint gRecJ[RING];
bool gAct[RING];
// What the voice needs from the replay: the latest glottal pulses with the formants they started, and the last three noise bursts.
int gSRel, gLastPh;
ivec4 gPul[PULSES];
ivec3 gBur[3];
// Tables hold four words to a vector, picked by selects since Windows rejects a runtime index into a vector; the macros repeat their index, so pass them only variables.
uint cWord(uvec4 v, int c) { return c == 0 ? v.x : (c == 1 ? v.y : (c == 2 ? v.z : v.w)); }
#define PACKED(A, i) cWord(A[(i) >> 2], (i) & 3)
#define PACKED16(A, i) ((PACKED(A, (i) >> 1) >> uint(((i) & 1) * 16)) & 0xFFFFu)
#define PAGED(F, i) cWord(F((i) >> 2), (i) & 3)
#define PAGED16(F, i) ((PAGED(F, (i) >> 1) >> uint(((i) & 1) * 16)) & 0xFFFFu)
// Scrambles the bits of a number: the one hash behind the voice's noise, the band's random phases and the backdrop's stars and floor.
uint hash(uint x) {
    x ^= x >> 16;
    x *= 0x7FEB352Du;
    x ^= x >> 15;
    x *= 0x846CA68Bu;
    x ^= x >> 16;
    return x;
}
uint singWord(int q) { return PACKED(D_SING, q); }
int singStart(int q) { return int(singWord(q) & 0x3FFFFFu); }
uint lineWord(int l, int k) { return PACKED(D_LINE, l * 3 + k); }
uint recAt(int i) { return PAGED(pageRec, gRecFirst + min(i, gRecCount - 1)); }
int recPh(uint r) { return int(r & 127u); }
int recLen(uint r) { return int((r >> 7) & 255u); }
int recPeriod(uint r) { return int((r >> 15) & 16383u); }
int recBurst(uint r) { return int(r >> 29); }
uint anchorWord(int a, int k) { return PAGED(pageAnch, a * 2 + k); }
// The time SAM's 6502 code takes, in fiftieths of a sample, from each kind of event to the next glottal step.
int ttGlottal(int old) { return old == 0 ? 162 : (old == 1 ? 226 : (old == 2 ? 225 : (old == 3 ? 200 : 199))); }
// The latest phrase started by a sample, by binary search, since the phrases are stored in the order they start.
int singAt(int s, int zero) {
    int q = -1;
    for (int step = 128; step > zero; step >>= 1) { if (q + step < N_SING && s >= singStart(q + step)) q += step; }
    return q;
}
// SAM's recipe for a record in two vectors: its phoneme's three formants and three amplitudes, then the sung note's period.
void recipe(uint r, out ivec4 lo, out ivec4 hi) {
    int i = recPh(r);
    uint f = PACKED(T_PH, i), a = PACKED(T_PHA, i);
    lo = ivec4(uvec4(f, f >> 8, f >> 16, a) & uvec4(255u, 255u, 255u, 15u));
    hi = ivec4(int((a >> 4) & 15u), int((a >> 8) & 15u), recPeriod(r), 0);
}
// Only the noise pages of Z, ZH, V and DH are kept: their bit patterns set the timing, while unvoiced bursts are timed from a summary.
int sampleByte(int i) { return int((PACKED(T_SAMPLE, i >> 2) >> uint((i & 3) * 8)) & 255u); }
// SAM's amplitude rescale, packed in a vector constant because every array element costs compile time on Windows.
int rescale(int v) { return (v >= 0 && v <= 15) ? int(((v < 8 ? T_RESCALE.x : T_RESCALE.y) >> uint((v & 7) * 4)) & 15u) : 0; }
// Whole-number division done in floats: exact for the small positive numbers the replay divides, and far cheaper on GPUs than integer division.
int divExact(int a, int b) { return int((float(a) + 0.5) / float(b)); }
ivec4 divExact(ivec4 a, int b) { return ivec4((vec4(a) + 0.5) / float(b)); }
// SAM's ramp between two values in closed form, so any frame of it costs the same; like the original, a slow ramp up from zero stays at zero.
ivec4 interpAt(int width, ivec4 start, ivec4 change, int k) {
    ivec4 mag = abs(change), down = ivec4(lessThan(change, ivec4(0)));
    ivec4 v = start + divExact(k * mag, width) * (1 - 2 * down);
    return v * (1 - ivec4(equal(start, ivec4(0))) * ivec4(lessThan(mag, ivec4(width))) * (1 - down));
}
uint recordAtFrame(int p, int f, int x) {
    uint r = recAt(p);
    for (int k = 0; k < 8 + gZero; k++) {
        if (p >= gRecCount) break;
        r = recAt(p);
        if (x < f + recLen(r)) break;
        f += recLen(r);
        p++;
    }
    return r;
}
// Records the blend at the boundary after a phoneme; SAM's blends overlap and feed each other, so the replay keeps the last six.
void pushBound(int j, uint recJ, int bfJ) {
    for (int i = 0; i < RING - 1; i++) { gGeo[i] = gGeo[i + 1]; gRecs[i] = gRecs[i + 1]; gRecJ[i] = gRecJ[i + 1]; gAct[i] = gAct[i + 1]; }
    int last = RING - 1;
    gGeo[last] = ivec4(0, 0, 0, bfJ); gRecs[last] = uvec2(0u); gRecJ[last] = recJ; gAct[last] = false;
    if (j + 1 >= gRecCount) return;
    uint recN = recAt(j + 1);
    int lj = recLen(recJ);
    uint aj = PACKED(T_PHA, recPh(recJ)), an = PACKED(T_PHA, recPh(recN));
    int rj = int((aj >> 12) & 255u), rn = int((an >> 12) & 255u);
    int ob = 0, ib = 0;
    if (rj == rn) { ob = int((aj >> 24) & 15u); ib = int((an >> 24) & 15u); }
    else if (rj < rn) { ob = int((an >> 20) & 15u); ib = int((an >> 24) & 15u); }
    else { ob = int((aj >> 24) & 15u); ib = int((aj >> 20) & 15u); }
    int ts = bfJ - ob;
    uint recTs = ts < bfJ ? (ts < bfJ - lj ? gRecJ[RING - 2] : recJ) : recordAtFrame(j + 1, bfJ, ts);
    gGeo[last] = ivec4(ts, ob, ib, bfJ);
    gRecs[last] = uvec2(recTs, recordAtFrame(j + 1, bfJ, bfJ + ib));
    gAct[last] = ob + ib >= 2;
}
void cursorStart(int line) {
    uint w = lineWord(line, 0);
    gLine = line; gRecFirst = int(w & 0xFFFFu); gRecCount = int(w >> 16); gEnded = false;
    gP = -1; gFo = 0; gY = 0; gRec = 0u; gL = 0; gBfEnd = 0;
    for (int i = 0; i < RING; i++) { gGeo[i] = ivec4(0); gRecs[i] = uvec2(0u); gRecJ[i] = 0u; gAct[i] = false; }
}
void advance(int n) {
    gFo += n;
    gY += n;
    for (int k = 0; k < 256 + gZero; k++) {
        if (gFo < gL) break;
        gFo -= gL;
        gP++;
        if (gP >= gRecCount) { gEnded = true; break; }
        gRec = recAt(gP);
        gL = recLen(gRec);
        gBfEnd += gL;
        pushBound(gP, gRec, gBfEnd);
    }
}
// The tables at a frame as the blends older than a given one left them, which is where that blend starts.
void tablesBefore(int x, uint r, int newer, out ivec4 lo, out ivec4 hi) {
    recipe(r, lo, hi);
    for (int i = newer - 1; i >= gZero; i--) {
        int w = gGeo[i].y + gGeo[i].z;
        if (gAct[i] && gGeo[i].x < x && x < gGeo[i].x + w) {
            ivec4 l1, h1;
            recipe(gRecs[i].x, lo, hi);
            recipe(gRecs[i].y, l1, h1);
            lo = interpAt(w, lo, l1 - lo, x - gGeo[i].x);
            hi = interpAt(w, hi, h1 - hi, x - gGeo[i].x);
            return;
        }
    }
}
Frame frameAt() {
    ivec4 lo, hi;
    recipe(gRec, lo, hi);
    gSteady = true;
    for (int i = RING - 1; i >= gZero; i--) {
        int w = gGeo[i].y + gGeo[i].z;
        if (gAct[i] && gGeo[i].x < gY && gY < gGeo[i].x + w) {
            ivec4 l0, h0, l1, h1;
            for (int k = 0; k < 2 + gZero; k++) {
                ivec4 l, h;
                tablesBefore(k == 0 ? gGeo[i].x : gGeo[i].w + gGeo[i].z, k == 0 ? gRecs[i].x : gRecs[i].y, i, l, h);
                if (k == 0) { l0 = l; h0 = h; } else { l1 = l; h1 = h; }
            }
            lo = interpAt(w, l0, l1 - l0, gY - gGeo[i].x);
            hi = interpAt(w, h0, h1 - h0, gY - gGeo[i].x);
            gSteady = false;
            break;
        }
    }
    int ph = recPh(gRec);
    Frame fr;
    fr.f = lo.xyz;
    fr.a = ivec3(rescale(lo.w), rescale(hi.x), rescale(hi.y));
    fr.period = hi.z;
    fr.flags = int(PACKED(T_PH, ph) >> 24);
    return fr;
}
// A note's whole number of glottal steps, and where each falls: spread so the next pulse starts exactly one period on, which keeps every note in tune.
int stepsOf(int period) { return max(2, (period + 81) / 162); }
int stepPos(int k, int period) { int p = stepsOf(period); return k >= p ? period : divExact(k * (period - 162), p - 1); }
// The time SAM's 6502 code takes, in fiftieths of a sample, from each kind of event to the first bit of an unvoiced burst.
int ttUnvoicedFirst(int old, int firstBit) { return old == 0 ? 167 : (old >= 3 ? 0 : ((old == 2 && firstBit == 1) ? 59 : 60)); }
int popcount8(int b) { b = b - ((b >> 1) & 0x55); b = (b & 0x33) + ((b >> 2) & 0x33); return (b + (b >> 4)) & 15; }
// Each unvoiced consonant's noise burst as SAM plays it: its length after a noise event, the kind of event it ends on, and its first bit.
ivec3 unvoicedBurst(int flags) {
    if (flags == 241) return ivec3(115422, 1, 1);
    if (flags == 226) return ivec3(107454, 2, 0);
    if (flags == 211) return ivec3(99991, 1, 0);
    if (flags == 187) return ivec3(88502, 1, 1);
    if (flags == 124) return ivec3(57757, 2, 0);
    if (flags == 149) return ivec3(69191, 1, 0);
    if (flags == 114) return ivec3(53966, 2, 0);
    if (flags == 27) return ivec3(11955, 1, 0);
    if (flags == 25) return ivec3(11964, 1, 0);
    return ivec3(0, 1, 0);
}
void pushPulse(int start, Frame fr, int ph) {
    for (int k = PULSES - 1; k > 0; k--) gPul[k] = gPul[k - 1];
    gPul[0] = ivec4(start, fr.f.x | (fr.f.y << 8) | (fr.f.z << 16), fr.a.x | (fr.a.y << 4) | (fr.a.z << 8), ph);
}
void pushBurst(int start, int end, int kind, ivec3 f) {
    gBur[2] = gBur[1];
    gBur[1] = gBur[0];
    gBur[0] = ivec3(start, end, kind | (f.x << 5) | (f.y << 13) | (f.z << 21));
}
// Replays one sung phrase with SAM from the nearest syllable snapshot up to a sample, recording the glottal pulses and noise bursts the voice needs.
void walkTo(int q, int s, int zero) {
    gZero = zero;
    int line = int(singWord(q) >> 22);
    int sRel = s - singStart(q);
    gSRel = sRel;
    uint w1 = lineWord(line, 1);
    int a0 = int(w1 & 0xFFFFu), na = int(w1 >> 16), w = 0, tCur = 0;
    uvec2 prev = uvec2(0u), cur = uvec2(0u);
    // The latest snapshot at or before the sample; pulse tails reach past syllable starts, so near one the replay begins a syllable earlier.
    for (int k = 0; k < 64 + zero; k++) {
        if (k >= na) break;
        uvec2 c = uvec2(anchorWord(a0 + k, 0), anchorWord(a0 + k, 1));
        int e = (int(c.x & 0xFFFFFFu) + ttGlottal(int(c.y & 7u))) / 50 - int(c.y >> 29);
        if (e > sRel) break;
        prev = cur; cur = c; tCur = e; w = k;
    }
    uvec2 an = (w > 0 && sRel - tCur < TAIL_SAMPLES) ? prev : cur;
    // Time runs in fiftieths of a sample, about 162 to a glottal step, which keeps SAM's 6502 timing exact.
    int B = int(an.x & 0xFFFFFFu), sc = int(an.x >> 24);
    int old = int(an.y & 7u), off = int((an.y >> 3) & 255u);
    cursorStart(line);
    int pendingAdvance = int((an.y >> 11) & 1023u);
    bool needFrame = true, inPulse = false, pendingVoiced = false;
    Frame Fc;
    int kindFlags = 0, per = 162, P = 2, m0 = 0, Bfirst = 0, i = 0, scc = sc;
    for (int step = 0; step < 2048 + zero; step++) {
        if (pendingAdvance >= 0) { advance(pendingAdvance); pendingAdvance = -1; if (gEnded) break; needFrame = true; }
        if (needFrame) { Fc = frameAt(); needFrame = false; }
        if (pendingVoiced) {
            // Voiced fricative: noise bits from the page of the frame that triggered it, as many bytes as the pitch period allows, each bit timed like SAM's loop and a little longer after a falling edge.
            pendingVoiced = false;
            int page = ((kindFlags & 7) - 1) * 256, nbytes = (stepsOf(Fc.period) >> 4) + 1;
            int first = B, units = -54, last = 0;
            for (int by = 0; by < 16 + zero; by++) {
                if (by >= nbytes) break;
                int b = sampleByte(page + ((off + by) & 255));
                if (by == 0) first = B + 128 - (b >> 7);
                units += 432 + popcount8(b & ~(b << 1) & 254) + (last & (1 - (b >> 7)));
                last = b & 1;
            }
            if (first / 50 > sRel) return;
            pushBurst(first, first + Fc.period, ((kindFlags & 7) - 1) | 16, Fc.f);
            if ((first + units) / 50 > sRel) return;
            B = first + units; old = last == 1 ? 3 : 4; off = (off + nbytes) & 255;
            inPulse = false;
        } else if ((Fc.flags & 248) != 0) {
            // Unvoiced consonant: a noise burst taking two frames, cut to the share the note leaves it; the releases of P and T are cut short and reshaped by place.
            ivec3 bu = unvoicedBurst(Fc.flags);
            int st = B + ttUnvoicedFirst(old, bu.z), endB = st + ((bu.x - 60) * (recBurst(gRec) + 1)) / 8, ph = recPh(gRec);
            if (sRel < st / 50) return;
            if (ph == 67 || ph == 70) pushBurst(st, min(endB, st + BURST_UNITS), ph == 67 ? 5 : 6, Fc.f);
            else pushBurst(st, endB, (Fc.flags & 7) - 1, Fc.f);
            if (sRel < endB / 50) return;
            B = endB; old = bu.y;
            pendingAdvance = 2;
            sc = SAM_SPEED;
            inPulse = false;
        } else {
            if (!inPulse) {
                per = Fc.period; P = stepsOf(per); m0 = (3 * P) >> 2; Bfirst = B + ttGlottal(old); i = 0;
                int ph = recPh(gRec);
                // In a steady vowel each pulse repeats the last one a period on, so the replay jumps to the last few pulses before the sample.
                if (gSteady && Fc.flags == 0 && ph == gLastPh) {
                    int last = gBfEnd - 1;
                    for (int j = 0; j < RING; j++) { if (gAct[j] && gGeo[j].x >= gY) last = min(last, gGeo[j].x); }
                    int k = min((sc + SAM_SPEED * (last - gY) - 1) / P, (50 * sRel + 49 - Bfirst) / per) + 1 - PULSES;
                    if (k > 0) {
                        int over = k * P - sc;
                        if (over >= 0) { pendingAdvance = 1 + over / SAM_SPEED; sc = SAM_SPEED - over % SAM_SPEED; } else sc = -over;
                        B += k * per;
                        continue;
                    }
                }
                scc = sc; inPulse = true;
                // A pulse joins the ring only once it has started, so it never pushes out an older one that is still ringing.
                if (sRel < Bfirst / 50) return;
                pushPulse(Bfirst, Fc, ph);
                // Releases of B, D, G (voiced) and K, and the aspiration after P, T and K, start at the first pulse of their phoneme.
                if (ph != gLastPh) {
                    if (ph == 55 || ph == 58 || ph == 61 || ph == 64 || ph == 73 || ph == 76) pushBurst(Bfirst, Bfirst + BURST_UNITS, (ph == 55 ? 5 : (ph == 58 ? 6 : 7)) | (ph < 70 ? 16 : 0), Fc.f);
                    else if (ph == 68 || ph == 71 || ph == 74 || ph == 77) pushBurst(Bfirst, Bfirst + recLen(gRec) * SAM_SPEED * 162, 8, Fc.f);
                }
                gLastPh = ph;
            }
            // One run of glottal steps on one frame: it ends at a frame change, at the pulse end, or where a voiced fricative cuts in three quarters into the period.
            int iChange = i + scc;
            int iEnd = min(P, iChange);
            bool voiced = Fc.flags != 0 && m0 >= 1 && m0 - 1 >= i && m0 - 1 < iEnd;
            if (voiced) iEnd = m0;
            if (sRel < (Bfirst + stepPos(i, per)) / 50) return;
            // In the run's last step a following voiced fricative may already have started; its branch decides.
            if (50 * sRel + 49 - Bfirst < stepPos(iEnd - (voiced ? 1 : 0), per)) return;
            B = Bfirst + stepPos(iEnd - 1, per);
            old = 0;
            if (voiced) {
                kindFlags = Fc.flags;
                pendingVoiced = true;
                if (iChange == m0) { pendingAdvance = 1; sc = SAM_SPEED; } else sc = scc - (iEnd - i);
            } else if (iChange <= P) {
                pendingAdvance = 1;
                scc = SAM_SPEED;
                i = iEnd;
                if (i >= P) { sc = SAM_SPEED; inPulse = false; }
            } else { sc = scc - (iEnd - i); inPulse = false; }
        }
    }
}
// White noise from integers alone, so every GPU makes the same bits.
float hashNoise(int i) { return float(hash(uint(i)) >> 8) * (2.0 / 16777216.0) - 1.0; }
// Noise colour by kind, up to three resonances: SAM's S, SH, F and TH, H and X, then releases at the lips, tongue tip and velum, and aspiration; H, aspiration and the velum follow the frame's formants.
void noiseShape(int kind, ivec3 f, out vec3 freq, out vec3 bw, out vec3 wgt) {
    vec3 ff = vec3(f) * HZ_PER_UNIT;
    if (kind == 3 || kind == 8) { freq = ff; bw = 300.0 + 3.0 * (40.0 + BANDWIDTH_SHARE * freq); wgt = vec3(1.0, 0.7, 0.5); }
    else if (kind == 0) { freq = vec3(5500.0, 8000.0, 0.0); bw = vec3(2500.0, 2500.0, 1.0); wgt = vec3(1.0, 0.6, 0.0); }
    else if (kind == 1) { freq = vec3(2600.0, 3800.0, 0.0); bw = vec3(900.0, 1500.0, 1.0); wgt = vec3(1.0, 0.4, 0.0); }
    else if (kind == 2) { freq = vec3(2000.0, 5000.0, 8000.0); bw = vec3(3000.0, 4000.0, 4000.0); wgt = vec3(0.6, 0.8, 0.6); }
    else if (kind == 4) { freq = vec3(1300.0, 4200.0, 0.0); bw = vec3(700.0, 1500.0, 1.0); wgt = vec3(1.0, 0.4, 0.0); }
    else if (kind == 5) { freq = vec3(900.0, 2500.0, 0.0); bw = vec3(1800.0, 3000.0, 1.0); wgt = vec3(1.0, 0.7, 0.0); }
    else if (kind == 6) { freq = vec3(4200.0, 6500.0, 0.0); bw = vec3(2500.0, 3500.0, 1.0); wgt = vec3(1.0, 0.8, 0.0); }
    else { freq = vec3(ff.yz, 0.0); bw = vec3(600.0, 900.0, 1.0); wgt = vec3(1.0, 0.6, 0.0); }
    wgt *= inversesqrt(dot(wgt, wgt));
}
// Noise level by kind, set against vowels at about half scale; voiced fricatives and the releases of voiced stops get their own offsets.
float noiseLevel(int kind) {
    int k = kind & 15;
    float db = KIND_DB[k] + ((kind & 16) != 0 && k >= 5 ? VOICED_BURST_DB : 0.0);
    return 0.5 * pow(10.0, db * (1.0 / 20.0));
}
// Each glottal pulse rings the vocal tract's resonances, so the voice sums damped sines per pulse: SAM's three formants, two fixed higher ones and a low body resonance.
float filterVoice(int n, int uRel, int zero) {
    float v = 0.0, env = -1.0;
    for (int k = 0; k < PULSES; k++) {
        ivec4 p = gPul[k];
        int du = uRel - p.x;
        if (p.x < 0 || du < 0) continue;
        vec3 am = vec3(p.z & 15, (p.z >> 4) & 15, (p.z >> 8) & 15) * (1.0 / 15.0);
        // Nasals keep little above the first formant, and K's release is voiceless.
        if (p.w == 27 || p.w == 28 || p.w == 29 || p.w == 79 || p.w == 80) am.yz *= NASAL;
        if (p.w == 73 || p.w == 76) am = vec3(0.0);
        if (env < 0.0) env = du <= HOLD_UNITS ? max(am.x, am.y) : 0.0;
        if (du > 66150) continue;
        float tau = float(du) * (1.0 / 1102500.0);
        vec3 fr = vec3(p.y & 255, (p.y >> 8) & 255, p.y >> 16) * HZ_PER_UNIT;
        vec3 bw = 40.0 + BANDWIDTH_SHARE * fr;
        vec2 bh = 40.0 + BANDWIDTH_SHARE * F45;
        float w = tau < ATTACK ? 0.5 - 0.5 * cos(tau * (PI / ATTACK)) : 1.0;
        float s = dot(am * sqrt(bw * (1.0 / 60.0)) * vec3(1.0, -1.0, 1.0) * exp(-PI * tau * bw), sin(TAU * tau * fr));
        s += dot(max(am.x, am.y) * sqrt(bh * (1.0 / 60.0)) * G45 * exp(-PI * tau * bh), sin(TAU * tau * F45));
        s += am.x * GLOT.z * sqrt(GLOT.y * (1.0 / 60.0)) * exp(-PI * tau * GLOT.y) * sin(TAU * tau * GLOT.x);
        v += w * s;
    }
    // Consonant noise: each noise sample is coloured by the newest burst that covers it, through a short filter with a tapered end.
    bool anyBurst = false;
    for (int b = 0; b < 3; b++) anyBurst = anyBurst || (gBur[b].x >= 0 && gBur[b].x <= uRel && gBur[b].y >= uRel - 25 * (TAPS - 1));
    if (anyBurst) {
        vec3 fq0, bw0, wg0, fq1, bw1, wg1, fq2, bw2, wg2;
        float g0 = 0.0, g1 = 0.0, g2 = 0.0;
        for (int b = 0; b < 3 + zero; b++) {
            ivec3 e = b == 0 ? gBur[0] : (b == 1 ? gBur[1] : gBur[2]);
            vec3 fq, bwb, wg;
            noiseShape(e.z & 15, ivec3((e.z >> 5) & 255, (e.z >> 13) & 255, (e.z >> 21) & 255), fq, bwb, wg);
            // Brings the uniform noise to unit loudness.
            float g = noiseLevel(e.z & 31) * 1.7320508;
            if (b == 0) { fq0 = fq; bw0 = bwb; wg0 = wg; g0 = g; } else if (b == 1) { fq1 = fq; bw1 = bwb; wg1 = wg; g1 = g; } else { fq2 = fq; bw2 = bwb; wg2 = wg; g2 = g; }
        }
        for (int m = 0; m < TAPS + zero; m++) {
            int um = uRel - 25 * m;
            bool in0 = gBur[0].x >= 0 && um >= gBur[0].x && um <= gBur[0].y;
            bool in1 = gBur[1].x >= 0 && um >= gBur[1].x && um <= gBur[1].y;
            bool in2 = gBur[2].x >= 0 && um >= gBur[2].x && um <= gBur[2].y;
            if (!in0 && !in1 && !in2) continue;
            vec3 fq = in0 ? fq0 : (in1 ? fq1 : fq2), bw = in0 ? bw0 : (in1 ? bw1 : bw2), wg = in0 ? wg0 : (in1 ? wg1 : wg2);
            float tm = float(m);
            vec3 al = bw * (PI / 44100.0);
            float taper = m < TAPS - 24 ? 1.0 : 0.5 + 0.5 * cos(float(m - (TAPS - 24)) * (PI / 24.0));
            float h = dot(wg * sqrt(2.0 * (1.0 - exp(-2.0 * al))) * exp(-al * tm), sin(fq * (TAU / 44100.0) * tm)) * taper;
            v += hashNoise(n - m) * (in0 ? g0 : (in1 ? g1 : g2)) * h;
        }
    }
    // Breath: fixed-filtered noise riding on the latest pulse's loudness.
    if (env > 0.0) {
        float b = 0.0;
        for (int m = 0; m < BREATH_TAPS / 4 + zero; m++) { vec4 f = BREATH_FIR[m]; int j = n - 4 * m + 7919; b += f.x * hashNoise(j); b += f.y * hashNoise(j - 1); b += f.z * hashNoise(j - 2); b += f.w * hashNoise(j - 3); }
        v += b * env * BREATH_GAIN;
    }
    return v;
}
// The voice at 44100 Hz, two output samples per SAM sample: the phrase being sung and the one before, each only while it still sounds, since lines run into each other.
float voiceAt(int n, int zero) {
    int s = n >> 1;
    for (int j = 0; j < PULSES; j++) gPul[j] = ivec4(-1);
    // Never runs. Chrome on Windows would spend seconds optimizing the Sound tab; dividing by this known zero makes the optimizer give up at once, and Chrome compiles it unoptimized instead.
    for (int j = 0; j < 1 + zero; j++) { if (zero < 0) s += 7 / (gPul[j].x + 1); }
    int q = singAt(s, zero);
    float v = 0.0;
    for (int k = 0; k < 2 + zero; k++) {
        int qk = q - k;
        if (qk < 0 || s >= singStart(qk) + int(lineWord(int(singWord(qk) >> 22), 2))) break;
        for (int j = 0; j < PULSES; j++) gPul[j] = ivec4(-1);
        for (int j = 0; j < 3; j++) gBur[j] = ivec3(-1, -1, 0);
        gSRel = 0;
        gLastPh = -1;
        walkTo(qk, s, zero);
        v += filterVoice(n, 50 * gSRel + 25 * (n & 1), zero);
    }
    return v * FILTER_GAIN;
}
