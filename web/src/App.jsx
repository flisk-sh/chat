import {useState, useEffect, useRef, useCallback} from 'react';
import {Tip, ExplainContext} from './Tip.jsx';
import {Brand} from './Brand.jsx';
import {ModelDialog, ComputerDialog, brandOf} from './Pickers.jsx';
import {BOOT, runTask, keyFor, modelFor, lsGet, orStartLogin, orFinishLogin, loadChats, saveChats, vaultReady} from './api.js';
import {newTurn, applyEv, nextSteps, chatTitle, shownText} from './events.js';
import {QuestionMarkCircleIcon} from '@heroicons/react/24/outline';
import {AppShell} from '@astryxdesign/core/AppShell';
import {SideNav, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Card} from '@astryxdesign/core/Card';
import {Badge} from '@astryxdesign/core/Badge';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Markdown} from '@astryxdesign/core/Markdown';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {
  ChatComposer, ChatComposerInput, ChatLayout, ChatMessage, ChatMessageBubble,
  ChatMessageList, ChatToolCalls,
} from '@astryxdesign/core/Chat';
import {
  PlusIcon, MicrophoneIcon, GlobeAltIcon, ChatBubbleLeftIcon, ComputerDesktopIcon, ArrowTopRightOnSquareIcon, PaperClipIcon, FilmIcon,
  CloudIcon, ChartBarIcon, ServerStackIcon, SpeakerWaveIcon, Cog6ToothIcon, MagnifyingGlassIcon, SunIcon, KeyIcon,
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
    if (f.size > 150 * 1024) {res({error: f.name + ' is bigger than 150 KB'}); return;}
    const r = new FileReader();
    const text = TEXTY.test(f.name) || (f.type || '').startsWith('text/');
    r.onload = () => res({name: f.name, type: f.type, content: text ? String(r.result) : String(r.result).split(',')[1] || '', b64: !text});
    r.onerror = () => res({error: 'Could not read ' + f.name});
    text ? r.readAsText(f) : r.readAsDataURL(f);
  });
}

function Answer({t, onAgain, onPick}) {
  const text = shownText(t);
  const links = t.link ? [t.link] : [];
  return (
    <>
      {t.steps.length > 0 && (
        <ChatToolCalls defaultIsExpanded calls={t.steps.map((s) => ({name: s.name, target: s.target, status: s.status, duration: s.duration, node: s.node, errorMessage: s.errorMessage}))} />
      )}
      {t.outs.length > 0 && <pre style={{margin: 0, padding: 12, borderRadius: 12, background: 'var(--color-background-secondary, #8881)', overflow: 'auto', maxHeight: 220, fontSize: 12}}>{t.outs.map((o) => o.text).join('\n')}</pre>}
      {text && <ChatMessageBubble variant="ghost"><Markdown density="compact">{text}</Markdown></ChatMessageBubble>}
      {links.map((u) => (
        <Card key={u}><VStack gap={2}>
          <HStack gap={2} align="center"><Badge label="Live" variant="success" /><Text type="supporting" color="secondary">{t.kept && t.kept.days ? 'Kept ' + t.kept.days + ' days' : 'Real link'}</Text></HStack>
          <Text weight="semibold" style={{wordBreak: 'break-all'}}>{u}</Text>
          <HStack gap={2}>
            <Tip text="Open the real thing in a new tab."><Button label="Open" variant="primary" href={u} target="_blank" icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />} /></Tip>
            <Button label="Copy link" variant="secondary" onClick={() => navigator.clipboard && navigator.clipboard.writeText(u).catch(() => {})} />
          </HStack>
        </VStack></Card>
      ))}
      {t.video && <video src={t.video} controls style={{maxWidth: '100%', borderRadius: 12}} />}
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
    <Card><VStack gap={2}>
      <Text weight="semibold">{t.error.message}</Text>
      <HStack gap={2} wrap="wrap">{choices.map((c, i) => <Button key={c} label={label[c]} variant={i === 0 ? 'primary' : 'secondary'} size="sm" onClick={() => onPick(c)} />)}</HStack>
    </VStack></Card>
  );
}

