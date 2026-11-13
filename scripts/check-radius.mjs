import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// One sharp corner (same doctrine as flisk.sh). Every radius in the chat UI is
// var(--radius) (4px, defined once in src/page.js), 0, or a
// true circle (50%). Anything else is a "weird border" and fails CI.
const ALLOWED_PART = /^(?:0|0px|50%|var\(--radius\)|inherit)$/;
const TOKEN_FILE = 'src/page.js';

const SKIP_DIRS = new Set(['.git', 'node_modules']);
const SKIP_FILES = new Set(['assets/css/bootstrap.purged.min.css']);
const SKIP_PREFIXES = ['assets/social/'];
const EXTENSIONS = /\.(?:css|html|js|mjs)$/;

// border-radius / border-top-left-radius / borderRadius (inline JS styles)
const RADIUS_DECL = /(?<![\w-])(border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius|border(?:Top|Bottom|Start|End)?(?:Left|Right|Start|End)?Radius)\s*[:=]\s*['"`]?([^;}"'`\n!]+)/g;
// Any custom property named like a radius token, other than the one allowed.
const RADIUS_TOKEN_DEF = /(?<![\w-])(--(?:bs-)?(?:[\w-]*-)?radius[\w-]*)\s*:\s*([^;}\n]+)/g;

export function findRadiusProblems(source, file = '') {
  const problems = [];
  const lineOf = (index) => source.slice(0, index).split('\n').length;
  if (file.startsWith('scripts/') || file.startsWith('test/')) return problems;
  for (const match of source.matchAll(RADIUS_DECL)) {
    const value = match[2].trim();
    if (value.startsWith('${') || value === '') continue;
    const parts = value.split(/\s*\/\s*|\s+/).filter(Boolean);
    if (!parts.every((part) => ALLOWED_PART.test(part))) {
      problems.push(`${file}:${lineOf(match.index)} ${match[1]}: ${value} (use var(--radius), 0 or 50%)`);
    }
  }
  for (const match of source.matchAll(RADIUS_TOKEN_DEF)) {
    const [, name, raw] = match;
    const value = raw.trim();
    if (file === TOKEN_FILE && (name === '--radius' || (name.startsWith('--bs-') && value === 'var(--radius)'))) continue;
    problems.push(`${file}:${lineOf(match.index)} ${name}: ${value} (only --radius in ${TOKEN_FILE} may set a radius)`);
  }
  return problems;
}

function* walk(root, dir = root) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(root, path);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(root, path);
    } else if (EXTENSIONS.test(name) && !SKIP_FILES.has(rel) && !SKIP_PREFIXES.some((p) => rel.startsWith(p))) {
      yield rel;
    }
  }
}

export function checkSite(root) {
  const problems = [];
  for (const file of walk(root)) problems.push(...findRadiusProblems(readFileSync(join(root, file), 'utf8'), file));
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const problems = checkSite(root);
  if (problems.length) {
    console.error(`Corner radius off the sharp doctrine (same as flisk.sh), ${problems.length} found:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log('Corner radius: every value is var(--radius), 0 or 50%.');
}
