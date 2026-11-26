import {useEffect, useId, useMemo, useRef, useState} from 'react';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {ChatSystemMessage, ChatMessageBubble} from '@astryxdesign/core/Chat';
import {Card} from '@astryxdesign/core/Card';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Icon} from '@astryxdesign/core/Icon';
import {Kbd} from '@astryxdesign/core/Kbd';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {TextInput} from '@astryxdesign/core/TextInput';
import {BoltIcon, ClipboardDocumentListIcon, RocketLaunchIcon} from '@heroicons/react/24/outline';

// How the person wants the answer (docs/adr/0002). The page still sends mode `ask` to the server; the choice only
// changes what is sent as the task, so the router and the 40 answers a day are untouched.
export const ANSWER_MODES = [
  {id: 'fast', name: 'Quick answer', hint: 'Answers in seconds. The default.', icon: BoltIcon},
  {id: 'ask', name: 'Ask me first', hint: 'I know this topic. Ask me a few questions before you start.', icon: ClipboardDocumentListIcon},
  {id: 'long', name: 'Take your time', hint: 'Works longer and does the whole job.', icon: RocketLaunchIcon},
];

import {ASK_QUESTIONS, frame, readSlash} from './modes-logic.js';
import {shownText} from './events.js';
export {ASK_QUESTIONS, frame, readSlash};

// True while ⌘ (or Ctrl) is held for a moment, or a ⌘ shortcut is pressed. Release, or leaving the window, hides it.
export function useHeldModifier() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    let t = 0;
    const down = (e) => {
      if (e.key === 'Meta' || e.key === 'Control') { if (!t) t = setTimeout(() => setHeld(true), 120); return; }
      if (e.metaKey || e.ctrlKey) setHeld(true);
    };
    const off = () => { clearTimeout(t); t = 0; setHeld(false); };
    const up = (e) => { if (e.key === 'Meta' || e.key === 'Control') off(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', off); off(); };
  }, []);
  return held;
}

// ⌘1, ⌘2, ⌘3 pick a mode, ⌘K opens the command menu.
export function useAnswerKeys(onPick, onPalette) {
  useEffect(() => {
    const h = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i >= 0) { e.preventDefault(); onPick(ANSWER_MODES[i].id); }
      else if (e.key.toLowerCase() === 'k') { e.preventDefault(); onPalette(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onPick, onPalette]);
}

// True on a screen narrower than `px`, where the three full names do not fit in one row.
function useNarrow(px = 480) {
  const q = typeof matchMedia !== 'undefined' ? matchMedia('(max-width: ' + px + 'px)') : null;
  const [n, setN] = useState(!!(q && q.matches));
  useEffect(() => { if (!q) return; const f = () => setN(q.matches); q.addEventListener('change', f); return () => q.removeEventListener('change', f); }, []);
  return n;
}
const SHORT = {fast: 'Quick', ask: 'Ask me', long: 'Take time'};

export function AnswerBar({value, onChange}) {
  const narrow = useNarrow();
  return (
    <HStack gap={3} vAlign="center" wrap="wrap">
      <SegmentedControl size="sm" value={value} onChange={(v) => onChange(v)} aria-label="How to answer">
        {ANSWER_MODES.map((m) => <SegmentedControlItem key={m.id} value={m.id} label={narrow ? SHORT[m.id] : m.name} aria-label={m.name} icon={<Icon icon={m.icon} size="sm" />} />)}
      </SegmentedControl>
    </HStack>
  );
}

// Held ⌘: every shortcut, as a row inside the composer's own drawer. Items wrap, so nothing is cut off at any width.
export function ShortcutHints() {
  return (
    <div className="cmd-hints" role="status" aria-label="Keyboard shortcuts">
      <Text type="caption" color="secondary">Shortcuts</Text>
      {ANSWER_MODES.map((m, i) => <span key={m.id} className="cmd-hint"><Kbd keys={'mod+' + (i + 1)} /><Text type="caption">{m.name}</Text></span>)}
      <span className="cmd-hint"><Kbd keys="mod+k" /><Text type="caption">Commands</Text></span>
    </div>
  );
}

export function focusComposer() {
  const el = document.querySelector('.astryx-chat-composer-input [contenteditable], .astryx-chat-composer-input textarea');
  if (el) el.focus();
}

// ⌘K: the composer grows upward (its drawer). A filter box, then "How to answer" and "Chat" choices as a listbox.
// `actions` is [{id, label, run}]. Arrows move, Enter runs, Esc closes; focus goes back to the message box.
export function AnswerMenu({onClose, onPick, actions = []}) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const uid = useId();
  const latest = useRef(actions); latest.current = actions;
  const listRef = useRef(null);
  const num = Object.fromEntries(ANSWER_MODES.map((m, i) => [m.id, i + 1]));
  const items = useMemo(() => {
    const all = [
      ...ANSWER_MODES.map((m) => ({id: m.id, label: m.name, group: 'How to answer'})),
      ...actions.map((x) => ({id: 'do:' + x.id, label: x.label, group: 'Chat', run: x.run})),
    ];
    const n = q.trim().toLowerCase();
    return n ? all.filter((i) => i.label.toLowerCase().includes(n)) : all;
  }, [q, actions.map((x) => x.id).join('|')]);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { const el = listRef.current && listRef.current.querySelector('[aria-selected="true"]'); if (el && el.scrollIntoView) el.scrollIntoView({block: 'nearest'}); }, [at]);
  const close = () => { onClose(); setTimeout(focusComposer, 0); };
  const choose = (it) => {
    if (!it) return;
    onClose();
    if (it.run) setTimeout(() => { const x = latest.current.find((y) => 'do:' + y.id === it.id); if (x) x.run(); }, 0); else { onPick(it.id); setTimeout(focusComposer, 0); }
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => (items.length ? (i + 1) % items.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => (items.length ? (i - 1 + items.length) % items.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[at]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  const groups = ['How to answer', 'Chat'].map((g) => ({g, list: items.filter((i) => i.group === g)})).filter((x) => x.list.length);
  const optId = (it) => uid + '-' + it.id.replace(/[^a-z0-9]/gi, '_');
  return (
    <div className="cmdk">
      <input className="cmdk-input" autoFocus type="text" placeholder="Type a command…" aria-label="Command menu" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
        role="combobox" aria-expanded="true" aria-controls={uid + '-list'} aria-autocomplete="list" aria-activedescendant={items[at] ? optId(items[at]) : undefined} autoComplete="off" spellCheck={false} enterKeyHint="go" />
      <div className="cmdk-list" id={uid + '-list'} role="listbox" aria-label="Commands" ref={listRef}>
        {groups.map(({g, list}) => (
          <div key={g} role="group" aria-label={g}>
            <div className="cmdk-group" aria-hidden="true">{g}</div>
            {list.map((it) => (
              <div key={it.id} id={optId(it)} role="option" aria-selected={items[at] === it} className="cmdk-item" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(it)} onMouseMove={() => setAt(items.indexOf(it))}>
                <Text type="body">{it.label}</Text>{num[it.id] ? <Kbd keys={'mod+' + num[it.id]} /> : null}
              </div>
            ))}
          </div>
        ))}
        {!items.length && <div className="cmdk-empty"><Text type="caption" color="secondary">Nothing matches</Text></div>}
      </div>
    </div>
  );
}

// "Ask me first": three short questions the person answers before the AI starts. Skipping sends the task as it is.
export function AskFirst({task, onDone, onSkip}) {
  const [a, setA] = useState(['', '', '']);
  const set = (i, v) => setA((all) => all.map((x, j) => (j === i ? v : x)));
  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onDone(a); } else if (e.key === 'Escape') onSkip(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [a, onDone, onSkip]);
  return (
    <div style={{padding: 'var(--spacing-3)'}}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" hAlign="between">
          <Text weight="semibold">A few quick questions</Text>
          <Text type="caption" color="secondary">All optional</Text>
        </HStack>
        {ASK_QUESTIONS.map((q, i) => (
          <TextInput key={q} label={q} isLabelHidden placeholder={q} size="sm" value={a[i]} onChange={(v) => set(i, v)} autoFocus={i === 0} />
        ))}
        <HStack gap={2} vAlign="center">
          <Button label="Start" variant="primary" size="sm" onClick={() => onDone(a)} />
          <Button label="Skip" variant="ghost" size="sm" onClick={onSkip} />
          <HStack gap={1} vAlign="center"><Kbd keys="mod+enter" /><Text type="caption" color="secondary">to start</Text></HStack>
        </HStack>
      </VStack>
    </div>
  );
}

