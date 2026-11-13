import { icon } from './icons.js';
import { LOGOS } from './logos.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// JSON inside a <script>: no "</script>" or "<!--" can close it early.
const inlineJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// Providers a user can paste one key for. `url` is where that provider shows API keys.
export const PROVIDER_CARDS = [
  { id: 'daytona', label: 'Daytona', url: 'https://app.daytona.io/dashboard/keys', note: 'Sign in with GitHub or Google. Free credit.' },
  { id: 'upstash', label: 'Upstash Box', url: 'https://console.upstash.com', note: 'Free plan.' },
  { id: 'e2b', label: 'E2B', url: 'https://e2b.dev/dashboard', note: 'Free credit (the computer Manus uses).' },
  { id: 'isorun', label: 'Isorun', url: 'https://app.isorun.ai', note: 'Free credit.' },
];

// Every provider fleet can use. Only some can be connected here with one key; the rest are connected in fleet's own cabinet.
export const PROVIDER_NAMES = { daytona: 'Daytona', blaxel: 'Blaxel', upstash: 'Upstash Box', e2b: 'E2B', isorun: 'Isorun', vercel: 'Vercel Sandbox', boat: 'boat', hopx: 'Hopx', runloop: 'Runloop', sprites: 'Fly Sprites', morph: 'Morph', tensorlake: 'Tensorlake', freestyle: 'Freestyle', langsmith: 'LangSmith' };
export const AI_CHOICES = [['wolf', 'Flisk Wolf (free)'], ['anthropic', 'Claude (my API key)'], ['openai', 'OpenAI (my API key)'], ['openrouter', 'OpenRouter (my API key)']];

// The model picker's list when inference.flisk.si/v1/catalog cannot be read. Same shape as that catalogue.
export const DEFAULT_MODELS = [
  { id: 'flisk-wolf-chat', name: 'Flisk Wolf', provider: 'flisk', providerName: 'Flisk', description: 'Free model for everyday tasks and small websites', price: 'free', free: true, key: '', model: 'flisk-wolf-chat' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', provider: 'anthropic', providerName: 'Anthropic', description: 'Fast, strong model for websites, code and everyday work', price: '$$', free: false, key: 'anthropic', model: 'claude-sonnet-5-5' },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', provider: 'anthropic', providerName: 'Anthropic', description: "Anthropic's most capable model for long, demanding tasks", price: '$$$', free: false, key: 'anthropic', model: 'claude-opus-5-5' },
  { id: 'openai', name: 'OpenAI', provider: 'openai', providerName: 'OpenAI', description: 'Any OpenAI model: type its name from your OpenAI model list', price: '$$', free: false, key: 'openai', model: '' },
  { id: 'openrouter', name: 'OpenRouter', provider: 'openrouter', providerName: 'OpenRouter', description: 'Hundreds of models with one OpenRouter key', price: '$', free: false, key: 'openrouter', model: '' },
];

// Keeps only well-formed catalogue entries that chat can actually call.
export function cleanModels(list) {
  const keys = new Set(AI_CHOICES.map(([v]) => (v === 'wolf' ? '' : v)));
  const s = (v, n) => String(v ?? '').slice(0, n);
  const out = (Array.isArray(list) ? list : [])
    .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string' && keys.has(String(m.key ?? '')))
    .slice(0, 60)
    .map((m) => ({ id: s(m.id, 60), name: s(m.name, 60), provider: s(m.provider, 30), providerName: s(m.providerName, 30), description: s(m.description, 140), price: s(m.price, 5), free: m.key === '', key: s(m.key, 20), model: /^[A-Za-z0-9._:\/-]{0,80}$/.test(String(m.model ?? '')) ? s(m.model, 80) : '' }));
  return out.some((m) => m.free) ? out : DEFAULT_MODELS;
}

