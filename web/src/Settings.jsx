import {useState, useEffect, useCallback} from 'react';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Item} from '@astryxdesign/core/Item';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {Selector} from '@astryxdesign/core/Selector';
import {Switch} from '@astryxdesign/core/Switch';
import {TextInput} from '@astryxdesign/core/TextInput';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {
  UserIcon, ChartBarIcon, SparklesIcon, CodeBracketSquareIcon, ComputerDesktopIcon, XMarkIcon, SunIcon, QuestionMarkCircleIcon,
  ClockIcon, KeyIcon, ArrowTopRightOnSquareIcon, ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import {BOOT} from './api.js';

// The settings dialog, built like the Astryx "settings-dialog" template: a modal with a grouped section list on the left and, on
// the right, the chosen section as headed cards of rows (icon, label, hint, control).
export const SECTIONS = [
  ['Account', [['profile', 'Profile', UserIcon], ['usage', 'Usage today', ChartBarIcon]]],
  ['Chat', [['ai', 'AI for reviews', SparklesIcon], ['github', 'GitHub reviews', CodeBracketSquareIcon], ['computers', 'Computers', ComputerDesktopIcon]]],
];
const IDS = SECTIONS.flatMap(([, items]) => items.map((i) => i[0]));
export const settingsSection = (s) => (IDS.includes(s) ? s : 'profile');

const LOOKS = [{value: 'earth', label: 'Earth'}, {value: 'light', label: 'Light'}, {value: 'dark', label: 'Dark'}, {value: 'system', label: 'Same as your phone'}];
const COMMANDS = [
  ['@flisk-chat review', 'Reads the changes and posts a review. Takes about 20 seconds.'],
  ['@flisk-chat review run', "The same, and also runs the project's lint and tests on one of your computers. The results are posted when it finishes."],
  ['@flisk-chat auto on', 'Reviews every new pull request in this repo by itself. Write @flisk-chat auto off to stop.'],
];
const USAGE = {tasks: ['Free tasks', 'Questions, pages and apps on the free Flisk Wolf model.'], pictures: ['Pictures', 'Photos and drawings made for you.'], talk: ['Voice chats', 'Talking with chat out loud.']};

const ic = (I) => <Icon icon={I} size="sm" />;

// A small heading above a rounded card; the rows inside are split by hairlines.
function Group({title, children}) {
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <VStack gap={2} role="group" aria-label={title}>
      {title && <Text type="supporting" weight="semibold" color="secondary">{title}</Text>}
      <Card padding={0}>
        {rows.map((r, i) => <div key={i}>{i > 0 && <Divider />}{r}</div>)}
      </Card>
    </VStack>
  );
}
const Row = ({icon, label, description, control}) => (
  <div className="srow">
    <div className="srow-text"><Item startContent={icon ? ic(icon) : undefined} label={label} description={description} /></div>
    {control && <div className="srow-ctl">{control}</div>}
  </div>
);

const SignIn = () => <Button label="Sign in with GitHub" variant="primary" href="/auth/start" />;

function Profile({scheme, setScheme, explain, onExplain, onModel, onClose, data}) {
  const named = !!data?.named;
  return (
    <VStack gap={5}>
      <Group title="Identity">
        <Row icon={UserIcon} label="Display name" description="Shown on your chats and reviews. It comes from your GitHub account."
          control={<TextInput label="Display name" isLabelHidden value={named ? '@' + data.login : 'Guest'} isReadOnly width={200} onChange={() => {}} />} />
        {named
          ? <Row icon={CodeBracketSquareIcon} label="GitHub account" description={<>Signed in as <b>@{data.login}</b></>} control={<Button label="Sign out" variant="secondary" href="/auth/signout" />} />
          : <Row icon={CodeBracketSquareIcon} label="Not signed in" description="Signing in with GitHub is optional. It keeps your chats and unlocks reviews of your pull requests." control={<SignIn />} />}
      </Group>
      <Group title="Appearance">
        <Row icon={SunIcon} label="Look of the page" description="Earth, light, dark, or the same as your phone."
          control={<Selector label="Look of the page" isLabelHidden options={LOOKS} value={scheme} onChange={setScheme} width={200} hasClear={false} />} />
        <Row icon={QuestionMarkCircleIcon} label="Explain mode" description="Tap anything to read what it does, without running it."
          control={<Switch label="Explain mode" isLabelHidden value={!!explain} onChange={() => onExplain()} />} />
      </Group>
      <Group title="AI">
        <Row icon={SparklesIcon} label="AI model and keys" description="Flisk Wolf is free, or add your own key." control={<Button label="Choose the AI" variant="secondary" onClick={() => { onClose(); onModel(); }} />} />
      </Group>
    </VStack>
  );
}