// "Take your time": under the quick answer, a pill shows the long run. Hover or focus opens a card; when it is ready the card
// opens by itself and Switch (or Option+Enter on the latest one) replaces the quick answer with it.
export function LongPill({long, onSwitch, isLast}) {
  const [hover, setHover] = useState(false);
  const {state, switched} = long;
  const done = state === 'done' && !switched;
  const [pinned, setPinned] = useState(false);
  useEffect(() => { setPinned(done); }, [done]);
  useEffect(() => {
    if (!done || !isLast) return;
    const h = (e) => { if (e.altKey && e.key === 'Enter') { e.preventDefault(); onSwitch(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [done, isLast, onSwitch]);
  const text = shownText(long.t) || '';
  const label = switched ? 'Showing the long answer' : state === 'done' ? 'Long answer is ready' : state === 'error' ? 'The long answer did not finish' : 'Long answer is cooking\u2026';
  const busy = state !== 'done' && state !== 'error' && !switched;
  return (
    <VStack gap={1}>
      {(hover || pinned) && !switched && (
        <ChatMessageBubble variant="ghost" width="100%">
          <Card padding={3}>
            <VStack gap={2}>
              <Text weight="semibold">{state === 'done' ? 'Long answer' : state === 'error' ? 'It did not finish' : long.t.status || 'Working'}</Text>
              {text && <Text size="xsm" color="secondary">{text.length > 400 ? text.slice(0, 400) + '\u2026' : text}</Text>}
              {done && <HStack gap={2}><Button label={'Switch to this answer  \u2325\u21b5'} size="sm" variant="primary" onClick={onSwitch} /></HStack>}
            </VStack>
          </Card>
        </ChatMessageBubble>
      )}
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)} onClick={() => setPinned((p) => !p)} role="button" tabIndex={0} aria-live="polite" aria-label={label}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPinned((p) => !p); } }} style={{cursor: 'pointer', alignSelf: 'flex-start'}}>
        <ChatSystemMessage icon={busy ? <Spinner size="sm" /> : undefined}>{label}</ChatSystemMessage>
      </div>
    </VStack>
  );
}

// The box's placeholder says what the picked mode will do, so the choice explains itself without another line of text.
export const PLACEHOLDER = {fast: 'Ask or build…', ask: 'Questions first…', long: 'The whole job…'};