const CSS = `
:root{--bg:#F7F6F2;--panel:#fff;--side:#F0EEE7;--line:#E3E0D6;--line2:#D3D0C5;--ink:#1B1B18;--dim:#6B6960;--soft:#9A988E;--green:#2F7D4A;--green-d:#246139;--tint:#EAF3DE;--warn:#B54708;--red:#B42318;
--t0:#F6D2C2;--t0i:#712B13;--t1:#F7E3B0;--t1i:#633806;--t2:#C9EDE4;--t2i:#085041;--t3:#F4D3E1;--t3i:#72243E;
--sans:Geist,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;--mono:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace;--radius:4px}
.set{display:grid;grid-template-columns:240px minmax(0,1fr);height:100vh;height:100dvh}
.setnav{background:var(--side);border-right:1px solid var(--line);display:flex;flex-direction:column;gap:2px;padding:14px 12px;overflow:auto}
.setnav>a{display:flex;align-items:center;gap:8px;padding:8px;border-radius:var(--radius);color:var(--ink);text-decoration:none;font-size:14px}.setnav>a:hover,.setnav>a.cur{background:rgba(27,27,24,.06)}
.setnav .brand{margin-bottom:10px}.setnav .who{margin-top:auto}
.setmain{overflow:auto;padding:6vh 28px 60px;max-width:760px;width:100%}
.setmain h1{font:600 32px/1.2 var(--sans);letter-spacing:-.02em;margin:0 0 18px}
.setcard{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:20px 22px;margin-bottom:18px}
.setcard h2{font:600 18px/1.3 var(--sans);margin:0 0 8px}.setcard p{margin:8px 0}
.howto{list-style:decimal;padding-left:22px;margin:8px 0;color:var(--dim)}
.steps{padding-left:0;margin:12px 0;display:flex;flex-direction:column;gap:14px;list-style:none}.steps li::marker{font-weight:600}.steps .row{margin-top:8px}
.cmds{display:grid;gap:8px;margin-top:10px}.cmd{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);padding:10px 12px}.cmd code{font:14px var(--mono);color:var(--ink)}.cmd span{grid-column:1/-1;color:var(--dim);font-size:13px}.cmd .cp{padding:3px 10px;font-size:12px}
.row{display:flex;flex-wrap:wrap;gap:8px}
.setform{display:grid;gap:12px;max-width:440px}.setform label{display:grid;gap:4px;font-size:14px}
.setform select,.setform input{width:100%;padding:8px;border:1px solid var(--line2);border-radius:var(--radius);background:var(--bg);font:inherit}
.keylinks,.hint{color:var(--dim);font-size:13px;margin:0}.flash{background:var(--tint);color:var(--green-d);border:1px solid var(--line);border-radius:var(--radius);padding:8px 12px}
@media(max-width:760px){.set{grid-template-columns:1fr;height:auto}.setnav{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--line)}.setnav .who,.setnav .brand{width:100%;margin:0}body{overflow:auto}}
*{box-sizing:border-box}html,body{height:100%}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 var(--sans);overflow:hidden}
a{color:var(--green)}button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.app{display:grid;grid-template-columns:264px minmax(0,1fr);height:100vh;height:100dvh}
.side{background:var(--side);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;padding:14px 12px;gap:10px}
.brand{display:flex;align-items:center;justify-content:space-between;padding:2px 4px}
.logo{display:inline-flex;align-items:center;gap:9px;font:600 17px/1 var(--mono);color:var(--ink);text-decoration:none;letter-spacing:-.01em}.logo span{color:var(--green)}
.newchat{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:0;border-radius:var(--radius);background:var(--green);color:#fff;font-weight:500;padding:10px;cursor:pointer}
.newchat:hover{background:var(--green-d)}
.search{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line2);padding:6px 4px;color:var(--soft)}
.search input{flex:1;border:0;background:transparent;font:14px var(--sans);color:var(--ink);outline:0;min-width:0}
.histwrap{flex:1;min-height:0;overflow:auto;margin:0 -4px}
#hist{list-style:none;margin:0;padding:0}
#hist li{display:flex;align-items:center;border-radius:var(--radius)}#hist li:hover,#hist li.cur{background:rgba(27,27,24,.06)}
#hist li button{flex:1;min-width:0;text-align:left;background:none;border:0;padding:7px 8px;cursor:pointer;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#hist li .x{flex:none;opacity:0;padding:6px 8px;color:var(--soft)}#hist li:hover .x,#hist li .x:focus-visible{opacity:1}@media (hover:none){#hist li .x{opacity:1}}#hist li .when{flex:none;font-size:11px;color:var(--soft);padding:0 4px}
#hist .none{font-size:13px;color:var(--soft);padding:6px 8px}
.sidesec{border-top:1px solid var(--line);padding:10px 4px 0}
.sidesec h4{margin:0 0 6px;font:500 12px/1.4 var(--sans);color:var(--dim);display:flex;justify-content:space-between;align-items:center}
.sidesec h4 a{font-weight:400;text-decoration:none}
.comps{list-style:none;margin:0;padding:0;font-size:13px;display:flex;flex-wrap:wrap;gap:4px}
.comps li{display:inline-flex;align-items:center;gap:5px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:2px 8px}
.comps .on::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--green)}.comps .off{color:var(--soft);background:transparent;border-style:dashed}
.soon{display:flex;align-items:center;justify-content:space-between;font-size:13px;color:var(--dim);padding:2px 0}
.tag{font-size:11px;border:1px solid var(--line2);border-radius:var(--radius);padding:1px 7px;color:var(--soft)}
.who{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;color:var(--dim);border-top:1px solid var(--line);padding:10px 4px 0}
.who a{color:var(--dim)}
/* Click targets: the small text links get a padded hit area (about 32px tall) without changing the layout. */
.who a,.sidesec h4 a{display:inline-flex;align-items:center;min-height:32px;padding:0 6px;margin:0 -6px}
.main{display:flex;flex-direction:column;min-width:0;min-height:0}
.top{display:none;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--bg)}
.iconbtn{border:1px solid var(--line2);background:var(--panel);border-radius:var(--radius);width:34px;height:34px;display:inline-grid;place-items:center;cursor:pointer}
.scroll{flex:1;min-height:0;overflow:auto}
.col{max-width:780px;margin:0 auto;padding:0 24px}
.welcome{padding:12vh 0 24px}.welcome.gone{display:none}
.welcome h1{font:600 clamp(28px,4vw,36px)/1.15 var(--sans);letter-spacing:-.025em;margin:0 0 8px}
.welcome .sub{color:var(--dim);margin:0 0 22px;max-width:60ch}
.cats{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.cat{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line2);background:var(--panel);border-radius:var(--radius);padding:6px 14px 6px 6px;cursor:pointer;font-size:14px;transition:border-color .15s,transform .15s}
.cat svg{border-radius:var(--radius)}.cat:hover{border-color:var(--ink);transform:translateY(-1px)}.cat[aria-pressed=true]{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.sugg{list-style:none;margin:0;padding:0}
.sugg button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;padding:12px 4px;cursor:pointer;color:var(--ink);font-size:15px}
.sugg li:last-child button{border-bottom:0}.sugg button:hover{color:var(--green)}
#talk{display:flex;flex-direction:column;gap:18px;padding:28px 0 24px}#talk:empty{display:none}
.u{align-self:flex-end;max-width:80%;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:10px 16px;white-space:pre-wrap;overflow-wrap:anywhere}
.turn{display:flex;flex-direction:column;gap:10px}
.a{overflow-wrap:anywhere;line-height:1.65}.a a{font-weight:500;word-break:break-all}.wg{border:1px solid var(--line);background:var(--panel);padding:16px 18px;margin:8px 0 14px;border-radius:var(--radius)}.wtitle{font-weight:600;margin-bottom:10px}.wtop{display:flex;flex-wrap:wrap;align-items:center;gap:6px 24px}.wbig{display:flex;align-items:center;gap:10px}.wtemp{font-size:48px;line-height:1;font-weight:500}.wunit{align-self:flex-start;margin-top:6px;color:var(--dim)}.wmeta{display:flex;flex-direction:column;font-size:13px;color:var(--dim);gap:2px}.wplace{margin-left:auto;font-weight:600;text-align:right}.wline,.wchart{width:100%;height:auto;color:var(--dim);margin-top:10px;display:block}.wdays{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:8px;margin-top:12px;border-top:1px solid var(--line);padding-top:12px}.wday{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:13px}.wday em{font-style:normal;color:var(--dim);font-size:12px}.wlegend{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;margin-top:6px}.wlegend span:before{content:'';display:inline-block;width:10px;height:10px;background:var(--c);margin-right:6px}.wsvc{list-style:none;margin:0;padding:0}.wsvc li{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line)}.wsvc li:first-child{border-top:0}.wsvc span{color:var(--dim);font-size:13px}.wsvc em{margin-left:auto;font-style:normal;font-size:13px}.wdot{width:9px;height:9px;border-radius:50%;background:#bbb;flex:none}.wdot.ok{background:#1F7A3F}.wdot.bad{background:var(--red)}.a p{margin:0 0 .8em}.a p.h{font-weight:600;font-size:1.05em}.a ul,.a ol{margin:0 0 .8em;padding-left:1.3em}.a li{margin:.3em 0}.a code{font-family:var(--mono);font-size:.9em;background:var(--panel);padding:.1em .35em}.a .tw{overflow-x:auto;margin:.4em 0 1em}.a table{border-collapse:collapse;width:100%;min-width:420px}.a th{text-align:left;font-weight:600;padding:.7em 1em .7em 0;border-bottom:1px solid var(--line)}.a td{padding:.7em 1em .7em 0;border-bottom:1px solid var(--line)}
.work{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;color:var(--dim);border-bottom:1px solid var(--line);padding-bottom:8px}
.work .l{display:inline-flex;align-items:center;gap:8px}
.spin{width:14px;height:14px;border-radius:50%;border:2px solid var(--line2);border-top-color:var(--green);animation:spin .8s linear infinite}
.done .spin{animation:none;border-color:var(--green);background:var(--green) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/12px no-repeat}
.fail .spin{animation:none;border-color:var(--red);background:var(--red)}
@keyframes spin{to{transform:rotate(360deg)}}
.stepsbox>summary{list-style:none;cursor:pointer;font-size:13px;color:var(--dim);display:inline-flex;align-items:center;gap:6px;padding:2px 0}
.stepsbox>summary::-webkit-details-marker{display:none}.stepsbox>summary::before{content:'';width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .15s}
.stepsbox[open]>summary::before{transform:rotate(45deg)}
.steps{list-style:none;margin:6px 0 0;padding:0 0 0 2px;display:flex;flex-direction:column}
.st{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;padding:4px 0;font-size:14px;position:relative;animation:rise .2s ease-out}
.st .si{width:24px;height:24px;border-radius:var(--radius);display:grid;place-items:center;background:rgba(27,27,24,.05);color:var(--dim)}
.st .si svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.st .t{padding-top:2px}
.st.live .si{background:#FAEEDA;color:#854F0B;animation:pulse 1.2s ease-in-out infinite}
.st.ok .si{background:var(--tint);color:var(--green)}.st.bad .si{background:#FEF3F2;color:var(--red)}
.st .t{overflow-wrap:anywhere}.st .t code{font:13px var(--mono);background:rgba(27,27,24,.05);border-radius:var(--radius);padding:1px 5px}
.st pre{margin:6px 0 0;font:12px/1.5 var(--mono);color:var(--dim);background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:8px 10px;max-height:160px;overflow:auto;white-space:pre-wrap;word-break:break-word}
@keyframes rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(232,163,59,.45)}70%{box-shadow:0 0 0 6px rgba(232,163,59,0)}}
.sep{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--soft);letter-spacing:.02em}.sep::before,.sep::after{content:'';flex:1;height:1px;background:var(--line)}
.result{display:flex;align-items:center;gap:12px;background:var(--panel);border:1px solid var(--line2);border-radius:var(--radius);padding:12px 14px}
.result .rt{flex:1;min-width:0}.result b{display:block;font-weight:500}.result .url{font-size:13px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.byor{display:block;margin:6px 0 2px;padding:0;border:0;background:none;color:var(--ink);text-decoration:underline;font-size:13px;cursor:pointer}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line2);background:var(--panel);color:var(--ink);border-radius:var(--radius);padding:7px 14px;font-size:14px;text-decoration:none;cursor:pointer;white-space:nowrap}
.btn:hover{border-color:var(--ink)}.btn.go{background:var(--green);border-color:var(--green);color:#fff}.btn.go:hover{background:var(--green-d)}
.btn[disabled]{opacity:.55;cursor:wait}
.err{color:var(--red);background:#FEF3F2;border:1px solid #FECDCA;border-radius:var(--radius);padding:10px 14px;white-space:pre-wrap;font-size:14px}
.note{font-size:13px;color:var(--dim);margin:6px 0 0}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:10px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px}.card b{display:block;font-weight:500}.card small{color:var(--dim)}
.card form{display:flex;gap:8px;margin-top:10px}.card input{flex:1;min-width:0;font:14px var(--mono);padding:8px 10px;border:1px solid var(--line2);border-radius:var(--radius);background:var(--bg);color:inherit}
#setup{padding-bottom:20px}#signin{margin-bottom:20px}
.zq{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.zq .h{font-size:14px;color:var(--dim)}
.trow{display:grid;grid-template-columns:118px minmax(0,1fr);gap:12px;align-items:start}
.trow.new{animation:rise .22s ease-out}
.trow .q{font-size:13px;color:var(--dim);padding-top:8px}
.sqs{display:flex;gap:8px;flex-wrap:wrap}
.trow.done .sq{height:40px;padding:0 10px;flex-direction:row;align-items:center;justify-content:flex-start;font-size:12px}.trow.done .sq svg{display:none}.trow.done .sq>span:last-child{margin:0}
.trow.done .q{padding-top:11px}
.sq{flex:0 0 100px;width:100px;height:84px;border:0;border-radius:var(--radius);padding:9px 10px;font:500 13px/1.25 var(--sans);cursor:pointer;text-align:left;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;transition:transform .16s ease-out,box-shadow .16s,opacity .16s}
.sq svg{border-radius:var(--radius);flex:none}.sq>span:last-child{margin-top:auto}
.sq:hover,.sq:focus-visible{transform:translateY(-3px);box-shadow:0 6px 14px -6px rgba(27,27,24,.35);outline:0}
.sq.on{box-shadow:inset 0 0 0 2px currentColor}
.sq.other{background:transparent;border:1.5px dashed var(--line2);color:var(--dim)}.sq.other.on{border-style:solid;border-color:var(--ink);color:var(--ink);box-shadow:none}
.sqs:has(.sq.on) .sq:not(.on){opacity:.5}.sqs:has(.sq.on) .sq:not(.on):hover{opacity:1}
.subs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;animation:rise .2s ease-out}
.ss{border:0;border-radius:var(--radius);height:34px;padding:0 12px;font:500 13px var(--sans);cursor:pointer;transition:transform .15s,box-shadow .15s}
.ss:hover,.ss:focus-visible{transform:translateY(-2px);outline:0}.ss.on{box-shadow:inset 0 0 0 2px currentColor}
.p0{background:var(--t0);color:var(--t0i)}.p1{background:var(--t1);color:var(--t1i)}.p2{background:var(--t2);color:var(--t2i)}.p3{background:var(--t3);color:var(--t3i)}
.zchips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.zchip{font-size:12px;border:1px solid var(--line2);border-radius:var(--radius);padding:3px 10px;color:var(--soft)}
.zchip.ok{background:var(--ink);border-color:var(--ink);color:#fff}
.zskip{margin-left:auto;font-size:13px;border:1px solid var(--ink);border-radius:var(--radius);background:var(--panel);padding:5px 12px;cursor:pointer}
.zskip.ready{background:var(--green);border-color:var(--green);color:#fff}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.dock{padding:0 0 14px;background:linear-gradient(to bottom,rgba(247,246,242,0),var(--bg) 18px)}
.composer{background:var(--panel);border:1px solid var(--line2);border-radius:var(--radius);box-shadow:0 10px 30px -18px rgba(27,27,24,.35);padding:12px 12px 10px 16px;transition:border-color .15s,box-shadow .15s}
.composer:focus-within{border-color:var(--ink)}
.composer textarea{display:block;width:100%;min-height:52px;max-height:200px;border:0;outline:0;resize:none;background:transparent;font:16px/1.5 var(--sans);color:var(--ink);padding:2px 0 8px}
.composer textarea::placeholder{color:var(--soft)}
.bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--bg);border-radius:var(--radius);padding:4px 11px 4px 5px;font-size:13px;color:var(--ink);cursor:pointer;white-space:nowrap;max-width:240px}
.chip>span{overflow:hidden;text-overflow:ellipsis}.chip svg{border-radius:var(--radius);flex:none}.chip:hover{border-color:var(--ink)}
.chip.plain{padding:4px 11px;color:var(--soft);border-style:dashed;cursor:pointer}.chip.plain:hover{border-color:var(--ink)}
.chip.ico{padding:5px 8px;color:var(--dim)}.chip.ico.on{color:#fff;background:var(--green);border-color:var(--green)}
.talkb{color:#fff!important;background:var(--ink)!important;border-color:var(--ink)!important}.talkb:hover{opacity:.85}
.oracle{position:fixed;inset:0;z-index:100;background:radial-gradient(circle at 50% 40%,#1d2b22 0,#0d110e 70%);color:#eef2ec;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:84px 16px 24px}
.oracle[hidden]{display:none}.otop{position:absolute;top:18px;left:0;right:0;text-align:center;display:flex;flex-direction:column;gap:4px}.otitle{font-weight:600;letter-spacing:.04em}.ohint{font-size:12px;color:#9fb0a3}
.orb{position:relative;width:190px;height:190px;border:0;background:none;cursor:pointer;padding:0;--lv:0}
.orb .ocore{position:absolute;inset:22px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#b9f0c9,#3fa765 45%,#1e5c35 100%);box-shadow:0 0 60px rgba(80,200,120,.35);transform:scale(calc(1 + var(--lv)*.35));transition:transform .08s linear}
.orb .oring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(140,230,170,.35)}
.oracle.listening .oring{animation:oring 1.6s ease-out infinite}.oracle.thinking .ocore{animation:othink 1.1s ease-in-out infinite;filter:hue-rotate(40deg)}
.oracle.speaking .ocore{animation:ospeak .7s ease-in-out infinite alternate}.oracle.idle .ocore{filter:grayscale(.6) brightness(.8)}
@keyframes oring{0%{transform:scale(.9);opacity:1}100%{transform:scale(1.25);opacity:0}}@keyframes othink{50%{transform:scale(.88)}}@keyframes ospeak{from{transform:scale(1)}to{transform:scale(1.12)}}
.ostate{margin:0;font-size:15px;color:#cfe0d3;min-height:22px}.ocap{max-width:600px;width:100%;text-align:center;min-height:90px}
.oyou{margin:0 0 10px;color:#9fb0a3;font-size:14px}.osay{margin:0;font-size:20px;line-height:1.45}
.oend{width:58px;height:58px;border-radius:50%;border:0;background:#c0392b;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}.oend:hover{background:#a93226}
@media (prefers-reduced-motion:reduce){.oracle .ocore,.oracle .oring{animation:none!important}}
.chip.plain.on{color:#fff;background:var(--green);border:1px solid var(--green)}#mic{padding:4px 8px}#mic.rec{color:#fff;background:#c0392b;border-color:#c0392b;animation:micp 1.2s ease-in-out infinite}#mic.busy{opacity:.6;cursor:progress}@keyframes micp{50%{box-shadow:0 0 0 5px rgba(192,57,43,.25)}}
.chev{width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translate(-2px,-2px);flex:none;opacity:.6}
.send{margin-left:auto;width:38px;height:38px;border:0;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;cursor:pointer;flex:none}
.send:hover{background:var(--green-d)}.send[disabled]{background:var(--line2);cursor:wait}
.fine{font-size:12px;color:var(--soft);text-align:center;margin:8px 0 0}
.mp{position:relative}
.scrim{display:none}
.pop{position:absolute;left:0;bottom:calc(100% + 10px);z-index:20;width:min(520px,calc(100vw - 32px));background:var(--panel);border:1px solid var(--line2);border-radius:var(--radius);box-shadow:0 24px 60px -24px rgba(27,27,24,.45);overflow:hidden}
.pop[hidden]{display:none}.pop{max-height:calc(100vh - 150px);overflow:auto}
.pop .ps{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);color:var(--soft)}
.pop .ps input{flex:1;border:0;outline:0;font:14px var(--sans);background:transparent;color:var(--ink);min-width:0}
.pgrid{display:grid;grid-template-columns:78px minmax(0,1fr);grid-template-rows:minmax(0,1fr);max-height:min(420px,48vh);min-height:0}
.rail{border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 0;overflow:auto}
.rail button{width:68px;border-radius:var(--radius);border:1px solid transparent;background:none;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;padding:6px 2px;font-size:11px;line-height:1.2;color:var(--dim)}.rail button>span:last-child{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rail button:hover{background:var(--bg)}.rail button[aria-pressed=true]{background:var(--tint);color:#173404}
.lt{width:26px;height:26px;border-radius:var(--radius);display:grid;place-items:center;font:600 12px/1 var(--mono);background:var(--bg);color:var(--ink);border:1px solid var(--line)}
.mlist{overflow:auto;padding:6px}
.mi{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:start;width:100%;text-align:left;border:0;background:none;border-radius:var(--radius);padding:9px 10px;cursor:pointer}
.mi:hover,.mi.on{background:var(--bg)}.mi svg{border-radius:var(--radius)}
.mi .n{font-weight:500;font-size:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.mi .d{font-size:13px;color:var(--dim)}
.price{font:500 11px var(--mono);color:var(--soft)}.price.free{color:var(--green);background:var(--tint);border-radius:var(--radius);padding:1px 7px}
.mi .ck{width:16px;height:16px;margin-top:3px;opacity:0}.mi.on .ck{opacity:1}
.mgroup{font-size:12px;color:var(--soft);padding:8px 10px 2px}
#byo{border-top:1px solid var(--line);padding:10px 14px 12px;display:flex;flex-direction:column;gap:8px;background:var(--bg)}#byo[hidden]{display:none}
#byo .bystat{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;font-size:12px;color:var(--dim)}#byo #byrm{font:12px var(--mono);text-transform:uppercase;background:transparent;border:1px solid var(--line2);border-radius:var(--radius);padding:0 12px;color:var(--ink);cursor:pointer}#byo #byrm:hover{border-color:var(--red);color:var(--red)}
#byo label{font-size:12px;color:var(--dim)}#byo .byrev{display:flex;gap:8px;align-items:flex-start;margin-top:8px}#byo .byrev input{width:auto;margin-top:2px}
#byo>div{position:relative}.bysug{list-style:none;margin:2px 0 0;padding:0;position:static;max-height:168px;overflow:auto;background:var(--panel);border:1px solid var(--line2);border-radius:var(--radius);box-shadow:0 10px 30px -18px rgba(27,27,24,.35)}.bysug[hidden]{display:none}
.bysug li{display:flex;gap:8px;align-items:baseline;padding:7px 10px;cursor:pointer;font-size:13px}.bysug li:hover{background:var(--bg)}.bysug li b{font:13px var(--mono);font-weight:500;color:var(--ink)}.bysug li span{color:var(--dim);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bysug li.none{cursor:default;color:var(--dim)}.bysug .fr{font-style:normal;font-size:11px;color:var(--green);border:1px solid currentColor;border-radius:var(--radius);padding:0 5px;margin-left:auto}
.bywarn{font-size:12px;color:var(--red);margin-top:4px}.bywarn[hidden]{display:none}
#byo .byacts{display:flex;gap:8px;flex:none}#byo .byacts button{height:30px;padding:0 12px;line-height:1;display:inline-flex;align-items:center}#byo #bysave{font:12px var(--mono);text-transform:uppercase;background:var(--ink);color:var(--panel);border:1px solid var(--ink);border-radius:var(--radius);padding:4px 10px;cursor:pointer}
.errbox.calm,.errbox.calm .err{border-color:var(--line2);background:var(--panel);color:var(--ink)}.errbox.calm .err{border:0}
.errbox{border:1px solid #FECDCA;background:#FEF3F2;border-radius:var(--radius);padding:12px 14px}.errbox .err{border:0;padding:0;background:transparent}.errbox .next{margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.errbox .next small{color:var(--dim);font-size:12px;width:100%}
.files{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px}.files:empty{display:none}.ufiles{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.ufiles .fchip{padding:2px 8px}.ufiles img{width:40px;height:40px;object-fit:cover;border-radius:var(--radius)}.blind{display:flex;gap:10px;align-items:center;justify-content:space-between;font-size:13px;color:var(--dim);border:1px dashed var(--line2);border-radius:var(--radius);padding:8px 12px;margin:6px 0}.fnote{font-size:12px;color:var(--red);align-self:center}.fchip{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--line2);background:var(--bg);border-radius:var(--radius);padding:2px 4px 2px 8px;font:12px var(--mono)}.fchip button{border:0;background:transparent;cursor:pointer;color:var(--dim);font-size:15px;line-height:1}
.attach{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--line);background:var(--bg);border-radius:var(--radius);cursor:pointer;color:var(--ink)}.attach:hover{border-color:var(--ink)}
.asave{display:flex;gap:8px;margin-top:8px}
#byo input{font:14px var(--mono);padding:8px 10px;border:1px solid var(--line2);border-radius:var(--radius);background:var(--panel);color:var(--ink);width:100%}
details.pick .menu{overscroll-behavior:contain}details.pick .menu::after{content:'';position:sticky;bottom:-6px;display:block;height:22px;margin:-22px -6px -6px;background:linear-gradient(to bottom,rgba(255,255,255,0),var(--panel));pointer-events:none}details.pick{position:relative}details.pick>summary{list-style:none}details.pick>summary::-webkit-details-marker{display:none}
details.pick .menu{position:absolute;left:0;bottom:calc(100% + 10px);z-index:20;width:min(330px,calc(100vw - 32px));background:var(--panel);border:1px solid var(--line2);border-radius:var(--radius);box-shadow:0 24px 60px -24px rgba(27,27,24,.45);padding:6px;max-height:min(420px,60vh);overflow:auto;font-size:14px}
.crow{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:var(--radius);cursor:pointer}
.crow:hover{background:var(--bg)}.crow .nm{flex:1;min-width:0}.crow small{display:block;font-size:12px;color:var(--dim);line-height:1.3}
.crow.auto{background:var(--tint)}.crow.auto .nm{color:#173404}.crow.auto small{color:#3B6D11}
.crow.off{cursor:default;color:var(--dim)}.crow.off .lg{filter:grayscale(1);opacity:.55}
.mhead{font-size:12px;color:var(--soft);padding:10px 8px 3px}
.ready{font-size:11px;color:var(--green);background:var(--tint);border-radius:var(--radius);padding:1px 8px}
.cbtn{font-size:12px;border:1px solid var(--line2);border-radius:var(--radius);padding:3px 10px;text-decoration:none;color:var(--ink);background:var(--panel);white-space:nowrap}.cbtn:hover{border-color:var(--ink)}
.sw{appearance:none;-webkit-appearance:none;width:32px;height:18px;border-radius:var(--radius);background:var(--line2);position:relative;cursor:pointer;flex:none;margin:0;transition:background .15s}
.sw::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.sw:checked{background:var(--green)}.sw:checked::after{transform:translateX(14px)}
.lg{width:26px;height:26px;border-radius:var(--radius);background:#fff;border:1px solid var(--line);display:inline-grid;place-items:center;flex:none;overflow:hidden}.lg img{width:70%;height:70%;object-fit:contain}
.comps .lg{width:16px;height:16px;border-radius:var(--radius);border:0}
.limit{display:flex;gap:12px;align-items:flex-start;background:var(--panel);border:1px solid var(--line2);border-radius:var(--radius);padding:14px 16px}
.limit .ic{width:34px;height:34px;border-radius:var(--radius);background:var(--t1);color:var(--t1i);display:grid;place-items:center;flex:none}
.limit b{display:block;font-weight:500}.limit p{margin:2px 0 10px;color:var(--dim);font-size:14px}.limit .acts{display:flex;gap:8px;flex-wrap:wrap}
.ring{width:50px;height:50px;border-radius:50%;border:4px solid #E8A33B;display:grid;place-items:center;font:500 11px var(--mono);color:var(--dim);flex:none}
.vres{background:var(--panel);border:1px solid var(--line2);border-radius:var(--radius);overflow:hidden}
.vres video{display:block;width:100%;max-height:440px;background:#0f1426}
.vres .vb{display:flex;align-items:center;gap:10px;padding:10px 14px;flex-wrap:wrap}.vres .vb b{flex:1;font-weight:500;min-width:140px}
@media (max-width:860px){
.trow{grid-template-columns:1fr}.trow .q,.trow.done .q{padding:0}.sqs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.sq{width:auto;height:76px}
.app{grid-template-columns:1fr}.side{position:fixed;inset:0 auto 0 0;width:min(300px,86vw);z-index:40;transform:translateX(-105%);transition:transform .2s;box-shadow:20px 0 60px -30px rgba(0,0,0,.4)}
.side{visibility:hidden;transition:transform .2s,visibility 0s linear .2s}.side.open{transform:none;visibility:visible;transition:transform .2s}.scrim{display:block;position:fixed;inset:0;z-index:39;background:rgba(27,27,24,.35);opacity:0;pointer-events:none;transition:opacity .2s}.side.open~.scrim{opacity:1;pointer-events:auto}
.composer{position:relative}.mp{position:static}.pop{left:0;right:0;width:auto}.top{display:flex}.col{padding:0 16px}.welcome{padding:6vh 0 16px}
.u{max-width:90%}.composer .chip.plain:not(#voice){display:none}.pop{max-height:calc(100vh - 140px);overflow:auto}}
@media (prefers-color-scheme:dark){
:root{color-scheme:dark;--bg:#161614;--panel:#1F1F1C;--side:#1B1B18;--line:#2E2D28;--line2:#3D3C35;--ink:#F1EFE8;--dim:#A8A598;--soft:#7C7A70;--green:#3E9A5E;--green-d:#4BB06E;--tint:#1F3326;--warn:#E0924A;--red:#F2746B;
--t0:#4A2A1D;--t0i:#F6D2C2;--t1:#4A3A18;--t1i:#F7E3B0;--t2:#1D3F37;--t2i:#C9EDE4;--t3:#47263A;--t3i:#F4D3E1}
#hist li:hover,#hist li.cur{background:rgba(255,255,255,.07)}
.st .si,.st .t code{background:rgba(255,255,255,.07)}.st.live .si{background:#4A3A18;color:#F7C873}.st.bad .si{background:#3A1F1C}
.err{background:#3A1F1C;border-color:#6B2A24}
.dock{background:linear-gradient(to bottom,rgba(22,22,20,0),var(--bg) 18px)}
.rail button[aria-pressed=true],.crow.auto .nm{color:#CFE8BE}.crow.auto small{color:#9CCB7B}
details.pick .menu::after{background:linear-gradient(to bottom,rgba(31,31,28,0),var(--panel))}
.sq:hover,.sq:focus-visible,.composer,.pop,details.pick .menu{box-shadow:0 10px 30px -18px rgba(0,0,0,.7)}
.zchip.ok,.talkb{color:#161614!important}
}
@media (min-width:861px){.only-m{display:none}}
/* Phones: the composer buttons fit on one row with the send button (Fleet shows its icon only, no arrows). */
@media (max-width:520px){.composer{padding:10px 8px 8px 10px}.composer .bar{gap:3px}.composer .bar .chev{display:none}.composer .bar .chip{gap:5px;padding-right:7px}#sbsum{display:none}.composer .bar #mic,.composer .bar #voice,.composer .bar #orbbtn,.composer .bar .attach{width:32px;padding-left:0;padding-right:0;justify-content:center}.composer .send{width:36px;height:36px}}
`;

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap">';
const FAVICON = `data:image/svg+xml,${encodeURIComponent(icon('chat', 32).replace(' aria-hidden="true" focusable="false"', ''))}`;

