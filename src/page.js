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
#hist li .x{flex:none;opacity:0;padding:6px 8px;color:var(--soft)}#hist li:hover .x,#hist li .x:focus-visible{opacity:1}
#hist .none{font-size:13px;color:var(--soft);padding:6px 8px}
.sidesec{border-top:1px solid var(--line);padding:10px 4px 0}
.sidesec h4{margin:0 0 6px;font:500 12px/1 var(--sans);color:var(--dim);display:flex;justify-content:space-between;align-items:center}
.sidesec h4 a{font-weight:400;text-decoration:none}
.comps{list-style:none;margin:0;padding:0;font-size:13px;display:flex;flex-wrap:wrap;gap:4px}
.comps li{display:inline-flex;align-items:center;gap:5px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:2px 8px}
.comps .on::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--green)}.comps .off{color:var(--soft);background:transparent;border-style:dashed}
.soon{display:flex;align-items:center;justify-content:space-between;font-size:13px;color:var(--dim);padding:2px 0}
.tag{font-size:11px;border:1px solid var(--line2);border-radius:var(--radius);padding:1px 7px;color:var(--soft)}
.who{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;color:var(--dim);border-top:1px solid var(--line);padding:10px 4px 0}
.who a{color:var(--dim)}
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
.a{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65}.a a{font-weight:500;word-break:break-all}
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
.chip.plain{padding:4px 11px;color:var(--soft);border-style:dashed;cursor:not-allowed}.chip.plain:hover{border-color:var(--line)}
.chev{width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translate(-2px,-2px);flex:none;opacity:.6}
.send{margin-left:auto;width:38px;height:38px;border:0;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;cursor:pointer;flex:none}
.send:hover{background:var(--green-d)}.send[disabled]{background:var(--line2);cursor:wait}
.fine{font-size:12px;color:var(--soft);text-align:center;margin:8px 0 0}
.mp{position:relative}
.pop{position:absolute;left:0;bottom:calc(100% + 10px);z-index:20;width:min(520px,calc(100vw - 32px));background:var(--panel);border:1px solid var(--line2);border-radius:var(--radius);box-shadow:0 24px 60px -24px rgba(27,27,24,.45);overflow:hidden}
.pop[hidden]{display:none}
.pop .ps{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);color:var(--soft)}
.pop .ps input{flex:1;border:0;outline:0;font:14px var(--sans);background:transparent;color:var(--ink);min-width:0}
.pgrid{display:grid;grid-template-columns:78px minmax(0,1fr);max-height:min(360px,55vh)}
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
#byo .bystat{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--dim)}#byo #byrm{font:12px var(--mono);text-transform:uppercase;background:transparent;border:1px solid var(--line2);border-radius:var(--radius);padding:4px 8px;color:var(--ink);cursor:pointer}#byo #byrm:hover{border-color:var(--red);color:var(--red)}
#byo label{font-size:12px;color:var(--dim)}
#byo input{font:14px var(--mono);padding:8px 10px;border:1px solid var(--line2);border-radius:var(--radius);background:var(--panel);color:var(--ink);width:100%}
details.pick{position:relative}details.pick>summary{list-style:none}details.pick>summary::-webkit-details-marker{display:none}
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
.trow{grid-template-columns:1fr}.trow .q{padding:0}.sq{flex:1 1 calc(33% - 8px);width:auto;height:76px}
.app{grid-template-columns:1fr}.side{position:fixed;inset:0 auto 0 0;width:min(300px,86vw);z-index:40;transform:translateX(-105%);transition:transform .2s;box-shadow:20px 0 60px -30px rgba(0,0,0,.4)}
.side.open{transform:none}.top{display:flex}.col{padding:0 16px}.welcome{padding:6vh 0 16px}
.u{max-width:90%}}
@media (min-width:861px){.only-m{display:none}}
`;

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap">';
const FAVICON = `data:image/svg+xml,${encodeURIComponent(icon('chat', 32).replace(' aria-hidden="true" focusable="false"', ''))}`;

const shell = (title, body, script = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(title)}</title><meta name="robots" content="noindex"><link rel="icon" href="${FAVICON}"><meta name="theme-color" content="#F7F6F2"><meta name="description" content="Ask for a task or a website. Flisk Chat gets a real computer and does it.">${FONTS}<style>${CSS}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;

const LOGO = `<a class="logo" href="/">${icon('chat', 26)}<b style="font-weight:inherit">chat<span>.</span>flisk</b></a>`;

export const homePage = () =>
  shell(
    'Flisk Chat',
    `<main class="col" style="padding-top:14vh;overflow:auto;height:100%">${LOGO}<h1 style="font:600 36px/1.15 var(--sans);letter-spacing:-.025em;margin:28px 0 10px">Ask for a website. It gets a computer.</h1><p style="color:var(--dim);max-width:56ch">Type what you want. Flisk's free model plans it, runs it on a real computer from your own sandbox account, and gives you the result and a live link.</p><a class="btn go" href="/auth/start">Sign in with GitHub</a></main>`,
  );

