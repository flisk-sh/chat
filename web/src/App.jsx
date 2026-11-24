import {useState, useEffect, useRef, useCallback} from 'react';
import {Tip, ExplainContext} from './Tip.jsx';
import {Brand} from './Brand.jsx';
import {Oracle} from './Oracle.jsx';
import {Demo} from './MenuDemos.jsx';
import {ModelDialog, ComputerDialog, brandOf} from './Pickers.jsx';
import {BOOT, runTask, podOk, getPod, runInBrowser, keyFor, modelFor, lsGet, orStartLogin, orFinishLogin, loadChats, saveChats, deleteChat, vaultReady} from './api.js';
import {markEngaged} from './engaged.js';
import {Widget, WorkerCard, BrowserAnswer} from './Cards.jsx';
import {newTurn, applyEv, nextSteps, chatTitle, shownText, liveText, pictures, wantsVoice, resetText} from './events.js';
import {QuestionMarkCircleIcon} from '@heroicons/react/24/outline';
import {AppShell, useAppShellMobile} from '@astryxdesign/core/AppShell';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {MobileNav, MobileNavToggle} from '@astryxdesign/core/MobileNav';
import {SideNav, SideNavItem, SideNavSection, SideNavRenderContext} from '@astryxdesign/core/SideNav';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Card} from '@astryxdesign/core/Card';
import {Badge} from '@astryxdesign/core/Badge';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Markdown} from '@astryxdesign/core/Markdown';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {
  ChatComposer, ChatComposerInput, ChatLayout, ChatMessage, ChatMessageBubble,
  ChatMessageList, ChatToolCalls,
} from '@astryxdesign/core/Chat';
import {
  PlusIcon, MicrophoneIcon, ArrowDownTrayIcon, GlobeAltIcon, ChatBubbleLeftIcon, ComputerDesktopIcon, ArrowTopRightOnSquareIcon, PaperClipIcon, FilmIcon,
  CloudIcon, ChartBarIcon, ServerStackIcon, SpeakerWaveIcon, Cog6ToothIcon, MagnifyingGlassIcon, SunIcon, KeyIcon, TrashIcon,
} from '@heroicons/react/24/outline';

const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const MODES = {ask: ['chat', 'answer'], build: ['build', 'website'], search: ['search', 'answer'], video: ['create', 'video'], computer: ['computer', 'answer']};
const TEXTY = /\.(txt|md|json|csv|js|mjs|ts|tsx|jsx|py|html|css|yml|yaml|toml|xml|sh|sql|go|rs|java|c|h|cpp|rb|php|log|env)$/i;
const ICON = {Globe: GlobeAltIcon, Cloud: CloudIcon, Chart: ChartBarIcon, Film: FilmIcon, Server: ServerStackIcon};
const WOLF = {id: 'flisk-wolf-chat', name: 'Flisk Wolf', provider: 'flisk', providerName: 'Flisk', description: '', free: true, key: '', model: 'flisk-wolf-chat'};

// A past chat's messages are kept as {role, content}; a few of the last ones go back to the server with each task.
const lang = (task) => (/[іїєґ]/i.test(task) ? 'uk' : /[ыэъё]/i.test(task) ? 'ru' : '');

function readFile(f) {
  return new Promise((res) => {
    if (f.size > 5 * 1024 * 1024) {res({error: f.name + ' is bigger than 5 MB'}); return;}
    const r = new FileReader();
    const text = TEXTY.test(f.name) || (f.type || '').startsWith('text/');
    r.onload = () => res({name: f.name, type: f.type, content: text ? String(r.result) : String(r.result).split(',')[1] || '', b64: !text});
    r.onerror = () => res({error: 'Could not read ' + f.name});
    text ? r.readAsText(f) : r.readAsDataURL(f);
  });
}