const DESC = 'Flisk Chat: describe a website, an app, a system of services or a task. It runs on a real computer and gives you the result and a live link. Free model, sign in with GitHub.';
const shell = (title, body, script = '', index = false) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(title)}</title>${index ? `<meta name="robots" content="index,follow"><link rel="canonical" href="https://chat.flisk.si/"><meta property="og:title" content="Flisk Chat"><meta property="og:description" content="${DESC}"><meta property="og:url" content="https://chat.flisk.si/"><meta name="twitter:card" content="summary">` : '<meta name="robots" content="noindex">'}<link rel="icon" href="${FAVICON}"><meta name="theme-color" content="#F7F6F2"><meta name="description" content="${index ? DESC : 'Ask for a task or a website. Flisk Chat gets a real computer and does it.'}">${FONTS}<style>${CSS}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;

const LOGO = `<a class="logo" href="/">${icon('chat', 26)}<b style="font-weight:inherit">chat<span>.</span>flisk</b></a>`;

export const homePage = () =>
  shell(
    'Flisk Chat',
    `<main class="col" style="padding-top:14vh;overflow:auto;height:100%">${LOGO}<h1 style="font:600 36px/1.15 var(--sans);letter-spacing:-.025em;margin:28px 0 10px">Ask for a website, an app or a whole system. It gets a computer.</h1><p style="color:var(--dim);max-width:56ch">Type what you want. Flisk's free model plans it, runs it on a real computer from your own sandbox account, and gives you the result and a live link. Bigger asks work too: several services that run together, started and checked on the computer.</p><a class="btn go" href="/auth/start">Sign in with GitHub</a></main>`,
  );

export const messagePage = (title, text) =>
  shell(`${title} · chat`, `<main class="col" style="padding-top:14vh;overflow:auto;height:100%">${LOGO}<h1 style="font:600 32px/1.2 var(--sans);letter-spacing:-.02em;margin:28px 0 8px">${esc(title)}</h1><p style="color:var(--dim)">${esc(text)}</p><a class="btn" href="/">Back to chat</a></main>`);

// Where a person manages the AI behind their pull request reviews (@flisk-chat review). The key is never shown again.
export const GITHUB_APP_URL = 'https://github.com/apps/flisk-chat';
export const KEY_PAGES = { openrouter: ['OpenRouter', 'https://openrouter.ai/keys'], anthropic: ['Claude', 'https://console.anthropic.com/settings/keys'], openai: ['OpenAI', 'https://platform.openai.com/api-keys'] };