export const messagePage = (title, text) =>
  shell(`${title} · chat`, `<main class="col" style="padding-top:14vh;overflow:auto;height:100%">${LOGO}<h1 style="font:600 32px/1.2 var(--sans);letter-spacing:-.02em;margin:28px 0 8px">${esc(title)}</h1><p style="color:var(--dim)">${esc(text)}</p><a class="btn" href="/">Back to chat</a></main>`);

// Where a person saves the AI that reviews their pull requests (@flisk-chat review). The key is never shown again.
export const reviewsPage = ({ login, saved, stored, limit, flash }) =>
  shell(
    'PR reviews · chat',
    `<main class="col" style="padding-top:10vh;overflow:auto;height:100%">${LOGO}<h1 style="font:600 32px/1.2 var(--sans);letter-spacing:-.02em;margin:28px 0 8px">Pull request reviews</h1>
<p style="color:var(--dim)">Install the <b>flisk-chat</b> GitHub App on a repo, then comment <code>@flisk-chat review</code> on a pull request. You get one review with a summary, line comments, suggested fixes and a verdict. Only people who can push to the repo can ask.</p>
${flash ? `<p style="color:var(--green)">${flash === 'saved' ? 'Saved.' : 'Deleted.'}</p>` : ''}
<p>${saved ? `Reviews for <b>@${esc(login)}</b> use <b>${esc(saved.model)}</b> (${esc(saved.ai)}) with your key. You pay your provider; no daily limit.` : `Reviews for <b>@${esc(login)}</b> use the free Flisk Wolf model: ${limit} a day, and only the first part of a big diff.`}</p>
${stored ? `<form method="post" action="/reviews/save" style="display:grid;gap:10px;max-width:420px">
<label>AI<br><select name="ai" style="width:100%;padding:8px"><option value="openrouter">OpenRouter</option><option value="anthropic">Claude</option><option value="openai">OpenAI</option></select></label>
<label>Model name<br><input name="model" required maxlength="80" placeholder="e.g. anthropic/claude-sonnet-5.5" style="width:100%;padding:8px" value="${esc(saved?.model || '')}"></label>
<label>API key<br><input name="key" type="password" required minlength="8" maxlength="300" autocomplete="off" style="width:100%;padding:8px"></label>
<p style="color:var(--dim);font-size:13px;margin:0">The key is encrypted before it is stored and never shown again.</p>
<button class="btn" type="submit">Save for reviews</button></form>` : '<p style="color:var(--dim)">Saving a key is not switched on yet.</p>'}
${saved ? '<form method="post" action="/reviews/delete" style="margin-top:14px"><button class="btn" type="submit">Delete my saved key</button></form>' : ''}
</main>`,
  );

// Starter ideas per kind, for people who never write code.
const CATS = [
  { id: 'website', label: 'Website', ideas: ['Make me a one-page website for a coffee shop called Moon Roast.', 'A wedding page with the date, the place and an RSVP form.', 'A menu page for my bakery, with prices and opening hours.'] },
  { id: 'app', label: 'Small app', ideas: ['Build a tip calculator web page with a dark theme.', 'A countdown timer page for my product launch on December 1.', 'A simple to-do list page that remembers my items.'] },
  { id: 'answer', label: 'Answer', ideas: ['What is the 40th Fibonacci number? Check it with Python.', 'How many working days are there between today and New Year?', 'Turn 72 degrees Fahrenheit into Celsius and show the formula.'] },
  { id: 'video', label: 'Video', ideas: ['Make a 30-second promo video for my coffee shop called Moon Roast.', 'A short explainer video: how to brew pour-over coffee in 5 steps.', 'A birthday video for my friend Sam with 4 happy messages.'] },
  { id: 'check', label: 'Check a page', ideas: ['Fetch https://flisk.si and tell me its page title.', 'Is https://example.com up, and how fast does it answer?', 'List the links on https://flisk.sh.'] },
];

