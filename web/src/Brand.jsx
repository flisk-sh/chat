import {LOGOS} from '../../src/logos.js';

// Official company marks come from src/logos.js (data URIs, so the page's CSP needs no outside images).
// The Flisk marks (Wolf, Fleet, CLI) are our own files, bundled by Vite as inline data URIs.
import wolf from '../public/flisk-wolf.svg?inline';
import fleet from '../public/fleet.svg?inline';
import flisk from '../public/flisk-cli.svg?inline';

const IMG = {wolf, fleet, flisk, claude: LOGOS.anthropic, openai: LOGOS.openai, openrouter: LOGOS.openrouter, upstash: LOGOS.upstash, e2b: LOGOS.e2b, daytona: LOGOS.daytona, isorun: LOGOS.isorun};
export const BRAND_NAME = {wolf: 'Flisk Wolf', claude: 'Claude', openai: 'OpenAI', openrouter: 'OpenRouter', fleet: 'Fleet', upstash: 'Upstash', e2b: 'E2B', daytona: 'Daytona', isorun: 'Isorun', flisk: 'Flisk'};
// Marks that are dark glyphs on a transparent background need a light plate to stay visible in dark mode.
const PLATE = {claude: '#d97757', openai: '#fff', openrouter: '#fff', upstash: '#fff', isorun: '#fff'};

export function Brand({name, size = 18}) {
  const box = {width: size, height: size, borderRadius: size * 0.24, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle', background: PLATE[name], overflow: 'hidden'};
  const src = IMG[name];
  if (!src) return <span style={{...box, background: '#444', color: '#fff', fontSize: size * 0.5, fontWeight: 700}}>{(BRAND_NAME[name] || name || '?')[0]}</span>;
  const pad = PLATE[name] ? size * 0.16 : 0;
  return <span style={box}><img src={src} alt="" width={size - pad * 2} height={size - pad * 2} style={{objectFit: 'contain', filter: name === 'claude' ? 'brightness(0) invert(1)' : undefined}} /></span>;
}
// For DropdownMenu item icons (they take a component).
export const brandIcon = (name) => function BrandItemIcon() { return <Brand name={name} size={18} />; };
