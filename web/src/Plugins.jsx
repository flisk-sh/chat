import {useState, useMemo, useEffect} from 'react';
import {Dialog} from '@astryxdesign/core/Dialog';
import {TextInput} from '@astryxdesign/core/TextInput';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {Icon} from '@astryxdesign/core/Icon';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {
  ScissorsIcon, ArrowsPointingInIcon, ArrowPathIcon, SunIcon, ArrowsPointingOutIcon, LanguageIcon, PhotoIcon, DocumentDuplicateIcon,
  DocumentArrowDownIcon, DocumentTextIcon, ArrowUturnLeftIcon, ArrowDownTrayIcon, CommandLineIcon, WrenchScrewdriverIcon, GlobeAltIcon,
  ChartBarIcon, MagnifyingGlassIcon, MegaphoneIcon, CpuChipIcon, SparklesIcon, PuzzlePieceIcon, MicrophoneIcon, ChatBubbleLeftRightIcon,
  LinkIcon, ServerStackIcon, PencilSquareIcon, Squares2X2Icon, FilmIcon, FaceSmileIcon, RocketLaunchIcon,
} from '@heroicons/react/24/outline';
import catalog from '../../plugins/catalog.json';

// The plugin picker behind the + menu: the whole catalog (plugins/catalog.json), ready ones first, so nothing is offered that is not there.
// A ready Studio plugin opens the Studio panel; the other ready ones show what to say. Coming soon ones are listed and not clickable.
export const PLUGINS = catalog.plugins;
export const opensStudio = (p) => p.status === 'ready' && p.id.startsWith('studio.');

// One icon per plugin, matched on words in its id; anything unmatched gets the puzzle piece.
const ICONS = [
  ['background', ScissorsIcon], ['crop', ArrowsPointingInIcon], ['rotate', ArrowPathIcon], ['adjust', SunIcon], ['resize', ArrowsPointingOutIcon],
  ['upscale', ArrowsPointingOutIcon], ['text', LanguageIcon], ['batch', Squares2X2Icon], ['merge', DocumentDuplicateIcon], ['shrink', DocumentArrowDownIcon],
  ['pdf', DocumentTextIcon], ['undo', ArrowUturnLeftIcon], ['export', ArrowDownTrayIcon], ['cli', CommandLineIcon], ['build', WrenchScrewdriverIcon],
  ['pages', GlobeAltIcon], ['analytics', ChartBarIcon], ['search', MagnifyingGlassIcon], ['listing', MegaphoneIcon], ['citable', SparklesIcon],
  ['grow', RocketLaunchIcon], ['agents', CpuChipIcon], ['seo', MagnifyingGlassIcon], ['voice', MicrophoneIcon], ['read-aloud', MicrophoneIcon],
  ['chat', ChatBubbleLeftRightIcon], ['pods', ServerStackIcon], ['sign', PencilSquareIcon], ['video', FilmIcon], ['meme', FaceSmileIcon],
  ['emoji', FaceSmileIcon], ['erase', ScissorsIcon], ['photo', PhotoIcon], ['heic', PhotoIcon], ['icons', Squares2X2Icon], ['social', PhotoIcon],
];
const iconOf = (p) => (ICONS.find(([k]) => p.id.includes(k)) || [0, p.group === 'Connectors' ? LinkIcon : PuzzlePieceIcon])[1];

const TABS = [
  {id: 'all', label: 'All', icon: Squares2X2Icon, has: () => true},
  {id: 'studio', label: 'Photos and PDFs', icon: PhotoIcon, has: (p) => p.id.startsWith('studio.')},
  {id: 'flisk', label: 'Flisk', icon: SparklesIcon, has: (p) => p.group === 'Flisk' || p.group === 'Voice and chat'},
  {id: 'connect', label: 'Connectors', icon: LinkIcon, has: (p) => p.group === 'Connectors'},
];

function Tile({p}) {
  const ready = p.status === 'ready';
  return (
    <span style={{width: 36, height: 36, borderRadius: 'var(--radius)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      background: ready ? 'var(--color-background-accent-subtle, #6aa1ff22)' : 'var(--color-background-secondary, #8882)'}}>
      <Icon icon={iconOf(p)} size="sm" color={ready ? 'accent' : 'secondary'} />
    </span>
  );
}

export function PluginsDialog({open, onClose, onStudio}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  useEffect(() => { if (open) { setQ(''); setTab('all'); } }, [open]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const has = TABS.find((t) => t.id === tab).has;
    return PLUGINS.filter((p) => has(p) && (!s || (p.title + ' ' + p.group + ' ' + p.voice.join(' ')).toLowerCase().includes(s)))
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'ready' ? -1 : 1));
  }, [q, tab]);
  const ready = rows.filter((p) => p.status === 'ready').length;
  const pick = (p) => { if (opensStudio(p)) { onClose(); onStudio(); } };
  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} width={600} purpose="form">
      <div style={{display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, maxHeight: 'min(82dvh, 680px)'}}>
        <VStack gap={1}>
          <Heading level={3}>Plugins</Heading>
          <Text type="supporting" color="secondary">Say what you want in the chat, or tap a ready one.</Text>
        </VStack>
        <TextInput label="Search plugins" isLabelHidden value={q} onChange={setQ} startIcon={MagnifyingGlassIcon} placeholder="Search by name or what you would say" autoComplete="off" autoCapitalize="off" hasAutoCorrect={false} enterKeyHint="search" />
        <SegmentedControl size="sm" value={tab} onChange={setTab} aria-label="Show plugins">
          {TABS.map((t) => <SegmentedControlItem key={t.id} value={t.id} label={t.label} icon={<Icon icon={t.icon} size="sm" />} />)}
        </SegmentedControl>
        <Text type="caption" color="secondary">{ready} ready · {rows.length - ready} coming soon</Text>
        <div role="list" aria-label="Plugins" style={{overflowY: 'auto', minHeight: 0, flex: 1}}>
          {rows.map((p) => (
            <div role="listitem" key={p.id} style={{opacity: p.status === 'ready' ? 1 : 0.55}}>
              <button type="button" className="plug-row" disabled={p.status !== 'ready'} onClick={() => pick(p)} style={{cursor: opensStudio(p) ? 'pointer' : 'default'}}>
                <Tile p={p} />
                <span style={{flex: 1, minWidth: 0}}>
                  <Text weight="semibold" style={{display: 'block'}}>{p.title}</Text>
                  <Text type="supporting" color="secondary" style={{display: 'block'}}>{'Say "' + p.voice[0] + '"'}</Text>
                </span>
                {p.status === 'ready' ? <Badge label={opensStudio(p) ? 'Open' : 'Ready'} variant="success" /> : <Badge label="Soon" />}
              </button>
            </div>
          ))}
          {!rows.length && <VStack gap={1} hAlign="center" style={{padding: 24}}><Icon icon={PuzzlePieceIcon} size="lg" color="secondary" /><Text weight="semibold">No plugin matches</Text><Text type="supporting" color="secondary">Try other words, or pick All.</Text></VStack>}
        </div>
      </div>
    </Dialog>
  );
}
