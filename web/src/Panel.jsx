import {useEffect} from 'react';
import {HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, XMarkIcon} from '@heroicons/react/24/outline';

// The page this chat published (/s/<id>), shown beside the conversation, as Astryx's AI chat template shows its artifact (#438).
// The page keeps its own sandbox: the server sends `Content-Security-Policy: sandbox allow-scripts allow-forms` with every /s/<id>, so it cannot
// reach the chat. (An iframe sandbox attribute on top of that was blocked in the in-app browser, so the header is the one rule.)
// Wide screens: a column next to the chat. Phones: it covers the screen, and Close brings the chat back.
export function PagePanel({url, onClose, onCopy}) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <aside className="page-panel" aria-label="Page preview">
      <HStack gap={1} align="center" justify="space-between" className="page-panel-bar">
        <Text weight="semibold">Live page</Text>
        <HStack gap={1}>
          <Button label="Copy link" variant="ghost" size="sm" isIconOnly icon={<Icon icon={ClipboardDocumentIcon} size="sm" />} onClick={() => onCopy(url)} />
          <Button label="Open in a new tab" variant="ghost" size="sm" isIconOnly icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />} href={url} target="_blank" />
          <Button label="Close preview" variant="ghost" size="sm" isIconOnly icon={<Icon icon={XMarkIcon} size="sm" />} onClick={onClose} />
        </HStack>
      </HStack>
      <iframe title="Preview of the page" src={url} referrerPolicy="no-referrer" className="page-panel-frame" />
    </aside>
  );
}