// Zachman questions for the tree of squares: each answer has its own smaller squares, shown when you hover it.
const ZQ = [
  ['What', 'What is it?', [['A website', 'website', ['Landing page', 'Shop', 'Portfolio']], ['A small app', 'app', ['Calculator', 'Tracker', 'Booking form']], ['A video', 'video', ['Promo', 'Explainer', 'Social short']], ['An answer or check', 'answer', ['Maths', 'Facts from the web', 'Check a site']]]],
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
const linkify=(n,text)=>{n.textContent='';String(text).split(/(https?:\\/\\/[^\\s)]+)/).forEach(p=>{if(/^https?:\\/\\//.test(p)){const a=document.createElement('a');a.href=p;a.target='_blank';a.rel='noopener';a.textContent=p;n.appendChild(a);}else n.appendChild(document.createTextNode(p));});};
const add=(n)=>{talk.appendChild(n);down();return n;};
const userMsg=(t)=>add(node('div','u',t));
const asstMsg=(t)=>{const d=node('div','a');linkify(d,t);return add(d);};
const errMsg=(t)=>add(node('div','err',t));
const chatting=(on)=>{welcome.classList.toggle('gone',on);};
// Past chats live in this browser only (localStorage), never on our server.
const KEY='chat_history_v1';let chatId=null;
const loadAll=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){return [];}};
const saveAll=(all)=>{try{localStorage.setItem(KEY,JSON.stringify(all.slice(0,30)));}catch(e){}};
const saveChat=()=>{if(!history.length)return;const all=loadAll().filter(c=>c.id!==chatId);if(!chatId)chatId=Date.now().toString(36);all.unshift({id:chatId,title:history[0].content.split('\\n')[0].slice(0,80),msgs:history});saveAll(all);drawHist();};
function drawHist(){const q=($('q').value||'').toLowerCase();const all=loadAll().filter(c=>!q||c.title.toLowerCase().includes(q));hist.textContent='';
  if(!all.length){hist.appendChild(node('li','none',q?'No chats match.':'Your chats show here. They stay in this browser.'));return;}
  all.forEach(c=>{const li=node('li',c.id===chatId?'cur':''),b=node('button','',c.title),x=node('button','x','×');b.type=x.type='button';b.title=c.title;b.onclick=()=>{openChat(c);closeSide();};x.title='Delete this chat';x.setAttribute('aria-label','Delete chat: '+c.title);x.onclick=()=>{saveAll(loadAll().filter(o=>o.id!==c.id));if(chatId===c.id)newChat();drawHist();};li.append(b,x);hist.appendChild(li);});}
$('q').addEventListener('input',drawHist);
function newChat(){history=[];go.disabled=false;treeAnswer=null;box.placeholder='What should it do?';chatId=null;talk.textContent='';setup.hidden=true;signin.hidden=true;chatting(false);drawHist();box.focus();}
function openChat(c){newChat();chatId=c.id;history=c.msgs.slice();chatting(true);history.forEach(m=>m.role==='user'?userMsg(m.content):asstMsg(m.content));drawHist();}
$('newchat').onclick=()=>{newChat();closeSide();};
const side=$('side');const closeSide=()=>side.classList.remove('open');$('sideopen').onclick=()=>side.classList.add('open');$('sideclose').onclick=closeSide;
// Kinds of task: each pill shows its starter ideas.
const CATS=window.__CATS__||[],sugg=$('sugg');
const showCat=(id)=>{document.querySelectorAll('.cat').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cat===id)));const c=CATS.find(x=>x.id===id)||CATS[0];sugg.textContent='';c.ideas.forEach(t=>{const li=node('li'),b=node('button','',t);b.type='button';b.onclick=()=>{box.value=t;fit();box.focus();};li.appendChild(b);sugg.appendChild(li);});};
document.querySelectorAll('.cat').forEach(b=>b.onclick=()=>showCat(b.dataset.cat));showCat(CATS[0]&&CATS[0].id);
box.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
const fit=()=>{box.style.height='auto';box.style.height=Math.min(box.scrollHeight,200)+'px';};box.addEventListener('input',fit);
// Model picker. The list comes from inference.flisk.si/v1/catalog (server side), so new models need no chat change.
const aiSel=$('ai'),byo=$('byo'),byoKey=$('byokey'),byoModel=$('byomodel'),mpBtn=$('mpbtn'),pop=$('mppop'),mlist=$('mlist'),rail=$('rail'),mq=$('mq');
let cur=MODELS[0],railOn='';
try{const v=sessionStorage.getItem('chat_model');const m=MODELS.find(x=>x.id===v);if(m)cur=m;}catch(e){}
const svgAt=(svg,size)=>svg.replace('<svg ','<svg width="'+size+'" height="'+size+'" aria-hidden="true" ');
const tile=(m,size)=>m.provider==='flisk'?svgAt(IC.wolf,size):LG[m.provider]?'<span class="lg" style="width:'+size+'px;height:'+size+'px" aria-hidden="true"><img src="'+LG[m.provider]+'" alt=""></span>':'<span class="lt" aria-hidden="true">'+((m.providerName||'?').replace(/[^A-Z]/g,'').slice(0,2)||(m.providerName||'?')[0])+'</span>';
const providers=[...new Map(MODELS.map(m=>[m.provider,m])).values()];
function drawRail(){rail.textContent='';const all=node('button');all.type='button';all.title='All models';all.setAttribute('aria-label','All models');all.setAttribute('aria-pressed',String(!railOn));all.innerHTML='<span class="lt" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 1h5v5H1zM8 1h5v5H8zM1 8h5v5H1zM8 8h5v5H8z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></span><span>All</span>';all.onclick=()=>{railOn='';drawRail();drawList();};rail.appendChild(all);
  providers.forEach(p=>{const b=node('button');b.type='button';b.title=p.providerName;b.setAttribute('aria-label',p.providerName);b.setAttribute('aria-pressed',String(railOn===p.provider));b.innerHTML=tile(p,28);b.appendChild(node('span','',p.providerName));b.onclick=()=>{railOn=p.provider;drawRail();drawList();};rail.appendChild(b);});}
