import {useEffect} from 'react';
import {HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {ArrowTopRightOnSquareIcon, XMarkIcon} from '@heroicons/react/24/outline';

// The Studio plugin: the photo editor of studio.flisk.si beside the chat. The photo never leaves the browser.
// Chat talks to it with postMessage: {flisk: 'studio', cmd, ...} in, {flisk: 'studio', type: 'reply', cmd, ok, note} back.
// Studio only obeys chat.flisk.si (and the dev origin), and chat only listens to Studio.
export const STUDIO_URL = 'https://studio.flisk.si/?embed=1#editor';
const STUDIO_ORIGIN = 'https://studio.flisk.si';

export const sendToStudio = (frame, msg) => { if (!frame) return false; frame.contentWindow.postMessage({flisk: 'studio', ...msg}, STUDIO_ORIGIN); return true; };

// What chat can really ask Studio to do (see studio-commands.js). Everything else in Studio is done by hand in the editor.
export const QUICK = [['Remove background', {cmd: 'removeBackground'}], ['Crop square', {cmd: 'crop', ratio: '1:1'}], ['Crop 16:9', {cmd: 'crop', ratio: '16:9'}], ['Crop 4:3', {cmd: 'crop', ratio: '4:3'}]];

export function StudioPanel({frameRef, onClose, onReply, onQuick}) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    const m = (e) => { if (e.origin === STUDIO_ORIGIN && e.data && e.data.flisk === 'studio' && e.data.type === 'reply') onReply(e.data); };
    document.addEventListener('keydown', k); window.addEventListener('message', m);
    return () => { document.removeEventListener('keydown', k); window.removeEventListener('message', m); };
  }, [onClose, onReply]);
  return (
    <aside className="page-panel studio-panel" aria-label="Studio photo editor">
      <HStack gap={1} align="center" justify="space-between" className="page-panel-bar">
        <Text weight="semibold">Studio</Text>
        <HStack gap={1}>
          <Button label="Open in a new tab" variant="ghost" size="sm" isIconOnly icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />} href="https://studio.flisk.si/#editor" target="_blank" />
          <Button label="Close Studio" variant="ghost" size="sm" isIconOnly icon={<Icon icon={XMarkIcon} size="sm" />} onClick={onClose} />
        </HStack>
      </HStack>
      <HStack gap={1} wrap="wrap" className="page-panel-bar">
        {QUICK.map(([label, msg]) => <Button key={label} label={label} variant="secondary" size="sm" onClick={() => onQuick(msg)} />)}
        <Text type="supporting" color="secondary">Open a photo in the editor first. Or say it in the chat.</Text>
      </HStack>
      <iframe ref={frameRef} title="Studio photo editor" src={STUDIO_URL} allow="clipboard-read" className="page-panel-frame" />
    </aside>
  );
}
