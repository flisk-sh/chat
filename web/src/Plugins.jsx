import {useState, useMemo, useEffect} from 'react';
import {Dialog} from '@astryxdesign/core/Dialog';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import catalog from '../../plugins/catalog.json';

// The plugin picker behind the + menu: the catalog (plugins/catalog.json) as cards under group chips.
// It opens on what is ready; coming soon plugins have their own chip so they never crowd the first view.
// Every ready card does something: a Studio plugin opens Studio, any other fills the box with what to say.
export const PLUGINS = catalog.plugins;
export const READY = PLUGINS.filter((p) => p.status === 'ready');
export const SOON = PLUGINS.filter((p) => p.status !== 'ready');
export const opensStudio = (p) => p.status === 'ready' && p.id.startsWith('studio.');
const GROUPS = [...new Set(READY.map((p) => p.group))];
export const matches = (p, s) => !s || (p.title + ' ' + p.group + ' ' + p.voice.join(' ')).toLowerCase().includes(s.toLowerCase());

export function PluginsDialog({open, onClose, onStudio, onAsk}) {
  const [q, setQ] = useState('');
  const [chip, setChip] = useState('ready');
  useEffect(() => { if (open) { setQ(''); setChip('ready'); } }, [open]);
  const chips = [['ready', 'Ready · ' + READY.length], ...GROUPS.map((g) => [g, g]), ['soon', 'Coming soon · ' + SOON.length]];
  const rows = useMemo(() => {
    const base = chip === 'ready' ? READY : chip === 'soon' ? SOON : READY.filter((p) => p.group === chip);
    // A search looks at everything, so a plugin that is not here yet can still be found.
    return (q.trim() ? PLUGINS : base).filter((p) => matches(p, q.trim()));
  }, [q, chip]);
  const pick = (p) => {
    if (p.status !== 'ready') return;
    onClose();
    if (opensStudio(p)) onStudio(); else onAsk(p.voice[0]);
  };
  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} width={600} purpose="form">
      <div style={{display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, maxHeight: 'min(82dvh, 680px)'}}>
        <Heading level={3}>Plugins</Heading>
        <TextInput label="Search plugins" isLabelHidden value={q} onChange={setQ} placeholder="Search plugins, or say what you want" autoComplete="off" autoCapitalize="off" hasAutoCorrect={false} enterKeyHint="search" />
        <HStack gap={2} wrap="wrap">{chips.map(([id, label]) => <Button key={id} label={label} size="sm" variant={chip === id && !q.trim() ? 'primary' : 'secondary'} onClick={() => { setChip(id); setQ(''); }} />)}</HStack>
        <div role="list" aria-label="Plugins" style={{overflowY: 'auto', minHeight: 0, flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, alignContent: 'start', paddingBottom: 4}}>
          {rows.map((p) => {
            const ready = p.status === 'ready';
            return (
              <button key={p.id} role="listitem" type="button" aria-disabled={!ready} onClick={() => pick(p)}
                style={{display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left', padding: '10px 12px', background: 'transparent', color: 'inherit', border: '1px solid var(--color-border-subtle, #8884)', borderRadius: 12, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : 0.55}}>
                <Text weight="semibold">{p.title}</Text>
                <Text type="supporting" color="secondary">{ready ? '“' + p.voice[0] + '”' : 'Coming soon'}</Text>
              </button>
            );
          })}
          {!rows.length && <Text color="secondary" style={{padding: 12, gridColumn: '1 / -1'}}>No plugin matches. Clear the search.</Text>}
        </div>
      </div>
    </Dialog>
  );
}
