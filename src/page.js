const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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

const CSS = `
:root{--bg:#faf9f4;--fg:#1a1a14;--dim:#76746a;--line:#dedbcd;--card:#fff;--accent:#1f7a3d;--term:#12130f;--termfg:#e8e8e8}
@media (prefers-color-scheme:dark){:root{--bg:#12130f;--fg:#f1efdc;--dim:#a19f8d;--line:#2e2f26;--card:#1a1b15;--accent:#58c27d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}.m{font:14px ui-monospace,Menlo,monospace}
.wrap{max-width:820px;margin:0 auto;padding:20px 16px 40px;min-height:100vh;display:flex;flex-direction:column}
header{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;margin-bottom:28px;border-bottom:1px solid var(--line)}
header b{font:700 18px ui-monospace,Menlo,monospace}header b i{color:var(--accent);font-style:normal}
h1{font-size:clamp(28px,5vw,44px);line-height:1.1;margin:0 0 10px;letter-spacing:-.025em;text-align:center}
.sub{max-width:600px;color:var(--dim);margin:0 auto 22px;text-align:center}
.btn{display:inline-block;font:inherit;font-weight:600;background:var(--accent);color:#fff;border:0;border-radius:10px;padding:10px 18px;cursor:pointer;text-decoration:none}
.btn[disabled]{opacity:.5;cursor:default}
.cols{display:flex;flex-direction:column;gap:16px;flex:1}
.panel{border:0;padding:0}.panel h2{display:none}
#talk{display:flex;flex-direction:column;gap:14px;max-height:none}
#talk:empty{display:none}
.u{align-self:flex-end;max-width:85%;background:var(--accent);color:#fff;border-radius:16px 16px 4px 16px;padding:9px 14px;white-space:pre-wrap}
.a{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);border-radius:16px 16px 16px 4px;padding:10px 14px;max-width:92%}.a a{word-break:break-all;font-weight:600}.err{color:#b42318;white-space:pre-wrap;background:var(--card);border:1px solid #b42318;border-radius:12px;padding:10px 14px}
#comp{border:1px solid var(--line);border-radius:12px;overflow:hidden}#comp[hidden]{display:none}
#comp h3{margin:0;padding:8px 12px;font:600 12px ui-monospace,Menlo,monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);border-bottom:1px solid var(--line);background:var(--card)}
#screen{font:13px ui-monospace,Menlo,monospace;background:var(--term);color:var(--termfg);padding:12px;min-height:120px;max-height:36vh;overflow:auto;white-space:pre-wrap;word-break:break-word}
#screen .c{color:#7ee787}#screen .d{color:#9aa0a6}#screen .x{color:#ff7b72}
form.ask{display:flex;gap:8px;align-items:flex-end;margin-top:auto;position:sticky;bottom:12px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:8px;box-shadow:0 4px 20px rgba(0,0,0,.08)}
form.ask textarea{flex:1;min-height:48px;max-height:160px;font:inherit;padding:8px 10px;border:0;outline:0;background:transparent;color:inherit;resize:none}
.ideas{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0}.ideas.gone{display:none}
@media (max-width:600px){.ideas{grid-template-columns:1fr}}
.ideas button{font:inherit;font-size:14px;border:1px solid var(--line);background:var(--card);color:inherit;padding:12px 14px;cursor:pointer;text-align:left;border-radius:12px;line-height:1.35}
.ideas button:hover{border-color:var(--accent)}
.cards{display:grid;gap:10px;margin:10px 0}
.card{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:12px 14px}.card b{display:block}.card small{color:var(--dim)}
.card form{display:flex;gap:8px;margin-top:8px}.card input{flex:1;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;min-width:0}
.note{font-size:13px;color:var(--dim);margin-top:10px;text-align:center}
.pickers{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 18px;align-items:flex-start;justify-content:center}
.pick{display:flex;flex-direction:column;gap:4px;min-width:210px}
.pick>label{display:none}
.pick select,.pick input[type=text],.pick input[type=password]{font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:inherit}
details.pick{position:relative}details.pick>summary{cursor:pointer;list-style:none;border:1px solid var(--line);border-radius:10px;background:var(--card);padding:8px 10px;font-size:14px;min-width:240px}
details.pick>summary::after{content:' ▾';color:var(--dim)}
details.pick .menu{position:absolute;z-index:5;top:calc(100% + 4px);left:0;right:0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px 10px;max-height:300px;overflow:auto;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.12)}
details.pick .menu label{display:flex;gap:8px;align-items:center;padding:3px 0}
details.pick .menu .off{color:var(--dim)}details.pick .menu hr{border:0;border-top:1px solid var(--line);margin:6px 0}
#byo{display:flex;flex-direction:column;gap:6px}#byo[hidden]{display:none}
`;