function Usage({data, go}) {
  const usage = data?.usage || [];
  return (
    <VStack gap={5}>
      <Group title="Free allowance today">
        {usage.length ? usage.map((u) => {
          const [name, hint] = USAGE[u.key] || [u.key, ''];
          const left = Math.max(0, u.limit - u.used);
          return <Row key={u.key} icon={ClockIcon} label={name} description={<>{hint}<br />{left} left of {u.limit} · {u.used} used today</>}
            control={<div style={{width: 160}}><ProgressBar label={name} isLabelHidden value={u.used} max={u.limit} variant={u.used >= u.limit ? 'error' : undefined} /></div>} />;
        }) : <Row icon={ClockIcon} label="Usage is not available right now." />}
      </Group>
      <Text type="supporting" color="secondary">Counts reset every day at midnight UTC. {data?.named ? '' : 'Signing in with GitHub gives more free tasks, and keeps your chats.'}</Text>
      {!data?.named && <Group><Row icon={UserIcon} label="More free tasks" description="No card. Keeps your chats too." control={<SignIn />} /></Group>}
    </VStack>
  );
}

function Reviews({data, reload}) {
  const keyPages = BOOT.keyPages || {};
  const [ai, setAi] = useState(data?.saved?.ai || 'openrouter');
  const [model, setModel] = useState(data?.saved?.model || '');
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState({text: '', bad: false});
  const [busy, setBusy] = useState(false);
  const post = useCallback(async (path, body) => {
    setBusy(true); setMsg({text: '', bad: false});
    try {
      const r = await fetch(path, {method: 'POST', headers: {accept: 'application/json'}, body});
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({text: 'Not saved: ' + (j.error || 'try again'), bad: true});
      else { setMsg({text: j.flash === 'deleted' ? 'Deleted. Reviews use the free Flisk Wolf model again.' : 'Saved. Your next review uses this AI.', bad: false}); setKey(''); reload(); }
    } catch (_) { setMsg({text: 'Could not reach the server. Try again.', bad: true}); }
    setBusy(false);
  }, [reload]);
  if (!data) return <Text color="secondary">Loading…</Text>;
  if (!data.named) return <Group><Row icon={SparklesIcon} label="Your own AI" description="Sign in with GitHub to choose your own AI for reviews." control={<SignIn />} /></Group>;
  const current = data.saved
    ? <>Reviews for <b>@{data.login}</b> use <b>{data.saved.model}</b> ({data.saved.ai}) with your key. You pay your provider; no daily limit.</>
    : <>Reviews for <b>@{data.login}</b> use the free Flisk Wolf model: {data.limit} a day, and only the first part of a big diff.</>;
  const opts = Object.entries(keyPages).map(([v, [n]]) => ({value: v, label: n}));
  const link = keyPages[ai];
  return (
    <VStack gap={5}>
      <Group title="Current AI"><Row icon={SparklesIcon} label="Reviews" description={current} /></Group>
      {msg.text && <Text role={msg.bad ? 'alert' : 'status'} color={msg.bad ? 'error' : 'secondary'}>{msg.text}</Text>}
      {data.stored
        ? <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(); f.set('ai', ai); f.set('model', model); f.set('key', key); post('/reviews/save', f); }}>
            <VStack gap={3}>
              <Group title="Your own AI">
                <Row icon={SparklesIcon} label="AI" description="Which company runs the model that writes your reviews." control={<Selector label="AI" isLabelHidden options={opts} value={ai} onChange={setAi} width={220} hasClear={false} />} />
                <Row icon={CodeBracketSquareIcon} label="Model name" description="For example anthropic/claude-sonnet-5.5" control={<TextInput label="Model name" isLabelHidden value={model} onChange={setModel} placeholder="anthropic/claude-sonnet-5.5" width={220} autoComplete="off" />} />
                <Row icon={KeyIcon} label="API key" description={<>The key is encrypted before it is stored and never shown again.{link && <> <a href={link[1]} target="_blank" rel="noopener">Get your {link[0]} key</a></>}</>}
                  control={<TextInput label="API key" isLabelHidden type="password" value={key} onChange={setKey} width={220} autoComplete="off" />} />
              </Group>
              <HStack justify="end"><Button label={busy ? 'Saving…' : 'Save for reviews'} variant="primary" type="submit" isDisabled={busy || !model || key.length < 8} /></HStack>
            </VStack>
          </form>
        : <Text color="secondary">Saving a key is not switched on yet.</Text>}
      {data.saved && <Group><Row icon={KeyIcon} label="Delete my saved key" description="Deleting the key puts reviews back on the free Flisk Wolf model." control={<Button label="Delete my saved key" variant="secondary" isDisabled={busy} onClick={() => post('/reviews/delete', new FormData())} />} /></Group>}
    </VStack>
  );
}