function drawList(){const q=mq.value.trim().toLowerCase();mlist.textContent='';let last='';
  MODELS.filter(m=>(!railOn||m.provider===railOn)&&(!q||(m.name+' '+m.providerName+' '+m.description).toLowerCase().includes(q))).forEach(m=>{
    if(m.providerName!==last){last=m.providerName;mlist.appendChild(node('div','mgroup',m.providerName+(m.free?'':' · your key')));}
    const b=node('button','mi'+(m.id===cur.id?' on':''));b.type='button';b.setAttribute('role','option');b.setAttribute('aria-selected',String(m.id===cur.id));
    b.innerHTML=tile(m,28)+'<span><span class="n"></span><span class="d"></span></span><svg class="ck" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const n=b.querySelector('.n');n.textContent=m.name;const pr=node('span','price'+(m.free?' free':''),m.free?'free':m.price);n.appendChild(pr);b.querySelector('.d').textContent=m.description;
    b.onclick=()=>{pick(m);if(m.free)closePop();else{(m.model?byoKey:byoModel).focus();}};mlist.appendChild(b);});
  if(!mlist.children.length)mlist.appendChild(node('div','mgroup','No model matches.'));}
const SUGG={anthropic:['claude-sonnet-5-5','claude-opus-5-5','claude-haiku-5-5','claude-fable-5-2'],openai:['gpt-5','gpt-5-mini','gpt-4.1','gpt-4o','o4-mini'],openrouter:['google/gemini-2.5-pro','deepseek/deepseek-chat','moonshotai/kimi-k2','qwen/qwen3-coder','meta-llama/llama-3.3-70b-instruct']};
const lsGet=(k)=>{try{return localStorage.getItem(k)||'';}catch(e){return '';}};
const lsSet=(k,v)=>{try{if(v)localStorage.setItem(k,v);else localStorage.removeItem(k);}catch(e){}};
const byDl=$('bymodels'),byStat=$('bystat'),byRm=$('byrm');let orLoaded=false;
const fillSugg=(list)=>{byDl.textContent='';list.forEach(id=>{const o=document.createElement('option');o.value=id;byDl.appendChild(o);});};
const stat=()=>{const has=!!(cur&&!cur.free&&lsGet('chat_key_'+cur.key));byStat.textContent=has?'Saved in this browser only, never on our servers.':'Saved in this browser only once you paste it, never on our servers.';byRm.hidden=!has;};
async function loadOr(){if(orLoaded)return;orLoaded=true;try{const r=await fetch('https://openrouter.ai/api/v1/models');const j=await r.json();const ids=(j.data||[]).map(x=>x.id).filter(Boolean).sort();if(ids.length&&cur.key==='openrouter')fillSugg(ids);else orLoaded=false;}catch(e){orLoaded=false;}}
byoKey.addEventListener('input',()=>{if(!cur.free){lsSet('chat_key_'+cur.key,byoKey.value.trim());stat();}});
byoModel.addEventListener('input',()=>{if(!cur.free&&!cur.model)lsSet('chat_model_'+cur.key,byoModel.value.trim());});
byRm.onclick=()=>{lsSet('chat_key_'+cur.key,'');lsSet('chat_model_'+cur.key,'');byoKey.value='';if(!cur.model)byoModel.value='';stat();byoKey.focus();};
function pick(m){cur=m;aiSel.value=m.key||'wolf';byo.hidden=m.free;byoModel.value=m.model||(m.free?'':lsGet('chat_model_'+m.key));byoModel.parentElement.hidden=!!m.model;
  byoKey.value=m.free?'':lsGet('chat_key_'+m.key);fillSugg(SUGG[m.key]||[]);if(m.key==='openrouter')loadOr();stat();
  $('byokeylabel').textContent='Your '+m.providerName+' API key';
  mpBtn.querySelector('span').textContent=m.name;mpBtn.querySelector('.ti').innerHTML=tile(m,22);try{sessionStorage.setItem('chat_model',m.id);}catch(e){}drawList();}
