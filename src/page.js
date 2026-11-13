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
:root{--paper:#f7f5e4;--card:#fffef6;--ink:#171715;--dim:#6b6a5f;--green:#16a34a;--glow:#22c55e;--night:#0a0a0e;--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;--serif:Fraunces,'Times New Roman',serif;--sans:'Inter Tight',system-ui,-apple-system,'Segoe UI',sans-serif}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;overflow-x:clip}
body{margin:0;background:var(--paper) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.06'/%3E%3C/svg%3E");color:var(--ink);font:15px/1.55 var(--sans)}
a{color:inherit}.m{font-family:var(--mono);text-transform:uppercase;letter-spacing:.06em;font-size:12px}
.mark{display:inline-grid;place-items:center;width:22px;height:22px;background:var(--glow);color:var(--night);font:500 10px/1 var(--mono)}
.frame{max-width:980px;margin:0 auto;min-height:100vh;border-left:1px solid var(--ink);border-right:1px solid var(--ink);display:flex;flex-direction:column}
header{display:flex;justify-content:space-between;align-items:stretch;border-bottom:1px solid var(--ink);height:46px}
.logo{display:inline-flex;align-items:center;gap:9px;padding:0 20px;font:800 22px/1 var(--serif);letter-spacing:-.03em;text-decoration:none}
header .r{display:flex;align-items:center;gap:14px;padding:0 20px}
header a.cta{align-self:stretch;display:flex;align-items:center;padding:0 22px;margin-right:-20px;background:var(--ink);color:var(--paper);text-decoration:none}
header a.cta:hover{background:var(--green)}
.hero{padding:44px 40px 22px;border-bottom:1px solid var(--ink)}
h1{font:800 clamp(40px,7vw,76px)/.95 var(--serif);letter-spacing:-.045em;margin:0 0 16px}h1 em{font-style:normal;color:var(--green)}
.sub{font-size:17px;max-width:52ch;margin:0 0 22px}
.b,.btn{display:inline-block;border:1px solid var(--ink);padding:11px 18px;text-decoration:none;background:transparent;color:var(--ink);font:12px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em;cursor:pointer}
.b:hover,.btn:hover{background:var(--ink);color:var(--paper)}
.btn{background:var(--green);border-color:var(--green);color:#fff}.btn:hover{background:var(--ink);border-color:var(--ink)}
.btn[disabled]{opacity:.5;cursor:wait}
.pickers{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}
.pick{display:flex;flex-direction:column;gap:6px;min-width:230px}
.pick>label{font:11px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--dim)}
.pick select,.pick input[type=text],.pick input[type=password]{font:13px var(--mono);padding:10px;border:1px solid var(--ink);background:var(--card);color:inherit;border-radius:0}
details.pick{position:relative;align-self:flex-start}details.pick>summary{cursor:pointer;list-style:none;border:1px solid var(--ink);background:var(--card);padding:10px;font:13px var(--mono);min-width:260px}
details.pick>summary::before{content:'COMPUTERS  ';color:var(--dim);font-size:11px}details.pick>summary::after{content:' ▾'}
details.pick .menu{position:absolute;z-index:5;top:100%;left:0;right:0;background:var(--card);border:1px solid var(--ink);border-top:0;padding:8px 12px;max-height:300px;overflow:auto;font-size:14px}
details.pick .menu label{display:flex;gap:8px;align-items:center;padding:3px 0}
details.pick .menu .off{color:var(--dim)}details.pick .menu hr{border:0;border-top:1px solid var(--ink);margin:6px 0;opacity:.3}
#byo{display:flex;flex-direction:column;gap:6px}#byo[hidden]{display:none}
.cols{display:flex;flex-direction:column;flex:1}
.panel{padding:0}.panel h2{display:none}
.ideas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-bottom:1px solid var(--ink)}.ideas.gone{display:none}
@media (max-width:640px){.ideas{grid-template-columns:1fr}.hero{padding:28px 20px 18px}}
.ideas button{font:inherit;font-size:15px;border:0;border-right:1px solid var(--ink);border-bottom:1px solid var(--ink);background:transparent;color:inherit;padding:20px 24px 22px;cursor:pointer;text-align:left;line-height:1.4;position:relative}
.ideas button:nth-child(2n){border-right:0}.ideas button:nth-last-child(-n+2){border-bottom:0}
.ideas button::before{content:attr(data-n);display:block;font:11px/1 var(--mono);color:var(--dim);margin-bottom:10px;letter-spacing:.06em}
.ideas button:hover{background:var(--card)}.ideas button:hover::before{color:var(--green)}
#talk{display:flex;flex-direction:column;gap:14px;padding:24px 40px}#talk:empty{display:none}
@media (max-width:640px){#talk{padding:20px}}
.u{align-self:flex-end;max-width:85%;background:var(--ink);color:var(--paper);padding:10px 14px;white-space:pre-wrap}
.a{white-space:pre-wrap;background:var(--card);border:1px solid var(--ink);padding:12px 16px;max-width:92%}.a a{word-break:break-all;font-weight:600;color:var(--green)}
.err{color:#b42318;white-space:pre-wrap;border:1px dashed #b42318;padding:12px 16px}
#comp{margin:0 40px 20px;border:1px solid var(--ink)}#comp[hidden]{display:none}
@media (max-width:640px){#comp{margin:0 20px 16px}}
#comp h3{margin:0;padding:8px 12px;font:11px/1.3 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--dim);border-bottom:1px solid var(--ink);background:var(--card);font-weight:400}
#screen{font:13px/1.55 var(--mono);background:var(--night);color:#e8e8e8;padding:12px;min-height:120px;max-height:36vh;overflow:auto;white-space:pre-wrap;word-break:break-word}
#screen .c{color:var(--glow)}#screen .d{color:#8b8f98}#screen .x{color:#ff7b72}
#talk>*{scroll-margin-bottom:140px}
.dock{position:sticky;bottom:0;margin-top:auto;z-index:4}
.chatting .hero h1,.chatting .hero .sub{display:none}.chatting .hero{padding-top:16px;padding-bottom:16px}
form.ask{display:flex;gap:0;background:var(--card);border-top:1px solid var(--ink)}
form.ask textarea{flex:1;min-height:64px;max-height:160px;font:15px var(--sans);padding:18px 40px;border:0;outline:0;background:transparent;color:inherit;resize:none}
@media (max-width:640px){form.ask textarea{padding:16px 20px}}
form.ask .btn{border-width:0 0 0 1px;border-color:var(--ink);padding:0 28px}form.ask .btn::after{content:' >>>'}
.cards{display:grid;gap:10px;margin:0;padding:20px 40px}
.card{border:1px solid var(--ink);background:var(--card);padding:14px 16px}.card b{display:block}.card small{color:var(--dim)}.card small a{color:var(--green)}
.card form{display:flex;gap:8px;margin-top:10px}.card input{flex:1;font:13px var(--mono);padding:9px;border:1px solid var(--ink);background:transparent;color:inherit;min-width:0;border-radius:0}
.note{font:11px/1.5 var(--mono);text-transform:uppercase;letter-spacing:.04em;color:var(--dim);padding:0 40px 16px;margin:0}
#signin{margin:0 40px 20px}
.frame.app{max-width:1240px}
.shell{display:grid;grid-template-columns:260px minmax(0,1fr);flex:1;min-height:0}
@media (max-width:860px){.shell{grid-template-columns:1fr}.rail{order:2}.rail{border-right:0!important;border-bottom:1px solid var(--ink)}}
.rail{border-right:1px solid var(--ink);display:flex;flex-direction:column}
.rail section{border-bottom:1px solid var(--ink);padding:14px 16px}
.rail h4{margin:0 0 10px;font:11px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--dim);font-weight:400;display:flex;justify-content:space-between}
.rail h4 a{color:var(--green);text-decoration:none}
.newchat{display:block;width:100%;text-align:center}
#hist{list-style:none;margin:0;padding:0;max-height:34vh;overflow:auto}
#hist li{display:flex;align-items:center;border-bottom:1px dashed rgba(23,23,21,.2)}
#hist li button{flex:1;text-align:left;font:13px/1.35 var(--sans);background:none;border:0;padding:7px 0;cursor:pointer;color:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#hist li button:hover{color:var(--green)}#hist li .x{flex:0;color:var(--dim);padding:7px 4px}
#hist .none{font-size:13px;color:var(--dim);border:0;padding:4px 0}
.comps{list-style:none;margin:0;padding:0;font-size:13px}
.comps li{padding:4px 0}.comps .on::before{content:'● ';color:var(--glow)}
.comps .off{color:var(--dim)}
.soon{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;padding:5px 0}
.tag{font:10px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em;border:1px solid var(--ink);padding:3px 6px;color:var(--dim);white-space:nowrap}
.main{display:flex;flex-direction:column;min-width:0}
.tools{display:flex;gap:8px;align-items:center;padding:8px 40px 0;background:var(--card);border-top:1px solid var(--ink)}
@media (max-width:640px){.tools{padding:8px 20px 0}}
.tools button{font:11px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em;border:1px dashed var(--dim);background:none;color:var(--dim);padding:6px 9px;cursor:not-allowed}
form.ask{border-top:0}
.tree{display:flex;flex-direction:column;gap:8px;max-width:100%}
.trow{display:flex;gap:8px;align-items:stretch}
.trow .q{width:120px;flex:none;font:11px/1.3 var(--mono);text-transform:uppercase;letter-spacing:.05em;color:var(--dim);padding-top:12px}
.sq{flex:1;border:0;border-radius:0;padding:12px;font:14px/1.3 var(--sans);cursor:pointer;min-height:50px;text-align:left;transition:flex .25s,transform .25s,box-shadow .2s}
.sq:hover,.sq:focus-visible,.sq.on{flex:1.8;box-shadow:inset 0 0 0 3px var(--ink);outline:0}
.p0{background:#D9622B;color:#171715}.p1{background:#E8C21A;color:#171715}.p2{background:#3FD3D6;color:#171715}.p3{background:#DB7BB2;color:#171715}
.zchips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.zchip{font:11px var(--mono);text-transform:uppercase;border-radius:0;padding:4px 10px;background:var(--card);border:1px solid rgba(23,23,21,.15);color:var(--dim)}
.zchip.ok{background:var(--ink);border-color:var(--ink);color:#E8C21A}
.zskip{font:11px var(--mono);text-transform:uppercase;background:#E8C21A;border:0;padding:6px 12px;color:var(--ink);cursor:pointer}
@media (max-width:640px){.trow{flex-wrap:wrap}.trow .q{width:100%;padding:0}}
`;

const shell = (title, body, script = '', cls = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="noindex"><meta name="description" content="Ask for a task or a website. Flisk Chat gets a real computer and does it."><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,800&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"><style>${CSS}</style></head><body><div class="frame ${cls}">${body}</div>${script ? `<script>${script}</script>` : ''}</body></html>`;

export const homePage = () =>
  shell(
    'Flisk Chat',
    `<header><a class="logo" href="/"><span class="mark">C</span>chat</a><span class="r m"><a href="https://flisk.si">Flisk</a></span></header>
<h1>Ask for a website.<br>It gets a <em>computer.</em></h1>
<p class="sub">Type what you want. Flisk's free model plans it, runs it on a real computer from your own sandbox account, and gives you the result and a live link. Sign in with GitHub, nothing else.</p>
<a class="btn" href="/auth/start">Sign in with GitHub</a>
<p class="note">Beta. Computers come from your own provider account (several have free credit), so chat costs you nothing and us nothing.</p>`,
  );

export const messagePage = (title, text) => shell(`${title} · chat`, `<header><a class="logo" href="/"><span class="mark">C</span>chat</a></header><h1>${esc(title)}</h1><p class="sub">${esc(text)}</p><a class="btn" href="/">Back</a>`);

const IDEAS = [
  'Make me a one-page website for a coffee shop called Moon Roast.',
  'Build a tip calculator web page with a dark theme.',
  'What is the 40th Fibonacci number? Check it with Python.',
  'Fetch https://flisk.si and tell me its page title.',
];

const APP_JS = `
const talk=document.getElementById('talk'),screen=document.getElementById('screen'),form=document.getElementById('ask'),box=document.getElementById('task'),go=document.getElementById('go'),setup=document.getElementById('setup'),signin=document.getElementById('signin');
let history=[];const comp=document.getElementById('comp'),hist=document.getElementById('hist');
const el=(cls,text)=>{const d=document.createElement('div');d.className=cls;if(cls==='a')linkify(d,text);else d.textContent=text;talk.appendChild(d);d.scrollIntoView({block:"nearest"});return d;};
// Past chats live in this browser only (localStorage), never on our server.
const KEY='chat_history_v1';let chatId=null;
const loadAll=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){return [];}};
const saveAll=(all)=>{try{localStorage.setItem(KEY,JSON.stringify(all.slice(0,30)));}catch(e){}};
const saveChat=()=>{if(!history.length)return;const all=loadAll().filter(c=>c.id!==chatId);if(!chatId)chatId=Date.now().toString(36);all.unshift({id:chatId,title:history[0].content.slice(0,80),msgs:history});saveAll(all);drawHist();};
function drawHist(){const all=loadAll();hist.textContent='';if(!all.length){const li=document.createElement('li');li.className='none';li.textContent='No chats yet. They stay in this browser.';hist.appendChild(li);return;}
  all.forEach(c=>{const li=document.createElement('li'),b=document.createElement('button'),x=document.createElement('button');b.textContent=c.title;b.title=c.title;b.onclick=()=>openChat(c);x.className='x';x.textContent='×';x.title='Delete this chat';x.setAttribute('aria-label','Delete chat');x.onclick=()=>{saveAll(loadAll().filter(o=>o.id!==c.id));if(chatId===c.id)newChat();drawHist();};li.append(b,x);hist.appendChild(li);});}
function newChat(){history=[];go.disabled=false;chatId=null;talk.textContent='';screen.textContent='';comp.hidden=true;document.getElementById('ideas').classList.remove('gone');document.body.classList.remove('chatting');box.focus();}
function openChat(c){newChat();chatId=c.id;history=c.msgs.slice();document.getElementById('ideas').classList.add('gone');document.body.classList.add('chatting');history.forEach(m=>el(m.role==='user'?'u':'a',m.content));}
document.getElementById('newchat').onclick=newChat;
const say=(cls,text)=>{comp.hidden=false;const s=document.createElement('span');if(cls)s.className=cls;s.textContent=text+'\\n';screen.appendChild(s);screen.scrollTop=screen.scrollHeight;};
const linkify=(node,text)=>{node.textContent='';text.split(/(https?:\\/\\/[^\\s)]+)/).forEach(p=>{if(/^https?:\\/\\//.test(p)){const a=document.createElement('a');a.href=p;a.target='_blank';a.rel='noopener';a.textContent=p;node.appendChild(a);}else node.appendChild(document.createTextNode(p));});};
document.querySelectorAll('.ideas button').forEach(b=>b.onclick=()=>{box.value=b.childNodes[0].textContent;box.focus();});
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
  go.disabled=true;document.getElementById('ideas').classList.add('gone');document.body.classList.add('chatting');const wait=el('a','Working…');screen.textContent='';say('d','# new task');let answer=null;
  try{
    const res=await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:JSON.stringify({task,history,providers:picked(),ai:{ai:aiSel.value,key:byoKey.value,model:byoModel.value}})});
    if(res.status===401){wait.remove();try{sessionStorage.setItem('chat_pending',task);}catch(e){}signin.hidden=false;el('a','To run this I need you signed in with GitHub (one click). Your task is saved.');signin.scrollIntoView({block:'center'});go.disabled=false;return;}
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
  if(answer!==null){linkify(wait,answer);history.push({role:'assistant',content:answer});saveChat();}
  go.disabled=false;box.focus();
}
// Zachman questions as a tree of squares: hover (or tap) one, the next row opens, until all six are answered.
const ZQ=[['What','What is it?',['A website','A small app','An answer or check']],['Who','Who is it for?',['Customers','My team','Just me']],['Why','Why do you need it?',['Sell more','Look professional','Try an idea']],['Where','Where should it live?',['A live link','Code I can keep','Only this chat']],['When','When do you need it?',['Right now','Polished, no rush','A quick draft']],['How','How should it feel?',['Bold','Calm','Playful']]];
function ask6(task){
  go.disabled=true;document.getElementById('ideas').classList.add('gone');document.body.classList.add('chatting');
  const wrap=document.createElement('div');wrap.className='tree';talk.appendChild(wrap);
  const rows=document.createElement('div');rows.className='tree';const chips=document.createElement('div');chips.className='zchips';wrap.append(rows,chips);
  let pick=[],sent=false;
  const finish=()=>{if(sent)return;sent=true;wrap.querySelectorAll('button').forEach(b=>b.disabled=true);
    const full=pick.length?task+'\\n\\nAnswers: '+pick.map((p,i)=>ZQ[i][0]+': '+p).join('; ')+'.':task;
    history.push({role:'user',content:full});run(full);};
  const draw=()=>{rows.textContent='';
    for(let i=0;i<=Math.min(pick.length,ZQ.length-1);i++){const row=document.createElement('div');row.className='trow';row.style.marginLeft=(i*14)+'px';
      const q=document.createElement('div');q.className='q';q.textContent=ZQ[i][1];row.appendChild(q);
      ZQ[i][2].forEach((t,k)=>{const s=document.createElement('button');s.type='button';s.className='sq p'+((i+k)%4)+(pick[i]===t?' on':'');s.textContent=t;
        const choose=()=>{if(sent||pick[i]===t)return;pick=pick.slice(0,i);pick[i]=t;draw();};
        s.onmouseenter=choose;s.onfocus=choose;s.onclick=()=>{choose();if(pick.length===ZQ.length)finish();};row.appendChild(s);});
      rows.appendChild(row);}
    chips.textContent='';ZQ.forEach((z,i)=>{const c=document.createElement('span');c.className='zchip'+(pick[i]?' ok':'');c.textContent=z[0]+(pick[i]?': '+pick[i]:'');chips.appendChild(c);});
    const sk=document.createElement('button');sk.type='button';sk.className='zskip';sk.textContent=pick.length===ZQ.length?'Build it >>>':'Skip, just run it';sk.onclick=finish;chips.appendChild(sk);
    wrap.scrollIntoView({block:"nearest"});};
  draw();
}
form.onsubmit=(e)=>{e.preventDefault();const task=box.value.trim();if(!task)return;box.value='';el('u',task);if(!history.length){ask6(task);return;}history.push({role:'user',content:task});run(task);};
drawHist();
if(window.__SIGNED__){try{const t=sessionStorage.getItem('chat_pending');if(t){sessionStorage.removeItem('chat_pending');el('u',t);history.push({role:'user',content:t});run(t);}}catch(e){}}
`;

export function appPage({ login, connected = [] }) {
  const cards = PROVIDER_CARDS.map(
    (p) => `<div class="card"><b>${esc(p.label)}</b><small>${esc(p.note)} <a href="${esc(p.url)}" target="_blank" rel="noopener">Get a key</a></small><form data-p="${esc(p.id)}"><input type="password" autocomplete="off" placeholder="Paste the API key" aria-label="${esc(p.label)} API key"><button class="btn" type="submit">Connect</button></form></div>`,
  ).join('');
  return shell(
    'Flisk Chat',
    `<header><a class="logo" href="/"><span class="mark">C</span>chat</a>${login ? `<span class="r m">@${esc(login)} · <a href="/auth/signout">sign out</a></span>` : '<span class="r m"><a class="cta m" href="/auth/start">Sign in with GitHub</a></span>'}</header>
<div class="shell"><aside class="rail">
<section><button type="button" id="newchat" class="btn newchat">+ New chat</button></section>
<section><h4>History</h4><ul id="hist"></ul></section>
<section><h4>Computers &amp; keys <a href="https://fleet.flisk.si/console?section=providers" target="_blank" rel="noopener">manage</a></h4><ul class="comps">${
      login && connected.length
        ? connected.map((id) => `<li class="on">${esc(PROVIDER_NAMES[id] || id)}</li>`).join('')
        : `<li class="off">${login ? 'None connected yet' : 'Sign in to see yours'}</li>`
    }</ul>${login ? '<p style="margin:8px 0 0;font-size:12px;color:var(--dim)">Add a key here, or remove one in fleet (manage). Keys are stored encrypted in fleet; your own AI key is never saved.</p>' : ''}</section>
<section><h4>Coming soon</h4><div class="soon">🎙 Voice talk <span class="tag">soon</span></div><div class="soon">🎬 Video generation <span class="tag">soon</span></div><p style="margin:6px 0 0;font-size:12px;color:var(--dim)">Talk to chat and hear it answer in Ava, the warm voice from Flisk videos.</p></section>
</aside><div class="main">
<div class="hero"><h1>What should we <em>get done?</em></h1>
<p class="sub">${!login ? 'Type a task or a website idea. It runs on a real computer and gives you the result and a live link. You sign in with GitHub only when you press Run.' : connected.length ? `Connected computers: ${connected.map((id) => esc(PROVIDER_NAMES[id] || id)).join(', ')}. Fleet picks the cheapest one, or tick the ones you want.` : 'No computer connected yet: the first task will ask you for one key.'}</p>
<div class="pickers">
<div class="pick"><label for="ai">AI</label><select id="ai">${AI_CHOICES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
<div id="byo" hidden><input id="byomodel" type="text" placeholder="Model name (blank: Claude default)" aria-label="Model name" autocomplete="off"><input id="byokey" type="password" placeholder="Your API key (used for this task only, never saved)" aria-label="API key" autocomplete="off"></div></div>
<details class="pick"><summary id="sbsum">Fleet (auto: cheapest first)</summary><div class="menu"><label><input type="checkbox" id="auto" checked> <b>Fleet</b> (auto: cheapest first, falls back)</label><hr>${Object.entries(PROVIDER_NAMES).map(([id, name]) => (connected.includes(id) ? `<label><input type="checkbox" name="sb" value="${esc(id)}" data-label="${esc(name)}"> ${esc(name)}</label>` : `<label class="off">${esc(name)} · ${PROVIDER_CARDS.some((c) => c.id === id) ? '<a href="#setup">connect</a>' : '<a href="https://fleet.flisk.si/console?section=providers" target="_blank" rel="noopener">connect</a>'}</label>`)).join('')}</div></details>
</div></div>
<div class="cols">
<div class="panel"><h2>Chat</h2><div class="ideas" id="ideas">${IDEAS.map((i, n) => `<button type="button" data-n="0${n + 1} / TRY">${esc(i)}</button>`).join('')}</div><div id="talk" aria-live="polite"></div>
<div id="setup" ${connected.length ? 'hidden' : 'hidden'}><div class="cards">${cards}</div><p class="note">Your key is stored encrypted and is only used to start your computers. Free credit comes from the provider, not from us.</p></div>
<div id="signin" class="card" hidden><b>Sign in to run this</b><small>One click with GitHub. Nothing else to create: your task is kept and runs right after.</small><div style="margin-top:8px"><a class="btn" href="/auth/start">Sign in with GitHub</a></div></div>
</div>
<div id="comp" hidden><h3>Computer</h3><div id="screen" aria-label="What the computer did"></div></div>
<div class="dock"><div class="tools"><button type="button" disabled title="Coming soon">🎙 Voice · soon</button><button type="button" disabled title="Coming soon">🎬 Video · soon</button></div>
<form id="ask" class="ask"><textarea id="task" maxlength="2000" placeholder="What should it do?" aria-label="Task"></textarea><button id="go" class="btn" type="submit">Run</button></form></div>
</div></div></div>`,
    `window.__SIGNED__=${login ? 'true' : 'false'};` + APP_JS,
    'app',
  );
}
