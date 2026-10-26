/*
 * "Mario" by Inigo Quilez (iq), 2014
 * License: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported
 *          https://creativecommons.org/licenses/by-nc-sa/3.0/
 * Source:  https://www.shadertoy.com/user/iq
 * Bundled with dsh-shadertoy-skin as a preset under that same licence
 * (NOT MIT). See THIRD-PARTY-NOTICES.md in the repository root.
 */
// Created by inigo quilez - iq/2014
// https://www.youtube.com/c/InigoQuilez
// https://iquilezles.org/


// pack 12 pixels into a 24 bit integer
#define pack(a,b,c,d,e,f,g,h,i,j,k,l) (a+4*(b+4*(c+4*(d+4*(e+4*(f+4*(g+4*(h+4*(i+4*(j+4*(k+4*(l))))))))))))
#define _ 0

// 64 bytes (only 48 used)
const int bm[16] = int[16](
	pack( _,_,_,3,3,3,3,3,_,_,_,_ ),
	pack( _,_,3,3,3,3,3,3,3,3,3,_ ),
	pack( _,_,1,1,1,2,2,1,2,_,_,_ ),
	pack( _,1,2,1,2,2,2,1,2,2,2,_ ),
	pack( _,1,2,1,1,2,2,2,1,2,2,2 ),
	pack( _,1,1,2,2,2,2,2,1,1,1,_ ),
	pack( _,_,_,2,2,2,2,2,2,2,_,_ ),
	pack( _,_,1,1,3,1,1,1,_,_,_,_ ),
	pack( _,1,1,1,3,1,1,3,1,1,_,_ ),
	pack( 1,1,1,1,3,3,3,3,1,1,1,1 ),
	pack( 2,2,1,3,2,3,3,2,3,1,2,2 ),
	pack( 2,2,2,3,3,3,3,3,3,2,2,2 ),
	pack( 2,2,3,3,3,3,3,3,3,3,2,2 ),
	pack( _,_,3,3,3,_,_,3,3,3,_,_ ),
	pack( _,1,1,1,_,_,_,_,1,1,1,_ ),
	pack( 1,1,1,1,_,_,_,_,1,1,1,1 )
 );
    
vec3 mario( in vec3 col, in vec2 p ) 
{
    ivec2 q = ivec2(floor(p*10.0)) + ivec2(5,8);
    
    if( q.x<0 || q.x>11 || q.y<0 || q.y>15 ) return col;

	int c = (bm[15-q.y]>>(q.x+q.x)) & 3;
	
	if( c==1 ) col = vec3(0.5,0.4,0.1);
	if( c==2 ) col = vec3(1.0,0.6,0.0);
	if( c==3 ) col = vec3(1.0,0.0,0.0);
	
	return col;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
	vec2 p = (2.0*fragCoord-iResolution.xy)/iResolution.y;

    // background	
	vec2 q = vec2( atan(p.y,p.x), length(p) );
	float f = smoothstep( -0.1, 0.1, sin(q.x*10.0 + iTime) );
	vec3 col = mix( vec3(0.42,0.55,1.0), vec3(0.6,0.7,1.0), f );
	
	// soft shadow
	float sha = 0.0;
	for( int j=0; j<5; j++ )
	for( int i=0; i<5; i++ )
	{		
		vec3 s = mario( vec3(0.0), p + 15.0*vec2(float(i-4),float(j+1))/iResolution.y );
		sha += step(0.1,s.x);
    }			
	sha /= 25.0;	
	col *= 1.0-0.6*sha;

	// color
	col = mario( col, p);

    // vignetting	
	col *= 1.0 - 0.2*length(p);

    // fade in/out	
	col *=       smoothstep(  0.0,  2.0, iTime );
    col *= 1.0 - smoothstep( 55.0, 60.0, iTime );
	
	fragColor = vec4( col, 1.0 );
}