function LimitCard({info, task, onPick}) {
  return (
    <Card><VStack gap={2}>
      <Heading level={4}>Daily limit reached</Heading>
      <Text color="secondary">{info.error || 'You used all ' + (info.limit || '') + ' free tasks today.'} {info.resetsIn ? 'It resets in ' + info.resetsIn + '.' : ''} Use your own key for no limit, or wait.</Text>
      <HStack gap={2} wrap="wrap">
        <Button label="Log in with OpenRouter, free" variant="primary" size="sm" onClick={() => orStartLogin(task).catch(() => {})} />
        <Button label="Use my own key" variant="secondary" size="sm" onClick={() => onPick('setup-key')} />
        <Button label="Copy my task" variant="ghost" size="sm" onClick={() => navigator.clipboard && navigator.clipboard.writeText(task).catch(() => {})} />
        <Button label="Ask on Discord" variant="ghost" size="sm" href="https://discord.gg/flisk" target="_blank" />
      </HStack>
    </VStack></Card>
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
  const [mdlOpen, setMdlOpen] = useState(false);
  const [pcOpen, setPcOpen] = useState(false);
  const [explain, setExplain] = useState(false);
  const [caption, setCaption] = useState('');
  const [mode, setMode] = useState(() => lsGet('chat_mode') || 'build');
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
    if (res.status === 401) { setTurns((all) => all.slice(0, -1)); setNotice('Sign in with GitHub to run tasks.'); return; }
    if (res.status === 429) { setTurns((all) => all.slice(0, -1)); setLimit({...res.body, task}); return; }
    if (res.status === 409) { put({...t, needPod: true}); return; }
    if (res.status && res.status !== 200) { put({...t, error: {message: (res.body && res.body.error) || 'Something went wrong.', kind: 'other'}}); return; }
    if (!opts.reuse || !hist.current.length || hist.current[hist.current.length - 2]?.content !== task) hist.current.push({role: 'user', content: task});
    const reply = shownText(t);
    if (reply) hist.current.push({role: 'assistant', content: reply.slice(0, 4000)});
    persist(chatId); roll();
  }, [busy, mode, turns, picked, sel, chatId]);

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

  const newChat = () => { ctl.current && ctl.current.abort(); hist.current = []; memo.current = {text: '', n: 0, busy: false}; setTurns([]); setChatId('c' + Date.now()); setLimit(null); setBusy(false); };
  const openChat = (c) => { newChat(); hist.current = c.msgs.slice(); memo.current = {text: c.memo || '', n: c.memoN || 0, busy: false}; setChatId(c.id);
    const out = []; for (let i = 0; i < c.msgs.length; i++) if (c.msgs[i].role === 'user') out.push({task: c.msgs[i].content, files: [], t: {...newTurn(c.msgs[i].content), answer: (c.msgs[i + 1] && c.msgs[i + 1].role === 'assistant') ? c.msgs[i + 1].content : '', status: 'Done'}});
    setTurns(out); };

  // Back from OpenRouter login: the key is saved, so run the task the visitor had typed.
  useEffect(() => {
    orFinishLogin().then((r) => { if (!r) return; if (r.error) setNotice('OpenRouter login failed: ' + r.error); else { setNotice('OpenRouter connected. Your key is saved in this browser.'); if (r.task) setValue(r.task); } }, () => {});
    let p = ''; try { p = sessionStorage.getItem('chat_pending') || ''; sessionStorage.removeItem('chat_pending'); } catch (e) { /* storage blocked */ }
    if (p && BOOT.login) setValue(p);
  }, []);
  useEffect(() => { try { localStorage.setItem('chat_mode', mode); } catch (e) { /* storage blocked */ } }, [mode]);
  useEffect(() => { try { sessionStorage.setItem('chat_model', sel.id); } catch (e) { /* storage blocked */ } }, [sel]);

  const attach = async (list) => {
    const room = 3 - files.length; const got = [];
    for (const f of Array.from(list).slice(0, room)) { const r = await readFile(f); if (r.error) setNotice(r.error); else got.push(r); }
    if (got.length) setFiles((x) => [...x, ...got]);
  };
  const starters = (BOOT.cats || []).slice(0, 6);
  const used = connected.length ? connected.join(', ') : '';
  const pcLabel = picked.length ? picked.map((p) => (BOOT.providerNames || {})[p] || p).join(' + ') : 'Fleet auto';
  const shown = chats.filter((c) => !filter || c.title.toLowerCase().includes(filter.toLowerCase()));

  return (
    <ExplainContext.Provider value={ctx}>
    <div className="vv-root">
    {explain && <div className="caption" role="status">{caption || 'Explain mode: tap any dashed control to read what it does. Nothing will run.'}</div>}
    {notice && <div className="caption" role="status" onClick={() => setNotice('')}>{notice} (tap to close)</div>}
    <input ref={fileIn} type="file" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
    <AppShell height="fill"
      topNav={
      <HStack gap={2} align="center" justify="space-between" wrap="wrap" style={{padding: 'var(--spacing-2) var(--spacing-3)'}}>
        <Tip text="Ask: just answers. Build: makes websites and apps on a computer. Search: looks things up on the web."><span style={{display: 'inline-flex', flexShrink: 0}}><SegmentedControl label="Mode" value={['ask', 'build', 'search'].includes(mode) ? mode : ''} onChange={setMode}><SegmentedControlItem value="ask" label="Ask" /><SegmentedControlItem value="build" label="Build" /><SegmentedControlItem value="search" label="Search" /></SegmentedControl></span></Tip>
        <HStack gap={1}>
          {BOOT.login ? <Tip text="Free tasks run on Flisk Wolf. The count resets every day."><span><Badge label={BOOT.anon ? 'Guest' : '@' + BOOT.login} /></span></Tip> : <Button label="Sign in" size="sm" variant="primary" href="/auth/start" />}
          {BOOT.anon && <Tip text="Sign in with GitHub to keep your chats and get more free tasks."><Button label="Sign in" size="sm" variant="secondary" href="/auth/start" /></Tip>}
          <Tip text="Explain mode: tap anything to read what it does, without running it. Needed on phones, which have no hover."><Button label={explain ? 'Leave explain mode' : 'Explain'} variant={explain ? 'primary' : 'ghost'} size="sm" icon={<Icon icon={QuestionMarkCircleIcon} size="sm" />} onClick={() => { setExplain((e) => !e); setCaption(''); }} /></Tip>
          <Tip text="Look: tap to switch between Earth, light, dark and the same as your phone."><Button label={'Look of the page: ' + scheme} variant="ghost" size="sm" isIconOnly icon={<Icon icon={SunIcon} size="sm" />} onClick={() => setScheme(scheme === 'earth' ? 'light' : scheme === 'light' ? 'dark' : scheme === 'dark' ? 'system' : 'earth')} /></Tip>
          <Tip text="Keys, voice language and your data."><Button label="Settings" variant="ghost" size="sm" isIconOnly icon={<Icon icon={Cog6ToothIcon} size="sm" />} onClick={() => setMdlOpen(true)} /></Tip>
        </HStack>
      </HStack>
      }
      sideNav={
        <SideNav collapsible
          header={<HStack gap={2} align="center"><Brand name="wolf" size={28} /><Text type="emphasized">Flisk Chat</Text></HStack>}
          topContent={<VStack gap={2}><Tip text="Start a fresh chat. Your old chats stay in the list."><Button label="New chat" variant="secondary" icon={<Icon icon={PlusIcon} size="sm" />} isFullWidth onClick={newChat} /></Tip>
            <Tip text="Find an older chat by a word you remember."><Button label={filter ? 'Clear search' : 'Search your chats'} variant="ghost" icon={<Icon icon={MagnifyingGlassIcon} size="sm" />} isFullWidth onClick={() => setFilter(filter ? '' : (prompt('Search your chats for:') || ''))} /></Tip></VStack>}
          footer={<HStack gap={2} align="center"><Avatar name={BOOT.login || 'Guest'} size="sm" /><Text type="supporting">{BOOT.login ? '@' + BOOT.login : 'Not signed in'}</Text></HStack>}>
          <SideNavSection title="Your chats">
            {shown.map((c) => <SideNavItem key={c.id} label={c.title || 'Untitled'} icon={ChatBubbleLeftIcon} isSelected={c.id === chatId} onClick={() => openChat(c)} />)}
            {!shown.length && <Text type="supporting" color="secondary" style={{padding: 8}}>Nothing here yet. Your chats stay in this browser.</Text>}
          </SideNavSection>
        </SideNav>
      }>
      <div className="earth-content" style={{display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0}}>
      <ChatLayout style={{flex: 1, minHeight: 0}} density="spacious"
        composer={
          <ChatComposer value={value} onChange={setValue} onSubmit={submit} onStop={() => ctl.current && ctl.current.abort()} isStopShown={busy} isDisabled={false}
            placeholder={mode === 'video' ? 'Describe the video…' : mode === 'computer' ? 'What should the computer do?' : 'Ask anything, or describe what to build…'}
            input={<ChatComposerInput enterKeyHint={touch ? 'enter' : 'send'} onKeyDown={(e) => {
              if (touch && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); }
            }} />}
            headerActions={
              <HStack gap={1} wrap="wrap">
                {files.map((f, i) => <Badge key={f.name + i} label={f.name} onClick={() => setFiles(files.filter((_, j) => j !== i))} />)}
                <Tip text="Add: attach files, pick computers, make a website or video, weather, chart."><span><DropdownMenu
                  button={{label: 'Add', variant: 'ghost', size: 'sm', isIconOnly: true, icon: <Icon icon={PlusIcon} size="sm" />}}
                  items={[
                    {label: 'Attach files', description: 'Up to 3 files, 150 KB each', icon: PaperClipIcon, onClick: () => fileIn.current && fileIn.current.click()},
                    {label: 'Choose computers', description: 'Which of your computers may run it', icon: ComputerDesktopIcon, onClick: () => setPcOpen(true)},
                    {label: 'Make a website', description: 'One page with a public link, kept 7 days', icon: GlobeAltIcon, onClick: () => setMode('build')},
                    {label: 'Make a video', description: 'Narrated video from a short script', icon: FilmIcon, onClick: () => setMode('video')},
                    {label: 'Run on a computer', description: 'Commands on one of your computers', icon: ServerStackIcon, onClick: () => setMode('computer')},
                    {label: 'Choose AI model', description: 'Flisk Wolf is free; or use your own Claude, OpenAI or OpenRouter key', icon: KeyIcon, onClick: () => setMdlOpen(true)},
                  ]} /></span></Tip>
                <Tip text="Hold your voice in: it turns your words into text, phrase by phrase."><Button label="Speak your task" variant="ghost" size="sm" isIconOnly icon={<Icon icon={MicrophoneIcon} size="sm" />} onClick={() => setNotice('Voice typing arrives with the next step of this redesign.')} /></Tip>
                <Tip text="Talk out loud with the Flisk Oracle. It listens, answers, and listens again."><Button label="Voice talk" variant="ghost" size="sm" isIconOnly icon={<Icon icon={SpeakerWaveIcon} size="sm" />} onClick={() => setTalk(true)} /></Tip>
              </HStack>
            }
            footerActions={
              <HStack gap={1}>
                {brandOf(sel.provider) !== 'wolf' && <Tip brand={brandOf(sel.provider)} title="Which AI answers" text="Which AI answers. Flisk Wolf is free; your own key is sent per request and never stored." more="Tap to switch, paste your key, or pick a model. Claude and OpenAI use your own key, so you pay them directly."><span><Button label={sel.name} variant="ghost" size="sm" icon={<Brand name={brandOf(sel.provider)} />} onClick={() => setMdlOpen(true)} /></span></Tip>}
                {picked.length > 0 && <Tip brand="fleet" title="Where your app runs" text="Where your app runs. Fleet picks the cheapest of your connected computers." more="Tap to connect Daytona, Upstash, E2B or Isorun with a key."><span><Button label={pcLabel} variant="ghost" size="sm" icon={<Brand name={picked[0] || 'fleet'} />} onClick={() => setPcOpen(true)} /></span></Tip>}
              </HStack>
            }
          />
        }>
        <ChatMessageList>
          {!turns.length && (
            <ChatMessage sender="assistant" avatar={<Brand name="wolf" size={32} />}>
              <ChatMessageBubble variant="ghost"><Markdown density="compact">{BOOT.login ? 'What shall we make today? Ask a question, or describe a website or app.' : 'Flisk Chat makes real websites and apps from a sentence, on a computer that is yours. Sign in with GitHub to start. You can look around first.'}</Markdown></ChatMessageBubble>
              {!BOOT.login && <ChatMessageBubble variant="ghost"><Button label="Sign in with GitHub" variant="primary" href="/auth/start" /></ChatMessageBubble>}
              <ChatMessageBubble variant="ghost"><HStack gap={2} wrap="wrap">
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
      {talk && <div className="earth-talk" role="dialog" aria-label="Voice talk with the Flisk Oracle">
        <div className="earth-orb" />
        <Text type="emphasized">Talk with the Flisk Oracle</Text>
        <Text type="supporting" color="secondary">Live talking arrives with the next step. Type your task for now.</Text>
        <Button label="Close" variant="secondary" onClick={() => setTalk(false)} />
      </div>}
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