export const reviewsPage = ({ login, saved, stored, limit, flash, error = '', form = {} }) =>
  shell(
    'Settings · chat',
    `<div class="set">
<nav class="setnav" aria-label="Settings"><div class="brand">${LOGO}</div><a href="/">${icon('chat', 16)}Back to chat</a><a href="#github" class="cur">GitHub reviews</a><a href="#ai">AI for reviews</a><a href="https://fleet.flisk.si/console?section=providers" target="_blank" rel="noopener">Computers</a><a href="https://flisk.si" target="_blank" rel="noopener">Flisk</a><div class="who"><span>@${esc(login)}</span><a href="/auth/signout">Sign out</a></div></nav>
<main class="setmain">
<h1>Settings</h1>
${error ? `<p class="flash" role="alert" style="background:#FCE8E6;color:var(--red)">Not saved: ${esc(error)}</p>` : flash === 'saved' ? '<p class="flash" role="status">Saved. Your next review uses this AI.</p>' : flash === 'deleted' ? '<p class="flash" role="status">Deleted. Reviews use the free Flisk Wolf model again.</p>' : ''}
<section id="github" class="setcard"><h2>Get a code review on any pull request</h2>
<p>Chat reads your pull request and writes a review on GitHub: a summary, comments on the exact lines, one-click fixes and a verdict. You ask for it by writing a comment.</p>
<ol class="steps"><li><b>1. Install the app once.</b> Pick the repos you want it on.<br><span class="row"><a class="btn go" href="${GITHUB_APP_URL}/installations/new" target="_blank" rel="noopener">Install the GitHub App</a></span></li>
<li><b>2. Open any pull request on GitHub</b> and write one of these in the comment box at the bottom, then press Comment.
<div class="cmds">
<div class="cmd"><code>@flisk-chat review</code><button type="button" class="btn cp" data-copy="@flisk-chat review">Copy</button><span>Reads the changes and posts a review. Takes about 20 seconds.</span></div>
<div class="cmd"><code>@flisk-chat review run</code><button type="button" class="btn cp" data-copy="@flisk-chat review run">Copy</button><span>The same, and also runs the project's lint and tests on one of your computers. The results are posted when it finishes.</span></div>
<div class="cmd"><code>@flisk-chat auto on</code><button type="button" class="btn cp" data-copy="@flisk-chat auto on">Copy</button><span>Reviews every new pull request in this repo by itself. Write <code>@flisk-chat auto off</code> to stop.</span></div>
</div></li>
<li><b>3. Read the review</b> on the pull request. Nothing is merged or changed for you.</li></ol>
<p class="hint">Only people who can push to the repo can ask. Reviews use the AI chosen below. A model can be wrong, so read before you merge.</p>
<p class="row"><a class="btn" href="${GITHUB_APP_URL}" target="_blank" rel="noopener">View on GitHub</a><a class="btn" href="https://github.com/settings/installations" target="_blank" rel="noopener">Manage installed repos</a></p></section>
<section id="ai" class="setcard"><h2>AI for reviews</h2>
<p class="cur-ai">${saved ? `Reviews for <b>@${esc(login)}</b> use <b>${esc(saved.model)}</b> (${esc(saved.ai)}) with your key. You pay your provider; no daily limit.` : `Reviews for <b>@${esc(login)}</b> use the free Flisk Wolf model: ${limit} a day, and only the first part of a big diff.`}</p>
${stored ? `<form method="post" action="/reviews/save" class="setform">
<label>AI<select name="ai" id="aisel">${Object.entries(KEY_PAGES).map(([v, [n]]) => `<option value="${v}"${(form.ai || saved?.ai) === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
<p class="keylinks">${Object.entries(KEY_PAGES).map(([v, [n, u]]) => `<a class="keylink" href="${u}" target="_blank" rel="noopener" data-for="${v}"${(saved?.ai || 'openrouter') === v ? '' : ' hidden'}>Get your ${n} key</a>`).join('')}</p>
<label>Model name<input name="model" required maxlength="80" placeholder="e.g. anthropic/claude-sonnet-5.5" value="${esc(form.model ?? saved?.model ?? '')}"></label>
<label>API key<input name="key" type="password" required minlength="8" maxlength="300" autocomplete="off"></label>
<p class="hint">The key is encrypted before it is stored and never shown again.</p>
<p class="row"><button class="btn go" type="submit">Save for reviews</button></p></form>` : '<p class="hint">Saving a key is not switched on yet.</p>'}
${saved ? '<form method="post" action="/reviews/delete"><button class="btn" type="submit">Delete my saved key</button></form>' : ''}
</section>
</main></div>`,
    `document.querySelectorAll('.cp').forEach((b)=>b.addEventListener('click',()=>{const t=b.dataset.copy;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{b.textContent='Copied';setTimeout(()=>{b.textContent='Copy';},1500);}).catch(()=>{b.textContent='Select and copy';});}));const sel=document.getElementById('aisel');if(sel){const show=()=>document.querySelectorAll('.keylink').forEach((a)=>{a.hidden=a.dataset.for!==sel.value});sel.addEventListener('change',show);show();}`,
  );

// Starter ideas per kind, for people who never write code.
const CATS = [
  { id: 'website', label: 'Website', ideas: ['Make me a one-page website for a coffee shop called Moon Roast.', 'A wedding page with the date, the place and an RSVP form.', 'A menu page for my bakery, with prices and opening hours.'] },
  { id: 'app', label: 'Small app', ideas: ['Build a tip calculator web page with a dark theme.', 'A countdown timer page for my product launch on December 1.', 'A simple to-do list page that remembers my items.'] },
  { id: 'system', label: 'System', ideas: ['Build a back office with orders, stock, billing and customers as separate services, and check they all answer.', 'A booking platform: bookings, staff, payments and reminders as four services.', 'Start a support suite with tickets, users, notifications and reports, and show me which parts are healthy.'] },
  { id: 'answer', label: 'Answer', ideas: ['What is the 40th Fibonacci number? Check it with Python.', 'How many working days are there between today and New Year?', 'Turn 72 degrees Fahrenheit into Celsius and show the formula.'] },
  { id: 'video', label: 'Video', ideas: ['Make a 30-second promo video for my coffee shop called Moon Roast.', 'A short explainer video: how to brew pour-over coffee in 5 steps.', 'A birthday video for my friend Sam with 4 happy messages.'] },
  { id: 'check', label: 'Check a page', ideas: ['Fetch https://flisk.si and tell me its page title.', 'Is https://example.com up, and how fast does it answer?', 'List the links on https://flisk.sh.'] },
];

// Zachman questions for the tree of squares: each answer has its own smaller squares, shown when you hover it.
const ZQ = [
  ['What', 'What is it?', [['A website', 'website', ['Landing page', 'Shop', 'Portfolio']], ['A small app', 'app', ['Calculator', 'Tracker', 'Booking form']], ['A system of services', 'system', ['Orders, stock, billing', 'Customers and invoices', 'A back office']], ['A video', 'video', ['Promo', 'Explainer', 'Social short']], ['An answer or check', 'answer', ['Maths', 'Facts from the web', 'Check a site']]]],
  ['Who', 'Who is it for?', [['Customers', '', ['People nearby', 'Online buyers', 'Regulars']], ['My team', '', ['In the office', 'Remote', 'Clients too']], ['Just me', '', ['Personal', 'Learning', 'A hobby']], ['Kids or students', '', ['Under 10', 'Teens', 'University']]]],
  ['Why', 'Why do you need it?', [['Sell more', '', ['Bookings', 'Online orders', 'Sign-ups']], ['Look professional', '', ['Trust', 'Show my work', 'Press']], ['Try an idea', '', ['Test demand', 'Show investors', 'Just for fun']], ['Save time', '', ['Automate a chore', 'All in one place', 'Fewer emails']]]],
  ['Where', 'Where should it live?', [['A live link', '', ['Phone first', 'Desktop first', 'Both']], ['Code I can keep', '', ['One HTML file', 'A GitHub repo', 'A zip']], ['Only this chat', '', ['Plain text', 'A table', 'A chart']], ['Social media', '', ['Instagram', 'TikTok', 'LinkedIn']]]],
  ['When', 'When do you need it?', [['Right now', '', ['Rough is fine', 'Just start', 'Under a minute']], ['A quick draft', '', ['Placeholder text', 'One page', 'A sketch']], ['Polished, no rush', '', ['Real wording', 'Tested', 'Pixel-perfect']], ['This week', '', ['By Monday', 'By Friday', 'Weekend']]]],
  ['How', 'How should it feel?', [['Calm', '', ['Light', 'Soft colours', 'Lots of space']], ['Bold', '', ['Dark', 'Big type', 'Bright colours']], ['Playful', '', ['Rounded', 'Fun colours', 'Animated']], ['Classic', '', ['Serif type', 'Black and white', 'Elegant']]]],
];

const APP_JS = `
const $=(id)=>document.getElementById(id);
const talk=$('talk'),form=$('ask'),box=$('task'),go=$('go'),setup=$('setup'),signin=$('signin'),hist=$('hist'),scroller=$('scroll'),welcome=$('ideas');
const MODELS=window.__MODELS__||[],IC=window.__ICONS__||{},LG=window.__LOGOS__||{};
let history=[];
const down=()=>{scroller.scrollTop=scroller.scrollHeight;};
const node=(tag,cls,text)=>{const d=document.createElement(tag);if(cls)d.className=cls;if(text!=null)d.textContent=text;return d;};
const inl=(p,s)=>{String(s).split(/(\\*\\*[^*]+\\*\\*|\\x60[^\\x60]+\\x60|https?:\\/\\/[^\\s)|]+)/).forEach(t=>{if(!t)return;
  if(t.slice(0,2)==='**'&&t.length>4)p.appendChild(node('b','',t.slice(2,-2)));
  else if(t.charCodeAt(0)===96&&t.length>2)p.appendChild(node('code','',t.slice(1,-1)));
  else if(/^https?:\\/\\//.test(t)){const a=document.createElement('a');a.href=t;a.target='_blank';a.rel='noopener';a.textContent=t;p.appendChild(a);}
  else p.appendChild(document.createTextNode(t));});};
const LI=/^\\s*([-*]|\\d+[.)])\\s+(.*)/;
const md=(n,text)=>{n.textContent='';const L=String(text).split('\\n');let i=0;
  const cells=(l)=>l.trim().replace(/^\\|/,'').replace(/\\|$/,'').split('|').map(c=>c.trim());
  while(i<L.length){const l=L[i];
    if(!l.trim()){i++;continue;}
    if(l.trim().charAt(0)==='|'&&i+1<L.length&&L[i+1].indexOf('-')>=0&&/^[\\s:|-]+$/.test(L[i+1])){
      const t=node('table'),th=node('thead'),tb=node('tbody'),hr=node('tr');
      cells(l).forEach(c=>{const h=node('th');inl(h,c);hr.appendChild(h);});th.appendChild(hr);i+=2;
      while(i<L.length&&L[i].trim().charAt(0)==='|'){const r=node('tr');cells(L[i]).forEach(c=>{const d=node('td');inl(d,c);r.appendChild(d);});tb.appendChild(r);i++;}
      t.append(th,tb);const w=node('div','tw');w.appendChild(t);n.appendChild(w);continue;}
    const m=LI.exec(l);
    if(m){const ul=node(/\\d/.test(m[1])?'ol':'ul');for(let x=LI.exec(L[i]);i<L.length&&x;x=i<L.length?LI.exec(L[i]):null){const li=node('li');inl(li,x[2]);ul.appendChild(li);i++;}n.appendChild(ul);continue;}
    const h=/^#{1,4}\\s+(.*)/.exec(l);
    if(h){const e=node('p','h');inl(e,h[1]);n.appendChild(e);i++;continue;}
    const buf=[l];i++;
    while(i<L.length&&L[i].trim()&&!LI.test(L[i])&&L[i].trim().charAt(0)!=='|'&&!/^#{1,4}\\s/.test(L[i])){buf.push(L[i]);i++;}
    const p=node('p');inl(p,buf.join(' '));n.appendChild(p);}
};
// Widgets: the server sends {type:'widget', kind, data}; WIDGET_DRAW[kind] builds the card from DOM nodes (no innerHTML from data).
const SVGNS='http://www.w3.org/2000/svg';
const sv=(tag,attrs,kids)=>{const e=document.createElementNS(SVGNS,tag);Object.keys(attrs||{}).forEach(k=>e.setAttribute(k,attrs[k]));(kids||[]).forEach(c=>e.appendChild(c));return e;};
const skyIcon=(kind,size)=>{const s=sv('svg',{viewBox:'0 0 40 40',width:size,height:size,'aria-hidden':'true'});
  const sun=()=>sv('circle',{cx:20,cy:20,r:8,fill:'#F5A623'}),cloud=(y)=>sv('path',{d:'M11 '+(y+10)+'a6 6 0 0 1 1-12 8 8 0 0 1 15 2 5 5 0 0 1 0 10z',fill:'#B8C0CC'});
  const drops=(c)=>[14,21,28].forEach(x=>s.appendChild(sv('line',{x1:x,y1:31,x2:x-2,y2:36,stroke:c,'stroke-width':2.4,'stroke-linecap':'round'})));
  if(kind==='sun')s.appendChild(sun());
  else if(kind==='partly'){s.appendChild(sv('circle',{cx:15,cy:15,r:7,fill:'#F5A623'}));s.appendChild(cloud(14));}
  else if(kind==='rain'){s.appendChild(cloud(10));drops('#2F6FDE');}
  else if(kind==='snow'){s.appendChild(cloud(10));[14,21,28].forEach(x=>s.appendChild(sv('circle',{cx:x,cy:33,r:1.8,fill:'#7FA6D8'})));}
  else if(kind==='storm'){s.appendChild(cloud(10));s.appendChild(sv('path',{d:'M21 28l-4 6h4l-2 5 6-8h-4l2-3z',fill:'#F5A623'}));}
  else s.appendChild(cloud(14));
  return s;};
const fmtT=(v,u)=>v==null?'–':Math.round(v)+'°';
const dayName=(d,i)=>i===0?'Today':new Date(d+'T12:00:00').toLocaleDateString(undefined,{weekday:'short'});
const WIDGET_DRAW={
  weather(d){const c=node('div','wg wgw');
    const top=node('div','wtop'),big=node('div','wbig');big.appendChild(skyIcon(d.now.icon,56));big.appendChild(node('span','wtemp',fmtT(d.now.temp)));big.appendChild(node('span','wunit',d.unit));
    const meta=node('div','wmeta');[d.now.sky,'Feels like '+fmtT(d.now.feels),'Humidity '+(d.now.humidity==null?'–':d.now.humidity+'%'),'Wind '+(d.now.wind==null?'–':Math.round(d.now.wind)+' '+d.wind)].forEach(t=>meta.appendChild(node('span','',t)));
    top.append(big,meta,node('div','wplace',d.place));c.appendChild(top);
    const ts=d.hours.map(h=>h.temp).filter(v=>v!=null);
    if(ts.length>1){const lo=Math.min.apply(null,ts),hi=Math.max.apply(null,ts),W=560,H=70,pad=14,n=d.hours.length;
      const xy=(h,i)=>[pad+i*(W-2*pad)/(n-1),H-pad-(h.temp-lo)/((hi-lo)||1)*(H-2*pad-10)];
      const g=sv('svg',{viewBox:'0 0 '+W+' '+(H+18),class:'wline',role:'img','aria-label':'Temperature over the next 24 hours'});
      g.appendChild(sv('polyline',{points:d.hours.map((h,i)=>xy(h,i).join(',')).join(' '),fill:'none',stroke:'currentColor','stroke-width':2}));
      d.hours.forEach((h,i)=>{const p=xy(h,i);const a=sv('text',{x:p[0],y:p[1]-6,'text-anchor':'middle','font-size':11,fill:'currentColor'});a.textContent=Math.round(h.temp)+'°';g.appendChild(a);const b=sv('text',{x:p[0],y:H+14,'text-anchor':'middle','font-size':10,fill:'#888'});b.textContent=h.time;g.appendChild(b);});
      c.appendChild(g);}
    const row=node('div','wdays');d.days.forEach((x,i)=>{const e=node('div','wday');e.appendChild(node('b','',dayName(x.date,i)));e.appendChild(skyIcon(x.icon,30));e.appendChild(node('span','',fmtT(x.high)+' / '+fmtT(x.low)));e.appendChild(node('em','',x.rain==null?'':x.rain+'% rain'));e.title=x.sky;row.appendChild(e);});
    c.appendChild(row);return c;},
  chart(d){const c=node('div','wg');if(d.title)c.appendChild(node('div','wtitle',d.title+(d.unit?' ('+d.unit+')':'')));
    const W=560,H=220,L=44,R=12,T=12,B=28,all=[];d.series.forEach(s=>s.values.forEach(v=>{if(v!=null)all.push(v);}));
    let lo=Math.min.apply(null,all),hi=Math.max.apply(null,all);if(d.type==='bar')lo=Math.min(0,lo);if(lo===hi){hi=lo+1;}{const raw=(hi-lo)/4,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p,st=(f<=1?1:f<=2?2:f<=5?5:10)*p;lo=Math.floor(lo/st)*st;hi=Math.ceil(hi/st)*st;}
    const n=d.labels.length,X=(i)=>d.type==='bar'?L+(i+.5)*(W-L-R)/n:L+i*(W-L-R)/(n-1),Y=(v)=>T+(hi-v)/(hi-lo)*(H-T-B);
    const COL=['#1F7A3F','#2F6FDE','#E0852B','#B03A8C'];
    const g=sv('svg',{viewBox:'0 0 '+W+' '+H,class:'wchart',role:'img','aria-label':d.title||'Chart'});
    for(let k=0;k<=4;k++){const v=lo+(hi-lo)*k/4,y=Y(v);g.appendChild(sv('line',{x1:L,y1:y,x2:W-R,y2:y,stroke:'currentColor','stroke-opacity':.12}));const t=sv('text',{x:L-6,y:y+4,'text-anchor':'end','font-size':11,fill:'#888'});t.textContent=Math.abs(v)>=100?Math.round(v):Math.round(v*10)/10;g.appendChild(t);}
    const step=Math.ceil(n/8);d.labels.forEach((l,i)=>{if(i%step)return;const t=sv('text',{x:X(i),y:H-8,'text-anchor':'middle','font-size':11,fill:'#888'});t.textContent=l;g.appendChild(t);});
    const bw=Math.max(3,(W-L-R)/n/(d.series.length+1));
    d.series.forEach((s,si)=>{const col=COL[si%4];
      if(d.type==='bar')s.values.forEach((v,i)=>{if(v==null)return;const x=X(i)-bw*d.series.length/2+si*bw,y0=Y(0),y1=Y(v);g.appendChild(sv('rect',{x:x,y:Math.min(y0,y1),width:bw*.9,height:Math.abs(y0-y1),fill:col}));});
      else{const pts=s.values.map((v,i)=>v==null?null:X(i)+','+Y(v)).filter(Boolean);g.appendChild(sv('polyline',{points:pts.join(' '),fill:'none',stroke:col,'stroke-width':2.2,'stroke-linejoin':'round'}));}});
    c.appendChild(g);if(d.series.length>1||d.series[0].name){const lg=node('div','wlegend');d.series.forEach((s,i)=>{const l=node('span','',s.name||('Series '+(i+1)));l.style.setProperty('--c',COL[i%4]);lg.appendChild(l);});c.appendChild(lg);}return c;},
  services(d){const c=node('div','wg');c.appendChild(node('div','wtitle','Services · '+d.runtime+(d.ready?' · all ready':'')));
    const ul=node('ul','wsvc');d.services.forEach(x=>{const li=node('li'),ok=/ready|running|ok|healthy/i.test(x.status);li.appendChild(node('i','wdot '+(ok?'ok':/error|fail|crash/i.test(x.status)?'bad':'wait')));li.appendChild(node('b','',x.name));li.appendChild(node('span','',[x.type,x.port?':'+x.port:''].filter(Boolean).join(' ')));li.appendChild(node('em','',x.status));ul.appendChild(li);});
    c.appendChild(ul);return c;},
};
const drawWidget=(ev)=>{try{const f=WIDGET_DRAW[ev.kind];return f?f(ev.data):null;}catch(e){return null;}};
const linkify=(n,text)=>{n.textContent='';String(text).split(/(https?:\\/\\/[^\\s)]+)/).forEach(p=>{if(/^https?:\\/\\//.test(p)){const a=document.createElement('a');a.href=p;a.target='_blank';a.rel='noopener';a.textContent=p;n.appendChild(a);}else n.appendChild(document.createTextNode(p));});};
const add=(n)=>{talk.appendChild(n);down();return n;};
const userMsg=(t)=>add(node('div','u',t));
const asstMsg=(t)=>{const d=node('div','a');md(d,t);return add(d);};
const errMsg=(t)=>add(node('div','err',t));
const chatting=(on)=>{welcome.classList.toggle('gone',on);};
// Past chats live in this browser only (localStorage), never on our server.
const KEY='chat_history_v1';let chatId=null;
const loadAll=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){return [];}};
const saveAll=(all)=>{try{localStorage.setItem(KEY,JSON.stringify(all.slice(0,30)));}catch(e){}};
const saveChat=()=>{if(!history.length)return;const prev=loadAll().find(c=>c.id===chatId);const all=loadAll().filter(c=>c.id!==chatId);if(!chatId)chatId=Date.now().toString(36);all.unshift({id:chatId,at:(prev&&prev.at)||Date.now(),title:history[0].content.split('\\n')[0].slice(0,80),msgs:history});saveAll(all);drawHist();};
function drawHist(){const q=($('q').value||'').toLowerCase();const all=loadAll().filter(c=>!q||c.title.toLowerCase().includes(q)||(c.msgs||[]).some(m=>String(m.content||'').toLowerCase().includes(q)||(m.files||[]).some(n=>String(n).toLowerCase().includes(q))));hist.textContent='';
  if(!all.length){hist.appendChild(node('li','none',q?'No chats match.':'Your chats show here. They stay in this browser.'));return;}
  all.forEach(c=>{const li=node('li',c.id===chatId?'cur':''),b=node('button','',c.title),x=node('button','x','×');b.type=x.type='button';b.title=c.title;b.onclick=()=>{openChat(c);closeSide();};x.title='Delete this chat';x.setAttribute('aria-label','Delete chat: '+c.title);x.onclick=()=>{saveAll(loadAll().filter(o=>o.id!==c.id));if(chatId===c.id)newChat();drawHist();};li.append(b);if(c.at){const w=node('span','when',new Date(c.at).toLocaleDateString(undefined,{month:'short',day:'numeric'}));w.title=new Date(c.at).toLocaleString();li.append(w);}li.append(x);hist.appendChild(li);});}
$('q').addEventListener('input',drawHist);
function newChat(){history=[];go.disabled=false;treeAnswer=null;box.placeholder='What should it do?';chatId=null;talk.textContent='';setup.hidden=true;signin.hidden=true;chatting(false);drawHist();box.focus();}
// Result cards for a finished website or video. Built in run() and again when a saved chat is reopened, from the link in its answer.
function siteCard(link){const r=node('div','result');r.innerHTML=IC.website.replace('<svg ','<svg width="34" height="34" style="border-radius:var(--radius);flex:none" aria-hidden="true" ')+'<div class="rt"><b>Your page is live</b><div class="url"></div></div>';r.querySelector('.url').textContent=link.replace(/^https?:\\/\\//,'');
  const cp=node('button','btn','Copy link');cp.type='button';cp.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(link).then(()=>{cp.textContent='Copied';setTimeout(()=>cp.textContent='Copy link',1500);});};
  const op=node('a','btn go','Open');op.href=link;op.target='_blank';op.rel='noopener';r.append(cp,op);return r;}
function videoCard(video){const v=node('div','vres'),pl=document.createElement('video');pl.controls=true;pl.preload='metadata';pl.playsInline=true;pl.src=video+'#t=0.8';pl.style.aspectRatio='16/9';pl.addEventListener('loadedmetadata',down);
  const vb=node('div','vb');vb.innerHTML=svgAt(IC.video,30);vb.appendChild(node('b','','Your video is ready'));
  const dl=node('a','btn go','Download mp4');dl.href=video;dl.download='flisk-video.mp4';
  const cp=node('button','btn','Copy link');cp.type='button';cp.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(video).then(()=>{cp.textContent='Copied';setTimeout(()=>cp.textContent='Copy link',1500);});};
  vb.append(cp,dl);v.append(pl,vb);return v;}
// Own-site result links in a saved answer: /s/<16 hex> is a website, /v/<16 hex>.mp4 a video.
function resultLinks(text){const o=location.origin.replace(/[.]/g,'[.]'),site=new RegExp(o+'/s/[a-f0-9]{16}','g'),vid=new RegExp(o+'/v/[a-f0-9]{16}[.]mp4','g'),t=String(text||'');return {site:(t.match(site)||[])[0]||'',video:(t.match(vid)||[])[0]||''};}
function openChat(c){newChat();chatId=c.id;history=c.msgs.slice();chatting(true);history.forEach(m=>{if(m.role!=='user'){asstMsg(m.content);const rl=resultLinks(m.content);if(rl.site)add(siteCard(rl.site));if(rl.video)add(videoCard(rl.video));return;}const u=userMsg(m.content);if(u&&Array.isArray(m.files)&&m.files.length){const fl=node('div','ufiles');m.files.forEach(n=>fl.appendChild(node('span','fchip',String(n))));u.appendChild(fl);}});const lastM=history[history.length-1];if(lastM&&lastM.role==='user'){const ic=node('div','errbox');ic.appendChild(node('div','err','This task was interrupted: the page was closed before it finished.'));const n=node('div','next');const rb=node('button','btn go','Run it again');rb.type='button';rb.onclick=()=>{ic.remove();run(lastM.content);};n.appendChild(rb);ic.appendChild(n);add(ic);}drawHist();}
$('newchat').onclick=()=>{newChat();closeSide();};
const side=$('side');const closeSide=()=>side.classList.remove('open');$('sideopen').onclick=()=>side.classList.add('open');$('sideclose').onclick=closeSide;$('scrim').onclick=closeSide;
// Kinds of task: each pill shows its starter ideas.
const CATS=window.__CATS__||[],sugg=$('sugg');
const showCat=(id)=>{document.querySelectorAll('.cat').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cat===id)));const c=CATS.find(x=>x.id===id)||CATS[0];sugg.textContent='';c.ideas.forEach(t=>{const li=node('li'),b=node('button','',t);b.type='button';b.onclick=()=>{box.value=t;fit();box.focus();};li.appendChild(b);sugg.appendChild(li);});};
document.querySelectorAll('.cat').forEach(b=>b.onclick=()=>showCat(b.dataset.cat));showCat(CATS[0]&&CATS[0].id);
box.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
const fit=()=>{box.style.height='auto';box.style.height=Math.min(box.scrollHeight,200)+'px';};box.addEventListener('input',fit);
// Model picker. The list comes from inference.flisk.si/v1/catalog (server side), so new models need no chat change.
const aiSel=$('ai'),byo=$('byo'),byoKey=$('byokey'),byoModel=$('byomodel'),mpBtn=$('mpbtn'),pop=$('mppop'),mlist=$('mlist'),rail=$('rail'),mq=$('mq');
let cur=MODELS[0],railOn='';
// One OpenRouter model as a row of its own: picking it fills in the model id, so only the key is left to paste.
const orModel=(id,name,ppm,ctx)=>({id:'or:'+id,name:(name||id.split('/').pop()).replace(/^[^:]*: /,''),provider:'openrouter',providerName:'OpenRouter',description:id+(ctx?' · '+Math.round(ctx/1000)+'K context':''),price:ppm===0?'free':ppm<1?'$':ppm<5?'$$':'$$$',free:false,key:'openrouter',model:id,orFree:ppm===0});
let OR=[];
try{const v=sessionStorage.getItem('chat_model');const m=MODELS.find(x=>x.id===v)||(v&&v.indexOf('or:')===0?orModel(v.slice(3),'',1,0):null);if(m)cur=m;}catch(e){}
const svgAt=(svg,size)=>svg.replace('<svg ','<svg width="'+size+'" height="'+size+'" aria-hidden="true" ');
const tile=(m,size)=>m.provider==='flisk'?svgAt(IC.wolf,size):LG[m.provider]?'<span class="lg" style="width:'+size+'px;height:'+size+'px" aria-hidden="true"><img src="'+LG[m.provider]+'" alt=""></span>':'<span class="lt" aria-hidden="true">'+((m.providerName||'?').replace(/[^A-Z]/g,'').slice(0,2)||(m.providerName||'?')[0])+'</span>';
const providers=[...new Map(MODELS.map(m=>[m.provider,m])).values()];
function drawRail(){rail.textContent='';const all=node('button');all.type='button';all.title='All models';all.setAttribute('aria-label','All models');all.setAttribute('aria-pressed',String(!railOn));all.innerHTML='<span class="lt" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 1h5v5H1zM8 1h5v5H8zM1 8h5v5H1zM8 8h5v5H8z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></span><span>All</span>';all.onclick=()=>{railOn='';drawRail();drawList();};rail.appendChild(all);
  providers.forEach(p=>{const b=node('button');b.type='button';b.title=p.providerName;b.setAttribute('aria-label',p.providerName);b.setAttribute('aria-pressed',String(railOn===p.provider));b.innerHTML=tile(p,28);b.appendChild(node('span','',p.providerName));b.onclick=()=>{railOn=p.provider;if(railOn==='openrouter')loadOr();drawRail();drawList();};rail.appendChild(b);});}
// OpenRouter models to show: with no search, the newest model of each big vendor (OpenRouter lists newest first), then the free ones; with a search, every word must match.
const OR_TOP=['anthropic','google','openai','deepseek','moonshotai','qwen','x-ai','mistralai','meta-llama'];
const orShown=(q)=>{const w=q.split(' ').filter(Boolean);if(w.length)return OR.filter(m=>{const h=(m.model+' '+m.name).toLowerCase();return w.every(x=>h.indexOf(x)>=0);}).sort((a,b)=>a.model.length-b.model.length).slice(0,60);
  const top=OR_TOP.map(v=>OR.find(m=>m.model.indexOf(v+'/')===0&&!m.orFree)).filter(Boolean);return top.concat(OR.filter(m=>m.orFree&&top.indexOf(m)<0).slice(0,12));};
