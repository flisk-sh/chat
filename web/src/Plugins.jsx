import {useState, useMemo, useEffect} from 'react';
import {Dialog} from '@astryxdesign/core/Dialog';
import {TextInput} from '@astryxdesign/core/TextInput';
import {HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import catalog from '../../plugins/catalog.json';

// The plugin picker behind the + menu: the whole catalog (plugins/catalog.json), ready ones first, so nothing is offered that is not there.
// A ready Studio plugin opens the Studio panel; the other ready ones show what to say. Coming soon ones are listed and not clickable.
export const PLUGINS = catalog.plugins;
export const opensStudio = (p) => p.status === 'ready' && p.id.startsWith('studio.');

export function PluginsDialog({open, onClose, onStudio}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return PLUGINS.filter((p) => !s || (p.title + ' ' + p.group + ' ' + p.voice.join(' ')).toLowerCase().includes(s))
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'ready' ? -1 : 1));
  }, [q]);
  const pick = (p) => { if (opensStudio(p)) { onClose(); onStudio(); } };
  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} width={560} purpose="form">
      <div style={{display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, maxHeight: 'min(82dvh, 680px)'}}>
        <Heading level={3}>Plugins</Heading>
        <TextInput label="Search plugins" isLabelHidden value={q} onChange={setQ} placeholder="Search plugins: name or what you would say" autoComplete="off" autoCapitalize="off" hasAutoCorrect={false} enterKeyHint="search" />
        <div role="list" aria-label="Plugins" style={{overflowY: 'auto', minHeight: 0, flex: 1, border: '1px solid var(--color-border-subtle, #8884)', borderRadius: 12}}>
          {rows.map((p) => (
            <button key={p.id} role="listitem" type="button" disabled={p.status !== 'ready'} onClick={() => pick(p)}
              style={{display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'transparent', color: 'inherit', border: 0, borderBottom: '1px solid var(--color-border-subtle, #8884)', cursor: opensStudio(p) ? 'pointer' : 'default', opacity: p.status === 'ready' ? 1 : 0.6}}>
              <span style={{flex: 1, minWidth: 0}}>
                <Text weight="semibold">{p.title}</Text>
                <Text type="supporting" color="secondary" style={{display: 'block'}}>{p.group + ' · say "' + p.voice[0] + '"'}</Text>
              </span>
              <HStack gap={1}>{p.status === 'ready' ? <Badge label="Ready" variant="success" /> : <Badge label="Coming soon" />}</HStack>
            </button>
          ))}
          {!rows.length && <Text color="secondary" style={{padding: 12, display: 'block'}}>No plugin matches. Clear the search.</Text>}
        </div>
      </div>
    </Dialog>
  );
}
