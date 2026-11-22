import {useState, useEffect, useMemo} from 'react';
import {Dialog} from '@astryxdesign/core/Dialog';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {Brand} from './Brand.jsx';
import {Tip} from './Tip.jsx';
import {BOOT, keyFor, modelFor, lsSet, vaultReady, orCatalogue, orStartLogin, connectComputer} from './api.js';

// The Brand mark for a model row: the catalogue's provider names map to our marks.
export const brandOf = (provider) => ({flisk: 'wolf', anthropic: 'claude', openai: 'openai', openrouter: 'openrouter'}[provider] || 'flisk');
const SHAPE = {anthropic: [/^sk-ant-/, 'Claude keys start with sk-ant-'], openai: [/^sk-/, 'OpenAI keys start with sk-'], openrouter: [/^sk-or-/, 'OpenRouter keys start with sk-or-']};
const KEYNOTE = 'Your key is encrypted in this browser and sent only with your own requests. We never store it on our server.';
const SUGG = {
  anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'],
  openai: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini'],
};
const PROVIDER_CHIPS = [['', 'All'], ['flisk', 'Flisk Wolf'], ['anthropic', 'Claude'], ['openai', 'OpenAI'], ['openrouter', 'OpenRouter']];

// Re-render once the encrypted key vault has loaded (keys appear a moment after the page).
export function useVault() {
  const [n, setN] = useState(0);
  useEffect(() => { vaultReady.then(() => setN((x) => x + 1), () => {}); }, []);
  return n;
}

// One tap Paste (reads the clipboard, trims spaces and line breaks), Show/Hide, no autocorrect or capital letters,
// and a hint when the key looks wrong.
export function KeyField({label, value, onChange, placeholder, error, shape, hideLabel}) {
  const [show, setShow] = useState(false);
  const [note, setNote] = useState('');
  const clean = (v) => v.replace(/\s+/g, '');
  const paste = async () => {
    try {
      const t = clean(await navigator.clipboard.readText());
      if (!t) {setNote('Nothing to paste. Copy your key first.'); return;}
      onChange(t); setNote('Pasted ' + t.length + ' characters');
    } catch (_) {setNote('Your browser blocked the paste button. Press and hold in the box, then choose Paste.');}
  };
  const bad = value && shape && !shape[0].test(value) ? shape[1] : '';
  return (
    <VStack gap={2}>
      <TextInput label={label} isLabelHidden={hideLabel} type={show ? 'text' : 'password'} value={value} onChange={(v) => {onChange(clean(v)); setNote('');}}
        placeholder={placeholder} autoComplete="off" autoCapitalize="off" hasAutoCorrect={false} hasSpellCheck={false} enterKeyHint="done"
        status={error ? {type: 'error', message: error} : undefined} />
      <HStack gap={2}>
        <Tip title="Paste" text="Pastes the key you copied, with stray spaces and line breaks removed." more="Easier than press and hold. The first time, your phone may ask you to allow Paste."><Button label="Paste key" variant="primary" size="md" onClick={paste} /></Tip>
        <Tip text="Show or hide the key so you can check it pasted right."><Button label={show ? 'Hide' : 'Show'} variant="secondary" size="md" onClick={() => setShow(!show)} /></Tip>
      </HStack>
      {bad && !error && <Text type="supporting" color="warning">{bad}</Text>}
      {note && <Text type="supporting" color="secondary">{note}</Text>}
    </VStack>
  );
}

const priceLabel = {free: 'Free', $: 'Low cost', $$: 'Mid cost', $$$: 'Premium'};

