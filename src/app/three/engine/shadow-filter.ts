import * as THREE from 'three';

/**
 * Soft shadows for the single shadow-casting spot (the bay window key light).
 *
 * three's PCFSoftShadowMap is a fixed ~3 texel box (the light's `radius` is ignored), which reads as a hard, slightly
 * stair-stepped edge. This swaps its lookup for a contact-hardening filter (PCSS): a short blocker search sets the
 * penumbra width from the blocker -> receiver distance, then a rotated Vogel disc of PCF taps filters it, with a
 * receiver-plane depth slope so the wide kernel does not acne on the grazing floor. Shadows are crisp where an object
 * touches the floor and soften away from it. Receivers with no blocker nearby exit after the 6 search taps.
 *
 * `light.shadow.radius` is read as the light size in metres. The chunk is global but only the PCFSoft branch changes.
 */

const SEARCH_TAPS = 6;
const FILTER_TAPS = 18;
/** Blocker search radius and penumbra limits, in shadow map texels. */
const SEARCH_TEXELS = 12;
const MIN_TEXELS = 1.2;
const MAX_TEXELS = 16;

let installed = false;

export interface SoftShadowParams {
  /** Shadow camera near / far (m) and half field of view (rad) of the spot. */
  near: number;
  far: number;
  halfAngle: number;
}

export function installSoftShadows(p: SoftShadowParams): void {
  if (installed) {
    return;
  }
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const from = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )');
  const to = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )');
  const fn = chunk.indexOf('float getShadow(');
  if (from < 0 || to < from || fn < 0 || fn > from) {
    return;
  }
  const f = (v: number) => v.toFixed(5);
  const helpers = /* glsl */ `
	#define STUDIO_NEAR ${f(p.near)}
	#define STUDIO_FAR ${f(p.far)}
	#define STUDIO_TAN_HALF ${f(Math.tan(p.halfAngle))}

	float studioLinear( float z ) {
		return STUDIO_NEAR * STUDIO_FAR / ( STUDIO_FAR - z * ( STUDIO_FAR - STUDIO_NEAR ) );
	}

	float studioIgn( vec2 p ) {
		return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
	}

	vec2 studioVogel( int i, int n, float phi ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
		float a = float( i ) * 2.39996323 + phi;
		return r * vec2( cos( a ), sin( a ) );
	}

	float studioPcss( sampler2D shadowMap, vec2 mapSize, float lightSize, vec3 sc ) {
		vec2 texel = 1.0 / mapSize;
		float phi = 6.2831853 * studioIgn( gl_FragCoord.xy );

		// receiver plane: depth change per uv unit, from the screen space derivatives (clamped on silhouettes)
		vec3 ddx = dFdx( sc );
		vec3 ddy = dFdy( sc );
		float det = ddx.x * ddy.y - ddx.y * ddy.x;
		vec2 slope = vec2( 0.0 );
		if ( abs( det ) > 1e-14 ) {
			slope = vec2( ddy.y * ddx.z - ddx.y * ddy.z, ddx.x * ddy.z - ddy.x * ddx.z ) / det;
			slope = clamp( slope * texel, vec2( -0.002 ), vec2( 0.002 ) ) / texel;
		}

		// blocker search
		float sum = 0.0;
		float cnt = 0.0;
		for ( int i = 0; i < ${SEARCH_TAPS}; i ++ ) {
			vec2 o = studioVogel( i, ${SEARCH_TAPS}, phi ) * texel * ${SEARCH_TEXELS.toFixed(1)};
			float z = unpackRGBAToDepth( texture2D( shadowMap, sc.xy + o ) );
			if ( z < sc.z + dot( slope, o ) - 0.0004 ) {
				sum += z;
				cnt += 1.0;
			}
		}
		if ( cnt < 0.5 ) {
			return 1.0;
		}

		// penumbra: light size seen from the blocker, projected on the receiver, in uv
		float dB = studioLinear( sum / cnt );
		float dR = studioLinear( sc.z );
		float w = lightSize * max( dR - dB, 0.0 ) / ( 2.0 * dB * dR * STUDIO_TAN_HALF );
		w = clamp( w, ${MIN_TEXELS.toFixed(1)} * texel.x, ${MAX_TEXELS.toFixed(1)} * texel.x );

		float lit = 0.0;
		for ( int i = 0; i < ${FILTER_TAPS}; i ++ ) {
			vec2 o = studioVogel( i, ${FILTER_TAPS}, phi + 1.7 ) * w;
			lit += texture2DCompare( shadowMap, sc.xy + o, sc.z + dot( slope, o ) );
		}
		return lit / float( ${FILTER_TAPS} );
	}

	`;
  const branch = `#elif defined( SHADOWMAP_TYPE_PCF_SOFT )

			shadow = studioPcss( shadowMap, shadowMapSize, shadowRadius, shadowCoord.xyz );

		`;
  THREE.ShaderChunk.shadowmap_pars_fragment =
    chunk.slice(0, fn) + helpers + chunk.slice(fn, from) + branch + chunk.slice(to);
  installed = true;
}