function drawList(){const q=mq.value.trim().toLowerCase();mlist.textContent='';let last='';
  const ors=(railOn==='openrouter'||(!railOn&&q))?orShown(q):[];
  MODELS.filter(m=>(!railOn||m.provider===railOn)&&(!q||(m.name+' '+m.providerName+' '+m.description).toLowerCase().includes(q))).concat(ors).forEach(m=>{
    const g=m.orFree!==undefined?'OpenRouter models · your key':m.providerName+(m.free?'':' · your key');
    if(g!==last){last=g;mlist.appendChild(node('div','mgroup',g));}
    const b=node('button','mi'+(m.id===cur.id?' on':''));b.type='button';b.setAttribute('role','option');b.setAttribute('aria-selected',String(m.id===cur.id));
    b.innerHTML=tile(m,28)+'<span><span class="n"></span><span class="d"></span></span><svg class="ck" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const n=b.querySelector('.n');n.textContent=m.name;const pr=node('span','price'+(m.free||m.orFree?' free':''),m.free?'free':m.price);n.appendChild(pr);b.querySelector('.d').textContent=m.description;
    b.onclick=()=>{pick(m);if(m.free)closePop();else{(m.model?byoKey:byoModel).focus();}};mlist.appendChild(b);});
  if(railOn==='openrouter'&&!OR.length)mlist.appendChild(node('div','mgroup','Loading OpenRouter models…'));
  else if(railOn==='openrouter'&&!q)mlist.appendChild(node('div','mgroup','Search above for any of '+OR.length+' OpenRouter models.'));
  if(!mlist.children.length)mlist.appendChild(node('div','mgroup','No model matches.'));}
const SUGG={anthropic:['claude-sonnet-5-5','claude-opus-5-5','claude-haiku-5-5','claude-fable-5-2'],openai:['gpt-5','gpt-5-mini','gpt-4.1','gpt-4o','o4-mini'],openrouter:['google/gemini-2.5-pro','deepseek/deepseek-chat','moonshotai/kimi-k2','qwen/qwen3-coder','meta-llama/llama-3.3-70b-instruct']};
// API keys are never kept as plain text. They are encrypted with AES-GCM; the encryption key is a non-extractable WebCrypto key held in IndexedDB,
// so the key text cannot be read out of the browser's storage (localStorage, a copied profile or a storage dump). Other settings stay in localStorage.
const VAULT={};let vdb=null,master=null,vq=Promise.resolve();
const isSecret=(k)=>k.indexOf('chat_key_')===0;
const idbReq=(r)=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
async function vaultSave(k,v){if(!vdb||!master)return;
  if(!v){await idbReq(vdb.transaction('v','readwrite').objectStore('v').delete('k:'+k));return;}
  const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},master,new TextEncoder().encode(v));
  await idbReq(vdb.transaction('v','readwrite').objectStore('v').put({iv,ct},'k:'+k));}
const vaultReady=(async()=>{try{
  vdb=await new Promise((res,rej)=>{const r=indexedDB.open('chat_vault',1);r.onupgradeneeded=()=>r.result.createObjectStore('v');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  master=await idbReq(vdb.transaction('v').objectStore('v').get('master'));
  if(!master){master=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await idbReq(vdb.transaction('v','readwrite').objectStore('v').put(master,'master'));}
  const keys=await idbReq(vdb.transaction('v').objectStore('v').getAllKeys());
  for(const id of keys){if(String(id).indexOf('k:')!==0)continue;const rec=await idbReq(vdb.transaction('v').objectStore('v').get(id));
    try{VAULT[String(id).slice(2)]=new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:rec.iv},master,rec.ct));}catch(e){}}
  // Keys saved by an older version as plain text: encrypt them, then delete the plain copy.
  try{for(const k of Object.keys(localStorage).filter(isSecret)){const v=localStorage.getItem(k);if(v&&!VAULT[k]){VAULT[k]=v;await vaultSave(k,v);}localStorage.removeItem(k);}}catch(e){}
}catch(e){vdb=null;master=null;}})();
const lsGet=(k)=>{if(isSecret(k))return VAULT[k]||'';try{return localStorage.getItem(k)||'';}catch(e){return '';}};
const lsSet=(k,v)=>{if(isSecret(k)){if(v)VAULT[k]=v;else delete VAULT[k];vq=vq.then(()=>vaultReady).then(()=>vaultSave(k,VAULT[k]||'')).catch(()=>{});return;}
  try{if(v)localStorage.setItem(k,v);else localStorage.removeItem(k);}catch(e){}};
const byStat=$('bystat'),byRm=$('byrm'),bySave=$('bysave'),bySug=$('bysug'),byWarn=$('bywarn');let orLoaded=false,sugList=[],orIds=[],orNames={},orSees={};
// Can the chosen model look at a picture? Wolf cannot; OpenRouter says per model; Claude and OpenAI models can.
const canSee=()=>{if(!cur||cur.free)return false;if(cur.key!=='openrouter')return true;const id=cur.model||byoModel.value.trim();return id in orSees?orSees[id]:true;};
// Search every word of what was typed against the id and the name; best matches first (starts with, then contains), free ones marked.
const rank=(q)=>{const w=q.toLowerCase().split(' ').filter(Boolean);if(!w.length)return sugList.slice(0,40);
  return sugList.map(id=>{const h=(id+' '+(orNames[id]||'')).toLowerCase();if(!w.every(x=>h.indexOf(x)>=0))return null;const tail=id.toLowerCase().split('/').pop();return [w.every(x=>tail.indexOf(x)===0||id.toLowerCase().indexOf(x)===0)?0:1,id.length,id];}).filter(Boolean).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).slice(0,40).map(x=>x[2]);};
const drawSug=()=>{bySug.textContent='';if(cur.free||cur.model||!sugList.length){bySug.hidden=true;return;}const r=rank(byoModel.value.trim());
  r.forEach(id=>{const li=node('li','');li.setAttribute('role','option');const a=node('b','',id);li.appendChild(a);if(orNames[id])li.appendChild(node('span','',orNames[id]));if(/:free$/.test(id))li.appendChild(node('i','fr','free'));if(orSees[id])li.appendChild(node('i','fr','sees images'));
    li.onmousedown=(e)=>{e.preventDefault();byoModel.value=id;lsSet('chat_model_'+cur.key,id);bySug.hidden=true;byWarn.hidden=true;byoKey.focus();};bySug.appendChild(li);});
  if(!r.length)bySug.appendChild(node('li','none','No model matches. Check the spelling, or paste the exact id from openrouter.ai/models.'));bySug.hidden=false;byoModel.setAttribute('aria-expanded','true');};
const fillSugg=(list)=>{sugList=list;if(document.activeElement===byoModel)drawSug();};
// The id OpenRouter needs is vendor/name. If the typed one is not on the list, find the one that was meant (particle-1:free -> particle-ai/particle-1:free).
const notOn=(f)=>'That model is not on OpenRouter. '+(f.near&&f.near.length?'Did you mean: '+f.near.join(', ')+'?':'Pick one from the list, or copy the exact id from openrouter.ai/models.');
const fixModel=(m)=>{if(cur.key!=='openrouter'||!sugList.length||!m||sugList.indexOf(m)>=0)return {ok:true,model:m};
  const t=sugList.filter(id=>id.endsWith('/'+m));if(t.length===1)return {ok:true,model:t[0],fixed:true};
  const near=rank(m).slice(0,4);return {ok:false,near};};
const stat=()=>{const has=!!(cur&&!cur.free&&lsGet('chat_key_'+cur.key));byStat.textContent=has?'Encrypted and saved in this browser only, never on our servers.':'Encrypted and saved in this browser only once you paste it, never on our servers.';byRm.hidden=!has;};
async function loadOr(){if(orLoaded)return;orLoaded=true;try{const r=await fetch('https://openrouter.ai/api/v1/models');const j=await r.json();const d=(j.data||[]).filter(x=>x&&x.id);d.forEach(x=>{orNames[x.id]=x.name||'';orSees[x.id]=((x.architecture&&x.architecture.input_modalities)||[]).indexOf('image')>=0;});const ids=d.map(x=>x.id).sort();if(!ids.length){orLoaded=false;return;}
  OR=d.map(x=>orModel(x.id,x.name,(Number(x.pricing&&x.pricing.prompt)||0)*1e6,x.context_length));orIds=ids;if(cur.key==='openrouter')fillSugg(ids);const same=OR.find(m=>m.id===cur.id);if(same&&same.name!==cur.name)pick(same);else if(!pop.hidden)drawList();}catch(e){orLoaded=false;}}
byoKey.addEventListener('input',()=>{if(!cur.free){lsSet('chat_key_'+cur.key,byoKey.value.trim());stat();}});
byoModel.addEventListener('input',()=>{shownName();if(!cur.free&&!cur.model)lsSet('chat_model_'+cur.key,byoModel.value.trim());byWarn.hidden=true;drawSug();});
byoModel.addEventListener('focus',drawSug);byoModel.addEventListener('blur',()=>{bySug.hidden=true;byoModel.setAttribute('aria-expanded','false');const f=fixModel(byoModel.value.trim());
  if(f.ok&&f.fixed){byoModel.value=f.model;lsSet('chat_model_'+cur.key,f.model);}else if(!f.ok&&byoModel.value.trim()){byWarn.textContent=notOn(f);byWarn.hidden=false;}});