// Save a picture the chat drew, as /classic does: a file named flisk-picture.<ext>. A drawn (SVG) picture is saved as a
// PNG, which every app opens. If the picture cannot be fetched, it opens in a new tab instead (#354).
async function savePicture(src) {
  const give = (b, ext) => { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'flisk-picture.' + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
  try {
    const b = await (await fetch(src)).blob();
    if (b.type.indexOf('svg') < 0) { give(b, (b.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')); return; }
    const u = URL.createObjectURL(b); const im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 1024; c.getContext('2d').drawImage(im, 0, 0, 1024, 1024); URL.revokeObjectURL(u); c.toBlob((p) => (p ? give(p, 'png') : give(b, 'svg')), 'image/png'); };
    im.onerror = () => give(b, 'svg'); im.src = u;
  } catch (e) { window.open(src, '_blank', 'noopener'); }
}

const copy = (u) => navigator.clipboard && navigator.clipboard.writeText(u).catch(() => {});

function Answer({t, onAgain, onPick}) {
  const text = shownText(t);
  const links = t.link ? [t.link] : [];
  const pics = pictures(text);
  return (
    <>
      {t.steps.length > 0 && (
        <ChatToolCalls defaultIsExpanded calls={t.steps.map((s) => ({name: s.name, target: s.target, status: s.status, duration: s.duration, node: s.node, errorMessage: s.errorMessage}))} />
      )}
      {t.outs.length > 0 && <pre style={{margin: 0, padding: 12, borderRadius: 12, background: 'var(--color-background-secondary, #8881)', overflow: 'auto', maxHeight: 220, fontSize: 12}}>{t.outs.map((o) => o.text).join('\n')}</pre>}
      {text && <ChatMessageBubble variant="ghost"><Markdown density="compact">{text}</Markdown></ChatMessageBubble>}
      {pics.length > 0 && <HStack gap={2} wrap="wrap">{pics.map((src, i) => <Button key={src} label={pics.length > 1 ? 'Save picture ' + (i + 1) : 'Save picture'} variant="secondary" size="sm" icon={<Icon icon={ArrowDownTrayIcon} size="sm" />} onClick={() => savePicture(src)} />)}</HStack>}
      {links.map((u) => {
        // A page this chat published (/s/<id>) is kept 7 days, so it can be downloaded to keep it, as on /classic (#354).
        const page = typeof location !== 'undefined' && u.startsWith(location.origin + '/s/');
        return (
          <Card key={u}><VStack gap={2}>
            <HStack gap={2} align="center"><Badge label="Live" variant="success" /><Text type="supporting" color="secondary">{page ? 'Kept 7 days. Download the page to keep it.' : t.kept && t.kept.days ? 'Kept ' + t.kept.days + ' days' : 'Real link'}</Text></HStack>
            <Text weight="semibold" style={{wordBreak: 'break-all'}}>{u}</Text>
            <HStack gap={2} wrap="wrap">
              <Tip text="Open the real thing in a new tab."><Button label="Open" variant="primary" href={u} target="_blank" icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />} /></Tip>
              <Button label="Copy link" variant="secondary" onClick={() => copy(u)} />
              {page && <Button label="Download" variant="secondary" href={u} download="index.html" icon={<Icon icon={ArrowDownTrayIcon} size="sm" />} />}
            </HStack>
          </VStack></Card>
        );
      })}
      {t.widgets.map((w, i) => <Widget key={'w' + i} w={w} />)}
      {t.workers.map((ev, i) => <WorkerCard key={'k' + i} ev={ev} />)}
      {t.browser && <BrowserAnswer info={t.browser} />}
      {t.video && <VStack gap={2}>
        <video src={t.video} controls playsInline preload="metadata" style={{maxWidth: '100%', borderRadius: 12}} />
        <HStack gap={2} wrap="wrap">
          <Button label="Download mp4" variant="primary" href={t.video} download="flisk-video.mp4" icon={<Icon icon={ArrowDownTrayIcon} size="sm" />} />
          <Button label="Copy link" variant="secondary" onClick={() => copy(t.video)} />
        </HStack>
      </VStack>}
      {t.sources.length > 0 && <HStack gap={2} wrap="wrap">{t.sources.slice(0, 8).map((s, i) => <Button key={s.url} label={'[' + (i + 1) + '] ' + s.title} size="sm" variant="secondary" href={s.url} target="_blank" />)}</HStack>}
      {t.error && <ErrorCard t={t} onPick={onPick} />}
      {t.needPod && <Card><VStack gap={2}><Text>This task needs a computer. Start one for it, or connect your own.</Text>
        <HStack gap={2}><Button label="Start a computer and run it" variant="primary" onClick={() => onAgain(true)} /><Button label="Connect my own" variant="secondary" onClick={() => onPick('connect-computer')} /></HStack></VStack></Card>}
    </>
  );
}

function ErrorCard({t, onPick}) {
  const choices = nextSteps(t.error.kind, onPick.free);
  const label = {'setup-key': 'Add my API key', 'choose-model': 'Choose another model', wolf: 'Use Flisk Wolf (free)', 'change-provider': 'Change the AI', 'connect-computer': 'Connect a computer', retry: 'Try again', openrouter: 'Log in with OpenRouter, free', discord: 'Ask on Discord', 'change-model': 'Change the AI'};
  return (
    <Card role="alert"><VStack gap={2}>
      <Text weight="semibold">{t.error.message}</Text>
      <HStack gap={2} wrap="wrap">{choices.map((c, i) => <Button key={c} label={label[c]} variant={i === 0 ? 'primary' : 'secondary'} size="sm" onClick={() => onPick(c)} />)}</HStack>
    </VStack></Card>
  );
}

// The one big sign-in button of the signed-out home page. The utm tag tells analytics which button brought the visit; /auth/start ignores it.
const HERO_SIGNIN = '/auth/start?utm_source=chat&utm_medium=cta&utm_campaign=free-key';

function LimitCard({info, task, onPick}) {
  const err = info.error ? (info.error.endsWith('.') ? info.error : info.error + '.') : 'You used all ' + (info.limit || '') + ' free tasks today.';
  const reset = resetText(info.resetsIn);
  return (
    <Card role="alert"><VStack gap={2}>
      <Heading level={4}>Daily limit reached</Heading>
      <Text color="secondary">{err} {reset ? 'It resets in ' + reset + '.' : ''} Use your own key for no limit, or wait.</Text>
      <HStack gap={2} wrap="wrap">
        <Button label="Log in with OpenRouter, free" variant="primary" size="sm" onClick={() => orStartLogin(task).catch(() => {})} />
        <Button label="Use my own key" variant="secondary" size="sm" onClick={() => onPick('setup-key')} />
        <Button label="Copy my task" variant="ghost" size="sm" onClick={() => navigator.clipboard && navigator.clipboard.writeText(task).catch(() => {})} />
        <Button label="Ask on Discord" variant="ghost" size="sm" href="https://discord.gg/flisk" target="_blank" />
      </HStack>
    </VStack></Card>
  );
}

const GUEST_STARTERS = [
  {label: 'A coffee shop website', prompt: 'A one-page website for my coffee shop'},
  {label: 'A wedding invite page', prompt: 'A wedding page with the date, the place and an RSVP form'},
  {label: 'A bakery menu page', prompt: 'A menu page for my bakery with prices and opening hours'},
];
const LOOKS = {earth: 'Earth', light: 'Light', dark: 'Dark', system: 'Same as your phone'};
const nextLook = (s) => (s === 'earth' ? 'light' : s === 'light' ? 'dark' : s === 'dark' ? 'system' : 'earth');

// The right end of the chat header. On a phone it is one row: Sign in stays in sight and Explain, the look and the AI model
// move into Astryx's MoreMenu, which opens as a bottom sheet on touch screens. Wider screens keep every button in the row.
// True while the screen is at most `px` wide. On a 320 px phone the menu, mode, Sign in and more buttons do not fit in one row.
function useNarrow(px) {
  const q = typeof matchMedia !== 'undefined' ? matchMedia('(max-width: ' + px + 'px)') : null;
  const [on, setOn] = useState(() => !!(q && q.matches));
  useEffect(() => {
    if (!q) return undefined;
    const ch = () => setOn(q.matches);
    q.addEventListener('change', ch);
    return () => q.removeEventListener('change', ch);
  }, [px]);
  return on;
}

function HeaderEnd({explain, onExplain, scheme, onLook, onModel}) {
  const {isMobile} = useAppShellMobile();
  const guest = BOOT.login && BOOT.anon;
  const signIn = !BOOT.login || BOOT.anon;
  // Below 340 px Sign in moves into the more menu, so every button stays on screen (#358).
  const tiny = useNarrow(340);
  if (isMobile) {
    return (
      <HStack gap={1} align="center" className="chat-head-end">
        {signIn && !tiny && <Button label="Sign in" size="sm" variant="primary" href="/auth/start" />}
        {BOOT.login && !BOOT.anon && !tiny && <Badge label={'@' + BOOT.login} />}
        <MoreMenu label="More: explain, look, AI model" size="sm" presentation="adaptive" alignment="end" items={[
          ...(guest ? [{label: 'You are a guest', description: 'Sign in with GitHub to keep your chats and get more free tasks', isDisabled: true}, {type: 'divider'}] : []),
          ...(signIn && tiny ? [{label: 'Sign in with GitHub', description: 'Keep your chats and get more free tasks', icon: KeyIcon, onClick: () => { location.href = '/auth/start'; }}] : []),
          {label: explain ? 'Leave explain mode' : 'Explain', description: 'Tap anything to read what it does, without running it', icon: QuestionMarkCircleIcon, onClick: onExplain},
          {label: 'Look: ' + (LOOKS[scheme] || scheme), description: 'Tap to switch to ' + LOOKS[nextLook(scheme)], icon: SunIcon, onClick: onLook},
          {label: 'AI model and keys', description: 'Flisk Wolf is free, or add your own key', icon: Cog6ToothIcon, onClick: onModel},
        ]} />
      </HStack>
    );
  }
  return (
    <HStack gap={1}>
      {BOOT.login ? <Tip text="Free tasks run on Flisk Wolf. The count resets every day."><span><Badge label={BOOT.anon ? 'Guest' : '@' + BOOT.login} /></span></Tip> : <Button label="Sign in" size="sm" variant="primary" href="/auth/start" />}
      {BOOT.anon && <Tip text="Sign in with GitHub to keep your chats and get more free tasks."><Button label="Sign in" size="sm" variant="secondary" href="/auth/start" /></Tip>}
      <Tip passThrough text="Explain mode: tap anything to read what it does, without running it. Needed on phones, which have no hover."><Button label={explain ? 'Leave explain mode' : 'Explain'} variant={explain ? 'primary' : 'ghost'} size="sm" icon={<Icon icon={QuestionMarkCircleIcon} size="sm" />} onClick={onExplain} /></Tip>
      <Tip title="Look of the page" text="Look: tap to switch between Earth, light, dark and the same as your phone."><Button label={'Look of the page: ' + scheme} variant="ghost" size="sm" isIconOnly icon={<Icon icon={SunIcon} size="sm" />} onClick={onLook} /></Tip>
      <Tip title="AI model and keys" scene="model" text="Choose the AI and add your own keys."><Button label="AI model and keys" variant="ghost" size="sm" isIconOnly icon={<Icon icon={Cog6ToothIcon} size="sm" />} onClick={onModel} /></Tip>
    </HStack>
  );
}

export default function App({scheme = 'system', setScheme = () => {}}) {
  const [sel, setSel] = useState(() => {
    try {
      const v = sessionStorage.getItem('chat_model');
      const m = (BOOT.models || []).find((x) => x.id === v);
      if (m) return m;
      if (v && v.startsWith('or:')) return {id: v, name: v.slice(3).split('/').pop(), provider: 'openrouter', providerName: 'OpenRouter', free: false, key: 'openrouter', model: v.slice(3)};
    } catch (e) { /* storage blocked */ }
    return (BOOT.models || []).find((m) => m.free) || WOLF;
  });
  const [connected, setConnected] = useState(BOOT.connected || []);
  const [picked, setPicked] = useState([]);
  const [talk, setTalk] = useState(false);
  // A ?voice=1 link (also true or talk) opens voice talk. A browser lets the page use the speaker and microphone only after a
  // tap, so a note asks for one and the first tap anywhere opens it, as /classic does (#364). A tap on Voice talk opens it anyway.
  const [voiceNote, setVoiceNote] = useState(() => { try { return wantsVoice(location.search); } catch (e) { return false; } });
  useEffect(() => {
    if (!voiceNote) return undefined;
    const first = (e) => { setVoiceNote(false); if (e.target && e.target.closest && e.target.closest('[aria-label="Voice talk"], .earth-talk')) return; setTalk(true); };
    document.addEventListener('pointerdown', first, {once: true});
    return () => document.removeEventListener('pointerdown', first);
  }, []);
  const [mdlOpen, setMdlOpen] = useState(false);
  const [pcOpen, setPcOpen] = useState(false);
  const [explain, setExplain] = useState(false);
  const [caption, setCaption] = useState('');
  // The composer has no mode picker: the Jev router decides from the words whether it is a question, a site, a picture or a video.
  const mode = 'ask';
  const [turns, setTurns] = useState([]); // [{task, files, t}]
  useEffect(() => { document.documentElement.classList.toggle('chatting', turns.length > 0); }, [turns.length]);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState('');
  const [files, setFiles] = useState([]);
  const [limit, setLimit] = useState(null);
  const [notice, setNotice] = useState('');
  const [chats, setChats] = useState(loadChats);
  const [chatId, setChatId] = useState(() => 'c' + Date.now());
  const [filter, setFilter] = useState('');
  const hist = useRef([]);
  const memo = useRef({text: '', n: 0, busy: false});
  const ctl = useRef(null);
  const fileIn = useRef(null);
  const ctx = {on: explain, show: setCaption};
  useKeyboardViewport();
  // A task is running: ask before the tab is closed or reloaded, as /classic does (#352).
  useEffect(() => {
    if (!busy) return undefined;
    const stay = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', stay);
    return () => window.removeEventListener('beforeunload', stay);
  }, [busy]);

  const persist = useCallback((id, tr) => {
    if (!hist.current.length) return;
    const all = loadChats().filter((c) => c.id !== id);
    all.unshift({id, at: Date.now(), title: chatTitle(hist.current), msgs: hist.current.slice(-40), memo: memo.current.text, memoN: memo.current.n});
    saveChats(all); setChats(all.slice(0, 30));
  }, []);

  const aiBlock = () => {
    const prov = sel.free ? 'wolf' : sel.key;
    const m = sel.free ? sel.model : sel.model || modelFor(sel.key);
    const vision = !sel.free && (sel.key !== 'openrouter' || sel.sees !== false);
    return {vision, ai: prov, key: sel.free ? '' : keyFor(sel.key), model: m};
  };

  const roll = async () => {
    const h = hist.current, upto = h.length - 6, m = memo.current;
    if (m.busy || upto - m.n < 6) return;
    m.busy = true;
    try {
      const r = await fetch('/api/memo', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({memo: m.text, msgs: h.slice(m.n, upto).map((x) => ({role: x.role, content: x.content})), ai: aiBlock()})});
      const b = await r.json().catch(() => ({}));
      if (r.ok && b.memo) {m.text = b.memo; m.n = upto;}
    } catch (e) { /* the summary is best-effort */ }
    m.busy = false;
  };

  const run = useCallback(async (task, opts = {}) => {
    if (busy) return;
    markEngaged();
    await vaultReady;
    const [m, cat] = MODES[opts.mode || mode] || MODES.build;
    const sendFiles = opts.files || [];
    const idx = opts.reuse ? -1 : turns.length;
    let t = newTurn(task);
    const put = (nt) => { t = nt; setTurns((all) => { const c = all.slice(); const i = opts.reuse ? c.length - 1 : idx; c[i] = {...c[i], task, files: sendFiles.map((f) => f.name), t}; return c; }); };
    setTurns((all) => (opts.reuse ? all : [...all, {task, files: sendFiles.map((f) => f.name), t}]));
    setLimit(null); setBusy(true);
    const ac = new AbortController(); ctl.current = ac;
    const payload = {mode: m, pod: !!opts.pod, cat, task, history: hist.current.slice(-6).map((x) => ({role: x.role, content: x.content})), lang: task.length > 3 ? lang(task) : '', memo: memo.current.text, ui: '', providers: picked, files: sendFiles, ai: aiBlock()};
    let res;
    try { res = await runTask(payload, (ev) => put(applyEv(t, ev)), ac.signal); }
    catch (e) { res = {status: e.name === 'AbortError' ? 0 : -1}; if (res.status === -1) put({...t, error: {message: 'Could not reach Chat. Check your connection and try again.', kind: 'busy'}}); }
    setBusy(false); ctl.current = null;
    if (res.status === 401) {
      // Keep the task (and its files) so it runs on its own once the visitor is back from GitHub sign-in, as on /classic.
      try { sessionStorage.setItem('chat_pending', String(task).slice(0, 8000)); if (sendFiles.length) sessionStorage.setItem('chat_pending_files', JSON.stringify(sendFiles)); } catch (e) { /* storage blocked or files too big */ }
      setTurns((all) => all.slice(0, -1)); setNotice('Sign in with GitHub to run tasks.'); return; }
    if (res.status === 429) { setTurns((all) => all.slice(0, -1)); setLimit({...res.body, task}); return; }
    // No cloud computer connected: run the task on the small Linux in this tab, as /classic does. If the tab cannot start it,
    // the card to connect a computer is shown instead.
    if (res.status === 409 && podOk()) {
      setBusy(true); ctl.current = ac;
      put({...t, status: 'Starting a computer in this tab'});
      if (await getPod().then(() => true, () => false)) {
        try { res = await runInBrowser(payload, (ev) => put(applyEv(t, ev)), ac.signal); }
        catch (e) { res = {status: e.name === 'AbortError' ? 0 : -1}; }
      }
      setBusy(false); ctl.current = null;
      if (res.status === -1) { put({...t, error: {message: 'The computer in this tab stopped before the task finished. Try again.', kind: 'busy'}}); return; }
      if (res.status === 429) { setTurns((all) => all.slice(0, -1)); setLimit({...res.body, task}); return; }
    }
    if (res.status === 409) { put({...t, needPod: true}); return; }
    if (res.status && res.status !== 200) { put({...t, error: {message: (res.body && res.body.error) || 'Something went wrong.', kind: 'other'}}); return; }
    if (!opts.reuse || !hist.current.length || hist.current[hist.current.length - 2]?.content !== task) hist.current.push({role: 'user', content: task});
    const reply = shownText(t);
    if (reply) hist.current.push({role: 'assistant', content: reply.slice(0, 4000)});
    persist(chatId); roll();
  }, [busy, mode, turns, picked, sel, chatId]);

  const [dictating, setDictating] = useState(false);
  const dict = useRef(null);
  // Voice typing: record, and when you tap again the words are written into the box (the same /api/transcribe as before).
  const dictate = async () => {
    if (dict.current) { dict.current.stop(); return; }
    if (!BOOT.login) { setNotice('Sign in with GitHub to use your voice.'); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { setNotice('This browser cannot record. Try Chrome, Safari, Edge or Firefox.'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}}); } catch (e) { setNotice('The microphone is blocked. Allow it for this site and try again.'); return; }
    const chunks = [];
    const r = new MediaRecorder(stream);
    const timer = setTimeout(() => { if (r.state !== 'inactive') r.stop(); }, 120000);
    r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
      clearTimeout(timer); stream.getTracks().forEach((t) => t.stop()); dict.current = null; setDictating(false);
      const blob = new Blob(chunks, {type: r.mimeType || 'audio/webm'});
      if (blob.size < 800) return;
      try {
        const audio = await new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(',')[1] || ''); f.onerror = () => no(f.error); f.readAsDataURL(blob); });
        const res = await fetch('/api/transcribe', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({audio, type: blob.type, part: true})});
        const b = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(b.error || 'Voice answered ' + res.status);
        const text = String(b.text || '').trim();
        if (text) setValue((v) => (v ? v + ' ' : '') + text); else setNotice('I did not catch that. Try again.');
      } catch (e) { setNotice(String(e.message || e).slice(0, 160)); }
    };
    dict.current = {stop: () => { if (r.state !== 'inactive') r.stop(); }};
    r.start(); setDictating(true);
  };

  const submit = async (text) => {
    const task = (text || '').trim();
    if (!task && !files.length) return;
    const fs = files; setValue(''); setFiles([]);
    run(task, {files: fs}).catch(() => {});
  };

  const pick = (what) => {
    if (what === 'setup-key' || what === 'choose-model' || what === 'change-provider' || what === 'change-model') setMdlOpen(true);
    else if (what === 'connect-computer') setPcOpen(true);
    else if (what === 'wolf') { setSel((BOOT.models || []).find((m) => m.free) || WOLF); }
    else if (what === 'openrouter') orStartLogin(turns.length ? turns[turns.length - 1].task : '').catch(() => {});
    else if (what === 'discord') window.open('https://discord.gg/flisk', '_blank', 'noopener,noreferrer');
    else if (what === 'retry' && turns.length) run(turns[turns.length - 1].task, {reuse: true}).catch(() => {});
  };
  pick.free = sel.free;

  const [navOpen, setNavOpen] = useState(false); // the phone chat drawer
  const newChat = () => { setNavOpen(false); ctl.current && ctl.current.abort(); hist.current = []; memo.current = {text: '', n: 0, busy: false}; setTurns([]); setChatId('c' + Date.now()); setLimit(null); setBusy(false); };
  // Delete one past chat from this browser (#355). Deleting the open chat starts a new one.
  const dropChat = (c) => {
    if (!confirm('Delete the chat "' + (c.title || 'Untitled') + '"? This cannot be undone.')) return;
    setChats(deleteChat(c.id));
    if (c.id === chatId) newChat();
    setNotice('Chat deleted.');
  };
  const openChat = (c) => { newChat(); hist.current = c.msgs.slice(); memo.current = {text: c.memo || '', n: c.memoN || 0, busy: false}; setChatId(c.id);
    const out = []; for (let i = 0; i < c.msgs.length; i++) if (c.msgs[i].role === 'user') out.push({old: true, task: c.msgs[i].content, files: [], t: {...newTurn(c.msgs[i].content), answer: (c.msgs[i + 1] && c.msgs[i + 1].role === 'assistant') ? c.msgs[i + 1].content : '', status: 'Done'}});
    setTurns(out); };

  // Back from OpenRouter login: the key is saved, so run the task the visitor had typed.
  useEffect(() => {
    orFinishLogin().then((r) => { if (!r) return; if (r.error) setNotice('OpenRouter login failed: ' + r.error); else { setNotice('OpenRouter connected. Your key is saved in this browser.'); if (r.task) setValue(r.task); } }, () => {});
    let p = '', pf = [];
    try {
      p = sessionStorage.getItem('chat_pending') || '';
      pf = JSON.parse(sessionStorage.getItem('chat_pending_files') || '[]');
      sessionStorage.removeItem('chat_pending'); sessionStorage.removeItem('chat_pending_files');
    } catch (e) { /* storage blocked */ }
    // Signed in now: run the task that was stopped by the sign-in, once. Signed out: put it back in the box.
    if (p && BOOT.login) run(p, {files: Array.isArray(pf) ? pf.slice(0, 3) : []}).catch(() => {});
    else if (p) setValue(p);
  }, []);
  useEffect(() => { try { sessionStorage.setItem('chat_model', sel.id); } catch (e) { /* storage blocked */ } }, [sel]);

  const attach = async (list) => {
    const room = 3 - files.length; const got = [];
    if (list.length > room) setNotice('You can attach up to 3 files.'); // what fits is attached, the rest is said, not dropped silently (#365)
    let used = files.reduce((n, x) => n + (x.size || 0), 0);
    for (const f of Array.from(list).slice(0, room)) {
      if (used + f.size > 5 * 1024 * 1024) { setNotice('Attached files can be 5 MB in all'); continue; }
      const r = await readFile(f); if (r.error) setNotice(r.error); else { got.push({...r, size: f.size}); used += f.size; }
    }
    if (got.length) setFiles((x) => [...x, ...got]);
  };
  // A guest (most visitors) sees what they get and three things to ask for, not six category names (the 74% bounce of 2026-11-22).
  const guestHome = !!BOOT.login && !!BOOT.anon;
  const starters = guestHome ? GUEST_STARTERS : (BOOT.cats || []).slice(0, 6);
  const used = connected.length ? connected.join(', ') : '';
  const pcLabel = picked.length ? picked.map((p) => (BOOT.providerNames || {})[p] || p).join(' + ') : 'Fleet auto';
  const shown = chats.filter((c) => !filter || c.title.toLowerCase().includes(filter.toLowerCase()));

  const side = (
        <SideNav collapsible
          header={<HStack gap={2} align="center"><Brand name="wolf" size={28} /><Text type="emphasized">Flisk Chat</Text></HStack>}
          topContent={<VStack gap={2}><Tip title="New chat" scene="model" text="Start a fresh chat. Your old chats stay in the list."><Button label="New chat" variant="secondary" icon={<Icon icon={PlusIcon} size="sm" />} isFullWidth onClick={newChat} /></Tip>
            <Tip text="Find an older chat by a word you remember."><Button label={filter ? 'Clear search' : 'Search your chats'} variant="ghost" icon={<Icon icon={MagnifyingGlassIcon} size="sm" />} isFullWidth onClick={() => setFilter(filter ? '' : (prompt('Search your chats for:') || ''))} /></Tip></VStack>}
          footer={<HStack gap={2} align="center"><Avatar name={BOOT.login || 'Guest'} size="sm" /><Text type="supporting">{BOOT.login ? '@' + BOOT.login : 'Not signed in'}</Text></HStack>}>
          <SideNavSection title="Your chats">
            {shown.map((c) => <SideNavItem key={c.id} label={c.title || 'Untitled'} icon={ChatBubbleLeftIcon} isSelected={c.id === chatId} onClick={() => openChat(c)}
              actions={<Button label={'Delete chat: ' + (c.title || 'Untitled')} variant="ghost" isIconOnly icon={<Icon icon={TrashIcon} size="sm" />} onClick={() => dropChat(c)} />} />)}
            {!!BOOT.login && !BOOT.anon && <SideNavItem label="Reviews of your pull requests" href="/reviews" />}
            {!shown.length && <Text type="supporting" color="secondary" style={{padding: 8}}>Nothing here yet. Your chats stay in this browser.</Text>}
          </SideNavSection>
        </SideNav>
  );
  // On phones the chats open in a drawer from the menu button in the top bar.
  const drawer = <MobileNav header="Your chats"><SideNavRenderContext value="drawer-content">{side}</SideNavRenderContext></MobileNav>;

  return (
    <ExplainContext.Provider value={ctx}>
    <div className="vv-root">
    {explain && <div className="caption" role="status">{caption || 'Explain mode: tap any dashed control to read what it does. Nothing will run.'}</div>}
    {notice && <div className="caption" role="status" onClick={() => setNotice('')}>{notice} (tap to close)</div>}
    {voiceNote && <div className="caption voice-note" role="status">Tap anywhere to start talking</div>}
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="turn-status">{liveText(turns, busy)}</div>
    {turns.length > 0 && <h1 className="sr-only">{'Flisk Chat: ' + String(turns[0].task || 'files').slice(0, 80)}</h1>  /* the greeting h1 is gone once a chat has turns (#357) */}
    <input ref={fileIn} type="file" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
    {/* A custom top bar gets no automatic menu button, so it is placed here: without it phones cannot reach New chat or the chat list. */}
    <AppShell height="fill" mobileNav={{hasToggle: false, isOpen: navOpen, onOpenChange: setNavOpen, content: drawer}}
      topNav={
      <HStack gap={2} align="center" justify="space-between" wrap="wrap" className="chat-head" style={{padding: 'var(--spacing-2) var(--spacing-3)'}}>
        <HStack gap={1} align="center"><MobileNavToggle /></HStack>
        <HeaderEnd explain={explain} onExplain={() => { setExplain((e) => !e); setCaption(''); }} scheme={scheme} onLook={() => setScheme(nextLook(scheme))} onModel={() => setMdlOpen(true)} />
      </HStack>
      }
      sideNav={side}>
      <div className="earth-content" style={{display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0}}>
      <ChatLayout style={{flex: 1, minHeight: 0}} density="spacious"
        composer={
          <ChatComposer className="one-row" value={value} onChange={setValue} onSubmit={submit} onStop={() => ctl.current && ctl.current.abort()} isStopShown={busy} isDisabled={false}
            placeholder="Ask or build…"
            input={<ChatComposerInput enterKeyHint={touch ? 'enter' : 'send'} onKeyDown={(e) => {
              if (touch && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); }
            }} />}
            headerActions={
              <HStack gap={1} wrap="wrap" align="center">
                <Tip title="The + menu" text="Everything extra lives here. The AI works out whether you want an answer, a website, a video or a picture, so there is no mode to pick." scenes={[
                  {kind: 'dictate', label: 'Dictate', text: 'Speak your task, it turns into text.'},
                  {kind: 'talk', label: 'Voice talk', text: 'Talk out loud with the Flisk Oracle.'},
                  {kind: 'attach', label: 'Attach files', text: 'Drop up to 3 files, 5 MB in all.'},
                  {kind: 'computers', label: 'Choose computers', text: 'Pick which of your computers may run it.'},
                  {kind: 'model', label: 'Choose AI model', text: 'Flisk Wolf is free, or use your own key.'}]}><span><DropdownMenu
                  button={{label: 'More', variant: 'ghost', size: 'sm', isIconOnly: true, icon: <Icon icon={PlusIcon} size="sm" />}}
                  items={[
                    {label: 'Dictate', description: 'Speak your task, it turns into text', icon: MicrophoneIcon, endContent: <Demo kind="dictate" />, onClick: dictate},
                    {label: 'Voice talk', description: 'Talk out loud with the Flisk Oracle', icon: SpeakerWaveIcon, endContent: <Demo kind="talk" />, onClick: () => setTalk(true)},
                    {label: 'Attach files', description: 'Up to 3 files, 5 MB in all', icon: PaperClipIcon, endContent: <Demo kind="attach" />, onClick: () => fileIn.current && fileIn.current.click()},
                    {label: 'Choose computers', description: 'Which of your computers may run it', icon: ComputerDesktopIcon, endContent: <Demo kind="computers" />, onClick: () => setPcOpen(true)},
                    {label: 'Choose AI model', description: 'Flisk Wolf is free; or use your own Claude, OpenAI or OpenRouter key', icon: KeyIcon, endContent: <Demo kind="model" />, onClick: () => setMdlOpen(true)},
                  ]} /></span></Tip>
                {files.map((f, i) => <Tip key={f.name + i} title="Attached file" scene="attach" text={'Sent with your message: ' + f.name + '.'} more="Tap it to take it off again."><span><Badge label={f.name} onClick={() => setFiles(files.filter((_, j) => j !== i))} /></span></Tip>)}
                {dictating && <Tip title="Listening" scene="dictate" text="Stops listening and writes what you said into the box."><span><Button label="Stop and write what I said" variant="primary" size="sm" icon={<Icon icon={MicrophoneIcon} size="sm" />} onClick={dictate} /></span></Tip>}
              </HStack>
            }
            footerActions={
              <HStack gap={1}>
                {brandOf(sel.provider) !== 'wolf' && <Tip brand={brandOf(sel.provider)} title="Which AI answers" scene="model" text="Which AI answers. Flisk Wolf is free; your own key is sent per request and never stored." more="Tap to switch, paste your key, or pick a model. Claude and OpenAI use your own key, so you pay them directly."><span><Button label={sel.name} variant="ghost" size="sm" icon={<Brand name={brandOf(sel.provider)} />} onClick={() => setMdlOpen(true)} /></span></Tip>}
                {picked.length > 0 && <Tip brand="fleet" title="Where your app runs" scene="computers" text="Where your app runs. Fleet picks the cheapest of your connected computers." more="Tap to connect Daytona, Upstash, E2B or Isorun with a key."><span><Button label={pcLabel} variant="ghost" size="sm" icon={<Brand name={picked[0] || 'fleet'} />} onClick={() => setPcOpen(true)} /></span></Tip>}
              </HStack>
            }
          />
        }>
        <ChatMessageList>
          {!turns.length && (
            <ChatMessage sender="assistant" avatar={<Brand name="wolf" size={32} />}>
              <ChatMessageBubble variant="ghost"><VStack gap={1}>
                <Heading level={1} className="greet">{!BOOT.login ? 'Make real websites and apps from a sentence' : guestHome ? 'Describe a website or app. Get a live link.' : 'What shall we make today?'}</Heading>
                <Markdown density="compact">{BOOT.login ? (guestHome ? 'Free, no sign-up. Pick an example or type your own.' : 'Ask a question, or describe a website or app.') : 'Flisk Chat makes them on a computer that is yours. You can look around first.'}</Markdown>
              </VStack></ChatMessageBubble>
              {!BOOT.login && <ChatMessageBubble variant="ghost"><VStack gap={1}><Button label="Start free with GitHub" variant="primary" href={HERO_SIGNIN} /><Text type="supporting">No card. Free to start.</Text></VStack></ChatMessageBubble>}
              <ChatMessageBubble variant="ghost"><HStack className="chips" gap={2} wrap="wrap">
                {starters.map((c) => <Tip key={c.label || c.id} title={c.label} brand="flisk" text={'Tap to try: ' + (c.prompt || c.label)} more="Flisk does the work and shows you the result in this chat."><Button label={c.label} variant="secondary" size="sm" onClick={() => setValue(c.prompt || c.label)} /></Tip>)}
              </HStack></ChatMessageBubble>
            </ChatMessage>
          )}
          {turns.map((x, i) => (
            <div key={i}>
              <ChatMessage sender="user"><ChatMessageBubble>{x.task}{x.files && x.files.length ? '\n📎 ' + x.files.join(', ') : ''}</ChatMessageBubble></ChatMessage>
              <ChatMessage sender="assistant" avatar={<Brand name="wolf" size={32} />}>
                {busy && i === turns.length - 1 && <Text type="supporting" color="secondary">{x.t.status}…</Text>}
                <Answer t={x.t} onAgain={(pod) => run(x.task, {pod: !!pod, reuse: true}).catch(() => {})} onPick={pick} />
              </ChatMessage>
            </div>
          ))}
          {limit && <ChatMessage sender="assistant" avatar={<Brand name="wolf" size={32} />}><LimitCard info={limit} task={limit.task} onPick={pick} /></ChatMessage>}
        </ChatMessageList>
      </ChatLayout>
      </div>
    </AppShell>
    </div>
      <ModelDialog open={mdlOpen} onClose={() => setMdlOpen(false)} models={BOOT.models || []} value={sel} onUse={setSel} />
      <Oracle open={talk} onClose={() => setTalk(false)} aiBlock={aiBlock}
        onBuild={(t) => { run(t).catch(() => {}); }}
        onKeep={(ts) => {
          const pairs = [];
          for (let k = 0; k + 1 < ts.length; k += 2) pairs.push({old: true, task: ts[k].content, files: [], t: {...newTurn(ts[k].content), answer: ts[k + 1].content, status: 'Done'}});
          setTurns((all) => [...all, ...pairs]);
          ts.forEach((m) => hist.current.push(m)); persist(chatId); void roll();
        }} />
      <ComputerDialog open={pcOpen} onClose={() => setPcOpen(false)} connected={connected} onConnected={(id) => setConnected((c) => [...new Set([...c, id])])} picked={picked} setPicked={setPicked} />
    </ExplainContext.Provider>
  );
}

// iPhone Safari: position:fixed follows the *layout* viewport, so when the keyboard opens the composer
// hides behind it. Pin the app to the *visual* viewport instead and keep the page from scrolling.
function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty('--vv-h', vv.height + 'px');
      root.style.setProperty('--vv-top', vv.offsetTop + 'px');
      root.dataset.keyboard = window.innerHeight - vv.height > 120 ? 'open' : 'closed';
      if (vv.offsetTop) window.scrollTo(0, 0);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply); };
  }, []);
}