const shell = (title, body, script = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="noindex"><meta name="description" content="Ask for a task or a website. Flisk Chat gets a real computer and does it."><style>${CSS}</style></head><body><div class="wrap">${body}</div>${script ? `<script>${script}</script>` : ''}</body></html>`;

export const homePage = () =>
  shell(
    'Flisk Chat',
    `<header><b>chat<i>.</i>flisk</b><a href="https://flisk.si">Flisk</a></header>
<h1>Ask for a website.<br>It gets a computer.</h1>
<p class="sub">Type what you want. Flisk's free model plans it, runs it on a real computer from your own sandbox account, and gives you the result and a live link. Sign in with GitHub, nothing else.</p>
<a class="btn" href="/auth/start">Sign in with GitHub</a>
<p class="note">Beta. Computers come from your own provider account (several have free credit), so chat costs you nothing and us nothing.</p>`,
  );

export const messagePage = (title, text) => shell(`${title} · chat`, `<header><b>chat<i>.</i>flisk</b></header><h1>${esc(title)}</h1><p class="sub">${esc(text)}</p><a class="btn" href="/">Back</a>`);

const IDEAS = [
  'Make me a one-page website for a coffee shop called Moon Roast.',
  'Build a tip calculator web page with a dark theme.',
  'What is the 40th Fibonacci number? Check it with Python.',
  'Fetch https://flisk.si and tell me its page title.',
];

const APP_JS = `
const talk=document.getElementById('talk'),screen=document.getElementById('screen'),form=document.getElementById('ask'),box=document.getElementById('task'),go=document.getElementById('go'),setup=document.getElementById('setup'),signin=document.getElementById('signin');
const history=[],comp=document.getElementById('comp');
const el=(cls,text)=>{const d=document.createElement('div');d.className=cls;d.textContent=text;talk.appendChild(d);talk.scrollTop=talk.scrollHeight;return d;};
const say=(cls,text)=>{comp.hidden=false;const s=document.createElement('span');if(cls)s.className=cls;s.textContent=text+'\\n';screen.appendChild(s);screen.scrollTop=screen.scrollHeight;};
const linkify=(node,text)=>{node.textContent='';text.split(/(https?:\\/\\/[^\\s)]+)/).forEach(p=>{if(/^https?:\\/\\//.test(p)){const a=document.createElement('a');a.href=p;a.target='_blank';a.rel='noopener';a.textContent=p;node.appendChild(a);}else node.appendChild(document.createTextNode(p));});};
document.querySelectorAll('.ideas button').forEach(b=>b.onclick=()=>{box.value=b.textContent;box.focus();});
box.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
const aiSel=document.getElementById('ai'),byo=document.getElementById('byo'),byoKey=document.getElementById('byokey'),byoModel=document.getElementById('byomodel');
const auto=document.getElementById('auto'),opts=[...document.querySelectorAll('input[name=sb]')],sum=document.getElementById('sbsum');
const syncAi=()=>{byo.hidden=aiSel.value==='wolf';try{sessionStorage.setItem('chat_ai',aiSel.value);}catch(e){}};
aiSel.onchange=syncAi;try{const v=sessionStorage.getItem('chat_ai');if(v&&[...aiSel.options].some(o=>o.value===v))aiSel.value=v;}catch(e){}syncAi();
const picked=()=>opts.filter(o=>o.checked).map(o=>o.value);
const syncSb=()=>{const p=picked();auto.checked=!p.length;sum.textContent=p.length?p.map(x=>document.querySelector('input[value='+x+']').dataset.label).join(', '):'Fleet (auto: cheapest first)';};
auto.onchange=()=>{if(auto.checked)opts.forEach(o=>o.checked=false);syncSb();};
opts.forEach(o=>o.onchange=syncSb);syncSb();
document.querySelectorAll('a[href="#setup"]').forEach(a=>a.onclick=()=>{setup.hidden=false;});
let pending=null;
document.querySelectorAll('.card form').forEach(f=>f.onsubmit=async(e)=>{
  e.preventDefault();const input=f.querySelector('input'),btn=f.querySelector('button'),id=f.dataset.p;
  btn.disabled=true;const res=await fetch('/api/connect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:id,key:input.value})});
  const b=await res.json().catch(()=>({}));btn.disabled=false;
  if(!res.ok){el('err',b.error||'could not save that key');return;}
  input.value='';setup.hidden=true;el('a','Connected. Running your task…');
  if(pending){const t=pending;pending=null;run(t);}
});
async function run(task){
  go.disabled=true;document.getElementById('ideas').classList.add('gone');const wait=el('a','Working…');screen.textContent='';say('d','# new task');let answer=null;
  try{
    const res=await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:JSON.stringify({task,history,providers:picked(),ai:{ai:aiSel.value,key:byoKey.value,model:byoModel.value}})});
    if(res.status===401){wait.remove();try{sessionStorage.setItem('chat_pending',task);}catch(e){}signin.hidden=false;el('a','To run this I need you signed in with GitHub (one click). Your task is saved.');go.disabled=false;return;}
    if(res.status===409){wait.remove();pending=task;setup.hidden=false;el('a','I need a computer for that. Connect one of your sandbox accounts below (once).');go.disabled=false;return;}
    if(!res.ok||!res.body){const b=await res.json().catch(()=>({}));throw new Error(b.error||('error '+res.status));}
    const rd=res.body.getReader(),dec=new TextDecoder();let buf='';
    for(;;){const {value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
      while((i=buf.indexOf('\\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);if(!line.trim())continue;const ev=JSON.parse(line);
        if(ev.type==='thinking')wait.textContent='Thinking (step '+ev.step+')…';
        else if(ev.type==='pod_starting')say('d','# starting a computer…');
        else if(ev.type==='pod_started')say('d','# computer ready on '+ev.provider);
        else if(ev.type==='run')say('c','$ '+ev.command);
        else if(ev.type==='write')say('c','> write '+ev.path+' ('+ev.bytes+' chars)');
        else if(ev.type==='read')say('c','> read '+ev.path);
        else if(ev.type==='publish')say('c','> publish '+ev.path);
        else if(ev.type==='output'){if(ev.error)say('x',ev.error);else{if(ev.published)say('c','live: '+ev.published);if(ev.stdout)say('',ev.stdout.replace(/\\n$/,''));if(ev.stderr)say('x',ev.stderr.replace(/\\n$/,''));if(ev.content)say('',ev.content);if(ev.exitCode!==undefined)say('d','# exit '+ev.exitCode);}}
        else if(ev.type==='pod_stopped')say('d','# computer stopped');
        else if(ev.type==='answer')answer=ev.text;
        else if(ev.type==='error'){wait.className='err';wait.textContent=ev.error;}
        else if(ev.type==='done'&&ev.ms)say('d','# '+(ev.ms/1000).toFixed(1)+' s');
      }}
  }catch(err){wait.className='err';wait.textContent=String(err.message||err);}
  if(answer!==null){linkify(wait,answer);history.push({role:'assistant',content:answer});}
  go.disabled=false;box.focus();
}
form.onsubmit=(e)=>{e.preventDefault();const task=box.value.trim();if(!task)return;box.value='';el('u',task);history.push({role:'user',content:task});run(task);};
if(window.__SIGNED__){try{const t=sessionStorage.getItem('chat_pending');if(t){sessionStorage.removeItem('chat_pending');el('u',t);history.push({role:'user',content:t});run(t);}}catch(e){}}
`;

export function appPage({ login, connected = [] }) {
  const cards = PROVIDER_CARDS.map(
    (p) => `<div class="card"><b>${esc(p.label)}</b><small>${esc(p.note)} <a href="${esc(p.url)}" target="_blank" rel="noopener">Get a key</a></small><form data-p="${esc(p.id)}"><input type="password" autocomplete="off" placeholder="Paste the API key" aria-label="${esc(p.label)} API key"><button class="btn" type="submit">Connect</button></form></div>`,
  ).join('');
  return shell(
    'Flisk Chat',
    `<header><b>chat<i>.</i>flisk</b>${login ? `<span class="m">@${esc(login)} · <a href="/auth/signout">sign out</a></span>` : '<a class="m" href="/auth/start">Sign in with GitHub</a>'}</header>
<h1>What should we get done?</h1>
<p class="sub">${!login ? 'Type a task or a website idea. It runs on a real computer and gives you the result and a live link. You sign in with GitHub only when you press Run.' : connected.length ? `Connected computers: ${connected.map((id) => esc(PROVIDER_NAMES[id] || id)).join(', ')}. Fleet picks the cheapest one, or tick the ones you want.` : 'No computer connected yet: the first task will ask you for one key.'}</p>
<div class="pickers">
<div class="pick"><label for="ai">AI</label><select id="ai">${AI_CHOICES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
<div id="byo" hidden><input id="byomodel" type="text" placeholder="Model name (blank: Claude default)" aria-label="Model name" autocomplete="off"><input id="byokey" type="password" placeholder="Your API key (used for this task only, never saved)" aria-label="API key" autocomplete="off"></div></div>
<details class="pick"><summary id="sbsum">Fleet (auto: cheapest first)</summary><div class="menu"><label><input type="checkbox" id="auto" checked> <b>Fleet</b> (auto: cheapest first, falls back)</label><hr>${Object.entries(PROVIDER_NAMES).map(([id, name]) => (connected.includes(id) ? `<label><input type="checkbox" name="sb" value="${esc(id)}" data-label="${esc(name)}"> ${esc(name)}</label>` : `<label class="off">${esc(name)} · ${PROVIDER_CARDS.some((c) => c.id === id) ? '<a href="#setup">connect</a>' : '<a href="https://fleet.flisk.si/console?section=providers" target="_blank" rel="noopener">connect</a>'}</label>`)).join('')}</div></details>
</div>
<div class="cols">
<div class="panel"><h2>Chat</h2><div class="ideas" id="ideas">${IDEAS.map((i) => `<button type="button">${esc(i)}</button>`).join('')}</div><div id="talk" aria-live="polite"></div>
<div id="setup" ${connected.length ? 'hidden' : 'hidden'}><div class="cards">${cards}</div><p class="note">Your key is stored encrypted and is only used to start your computers. Free credit comes from the provider, not from us.</p></div>
<div id="signin" class="card" hidden><b>Sign in to run this</b><small>One click with GitHub. Nothing else to create: your task is kept and runs right after.</small><div style="margin-top:8px"><a class="btn" href="/auth/start">Sign in with GitHub</a></div></div>
</div>
<div id="comp" hidden><h3>Computer</h3><div id="screen" aria-label="What the computer did"></div></div>
<form id="ask" class="ask"><textarea id="task" maxlength="2000" placeholder="What should it do?" aria-label="Task"></textarea><button id="go" class="btn" type="submit">Run</button></form>
</div>`,
    `window.__SIGNED__=${login ? 'true' : 'false'};` + APP_JS,
  );
}