const openPop=()=>{pop.hidden=false;mpBtn.setAttribute('aria-expanded','true');drawRail();drawList();mq.value='';mq.focus();};
const closePop=()=>{if(pop.hidden)return;pop.hidden=true;mpBtn.setAttribute('aria-expanded','false');};
mpBtn.onclick=()=>pop.hidden?openPop():closePop();mq.addEventListener('input',drawList);
pick(cur);
// Computers menu.
const auto=$('auto'),opts=[...document.querySelectorAll('input[name=sb]')],sum=$('sbsum');
const picked=()=>opts.filter(o=>o.checked).map(o=>o.value);
const syncSb=()=>{const p=picked();auto.checked=!p.length;sum.textContent=p.length?p.map(x=>document.querySelector('input[value='+x+']').dataset.label).join(', '):'Fleet: cheapest first';};
auto.onchange=()=>{if(auto.checked)opts.forEach(o=>o.checked=false);syncSb();};opts.forEach(o=>o.onchange=syncSb);syncSb();
const pk=document.querySelector('details.pick');
document.addEventListener('click',e=>{if(pk&&pk.open&&!pk.contains(e.target))pk.open=false;if(!pop.hidden&&!$('mp').contains(e.target))closePop();});
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
  const turn=add(node('div','turn')),work=node('div','work'),l=node('span','l'),wt=node('span','',''),ws=node('span','','Thinking');
  l.append(node('span','spin'),wt);work.append(l,ws);turn.appendChild(work);
  const box2=node('details','stepsbox'),sum2=node('summary','','Steps'),list=node('ol','steps');box2.open=true;box2.append(sum2,list);box2.hidden=true;turn.appendChild(box2);
  const t0=Date.now(),tick=()=>{wt.textContent='Working for '+secs(Date.now()-t0);};tick();const timer=setInterval(tick,1000);
  let live=null,count=0,answer=null,failed=false,link=null,video=null,lastNote='';
  const step=(html,cls,ic)=>{if(live&&live.classList.contains('live')){live.classList.remove('live');live.classList.add('ok');}const li=node('li','st '+(cls||'live')),si=node('span','si'),t=node('div','t');si.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+(SI[ic]||SI.sparkles)+'</svg>';t.innerHTML=html;li.append(si,t);list.appendChild(li);box2.hidden=false;count++;sum2.textContent='Steps ('+count+')';live=li;down();return li;};
  const code=(s)=>{const c=document.createElement('code');c.textContent=s;return c.outerHTML;};
  const txt=(s)=>{const c=document.createElement('span');c.textContent=s;return c.innerHTML;};
  const out=(s,bad)=>{if(!live||!s)return;const p=node('pre','',s.length>1500?s.slice(0,1500)+'\\n…':s);live.querySelector('.t').appendChild(p);if(bad){live.classList.remove('live','ok');live.classList.add('bad');live.querySelector('.si').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+SI.alert+'</svg>';}down();};
  const end=(ok)=>{clearInterval(timer);if(live&&live.classList.contains('live')){live.classList.remove('live');live.classList.add(ok?'ok':'bad');}work.classList.add(ok?'done':'fail');wt.textContent=(ok?'Worked for ':'Stopped after ')+secs(Date.now()-t0);ws.textContent='';if(ok&&count)box2.open=false;};
  try{
    const res=await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:JSON.stringify({task,history,providers:picked(),ai:{ai:aiSel.value,key:byoKey.value,model:byoModel.value}})});
    if(res.status===401){clearInterval(timer);turn.remove();try{sessionStorage.setItem('chat_pending',task);}catch(e){}signin.hidden=false;signin.scrollIntoView({block:'center'});go.disabled=false;return;}
    if(res.status===409){clearInterval(timer);turn.remove();pending=task;asstMsg('I need a computer for that. Connect one of your sandbox accounts below, once.');setup.hidden=false;setup.scrollIntoView({block:'start'});go.disabled=false;return;}
    if(res.status===429){const b=await res.json().catch(()=>({}));clearInterval(timer);work.remove();box2.remove();limitCard(turn,task,b);go.disabled=false;return;}
    if(!res.ok||!res.body){const b=await res.json().catch(()=>({}));throw new Error(b.error||('Chat answered '+res.status+'. Try again in a minute.'));}
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
        else if(ev.type==='video_start'){step('Making a video: '+txt(ev.title)+' '+txt('('+ev.scenes+' scenes)'),'','film');ws.textContent='Making a video';}
        else if(ev.type==='note'){if(ev.text!==lastNote){lastNote=ev.text;step(txt(ev.text),'',noteIcon(ev.text));}}
        else if(ev.type==='output'){if(ev.error)out(ev.error,true);else{if(ev.published)link=ev.published;if(ev.video)video=ev.video;out([ev.stdout,ev.stderr,ev.content].filter(Boolean).join('\\n').replace(/\\n$/,''),ev.exitCode>0);}}
        else if(ev.type==='pod_stopped')step('Computer stopped','ok','power');
        else if(ev.type==='answer')answer=ev.text;
        else if(ev.type==='error'){failed=true;turn.appendChild(node('div','err',ev.error));}
      }}
  }catch(err){failed=true;turn.appendChild(node('div','err',String(err.message||err)));}
  end(!failed||answer!==null);
  if(answer!==null){const a=node('div','a');linkify(a,answer);turn.appendChild(a);history.push({role:'assistant',content:answer});saveChat();}
  if(link){const r=node('div','result');r.innerHTML=IC.website.replace('<svg ','<svg width="34" height="34" style="border-radius:var(--radius);flex:none" aria-hidden="true" ')+'<div class="rt"><b>Your page is live</b><div class="url"></div></div>';r.querySelector('.url').textContent=link.replace(/^https?:\\/\\//,'');
    const cp=node('button','btn','Copy link');cp.type='button';cp.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(link).then(()=>{cp.textContent='Copied';setTimeout(()=>cp.textContent='Copy link',1500);});};
    const op=node('a','btn go','Open');op.href=link;op.target='_blank';op.rel='noopener';r.append(cp,op);turn.appendChild(r);}
  if(video){const v=node('div','vres'),pl=document.createElement('video');pl.controls=true;pl.preload='metadata';pl.playsInline=true;pl.src=video+'#t=0.8';
    const vb=node('div','vb');vb.innerHTML=svgAt(IC.video,30);vb.appendChild(node('b','','Your video is ready'));
    const dl=node('a','btn go','Download mp4');dl.href=video;dl.download='flisk-video.mp4';
    const cp=node('button','btn','Copy link');cp.type='button';cp.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(video).then(()=>{cp.textContent='Copied';setTimeout(()=>cp.textContent='Copy link',1500);});};
    vb.append(cp,dl);v.append(pl,vb);turn.appendChild(v);}
  down();go.disabled=false;box.focus();
}
// The free model's daily cap: say when it comes back and offer the way round it, and keep the task.
function limitCard(turn,task,b){
  if(history.length&&history[history.length-1].content===task)history.pop();
  const ms=Number(b.resetsIn)||0,h=Math.floor(ms/3600000),m=Math.round((ms%3600000)/60000),n=b.limit||20;
  const c=node('div','limit');c.innerHTML='<div class="ic"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M5 2h8M5 16h8M6 2c0 4 6 4 6 7s-6 3-6 7M12 2c0 4-6 4-6 7s6 3 6 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></div><div style="flex:1;min-width:0"><b></b><p></p><div class="acts"></div></div><div class="ring"></div>';
  c.querySelector('b').textContent=b.error||"You've used today's free tasks";
  c.querySelector('p').textContent='They come back in '+(h?h+' h ':'')+m+' min. Your task is back in the box: pick a model with your own key and it runs right away.';
  c.querySelector('.ring').textContent=n+'/'+n;
  const k=node('button','btn go','Use my API key');k.type='button';k.onclick=()=>{openPop();const p=MODELS.find(x=>!x.free);if(p){railOn=p.provider;drawRail();drawList();}};
  const cp=node('button','btn','Copy my task');cp.type='button';cp.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(task).then(()=>{cp.textContent='Copied';setTimeout(()=>cp.textContent='Copy my task',1500);});};
  c.querySelector('.acts').append(k,cp);turn.appendChild(c);box.value=task;fit();down();
}
// Zachman questions as a tree of squares: hover (or tap) one to choose it and see its smaller squares; the next
// question opens below, until all six are answered. "Other…" takes a typed answer.
const ZQ=window.__ZQ__||[];
let treeAnswer=null;
function ask6(task){
  chatting(true);
  const wrap=add(node('div','zq'));wrap.appendChild(node('div','h','A few quick questions so it fits you. Hover a square to choose it and see more, or type your own answer.'));
  const rows=node('div');rows.style.cssText='display:flex;flex-direction:column;gap:14px';const chips=node('div','zchips');wrap.append(rows,chips);
  let pick=[],sub=[],sent=false,prevLen=0;
  const ans=(i)=>pick[i]?pick[i]+(sub[i]?' ('+sub[i]+')':''):'';
  const finish=()=>{if(sent||!wrap.isConnected)return;sent=true;treeAnswer=null;box.placeholder='What should it do?';rows.remove();wrap.firstChild.textContent=pick.length?'Your answers':'Skipped the questions';const sk=chips.querySelector('.zskip');if(sk)sk.remove();
    const full=pick.length?task+'\\n\\nAnswers: '+pick.map((p,i)=>ZQ[i][0]+': '+ans(i)).join('; ')+'.':task;history.push({role:'user',content:full});run(full);};
  treeAnswer=(text)=>{if(sent)return;const i=Math.min(pick.length,ZQ.length-1);pick=pick.slice(0,i);sub=sub.slice(0,i);pick[i]=text.slice(0,120);draw();if(pick.length===ZQ.length)finish();};
  const hover=(el,fn)=>{let tm=0;el.onmouseenter=()=>{clearTimeout(tm);tm=setTimeout(fn,220);};el.onmouseleave=()=>clearTimeout(tm);return ()=>clearTimeout(tm);};
  const draw=()=>{if(!wrap.isConnected)return;const grew=pick.length>prevLen;prevLen=pick.length;rows.textContent='';
    for(let i=0;i<=Math.min(pick.length,ZQ.length-1);i++){const row=node('div','trow'+(grew&&i===pick.length?' new':''));row.appendChild(node('div','q',ZQ[i][1]));
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
form.onsubmit=(e)=>{e.preventDefault();const task=box.value.trim();if(!task||go.disabled||Date.now()-lastSend<800)return;
  if(!cur.free&&!byoKey.value.trim()){openPop();pick(cur);byoKey.focus();return;}
  lastSend=Date.now();box.value='';fit();if(treeAnswer){treeAnswer(task);return;}userMsg(task);
  if(!history.length&&BUILD.test(task)&&!ASK.test(task)){ask6(task);return;}history.push({role:'user',content:task});run(task);};
drawHist();
try{if(matchMedia('(pointer:fine)').matches)box.focus();}catch(e){}
if(window.__SIGNED__){try{const t=sessionStorage.getItem('chat_pending');if(t){sessionStorage.removeItem('chat_pending');userMsg(t);history.push({role:'user',content:t});run(t);}}catch(e){}}
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
    PROVIDER_CARDS.some((c) => c.id === id) ? (login ? '<a class="cbtn" href="#setup">Connect</a>' : '<a class="cbtn" href="/auth/start">Sign in</a>') : '<a class="cbtn" href="https://fleet.flisk.si/console?section=providers" target="_blank" rel="noopener">Connect</a>';
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
<section class="sidesec"><h4>Coming soon</h4><div class="soon">Voice talk <span class="tag">soon</span></div></section>
<div class="who">${login ? `<span>@${esc(login)}</span><a href="/auth/signout">Sign out</a>` : '<a class="btn go" href="/auth/start" style="width:100%;justify-content:center">Sign in with GitHub</a>'}</div>
</aside>
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
<form id="ask" class="composer"><textarea id="task" maxlength="2000" rows="2" placeholder="What should it do?" aria-label="Task"></textarea>
<div class="bar">
<div class="mp" id="mp"><button type="button" id="mpbtn" class="chip" aria-haspopup="listbox" aria-expanded="false" aria-controls="mppop"><i class="ti" style="display:inline-flex"></i><span>Flisk Wolf</span><i class="chev"></i></button>
<div id="mppop" class="pop" hidden><div class="ps"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input id="mq" type="search" placeholder="Search models" aria-label="Search models" autocomplete="off"></div>
<div class="pgrid"><div class="rail" id="rail" aria-label="Providers"></div><div class="mlist" id="mlist" role="listbox" aria-label="Models"></div></div>
<div id="byo" hidden><div><label for="byomodel">Model name</label><input id="byomodel" type="text" list="bymodels" placeholder="Start typing to search models" autocomplete="off"><datalist id="bymodels"></datalist></div><div><label id="byokeylabel" for="byokey">Your API key</label><input id="byokey" type="password" placeholder="Paste your API key" autocomplete="off"><div class="bystat"><span id="bystat"></span><button type="button" id="byrm" hidden>Remove key</button></div></div></div></div></div>
<details class="pick"><summary class="chip">${icon('fleet', 22)}<span id="sbsum">Fleet: cheapest first</span><i class="chev"></i></summary><div class="menu">${menu}</div></details>
<button type="button" class="chip plain" disabled title="Coming soon">Voice · soon</button>
<button id="go" class="send" type="submit" aria-label="Run"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 14V4M4.5 8.5L9 4l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
</div></form>
<p class="fine">Runs on a real computer from your own sandbox account. Enter sends, Shift+Enter adds a line.</p>
</div></div></div></div>
<select id="ai" hidden aria-hidden="true">${AI_CHOICES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>`,
    `window.__SIGNED__=${login ? 'true' : 'false'};window.__MODELS__=${inlineJson(list)};window.__CATS__=${inlineJson(CATS)};window.__ZQ__=${inlineJson(ZQ)};window.__LOGOS__=${inlineJson(Object.fromEntries(['anthropic', 'openai', 'openrouter'].filter((k) => LOGOS[k]).map((k) => [k, LOGOS[k]])))};window.__ICONS__=${inlineJson(Object.fromEntries(['wolf', 'website', 'app', 'answer', 'video'].map((k) => [k, bare(k)])))};` +
      APP_JS,
  );
}