function GitHub() {
  const appUrl = BOOT.appUrl || 'https://github.com/apps/flisk-chat';
  const [copied, setCopied] = useState('');
  const copy = async (c) => { try { await navigator.clipboard.writeText(c); setCopied(c); setTimeout(() => setCopied(''), 1500); } catch (_) {} };
  return (
    <VStack gap={5}>
      <Text color="secondary">Chat reads your pull request and writes a review on GitHub: a summary, comments on the exact lines, one-click fixes and a verdict. You ask for it by writing a comment.</Text>
      <Group title="1. Install the app once"><Row icon={CodeBracketSquareIcon} label="Install the GitHub App" description="Pick the repos you want it on." control={<Button label="Install the GitHub App" variant="primary" href={appUrl + '/installations/new'} target="_blank" icon={ic(ArrowTopRightOnSquareIcon)} />} /></Group>
      <Group title="2. Write one of these in a pull request comment">
        {COMMANDS.map(([c, d]) => <Row key={c} icon={ClipboardDocumentIcon} label={<code>{c}</code>} description={d} control={<Button label={copied === c ? 'Copied' : 'Copy'} variant="secondary" onClick={() => copy(c)} />} />)}
      </Group>
      <Group title="3. Read the review"><Row icon={CodeBracketSquareIcon} label="Nothing is merged or changed for you." description="Only people who can push to the repo can ask. A model can be wrong, so read before you merge." control={<Button label="View on GitHub" variant="secondary" href={appUrl} target="_blank" />} /></Group>
    </VStack>
  );
}

function Computers() {
  return <Group><Row icon={ComputerDesktopIcon} label="Your computers" description="Connect the computers and cloud accounts where chat runs your tasks. This opens in Fleet, in a new tab."
    control={<Button label="Open Fleet" variant="primary" href={BOOT.computersUrl || 'https://fleet.flisk.si/console?section=providers'} target="_blank" icon={ic(ArrowTopRightOnSquareIcon)} />} /></Group>;
}

export function SettingsDialog({open, onClose, section, onSection, scheme, setScheme, explain, onExplain, onModel}) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    fetch('/settings/data', {cache: 'no-store'}).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((d) => { setData(d); setFailed(false); }, () => setFailed(true));
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);
  const cur = settingsSection(section);
  const title = SECTIONS.flatMap(([, items]) => items).find((i) => i[0] === cur)[1];
  let body;
  if (failed) body = <VStack gap={3} align="start"><Text color="secondary">Could not load your settings.</Text><Button label="Try again" variant="secondary" onClick={load} /></VStack>;
  else if (cur === 'profile') body = <Profile {...{scheme, setScheme, explain, onExplain, onModel, onClose, data}} />;
  else if (cur === 'usage') body = <Usage data={data} />;
  else if (cur === 'ai') body = <Reviews data={data} reload={load} />;
  else if (cur === 'github') body = <GitHub />;
  else body = <Computers />;
  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} width={920} purpose="info">
      <div className="settings-dialog">
        <div className="settings-head">
          <VStack gap={1}>
            <Heading level={3}>Settings</Heading>
            <Text type="supporting" color="secondary">Your profile, today's usage, the AI behind reviews and the computers that run your tasks.</Text>
          </VStack>
          <Button label="Close settings" variant="ghost" isIconOnly icon={ic(XMarkIcon)} onClick={onClose} />
        </div>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map(([group, items]) => (
              <VStack key={group} gap={1}>
                <Text type="supporting" weight="semibold" color="secondary" className="settings-gl">{group}</Text>
                {items.map(([id, label, I]) => <Item key={id} label={label} startContent={ic(I)} isSelected={id === cur} onClick={() => onSection(id)} />)}
              </VStack>
            ))}
          </nav>
          <main className="settings-pane" aria-label={title}>
            <Heading level={4}>{title}</Heading>
            {body}
          </main>
        </div>
      </div>
    </Dialog>
  );
}