// Pick the AI: the server's model catalogue plus (on the OpenRouter tab) every OpenRouter model, searchable, with badges for
// "sees images" and free. Own-key models ask for the key right here; the action row stays at the bottom while the list scrolls.
export function ModelDialog({open, onClose, models, value, onUse}) {
  const vault = useVault();
  const [q, setQ] = useState('');
  const [chip, setChip] = useState('');
  const [draft, setDraft] = useState(value);
  const [orList, setOrList] = useState(null);
  const [orErr, setOrErr] = useState('');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { if (open) { setDraft(value); setQ(''); setChip(''); setMsg(''); } }, [open]);
  useEffect(() => {
    if (!open || orList || (chip !== 'openrouter' && draft.key !== 'openrouter')) return;
    orCatalogue().then(setOrList, () => setOrErr('Could not load the OpenRouter list. You can still type a model name.'));
  }, [open, chip, draft.key]);
  // Key and model saved in this browser for the chosen provider.
  useEffect(() => { if (open && !draft.free) { setKey(keyFor(draft.key)); setModel(draft.model || modelFor(draft.key)); setMsg(''); } }, [open, draft.id, vault]);

  const rows = useMemo(() => {
    const base = (models || []).map((m) => ({...m, sees: !m.free}));
    const or = (orList || []).map((x) => ({id: 'or:' + x.id, name: x.name, provider: 'openrouter', providerName: 'OpenRouter', description: x.id + (x.ctx ? ' · ' + Math.round(x.ctx / 1000) + 'K context' : ''), price: x.price, free: false, key: 'openrouter', model: x.id, sees: x.sees, orFree: x.free}));
    // The generic "OpenRouter" row stays only until the real list has loaded.
    const all = [...base.filter((m) => !(or.length && m.provider === 'openrouter' && !m.model)), ...or];
    const s = q.trim().toLowerCase();
    return all.filter((m) => (!chip || m.provider === chip) && (!s || (m.name + ' ' + m.description + ' ' + m.id).toLowerCase().includes(s))).slice(0, 80);
  }, [models, orList, q, chip]);

  const needsModelName = !draft.free && !draft.model && draft.key !== 'openrouter';
  const needsOrModel = !draft.free && draft.key === 'openrouter' && !draft.model;
  const useIt = () => {
    if (!draft.free) {
      const k = key.trim() || keyFor(draft.key);
      if (!k) {setMsg('Paste your API key first.'); return;}
      const m = draft.model || model.trim();
      if (!m) {setMsg(draft.key === 'openrouter' ? 'Pick a model from the list, or type its name.' : 'Type the model name first.'); return;}
      if (key.trim()) lsSet('chat_key_' + draft.key, key.trim());
      if (!draft.model) lsSet('chat_model_' + draft.key, m);
      onUse({...draft, model: draft.model || m});
    } else onUse(draft);
    onClose();
  };
  const keyPage = (BOOT.keyPages || {})[draft.key];
  const sugg = SUGG[draft.key] || [];
  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} width={600} purpose="form">
      <div style={{display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, maxHeight: 'min(82dvh, 680px)'}}>
        <Heading level={3}>Choose the AI</Heading>
        <div style={{display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', minHeight: 0, flex: 1, paddingBottom: 4}}>
        <TextInput label="Search models" isLabelHidden value={q} onChange={setQ} placeholder="Search models: name, company or word" autoComplete="off" autoCapitalize="off" hasAutoCorrect={false} enterKeyHint="search" />
        <HStack gap={2} wrap="wrap">
          {PROVIDER_CHIPS.map(([id, label]) => (
            <Button key={id} label={label} size="sm" variant={chip === id ? 'primary' : 'secondary'} icon={id ? <Brand name={brandOf(id)} /> : undefined} onClick={() => setChip(id)} />
          ))}
        </HStack>
        <div role="listbox" aria-label="Models" style={{maxHeight: 'min(22dvh, 200px)', flexShrink: 0, overflowY: 'auto', border: '1px solid var(--color-border-subtle, #8884)', borderRadius: 12}}>
          {rows.map((m) => (
            <button key={m.id} role="option" aria-selected={m.id === draft.id} type="button" onClick={() => setDraft(m)}
              style={{display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', padding: '10px 12px', background: m.id === draft.id ? 'var(--color-background-selected, #8882)' : 'transparent', border: 0, borderBottom: '1px solid var(--color-border-subtle, #8882)', color: 'inherit', font: 'inherit', cursor: 'pointer'}}>
              <Brand name={brandOf(m.provider)} size={28} />
              <span style={{flex: 1, minWidth: 0}}>
                <Text weight="semibold">{m.name}</Text>
                <Text type="supporting" color="secondary" style={{display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{m.description}</Text>
              </span>
              <span style={{display: 'flex', gap: 4, flexShrink: 0}}>
                {m.free || m.orFree ? <Badge label="Free" variant="success" /> : null}
                {m.provider === 'openrouter' && m.sees ? <Badge label="Sees images" variant="info" /> : null}
                {!m.free && !m.orFree && m.price && m.provider !== 'openrouter' ? <Badge label={priceLabel[m.price] || m.price} /> : null}
              </span>
            </button>
          ))}
          {!rows.length && <Text color="secondary" style={{padding: 12, display: 'block'}}>{orErr || 'No model matches. Clear the search, or type a model name below.'}</Text>}
        </div>
        <HStack gap={2} align="center">
          <Brand name={brandOf(draft.provider)} size={28} />
          <VStack gap={0}><Text weight="semibold">{draft.name}</Text><Text type="supporting" color="secondary">{draft.free ? 'Free, no key needed' : 'Uses your key · you pay ' + (draft.providerName || 'the company') + ' directly'}</Text></VStack>
          {!draft.free && <Badge label="Your key" variant="info" />}
        </HStack>
        {draft.free ? (
          <Text color="secondary">Flisk Wolf is free: a daily limit of tasks, and no key to paste. Pick a model with your own key for no limit and bigger models.</Text>
        ) : (
          <VStack gap={3}>
            {(needsModelName || needsOrModel) && (
              <VStack gap={2}>
                <TextInput label="Model name" value={model} onChange={setModel} placeholder={draft.key === 'openrouter' ? 'Any OpenRouter model id, e.g. google/gemini-2.5-flash' : 'Model, e.g. ' + (sugg[0] || '')} autoCapitalize="off" hasAutoCorrect={false} hasSpellCheck={false} />
                {sugg.length > 0 && <HStack gap={1} wrap="wrap">{sugg.map((s) => <Button key={s} label={s} size="sm" variant="ghost" onClick={() => setModel(s)} />)}</HStack>}
              </VStack>
            )}
            <KeyField label={'Your ' + (draft.providerName || '') + ' API key'} value={key} onChange={(v) => {setKey(v); setMsg('');}} placeholder="Paste your API key" shape={SHAPE[draft.key]} error={msg} />
            {keyFor(draft.key) && !key && <Text type="supporting" color="secondary">Key saved in this browser</Text>}
            <HStack gap={2} wrap="wrap">
              {keyPage && <Button label={'Get your ' + keyPage[0] + ' key'} variant="secondary" size="sm" href={keyPage[1]} target="_blank" />}
              {draft.key === 'openrouter' && <Tip text="No key yet? Sign in to your own free OpenRouter account and we receive a key for you (no secret of ours)."><Button label="No key? Log in with OpenRouter, free" variant="ghost" size="sm" onClick={() => orStartLogin('')} /></Tip>}
              {keyFor(draft.key) && <Button label="Remove my key" variant="ghost" size="sm" onClick={() => { lsSet('chat_key_' + draft.key, ''); lsSet('chat_model_' + draft.key, ''); setKey(''); }} />}
            </HStack>
            <Text type="supporting" color="secondary">{KEYNOTE}</Text>
          </VStack>
        )}
        </div>
        <div style={{flexShrink: 0, paddingTop: 8, borderTop: '1px solid var(--color-border-subtle, #8883)'}}>
          <HStack gap={2} justify="end">
            <Tip title="Cancel" text="Closes this window and keeps what you had before."><span><Button label="Cancel" variant="ghost" onClick={onClose} /></span></Tip>
            <Button label={draft.free ? 'Use ' + draft.name : 'Save and use'} variant="primary" onClick={useIt} />
          </HStack>
        </div>
      </div>
    </Dialog>
  );
}

// Where the app runs: connect a computer once with its key (sent to /api/connect, kept encrypted by the server), then choose
// which connected ones may run a task. Nothing chosen = Fleet picks the cheapest first.
export function ComputerDialog({open, onClose, connected, onConnected, picked, setPicked}) {
  const cards = BOOT.cards || [];
  const [keys, setKeys] = useState({});
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState('');
  const connect = async (c) => {
    if ((keys[c.id] || '').trim().length < 8) {setErrs({...errs, [c.id]: 'Paste your ' + c.label + ' key first.'}); return;}
    setBusy(c.id);
    const r = await connectComputer(c.id, keys[c.id].trim());
    setBusy('');
    if (!r.ok) {setErrs({...errs, [c.id]: r.error || 'Could not save that key. Check it and try again.'}); return;}
    setErrs({...errs, [c.id]: ''}); setKeys({...keys, [c.id]: ''}); onConnected(c.id);
  };
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} width={560} purpose="info">
      <VStack gap={4}>
        <Heading level={3}>Where your app runs</Heading>
        <HStack gap={3} align="center">
          <Brand name="fleet" size={32} />
          <VStack gap={0}><Text weight="semibold">Fleet auto</Text><Text type="supporting" color="secondary">Uses your cheapest connected computer first</Text></VStack>
          <Button label={picked.length ? 'Use Fleet auto' : 'Fleet auto is on'} size="sm" variant={picked.length ? 'secondary' : 'primary'} onClick={() => setPicked([])} />
        </HStack>
        <Text color="secondary">Connect a computer once with its key. Free ones have free credit. Without any, small tasks run on a Linux inside this tab.</Text>
        {cards.map((c) => (
          <VStack key={c.id} gap={2}>
            <HStack gap={2} align="center">
              <Brand name={c.id} size={24} />
              <VStack gap={0}><Text weight="semibold">{c.label}</Text><Text type="supporting" color="secondary">{c.note}</Text></VStack>
              {connected.includes(c.id) && <Badge label="Connected" variant="success" />}
            </HStack>
            {!connected.includes(c.id) && (
              <HStack gap={2} align="end" wrap="wrap">
                <KeyField label={c.label + ' key'} hideLabel value={keys[c.id] || ''} onChange={(v) => setKeys({...keys, [c.id]: v})} placeholder="Paste key" error={errs[c.id]} />
                <Button label="Get key" variant="secondary" size="sm" href={c.url} target="_blank" />
                <Button label={busy === c.id ? 'Connecting…' : 'Connect'} variant="primary" size="sm" isDisabled={!!busy} onClick={() => connect(c)} />
              </HStack>
            )}
            {connected.includes(c.id) && <Button label={picked.includes(c.id) ? 'Only on ' + c.label + ' (tap to undo)' : 'Run only on ' + c.label} size="sm" variant={picked.includes(c.id) ? 'primary' : 'secondary'} onClick={() => toggle(c.id)} />}
          </VStack>
        ))}
        <HStack justify="end"><Tip title="Done" text="Closes this window. Your choices are already saved."><span><Button label="Done" variant="primary" onClick={onClose} /></span></Tip></HStack>
      </VStack>
    </Dialog>
  );
}