bySave.onclick=()=>{const m=byoModel.value.trim(),k=byoKey.value.trim();if(!k){byoKey.focus();byStat.textContent='Paste your API key first.';return;}const f=fixModel(m);if(!f.ok){byWarn.textContent=notOn(f);byWarn.hidden=false;byoModel.focus();return;}
  if(f.fixed)byoModel.value=f.model;lsSet('chat_key_'+cur.key,k);if(!cur.model)lsSet('chat_model_'+cur.key,byoModel.value.trim());stat();byStat.textContent='Saved ✓ encrypted in this browser only, never on our servers.';if($('byrev').checked){const mm=byoModel.value.trim();fetch('/api/review-ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ai:cur.key,model:mm,key:k})}).then((r)=>r.json().then((j)=>{byStat.textContent=r.ok?'Saved ✓ in this browser, and encrypted on our server for PR reviews.':'Saved in this browser. PR reviews: '+(j.error||'not saved'); })).catch(()=>{byStat.textContent='Saved in this browser. PR reviews: not saved.';});}bySave.textContent='Saved ✓';setTimeout(()=>{bySave.textContent='Save';},1500);closePop();box.focus();};
byRm.onclick=()=>{lsSet('chat_key_'+cur.key,'');lsSet('chat_model_'+cur.key,'');byoKey.value='';if(!cur.model)byoModel.value='';stat();byoKey.focus();};
// The button names what will run: a typed model name replaces the generic provider name.
function shownName(){const t=byoModel.value.trim();mpBtn.querySelector('.mpname').textContent=!cur.free&&!cur.model&&t?cur.providerName+' · '+t.split('/').pop():cur.name;}
function pick(m){cur=m;aiSel.value=m.key||'wolf';byo.hidden=m.free;byoModel.value=m.model||(m.free?'':lsGet('chat_model_'+m.key));byoModel.parentElement.hidden=!!m.model;
  byoKey.value=m.free?'':lsGet('chat_key_'+m.key);byWarn.hidden=true;fillSugg(m.key==='openrouter'&&orIds.length?orIds:SUGG[m.key]||[]);if(m.key==='openrouter')loadOr();stat();
  $('byokeylabel').textContent='Your '+m.providerName+' API key';$('byor').hidden=m.key!=='openrouter';
  mpBtn.querySelector('.mpname').textContent=m.name;shownName();mpBtn.querySelector('.ti').innerHTML=tile(m,22);try{sessionStorage.setItem('chat_model',m.id);}catch(e){}drawList();}
const openPop=()=>{pop.hidden=false;mpBtn.setAttribute('aria-expanded','true');drawRail();drawList();mq.value='';mq.focus();};
const closePop=()=>{if(pop.hidden)return;pop.hidden=true;mpBtn.setAttribute('aria-expanded','false');};
mpBtn.onclick=()=>pop.hidden?openPop():closePop();mq.addEventListener('input',()=>{if(mq.value.trim())loadOr();drawList();});
// The picker lives inside the composer form: Enter there must never send the task. Search: choose the first match.
// Model name: on to the key. Key (or both filled): done, close the picker and go back to the task box.
pop.addEventListener('keydown',(e)=>{if(e.key!=='Enter')return;const t=e.target;if(t.tagName!=='INPUT')return;e.preventDefault();e.stopPropagation();
  if(t===mq){const first=mlist.querySelector('.mi');if(first)first.click();}else if(t===byoModel&&!bySug.hidden&&bySug.firstChild&&bySug.firstChild.querySelector('b')){bySug.firstChild.onmousedown(e);}else if(t===byoModel&&!byoKey.value.trim()&&!byoKey.parentElement.parentElement.hidden){byoKey.focus();}else{closePop();box.focus();}});
pick(cur);
// The encrypted keys load a moment after the page: fill the key field when they arrive.
vaultReady.then(()=>{if(!cur.free&&!byoKey.value)pick(cur);});
// Computers menu.
const auto=$('auto'),opts=[...document.querySelectorAll('input[name=sb]')],sum=$('sbsum');
const picked=()=>opts.filter(o=>o.checked).map(o=>o.value);
const syncSb=()=>{const p=picked();auto.checked=!p.length;sum.textContent=p.length?p.map(x=>document.querySelector('input[value='+x+']').dataset.label).join(', '):'Fleet: cheapest first';};
auto.onchange=()=>{if(auto.checked)opts.forEach(o=>o.checked=false);syncSb();};opts.forEach(o=>o.onchange=syncSb);syncSb();
const pk=document.querySelector('details.pick');
document.addEventListener('click',e=>{if(pk&&pk.open&&!pk.contains(e.target))pk.open=false;if(!pop.hidden&&e.target.isConnected&&!$('mp').contains(e.target))closePop();});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!pop.hidden){closePop();mpBtn.focus();}else if(pk&&pk.open){pk.open=false;pk.querySelector('summary').focus();}else closeSide();});
document.querySelectorAll('a[href="#setup"]').forEach(a=>a.onclick=(e)=>{e.preventDefault();pk.open=false;setup.hidden=false;chatting(true);setup.scrollIntoView({block:'start'});});
let pending=null;
document.querySelectorAll('.card form').forEach(f=>f.onsubmit=async(e)=>{
  e.preventDefault();const input=f.querySelector('input'),btn=f.querySelector('button'),id=f.dataset.p;if(!input.value.trim()){input.focus();return;}
  btn.disabled=true;const res=await fetch('/api/connect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:id,key:input.value})}).catch(()=>null);
  const b=res?await res.json().catch(()=>({})):{};btn.disabled=false;
  if(!res||!res.ok){errMsg(b.error||'Could not save that key. Check it and try again.');return;}
  input.value='';setup.hidden=true;asstMsg('Connected. Running your task now.');if(pending){const t=pending;pending=null;run(t);}
});
 // Attached files: read in the browser, sent with the task, written to the computer before the first step.
let attached=[];const fileBox=$('files'),fileIn=$('fileIn');
const drawFiles=()=>{fileBox.textContent='';attached.forEach((f,i)=>{const c=node('span','fchip',f.name+' ');const x=node('button','','×');x.type='button';x.title='Remove '+f.name;x.onclick=()=>{attached.splice(i,1);drawFiles();};c.appendChild(x);fileBox.appendChild(c);});};
const TEXTY=['txt','md','csv','json','js','ts','py','html','css','xml','yml','yaml','log','sh','sql','tsv','toml','ini','rb','go','rs','java','c','cpp','h'];
$('attach').onclick=()=>fileIn.click();
const fileNote=(t)=>{const n=node('span','fnote',t);fileBox.appendChild(n);setTimeout(()=>n.remove(),5000);};
fileIn.onchange=()=>{[...fileIn.files].forEach(f=>{if(attached.length>=3){fileNote('You can attach up to 3 files.');return;}if(f.size>150*1024){fileNote(f.name+' is over 150 KB.');return;}
  const ext=(f.name.split('.').pop()||'').toLowerCase(),text=TEXTY.indexOf(ext)>=0||(f.type||'').indexOf('text/')===0,r=new FileReader();
  r.onload=()=>{let c=String(r.result||'');if(!text)c=c.slice(c.indexOf(',')+1);attached.push({name:f.name,type:f.type||'',content:c,b64:!text});drawFiles();};r.onerror=()=>fileNote('Could not read '+f.name+'.');
  if(text)r.readAsText(f);else r.readAsDataURL(f);});fileIn.value='';};
// Voice. The mic records in the browser and chat writes it down on the server (Whisper), so it works in every browser.
// With Voice on, a spoken task is sent by itself and each answer is read aloud, a sentence at a time (Chrome stops
// reading one long text after about 15 seconds).
const voiceBtn=$('voice'),micBtn=$('mic'),TTS=window.speechSynthesis;
let voiceOn=lsGet('chat_voice')==='1',rec=null,recTimer=null,byVoice=false;
const TICK=String.fromCharCode(96),spoken=(t)=>String(t).split(TICK+TICK+TICK).filter((x,i)=>i%2===0).join(' ').replace(/https?:[^ ]+/g,' link ').replace(/[*_#>|~]/g,' ').split(String.fromCharCode(10)).join('. ').split(TICK).join('').replace(/ +/g,' ').replace(/([.!?]) *[.] +/g,'$1 ').trim().slice(0,3000);
// The voice is Ava Multilingual, the one the video factory uses (streamed from /voice); the browser's own voice reads
// the answer when it fails. stopTalk ends whatever is being read.
const AUD=new Audio();AUD.preload='auto';let sayGen=0;
const SILENT='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const unlockAudio=()=>{try{AUD.src=SILENT;const p=AUD.play();if(p)p.catch(()=>{});}catch(e){}};
const stopTalk=()=>{sayGen++;try{AUD.pause();}catch(e){}try{TTS&&TTS.cancel();}catch(e){}};
const GOOD=['Google','Natural','Neural','Premium','Enhanced','Samantha','Ava','Daniel'];
// Which language a text is in: Whisper's answer when there is one, else a guess from the letters, else the browser's.
const LOC={en:'en-US',uk:'uk-UA',ru:'ru-RU',es:'es-ES',de:'de-DE',fr:'fr-FR',it:'it-IT',pt:'pt-BR',pl:'pl-PL',nl:'nl-NL',tr:'tr-TR',cs:'cs-CZ',ja:'ja-JP',ko:'ko-KR',zh:'zh-CN',ar:'ar-SA',he:'he-IL',hi:'hi-IN',el:'el-GR',sv:'sv-SE',fi:'fi-FI',da:'da-DK',no:'nb-NO',ro:'ro-RO',hu:'hu-HU',bg:'bg-BG',vi:'vi-VN',th:'th-TH',id:'id-ID',kk:'kk-KZ',ka:'ka-GE',be:'be-BY'};
const langOf=(t,hint)=>{if(hint)return String(hint).slice(0,2).toLowerCase();t=String(t||'');
  if(/[іїєґ]/i.test(t))return 'uk';if(/[а-яё]/i.test(t))return 'ru';if(/[가-힣]/.test(t))return 'ko';if(/[ぁ-ヿ]/.test(t))return 'ja';if(/[一-鿿]/.test(t))return 'zh';
  if(/[α-ω]/i.test(t))return 'el';if(/[א-ת]/.test(t))return 'he';if(/[ء-ي]/.test(t))return 'ar';if(/[ऀ-ॿ]/.test(t))return 'hi';if(/[ก-๛]/.test(t))return 'th';
  const w=' '+t.toLowerCase()+' ';if(/[¿¡ñ]/.test(w)||/ (el|los|las|que|es|por|para|una|cuál|qué) /.test(w))return 'es';if(/[ßäöü]/.test(w)||/ (der|die|und|ist|nicht|ich) /.test(w))return 'de';
  if(/[çœ]/.test(w)||/ (le|les|est|une|vous|je|pas|des) /.test(w))return 'fr';if(/[ãõ]/.test(w)||/ (não|você|uma|para|com) /.test(w))return 'pt';if(/[łąęśźż]/.test(w))return 'pl';
  if(/ (the|and|is|you|what|how|to) /.test(w))return 'en';return (navigator.language||'en').slice(0,2).toLowerCase();};
const pickVoice=(lang)=>{if(!TTS)return null;const l=String(lang).slice(0,2).toLowerCase(),vs=TTS.getVoices().filter(v=>v.lang&&v.lang.slice(0,2).toLowerCase()===l);return vs.find(v=>GOOD.some(g=>v.name.indexOf(g)>=0))||vs.find(v=>v.default)||vs[0]||null;};
const utter=(x,lang,v)=>{const u=new SpeechSynthesisUtterance(x);u.lang=v?v.lang:(LOC[lang]||lang);if(v)u.voice=v;return u;};
const sentences=(t)=>{const out=[];spoken(t).replace(/([.!?…]) +/g,'$1|').split('|').map(x=>x.trim()).filter(Boolean).forEach(x=>{if(out.length&&(out[out.length-1].length<40||out.length>=8))out[out.length-1]+=' '+x;else out.push(x);});return out;};
// Ava's voice streams from /voice, so it starts on the first chunk. When it has not started within 6 s, or fails
// before it starts, the browser's own voice reads the answer instead.
const playVoice=(text,lang,gen)=>new Promise((ok)=>{if(gen!==sayGen||!window.__SIGNED__){ok(false);return;}let started=false,w=0,t=0;
  const fin=(r)=>{AUD.onended=AUD.onerror=AUD.onplaying=null;clearInterval(w);clearTimeout(t);ok(r);};
  AUD.onplaying=()=>{started=true;clearTimeout(t);};AUD.onended=()=>fin(true);AUD.onerror=()=>{try{AUD.pause();}catch(e){}fin(started);};
  t=setTimeout(()=>{if(!started){try{AUD.pause();AUD.removeAttribute('src');AUD.load();}catch(e){}fin(false);}},6000);
  w=setInterval(()=>{if(gen!==sayGen){try{AUD.pause();}catch(e){}fin(true);}},150);
  AUD.src='/voice?l='+encodeURIComponent(lang)+'&t='+encodeURIComponent(text.slice(0,1200));const p=AUD.play();if(p)p.catch(()=>{if(!started)fin(false);});});
const browserSay=(x,lang,gen)=>new Promise((ok)=>{if(!TTS||gen!==sayGen){ok();return;}const u=utter(x,lang,pickVoice(lang));let done=false,w=0;
  const fin=()=>{if(done)return;done=true;clearInterval(w);ok();};u.onend=u.onerror=fin;w=setInterval(()=>{if(gen!==sayGen){try{TTS.cancel();}catch(e){}fin();}},150);TTS.speak(u);setTimeout(fin,4000+x.length*120);});
async function say(t,hint){stopTalk();const gen=sayGen,lang=langOf(t,hint),words=spoken(t);if(!words)return;
  if(await playVoice(words,lang,gen))return;
  for(const x of sentences(t)){if(gen!==sayGen)return;await browserSay(x,lang,gen);}}
const talkBack=(t,hint)=>{if(t)say(t,hint);};
if(TTS&&TTS.onvoiceschanged!==undefined)TTS.onvoiceschanged=()=>{};
const SV='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',SPK_ON=SV+'<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>',SPK_OFF=SV+'<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>';
const drawVoice=()=>{voiceBtn.innerHTML=voiceOn?SPK_ON:SPK_OFF;voiceBtn.classList.toggle('on',voiceOn);voiceBtn.setAttribute('aria-pressed',voiceOn);const t=voiceOn?'Reading answers aloud. Tap to stop':'Read answers aloud';voiceBtn.title=t;voiceBtn.setAttribute('aria-label',t);};
if(!TTS){voiceBtn.title='This browser cannot speak';voiceBtn.disabled=true;}
voiceBtn.onclick=()=>{unlockAudio();voiceOn=!voiceOn;lsSet('chat_voice',voiceOn?'1':'');drawVoice();if(!voiceOn)stopTalk();else talkBack('Answers will be read aloud.');};
drawVoice();

const micIdle=(label)=>{micBtn.classList.remove('rec','busy');micBtn.disabled=false;micBtn.setAttribute('aria-label',label||'Speak your task');micBtn.title=label||'Speak your task';};
const b64=(blob)=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>{const s=String(r.result||'');ok(s.slice(s.indexOf(',')+1));};r.onerror=()=>no(new Error('could not read the recording'));r.readAsDataURL(blob);});
// Audio to words on the server; null means "sign in first".
async function toText(blob){const res=await fetch('/api/transcribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({audio:await b64(blob),type:blob.type})});
  if(res.status===401)return null;const b=await res.json().catch(()=>({}));if(!res.ok)throw new Error(b.error||('Voice answered '+res.status));return String(b.text||'').trim();}
async function heard(blob){
  micBtn.classList.remove('rec');micBtn.classList.add('busy');micBtn.disabled=true;micBtn.title='Writing down what you said';const was=box.placeholder;box.placeholder='Writing down what you said…';
  try{if(blob.size<800)throw new Error('I did not hear anything. Hold the mic a bit longer and talk.');
    const t=await toText(blob);if(t===null){try{sessionStorage.setItem('chat_pending',box.value);}catch(e){}signin.hidden=false;signin.scrollIntoView({block:'center'});return;}if(!t)throw new Error('I did not catch any words. Try again a little closer to the mic.');
    box.value=((box.value.trim()?box.value.trim()+' ':'')+t).slice(0,2000);box.dispatchEvent(new Event('input'));
    if(voiceOn&&!go.disabled){byVoice=true;form.requestSubmit();byVoice=false;}else box.focus();
  }catch(e){errMsg(String(e.message||e));}
  finally{box.placeholder=was;micIdle();}
}
// What to do when the microphone is refused, in the words of the device in hand. On an iPhone, Chrome and Safari both
// need the phone's own switch (Settings) as well as the site's prompt, and a refused prompt is not asked again.
const IOS=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function micHelp(e,again){const n=e&&e.name;
  if(n==='NotFoundError'||n==='OverconstrainedError')return 'No microphone found on this device.';
  if(n==='NotReadableError'||n==='AbortError')return 'Another app is using the microphone. Close it (a call, a recorder), then '+again+'.';
  if(n!=='NotAllowedError'&&n!=='SecurityError')return 'Could not open the microphone: '+(e&&e.message||e);
  if(IOS&&/CriOS/.test(navigator.userAgent))return 'The microphone is off for Chrome. On your iPhone open Settings › Apps › Chrome and turn on Microphone. Then reload chat.flisk.si and '+again+'. If Chrome asked and you tapped Don’t Allow, reload the page and tap Allow.';
  if(IOS)return 'The microphone is off for this site. Tap aA in the address bar › Website Settings › Microphone › Allow (or Settings › Apps › Safari › Microphone). Then reload and '+again+'.';
  if(/Android/.test(navigator.userAgent))return 'The microphone is blocked. Tap the icon left of the address › Permissions › Microphone › Allow, then '+again+'.';
  return 'The microphone is blocked for chat.flisk.si. Click the icon left of the address › Microphone › Allow, then '+again+'.';}
async function listen(){
  if(rec){rec.stop();return;}
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){errMsg('This browser cannot record. Try Chrome, Safari, Edge or Firefox.');return;}
  stopTalk();let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}
  catch(e){errMsg(micHelp(e,'tap the mic again'));return;}
  const type=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(t=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t))||'';
  const chunks=[];rec=type?new MediaRecorder(stream,{mimeType:type}):new MediaRecorder(stream);
  rec.ondataavailable=(e)=>{if(e.data&&e.data.size)chunks.push(e.data);};
  rec.onstop=()=>{clearTimeout(recTimer);stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:rec.mimeType||type||'audio/webm'});rec=null;heard(blob);};
  rec.start();micBtn.classList.add('rec');micBtn.setAttribute('aria-label','Stop and send what I said');micBtn.title='Listening. Tap again when you are done.';
  recTimer=setTimeout(()=>{if(rec)rec.stop();},55000);
}
if(navigator.mediaDevices&&window.MediaRecorder){micBtn.hidden=false;micBtn.onclick=listen;}
// Voice talk (Flisk Oracle): listen until you pause, write it down, the model answers in a few spoken sentences, read it
// aloud, listen again. No computer, no typing. Tap the circle to interrupt, the red button to end; the talk is kept in the chat.
const oracle=$('oracle'),orb=$('orb'),oState=$('ostate'),oYou=$('oyou'),oSay=$('osay');
let oLang='',oOn=false,oStream=null,oCtx=null,oRec=null,oStop=null,oTurns=[],oSpeaking=false;
const oSet=(st,msg)=>{oracle.className='oracle '+st;oState.textContent=msg;};
const speakAll=async(t,hint)=>{oSpeaking=true;oracle._endSpeak=stopTalk;try{await say(t,hint);}finally{oSpeaking=false;}};
// Record one utterance: starts on speech, stops after 1 s of quiet (1.5 s after a short opening like "Hi!", so a greeting
// and its question stay one turn), or 30 s; gives up after 9 s of silence.
const hearOne=()=>new Promise((done)=>{const type=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(t=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t))||'';
  const chunks=[];const r=type?new MediaRecorder(oStream,{mimeType:type}):new MediaRecorder(oStream);oRec=r;
  const an=oCtx.createAnalyser();an.fftSize=1024;const src=oCtx.createMediaStreamSource(oStream);src.connect(an);const buf=new Float32Array(an.fftSize);
  let spoke=false,quiet=0,talked=0,t0=Date.now(),last=Date.now(),raf=0;
  const tick=()=>{an.getFloatTimeDomainData(buf);let sum=0;for(let i=0;i<buf.length;i++)sum+=buf[i]*buf[i];const rms=Math.sqrt(sum/buf.length),now=Date.now(),dt=now-last;last=now;
    orb.style.setProperty('--lv',Math.min(1,rms*12).toFixed(3));
    if(rms>0.02){spoke=true;quiet=0;talked+=dt;}else if(spoke)quiet+=dt;
    if((spoke&&quiet>(talked<2000?1500:1000))||now-t0>30000||(!spoke&&now-t0>9000)){if(r.state!=='inactive')r.stop();}};
  oStop=()=>{if(r.state!=='inactive')r.stop();};
  r.ondataavailable=(e)=>{if(e.data&&e.data.size)chunks.push(e.data);};
  r.onstop=()=>{clearInterval(raf);try{src.disconnect();}catch(e){}orb.style.setProperty('--lv',0);oRec=null;oStop=null;done(spoke?new Blob(chunks,{type:r.mimeType||type||'audio/webm'}):null);};
  r.start();raf=setInterval(tick,60);});
const LNAME={en:'English',uk:'Ukrainian',ru:'Russian',es:'Spanish',de:'German',fr:'French',it:'Italian',pt:'Portuguese',pl:'Polish',ja:'Japanese',ko:'Korean',zh:'Chinese',ar:'Arabic',he:'Hebrew',hi:'Hindi',tr:'Turkish',nl:'Dutch',el:'Greek'};
async function oLoop(){
  while(oOn){
    oSet('listening','Listening…');const blob=await hearOne();if(!oOn)return;
    if(!blob){oSet('idle','Tap the circle when you want to talk.');return;}
    // One request: the recording goes up, the words you said and the spoken answer come back, with the language heard.
    oSet('thinking','Thinking…');let b;
    try{const res=await fetch('/api/talk',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({audio:await b64(blob),type:blob.type,lang:oLang,history:oTurns,ai:{ai:aiSel.value,key:byoKey.value,model:cur.model||fixModel(byoModel.value.trim()).model}})});
      b=await res.json().catch(()=>({}));if(res.status===401){oClose();signin.hidden=false;signin.scrollIntoView({block:'center'});return;}if(!res.ok)throw new Error(b.error||('Voice talk answered '+res.status));}
    catch(e){oSet('idle',String(e.message||e));return;}
    if(!oOn)return;const said=String(b.heard||'').trim(),reply=String(b.text||'').trim();
    if(!said){oSet('idle','I did not catch that. Tap the circle and try again.');return;}
    if(b.lang)oLang=b.lang;oYou.textContent=said;oSay.textContent=reply;oTurns.push({role:'user',content:said},{role:'assistant',content:reply});
    oSet('speaking','Speaking… tap the circle to interrupt');
    await speakAll(reply,oLang);
  }
}
async function oOpen(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){errMsg('This browser cannot record. Try Chrome, Safari, Edge or Firefox.');return;}
  if(!window.__SIGNED__){signin.hidden=false;signin.scrollIntoView({block:'center'});return;}
  // The level meter's AudioContext is made inside the tap: an iPhone leaves one made later silent, and talk never hears you.
  const AC=window.AudioContext||window.webkitAudioContext;try{oCtx=new AC();oCtx.resume().catch(()=>{});}catch(e){oCtx=null;}
  stopTalk();oracle.hidden=false;oYou.textContent='';oSay.textContent='';oTurns=[];oLang='';oSet('thinking','Opening the microphone…');
  try{oStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});}
  catch(e){oClose();errMsg(micHelp(e,'tap the wave again'));return;}
  if(!oCtx){oClose();errMsg('This browser cannot listen for pauses. Use the mic button instead.');return;}
  try{await oCtx.resume();}catch(e){}
  oOn=true;oLoop();
}
function oClose(){oOn=false;if(oStop)oStop();if(oracle._endSpeak)oracle._endSpeak();stopTalk();
  if(oStream){oStream.getTracks().forEach(t=>t.stop());oStream=null;}if(oCtx){try{oCtx.close();}catch(e){}oCtx=null;}oracle.hidden=true;
  // Keep the talk in the chat, so it is saved with the rest and can be read later.
  if(oTurns.length){chatting(true);oTurns.forEach(m=>{if(m.role==='user')userMsg(m.content);else asstMsg(m.content);history.push(m);});saveChat();down();oTurns=[];}
}
orb.onclick=()=>{if(!oOn)return;if(oSpeaking&&oracle._endSpeak){oracle._endSpeak();return;}if(oStop){oStop();return;}if(!oRec)oLoop();};
$('oend').onclick=oClose;
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&!oracle.hidden)oClose();});
$('orbbtn').onclick=()=>{unlockAudio();oOpen();};
const secs=(ms)=>Math.max(0,Math.round(ms/1000))+'s';
// Step icons, from Lucide (lucide.dev, ISC license): each kind of step gets its own, the way T3 Code shows tool calls.
const SI={terminal:'<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  code:'<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  pen:'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  file:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  globe:'<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  server:'<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  power:'<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  film:'<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  image:'<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  mic:'<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  save:'<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  folder:'<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  layers:'<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  calc:'<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  sparkles:'<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  alert:'<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>'};
// Which icon a shell command gets.
const cmdIcon=(c)=>/\\b(curl|wget|ping|dig|nslookup)\\b/.test(c)?'globe':/\\b(pip3?|npm|pnpm|bun|apt(-get)?|apk|brew|yarn)\\b.*\\b(install|add|i)\\b/.test(c)?'download':/\\bflisk\\b/.test(c)?'layers':/\\b(sqlite3|psql|mysql|redis-cli)\\b/.test(c)?'database':/\\b(python3?|node|deno|ruby|go run|php)\\b/.test(c)?(/\\bbc\\b|[*][*]|math|fib/i.test(c)?'calc':'code'):/^\\s*(ls|cat|head|tail|find|tree|du|wc|mkdir|cp|mv)\\b/.test(c)?'folder':'terminal';
const noteIcon=(t)=>/scene|draw/i.test(t)?'image':/voice|record/i.test(t)?'mic':/sav/i.test(t)?'save':/install|pip/i.test(t)?'download':'film';
// One task: a "Working for Ns" header, each computer step as it happens, then the answer and a result card.
async function run(task){
  go.disabled=true;chatting(true);closePop();
  const sendFiles=attached;attached=[];drawFiles();
  {const lu=history[history.length-1];if(sendFiles.length&&lu&&lu.role==='user')lu.files=sendFiles.map(f=>f.name);}
  if(sendFiles.length){const us=talk.querySelectorAll('.u'),u=us[us.length-1];if(u){const fl=node('div','ufiles');sendFiles.forEach(f=>{const c=node('span','fchip');if(f.b64&&/^image[/]/.test(f.type)){const im=document.createElement('img');im.src='data:'+f.type+';base64,'+f.content;im.alt='';c.appendChild(im);}c.appendChild(node('span','',f.name));fl.appendChild(c);});u.appendChild(fl);}}
  const blind=sendFiles.some(f=>f.b64&&/^image[/]/.test(f.type))&&!canSee();
  const turn=add(node('div','turn')),work=node('div','work'),l=node('span','l'),wt=node('span','',''),ws=node('span','','Thinking');
  l.append(node('span','spin'),wt);work.append(l,ws);turn.appendChild(work);
  if(blind){const bn=node('div','blind');bn.textContent=cur.free?'Flisk Wolf cannot see pictures: it only gets the file on the computer (size, metadata). To ask about what is in the picture, pick a model with your own key that sees images, such as Claude, GPT or Gemini.':'This model cannot see pictures: it only gets the file on the computer. To ask about what is in the picture, pick a model marked "sees images".';const pk2=node('button','btn','Pick a model');pk2.type='button';pk2.onclick=()=>openPop();bn.appendChild(pk2);turn.appendChild(bn);}
  const box2=node('details','stepsbox'),sum2=node('summary','','Steps'),list=node('ol','steps');box2.open=true;box2.append(sum2,list);box2.hidden=true;turn.appendChild(box2);
  const t0=Date.now(),tick=()=>{const e=Date.now()-t0;wt.textContent='Working for '+secs(e)+(e>45000?' · slow: press Stop to give up':'');};let stopped=false;const ac=new AbortController();const stop=node('button','btn','Stop');stop.type='button';stop.onclick=()=>{stopped=true;ac.abort();};work.appendChild(stop);tick();const timer=setInterval(tick,1000);
  let live=null,count=0,answer=null,failed=false,link=null,video=null,lastNote='';
  const step=(html,cls,ic)=>{if(live&&live.classList.contains('live')){live.classList.remove('live');live.classList.add('ok');}const li=node('li','st '+(cls||'live')),si=node('span','si'),t=node('div','t');si.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+(SI[ic]||SI.sparkles)+'</svg>';t.innerHTML=html;li.append(si,t);list.appendChild(li);box2.hidden=false;count++;sum2.textContent='Steps ('+count+')';live=li;down();return li;};
  const code=(s)=>{const c=document.createElement('code');c.textContent=s;return c.outerHTML;};
  const txt=(s)=>{const c=document.createElement('span');c.textContent=s;return c.innerHTML;};
  const out=(s,bad)=>{if(!live||!s)return;const p=node('pre','',s.length>1500?s.slice(0,1500)+'\\n…':s);live.querySelector('.t').appendChild(p);if(bad){live.classList.remove('live','ok');live.classList.add('bad');live.querySelector('.si').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+SI.alert+'</svg>';}down();};
  const end=(ok)=>{clearInterval(timer);stop.remove();if(live&&live.classList.contains('live')){live.classList.remove('live');live.classList.add(ok?'ok':'bad');}work.classList.add(ok?'done':'fail');wt.textContent=(ok?'Worked for ':'Stopped after ')+secs(Date.now()-t0);ws.textContent='';if(ok&&count)box2.open=false;};
  try{
    const res=await fetch('/api/run',{signal:ac.signal,method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:JSON.stringify({task,history,providers:picked(),files:sendFiles,ai:{vision:canSee(),ai:aiSel.value,key:byoKey.value,model:cur.model||fixModel(byoModel.value.trim()).model||byoModel.value.trim()}})});
    if(res.status===401){clearInterval(timer);turn.remove();try{sessionStorage.setItem('chat_pending',task);if(sendFiles.length)sessionStorage.setItem('chat_pending_files',JSON.stringify(sendFiles));}catch(e){}attached=sendFiles;drawFiles();signin.hidden=false;signin.scrollIntoView({block:'center'});go.disabled=false;return;}
    if(res.status===409){clearInterval(timer);turn.remove();pending=task;asstMsg('I need a computer for that. Connect one of your sandbox accounts below, once.');saveChat();setup.hidden=false;setup.scrollIntoView({block:'start'});go.disabled=false;return;}
    if(res.status===429){const b=await res.json().catch(()=>({}));clearInterval(timer);work.remove();box2.remove();limitCard(turn,task,b);go.disabled=false;return;}
    if(!res.ok||!res.body){const b=await res.json().catch(()=>({}));const er=new Error(b.error||('Chat answered '+res.status+'. Try again in a minute.'));er.kind=b.kind;throw er;}
    const rd=res.body.getReader(),dec=new TextDecoder();let buf='';
    for(;;){const {value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
      while((i=buf.indexOf('\\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);if(!line.trim())continue;let ev;try{ev=JSON.parse(line);}catch(e){continue;}
        if(ev.type==='thinking')ws.textContent='Thinking, step '+ev.step;
        else if(ev.type==='pod_starting'){step('Starting a computer','','server');ws.textContent='Starting a computer';}
        else if(ev.type==='pod_started'){if(live)live.querySelector('.t').textContent='Computer ready on '+ev.provider;}
        else if(ev.type==='run'){step('Ran '+code(ev.command),'',cmdIcon(ev.command));ws.textContent='Running a command';}
        else if(ev.type==='write'){step('Wrote '+code(ev.path)+' '+txt('('+Number(ev.bytes||0).toLocaleString()+' characters)'),'','pen');ws.textContent='Writing files';}
        else if(ev.type==='read')step('Read '+code(ev.path),'','file');
        else if(ev.type==='publish'){step('Publishing '+code(ev.path),'','upload');ws.textContent='Publishing';}
        else if(ev.type==='system_plan'){step('Building a system of '+ev.services.length+' services: '+txt(ev.services.join(', ')),'','app');ws.textContent='Building a system';}
        else if(ev.type==='system_start'){step('Starting all services with Flisk','','app');}
        else if(ev.type==='video_start'){step('Making a video: '+txt(ev.title)+' '+txt('('+ev.scenes+' scenes)'),'','film');ws.textContent='Making a video';}
        else if(ev.type==='note'){if(ev.text!==lastNote){lastNote=ev.text;step(txt(ev.text),'',noteIcon(ev.text));}}
        else if(ev.type==='output'){if(ev.error)out(ev.error,true);else{if(ev.published)link=ev.published;if(ev.video)video=ev.video;out([ev.stdout,ev.stderr,ev.content].filter(Boolean).join('\\n').replace(/\\n$/,''),ev.exitCode>0);}}
        else if(ev.type==='pod_stopped')step('Computer stopped','ok','power');
        else if(ev.type==='widget'){const w=drawWidget(ev);if(w){turn.appendChild(w);down();}}
        else if(ev.type==='answer')answer=ev.text;
        else if(ev.type==='error'){failed=true;errCard(turn,ev.error,ev.kind,task);}
        else if(ev.type==='file'&&ev.error)out('Could not put '+ev.path+' on the computer: '+ev.error,true);
      }}
  }catch(err){failed=true;if(stopped)turn.appendChild(node('div','err','You stopped this task.'));else errCard(turn,String(err.message||err),err.kind||'other',task);}
  end(!failed||answer!==null);
  if(answer!==null){const a=node('div','a');md(a,answer);turn.appendChild(a);history.push({role:'assistant',content:answer});saveChat();if(voiceOn)talkBack(answer);
    const sv=node('div','asave'),dl2=node('button','btn','Save as file'),cp2=node('button','btn','Copy');dl2.type=cp2.type='button';
    dl2.onclick=()=>{const u=URL.createObjectURL(new Blob([answer],{type:'text/markdown'})),x=document.createElement('a');x.href=u;x.download='flisk-chat-answer.md';document.body.appendChild(x);x.click();x.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);dl2.textContent='Saved ✓';setTimeout(()=>dl2.textContent='Save as file',1500);};
    cp2.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(answer).then(()=>{cp2.textContent='Copied';setTimeout(()=>cp2.textContent='Copy',1500);});};sv.append(dl2,cp2);turn.appendChild(sv);}
  if(link)turn.appendChild(siteCard(link));
  if(video)turn.appendChild(videoCard(video));
  down();go.disabled=false;box.focus();
}
// An error you can act on: the real reason, then the buttons for what usually fixes it.
function errCard(turn,msg,kind,task){
  const c=node('div',kind==='busy'?'errbox calm':'errbox');c.appendChild(node('div','err',msg));const n=node('div','next');n.appendChild(node('small','','What to do next'));
  const btn=(t,f,primary)=>{const b=node('button','btn'+(primary?' go':''),t);b.type='button';b.onclick=f;n.appendChild(b);};
  // Deferred: this click also reaches the document handler that closes the picker on any outside click, so opening at once would close it again.
  const openAi=(focusKey)=>setTimeout(()=>{openPop();const p=MODELS.find(x=>!x.free&&x.key===aiSel.value)||MODELS.find(x=>!x.free);if(p&&aiSel.value==='wolf')pick(p);if(!byo.hidden)(focusKey?byoKey:byoModel).focus();},0);
  const retry=()=>{turn.remove();if(history.length&&history[history.length-1].role==='assistant')history.pop();run(task);};
  const wolf=(f)=>{if(!cur.free)btn('Use free Flisk Wolf',f);};
  if(cur.free&&(kind==='key'||kind==='model'||kind==='limit'))kind='other';
  if(kind==='key'){btn('Set up the key again',()=>{lsSet('chat_key_'+cur.key,'');byoKey.value='';stat();openAi(true);},true);wolf(()=>{const w=MODELS.find(x=>x.free);if(w)pick(w);retry();});}
  else if(kind==='model'){btn('Choose another model',()=>openAi(false),true);wolf(()=>{const w=MODELS.find(x=>x.free);if(w)pick(w);retry();});}
  else if(kind==='limit'){wolf(()=>{const w=MODELS.find(x=>x.free);if(w)pick(w);retry();});btn('Change provider',()=>openAi(true),true);}
  else if(kind==='computer'){btn('Connect a computer',()=>{pending=task;setup.hidden=false;setup.scrollIntoView({block:'start'});},true);btn('Try again',retry);}
  else if(kind==='busy'){btn('Try again',retry,true);btn(orLabel(),()=>orGo(task));n.appendChild(discord());}
  else{btn('Try again',retry,true);btn('Change model or provider',()=>setTimeout(openPop,0));}
  c.appendChild(n);turn.appendChild(c);down();
}
// "Log in with OpenRouter": the visitor signs in to their own free OpenRouter account (PKCE, no secret of ours) and the key
// comes back to this browser only, encrypted in the vault like a pasted key. Their free models then run on their own free
// daily allowance, not on the shared one. https://openrouter.ai/docs/use-cases/oauth-pkce
const OR_FREE=['google/gemma-4-31b-it:free','google/gemma-4-26b-a4b-it:free','nvidia/nemotron-3.5-lightning:free','nvidia/nemotron-3-ultra-550b-a55b:free'];
const b64u=(u)=>btoa(String.fromCharCode(...new Uint8Array(u))).replace(/[+]/g,'-').replace(/[/]/g,'_').replace(/=+$/,'');
const orLabel=()=>lsGet('chat_key_openrouter')?'Keep going free on my OpenRouter':'Keep going free with OpenRouter';
const discord=()=>{const a=node('a','btn','Join our Discord');a.href='https://discord.gg/qMu5Xn8Kaq';a.target='_blank';a.rel='noopener';return a;};
async function orFreeModel(){await loadOr();const id=OR_FREE.find(x=>orIds.indexOf(x)>=0)||orIds.find(x=>/:free$/.test(x)&&!/vl|omni|code/i.test(x))||OR_FREE[0];
  const m=OR.find(x=>x.id==='or:'+id)||orModel(id,'',0,0);pick(m);return m;}
async function orGo(task){
  if(lsGet('chat_key_openrouter')){await orFreeModel();if(task){box.value=task;fit();dropLimit();run(task);}return;}
  const v=b64u(crypto.getRandomValues(new Uint8Array(32)));const ch=b64u(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
  try{sessionStorage.setItem('chat_or_v',v);sessionStorage.setItem('chat_or_task',task||box.value||'');}catch(e){}
  location.href='https://openrouter.ai/auth?callback_url='+encodeURIComponent(location.origin+'/')+'&code_challenge='+ch+'&code_challenge_method=S256';}
$('byor').onclick=()=>orGo('');
// Back from OpenRouter with ?code=: swap it for this person's key, keep it in this browser only, pick a free model.
(async()=>{const q=new URLSearchParams(location.search),code=q.get('code');let v='',t='';try{v=sessionStorage.getItem('chat_or_v')||'';t=sessionStorage.getItem('chat_or_task')||'';}catch(e){}
  if(!code||!v)return;window.history.replaceState(null,'',location.pathname);try{sessionStorage.removeItem('chat_or_v');sessionStorage.removeItem('chat_or_task');}catch(e){}
  try{const r=await fetch('https://openrouter.ai/api/v1/auth/keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,code_verifier:v,code_challenge_method:'S256'})});const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.key)throw new Error((j.error&&j.error.message)||'OpenRouter did not send a key');
    await vaultReady;lsSet('chat_key_openrouter',j.key);const m=await orFreeModel();
    if(t){box.value=t;fit();}const ok=node('div','limit');ok.innerHTML='<div style="flex:1"><b></b><p></p></div>';ok.querySelector('b').textContent='Connected to your OpenRouter';ok.querySelector('p').textContent='Free tasks now run on '+m.name+' with your own free OpenRouter allowance. The key stays encrypted in this browser only.'+(t?' Your task is back in the box: press Run.':'');chatting(true);add(ok);
  }catch(e){const er=node('div','errbox');er.appendChild(node('div','err','Could not connect OpenRouter: '+String(e.message||e).slice(0,160)+'. Try again, or paste a key from openrouter.ai/keys.'));chatting(true);add(er);}})();
// The free model's daily cap: say when it comes back and offer the way round it, and keep the task.
// The limit card said the task was back in the box; once it is sent again, drop the card and the old copy of the task above it.
function dropLimit(){const t=document.querySelector('.turn[data-limit]');if(!t)return;const u=t.previousElementSibling;if(u&&u.classList.contains('u'))u.remove();t.remove();}
function limitCard(turn,task,b){
  if(history.length&&history[history.length-1].content===task)history.pop();
  const ms=Number(b.resetsIn)||0,h=Math.floor(ms/3600000),m=Math.round((ms%3600000)/60000),n=b.limit||20;
  const c=node('div','limit');c.innerHTML='<div class="ic"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M5 2h8M5 16h8M6 2c0 4 6 4 6 7s-6 3-6 7M12 2c0 4-6 4-6 7s6 3 6 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></div><div style="flex:1;min-width:0"><b></b><p></p><div class="acts"></div></div><div class="ring"></div>';
  c.querySelector('b').textContent=b.error||"You've used today's free tasks";
  c.querySelector('p').textContent='Keep going free: log in with OpenRouter (a free account, one click) and your task runs right away on your own free share. Or they come back in '+(h?h+' h ':'')+m+' min. Your task is back in the box.';
  c.querySelector('.ring').textContent=n+'/'+n;
  const fr=node('button','btn go',orLabel());fr.type='button';fr.onclick=()=>orGo(task);
  const k=node('button','btn','Use my API key');k.type='button';k.onclick=(e)=>{e.stopPropagation();openPop();const p=MODELS.find(x=>!x.free);if(p){railOn=p.provider;drawRail();drawList();}};
  const cp=node('button','btn','Copy my task');cp.type='button';cp.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(task).then(()=>{cp.textContent='Copied';setTimeout(()=>cp.textContent='Copy my task',1500);});};
  c.querySelector('.acts').append(fr,k,cp,discord());turn.setAttribute('data-limit','1');turn.appendChild(c);box.value=task;fit();down();
}
// Zachman questions as a tree of squares: hover (or tap) one to choose it and see its smaller squares; the next
// question opens below, until all six are answered. "Other…" takes a typed answer.
const ZQ=window.__ZQ__||[];
let treeAnswer=null;
// Leaving mid-task loses its live progress (the answer is saved only when it arrives), so ask first.
addEventListener('beforeunload',e=>{if(document.querySelector('.work:not(.done):not(.fail)')){e.preventDefault();e.returnValue='';}});
function ask6(task){
  chatting(true);
  const wrap=add(node('div','zq'));wrap.appendChild(node('div','h','A few quick questions so it fits you. Hover a square to choose it and see more, or type your own answer.'));
  const rows=node('div');rows.style.cssText='display:flex;flex-direction:column;gap:14px';const chips=node('div','zchips');wrap.append(rows,chips);
  let pick=[],sub=[],sent=false,prevLen=0;
  const kind=/\\b(video|clip|promo|reel)\\b/i.test(task)?'A video':/\\b(erp|back office|platform|services|microservices?|suite)\\b/i.test(task)?'A system of services':/\\b(app|tool|dashboard|calculator)\\b/i.test(task)?'A small app':/\\b(website|web page|webpage|landing|site|page|shop|store)\\b/i.test(task)?'A website':'';
  if(kind){pick=[kind];prevLen=1;}
  const ans=(i)=>pick[i]?pick[i]+(sub[i]?' ('+sub[i]+')':''):'';
  const finish=()=>{if(sent||!wrap.isConnected)return;sent=true;treeAnswer=null;box.placeholder='What should it do?';rows.remove();wrap.firstChild.textContent=pick.length?'Your answers':'Skipped the questions';const sk=chips.querySelector('.zskip');if(sk)sk.remove();chips.querySelectorAll('.zchip:not(.ok)').forEach(c=>c.remove());
    const full=pick.length?task+'\\n\\nAnswers: '+pick.map((p,i)=>ZQ[i][0]+': '+ans(i)).join('; ')+'.':task;history.push({role:'user',content:full});saveChat();run(full);};
  treeAnswer=(text)=>{if(sent)return;const i=Math.min(pick.length,ZQ.length-1);pick=pick.slice(0,i);sub=sub.slice(0,i);pick[i]=text.slice(0,120);draw();if(pick.length===ZQ.length)finish();};
  // Hover chooses only when a mouse really moves over a square: a new row that appears under a still pointer (the
  // chat scrolls as rows are added) must not choose itself, and a tap on a phone is a click, not a hover.
  const hover=(el,fn)=>{let tm=0;el.onpointermove=(e)=>{if(e.pointerType!=='mouse'||tm)return;tm=setTimeout(()=>{tm=0;fn();},220);};el.onpointerleave=()=>{clearTimeout(tm);tm=0;};return ()=>{clearTimeout(tm);tm=0;};};
  const draw=()=>{if(!wrap.isConnected)return;const grew=pick.length>prevLen;prevLen=pick.length;rows.textContent='';
    for(let i=0;i<=Math.min(pick.length,ZQ.length-1);i++){const row=node('div','trow'+(grew&&i===pick.length?' new':'')+(i<pick.length-1?' done':''));row.appendChild(node('div','q',ZQ[i][1]));
      const right=node('div'),sqs=node('div','sqs');right.appendChild(sqs);row.appendChild(right);
      const opts=ZQ[i][2];
      opts.forEach(([t,ic],k)=>{const on=pick[i]===t,s=node('button','sq p'+((i+k)%4)+(on?' on':''));s.type='button';s.setAttribute('aria-pressed',String(on));
        s.innerHTML=(ic&&IC[ic]?svgAt(IC[ic],24):'')+'<span></span>';s.lastChild.textContent=t;
        const choose=()=>{if(sent||pick[i]===t)return;pick=pick.slice(0,i);sub=sub.slice(0,i);pick[i]=t;draw();};
        const stop=hover(s,choose);s.onclick=()=>{stop();choose();if(pick.length===ZQ.length)finish();};sqs.appendChild(s);});
      const custom=pick[i]&&!opts.some(o=>o[0]===pick[i]),o=node('button','sq other'+(custom?' on':''));o.type='button';
      o.innerHTML='<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 14.5V16h1.5l8.8-8.8-1.5-1.5zM14.6 4.2l1.2 1.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span></span>';o.lastChild.textContent=custom?pick[i]:'Other…';
      o.onclick=()=>{if(sent)return;pick=pick.slice(0,i);sub=sub.slice(0,i);draw();box.placeholder='Type your own answer: '+ZQ[i][1];box.focus();};sqs.appendChild(o);
      const chosen=opts.findIndex(x=>x[0]===pick[i]);
      if(chosen>=0){const subs=node('div','subs');opts[chosen][2].forEach(st=>{const on=sub[i]===st,b=node('button','ss p'+((i+chosen)%4)+(on?' on':''),st);b.type='button';b.setAttribute('aria-pressed',String(on));
        const choose=()=>{if(sent||sub[i]===st)return;sub[i]=st;draw();};const stop=hover(b,choose);b.onclick=()=>{stop();choose();if(pick.length===ZQ.length)finish();};subs.appendChild(b);});right.appendChild(subs);}
      rows.appendChild(row);}
    chips.textContent='';ZQ.forEach((z,i)=>chips.appendChild(node('span','zchip'+(pick[i]?' ok':''),z[0]+(pick[i]?': '+ans(i):''))));
    const all=pick.length===ZQ.length,sk=node('button','zskip'+(all?' ready':''),all?'Build it':'Skip, just build it');sk.type='button';sk.onclick=finish;chips.appendChild(sk);
    if(!sent)box.placeholder=pick.length<ZQ.length?'Or type your own answer: '+ZQ[pick.length][1]:'Add anything else, or press Build it';down();};
  draw();
}
const BUILD=/\\b(website|web page|webpage|landing|site|page|app|shop|store|dashboard|tool|video|clip|promo|reel|build|make|create|design)\\b/i,ASK=/^\\s*(what|who|why|when|where|how|is|are|can|does|fetch|check|tell|list|turn)\\b/i;
let lastSend=0;
form.onsubmit=(e)=>{e.preventDefault();stopTalk();if(voiceOn)unlockAudio();const task=box.value.trim();if(!task||go.disabled||Date.now()-lastSend<800)return;
  if(!cur.free&&!byoModel.value.trim()){openPop();pick(cur);byWarn.textContent='Type or pick a model name first, then press Run again.';byWarn.hidden=false;byoModel.focus();return;}
  if(!cur.free&&!byoKey.value.trim()){openPop();pick(cur);byStat.textContent='Paste your '+cur.providerName+' API key first, then press Run again.';byoKey.focus();return;}
  lastSend=Date.now();box.value='';fit();if(treeAnswer){treeAnswer(task);return;}dropLimit();userMsg(task);
  if(!byVoice&&!attached.length&&!history.length&&BUILD.test(task)&&!ASK.test(task)){ask6(task);return;}history.push({role:'user',content:task});saveChat();run(task);};
drawHist();
try{if(matchMedia('(pointer:fine)').matches)box.focus();}catch(e){}
if(window.__SIGNED__){try{const t=sessionStorage.getItem('chat_pending');if(t){sessionStorage.removeItem('chat_pending');try{const pf=JSON.parse(sessionStorage.getItem('chat_pending_files')||'[]');if(Array.isArray(pf))attached=pf.slice(0,3);}catch(e){}sessionStorage.removeItem('chat_pending_files');userMsg(t);history.push({role:'user',content:t});run(t);}}catch(e){}}
`;

const bare = (name) => icon(name, 10).replace(/ width="10" height="10" aria-hidden="true" focusable="false"/, '');
// A company's logo on a small white tile, or its initials when flisk-emoji has no logo for it.
const logo = (id, size = 16) =>
  LOGOS[id] ? `<span class="lg" style="width:${size}px;height:${size}px" aria-hidden="true"><img src="${LOGOS[id]}" alt=""></span>` : `<span class="lt" style="width:${size}px;height:${size}px" aria-hidden="true">${esc(String(PROVIDER_NAMES[id] || id).slice(0, 2))}</span>`;

export function appPage({ login, connected = [], models = DEFAULT_MODELS }) {
  const list = cleanModels(models);
  const cards = PROVIDER_CARDS.map(
    (p) => `<div class="card"><b>${esc(p.label)}</b><small>${esc(p.note)} <a href="${esc(p.url)}" target="_blank" rel="noopener">Get a key</a></small><form data-p="${esc(p.id)}"><input type="password" autocomplete="off" placeholder="Paste the API key" aria-label="${esc(p.label)} API key"><button class="btn go" type="submit">Connect</button></form></div>`,
  ).join('');
  const comps = login && connected.length ? connected.map((id) => `<li class="on">${logo(id)}${esc(PROVIDER_NAMES[id] || id)}</li>`).join('') : `<li class="off">${login ? 'None connected yet' : 'Sign in to see yours'}</li>`;
  const sub = !login
    ? 'Type a task or a website idea. It runs on a real computer and gives you the result and a live link. You sign in with GitHub only when you press Run.'
    : connected.length
      ? `Runs on your own computers (${connected.length} connected). Fleet picks the cheapest one, or choose them below.`
      : 'No computer connected yet: the first task asks you for one key.';
  const on = Object.keys(PROVIDER_NAMES).filter((id) => connected.includes(id));
  const off = Object.keys(PROVIDER_NAMES).filter((id) => !connected.includes(id));
  const connectLink = (id) =>
    !login
      ? '<a class="cbtn" href="/auth/start">Sign in</a>'
      : PROVIDER_CARDS.some((c) => c.id === id) ? (login ? '<a class="cbtn" href="#setup">Connect</a>' : '<a class="cbtn" href="/auth/start">Sign in</a>') : '<a class="cbtn" href="https://fleet.flisk.si/console?section=providers" target="_blank" rel="noopener">Connect</a>';
  const menu = `<label class="crow auto">${icon('fleet', 26)}<span class="nm"><b style="font-weight:500">Fleet, automatic</b><small>Cheapest first, falls back to the next</small></span><input type="checkbox" class="sw" id="auto" checked aria-label="Fleet picks the computer"></label>${
    on.length ? `<div class="mhead">Connected · ${on.length}</div>` : ''
  }${on.map((id) => `<label class="crow">${logo(id, 26)}<span class="nm">${esc(PROVIDER_NAMES[id])}</span><span class="ready">ready</span><input type="checkbox" class="sw" name="sb" value="${esc(id)}" data-label="${esc(PROVIDER_NAMES[id])}" aria-label="Use ${esc(PROVIDER_NAMES[id])}"></label>`).join('')}<div class="mhead">Not connected · ${off.length}</div>${off
    .map((id) => `<div class="crow off">${logo(id, 26)}<span class="nm">${esc(PROVIDER_NAMES[id])}</span>${connectLink(id)}</div>`)
    .join('')}`;
  return shell(
    'Flisk Chat',
    `<div class="app">
<aside id="side" class="side" aria-label="Chats">
<div class="brand">${LOGO}<button type="button" id="sideclose" class="iconbtn only-m" aria-label="Close the menu">×</button></div>
<button type="button" id="newchat" class="newchat">${icon('thunder', 18)}New chat</button>
<label class="search"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input id="q" type="search" placeholder="Search your chats" aria-label="Search your chats" autocomplete="off"></label>
<div class="histwrap"><ul id="hist"></ul></div>
<section class="sidesec"><h4><span style="display:inline-flex;align-items:center;gap:6px">${icon('fleet', 16)}Computers</span><a href="https://fleet.flisk.si/console?section=providers" target="_blank" rel="noopener">manage</a></h4><ul class="comps">${comps}</ul></section>
<section class="sidesec"><h4>Voice</h4><div class="soon">Voice talk: tap the wave and just talk, it answers out loud <span class="tag">new</span></div></section>
<div class="who">${login ? `<span>@${esc(login)}</span><a href="/reviews">Settings</a><a href="/auth/signout">Sign out</a>` : '<a class="btn go" href="/auth/start" style="width:100%;justify-content:center">Sign in with GitHub</a>'}</div>
</aside>
<div id="scrim" class="scrim" aria-hidden="true"></div>
<div class="main">
<div class="top"><button type="button" id="sideopen" class="iconbtn" aria-label="Open the menu"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>${LOGO}</div>
<div id="scroll" class="scroll"><div class="col">
<section id="ideas" class="welcome"><h1>What should we build?</h1><p class="sub">${esc(sub)}</p>
<div class="cats">${CATS.map((c) => `<button type="button" class="cat" data-cat="${c.id}" aria-pressed="false">${icon(c.id, 26)}${esc(c.label)}</button>`).join('')}</div>
<ul class="sugg" id="sugg"></ul></section>
<div id="talk" aria-live="polite"></div>
<div id="setup" hidden><div class="cards">${cards}</div><p class="note">Your key is stored encrypted in fleet and only starts your computers. Free credit comes from the provider, not from us.</p></div>
<div id="signin" class="card" hidden><b>Sign in to run this</b><small>One click with GitHub. Your task is kept and runs right after.</small><div style="margin-top:10px"><a class="btn go" href="/auth/start">Sign in with GitHub</a></div></div>
</div></div>
<div class="dock"><div class="col">
<form id="ask" class="composer"><div id="files" class="files"></div><textarea id="task" maxlength="2000" rows="2" placeholder="What should it do?" aria-label="Task"></textarea>
<div class="bar">
<button type="button" id="attach" class="attach" title="Attach files (up to 3, 150 KB each)" aria-label="Attach files"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button><input id="fileIn" type="file" multiple hidden>
<div class="mp" id="mp"><button type="button" id="mpbtn" class="chip" aria-haspopup="listbox" aria-expanded="false" aria-controls="mppop"><i class="ti" style="display:inline-flex"></i><span class="mpname">Flisk Wolf</span><i class="chev"></i></button>
<div id="mppop" class="pop" hidden><div class="ps"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input id="mq" type="search" placeholder="Search models" aria-label="Search models" autocomplete="off"></div>
<div class="pgrid"><div class="rail" id="rail" aria-label="Providers"></div><div class="mlist" id="mlist" role="listbox" aria-label="Models"></div></div>
<div id="byo" hidden><div><label for="byomodel">Model name</label><input id="byomodel" type="text" placeholder="Any OpenRouter model id, e.g. google/gemini-2.5-flash" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="bysug"><ul id="bysug" class="bysug" role="listbox" hidden></ul><div id="bywarn" class="bywarn" hidden></div></div><div><label id="byokeylabel" for="byokey">Your API key</label><input id="byokey" type="password" placeholder="Paste your API key" autocomplete="off"><button type="button" id="byor" class="byor" hidden>No key? Log in with OpenRouter, free</button><div class="bystat"><span id="bystat"></span><span class="byacts"><button type="button" id="bysave">Save</button><button type="button" id="byrm" hidden>Remove key</button></span></div><label class="byrev"><input type="checkbox" id="byrev"> Also use this AI for PR reviews (the key is then stored encrypted on our server; change it in Settings)</label></div></div></div></div>
<details class="pick"><summary class="chip" title="Computers" aria-label="Computers">${icon('fleet', 22)}<span id="sbsum">Fleet: cheapest first</span><i class="chev"></i></summary><div class="menu">${menu}</div></details>
<button type="button" id="mic" class="chip" hidden title="Speak your task" aria-label="Speak your task"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
<button type="button" id="voice" class="chip ico" aria-pressed="false" title="Read answers aloud" aria-label="Read answers aloud"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg></button>
<button type="button" id="orbbtn" class="chip ico talkb" title="Voice talk: just talk, it answers out loud" aria-label="Start voice talk"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg></button>
<button id="go" class="send" type="submit" aria-label="Run"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 14V4M4.5 8.5L9 4l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
</div></form>
<p class="fine">Runs on a real computer from your own sandbox account. Your keys stay encrypted and are never shown. Enter sends, Shift+Enter adds a line.</p>
</div></div></div></div>
<div id="oracle" class="oracle" hidden role="dialog" aria-modal="true" aria-label="Voice talk">
<div class="otop"><span class="otitle">Flisk Oracle</span><span class="ohint">Talk. Pause when you are done. Tap the circle to interrupt.</span></div>
<button type="button" id="orb" class="orb" aria-label="Tap to talk or interrupt"><span class="oring"></span><span class="ocore"></span></button>
<p id="ostate" class="ostate" aria-live="polite">Starting…</p>
<div class="ocap"><p id="oyou" class="oyou"></p><p id="osay" class="osay"></p></div>
<button type="button" id="oend" class="oend" aria-label="End voice talk"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
</div>
<select id="ai" hidden aria-hidden="true">${AI_CHOICES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>`,
    `window.__SIGNED__=${login ? 'true' : 'false'};window.__MODELS__=${inlineJson(list)};window.__CATS__=${inlineJson(CATS)};window.__ZQ__=${inlineJson(ZQ)};window.__LOGOS__=${inlineJson(Object.fromEntries(['anthropic', 'openai', 'openrouter'].filter((k) => LOGOS[k]).map((k) => [k, LOGOS[k]])))};window.__ICONS__=${inlineJson(Object.fromEntries(['wolf', 'website', 'app', 'system', 'answer', 'video'].map((k) => [k, bare(k)])))};` +
      APP_JS,
    true,
  );
}
