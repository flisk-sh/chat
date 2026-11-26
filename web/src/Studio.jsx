import {useEffect, useRef} from 'react';
import {HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {ArrowTopRightOnSquareIcon, XMarkIcon} from '@heroicons/react/24/outline';

// The Studio plugin: the photo editor of studio.flisk.si beside the chat. The photo never leaves the browser.
// Chat talks to it with postMessage: {flisk: 'studio', cmd, ...} in, {flisk: 'studio', type: 'reply', cmd, ok, note} back.
// Studio only obeys chat.flisk.si (and the dev origin), and chat only listens to Studio.
export const STUDIO_URL = 'https://studio.flisk.si/?embed=1#editor';
// The frame wears the chat's own light or dark, so a dark chat never shows a white editor. Earth is a dark look.
export const studioMode = (scheme) => (scheme === 'earth' ? 'dark' : scheme === 'light' || scheme === 'dark' ? scheme : 'system');
export const studioSrc = (scheme) => STUDIO_URL.replace('?embed=1', '?embed=1&mode=' + studioMode(scheme));
const STUDIO_ORIGIN = 'https://studio.flisk.si';

export const sendToStudio = (frame, msg) => { if (!frame) return false; frame.contentWindow.postMessage({flisk: 'studio', ...msg}, STUDIO_ORIGIN); return true; };

export function StudioPanel({frameRef, onClose, onReply, scheme = 'system'}) {
  const first = useRef(studioSrc(scheme)); // the address is fixed once, so a look change never reloads the frame and loses the photo
  useEffect(() => { sendToStudio(frameRef.current, {type: 'mode', mode: studioMode(scheme)}); }, [scheme]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    const m = (e) => { if (e.origin === STUDIO_ORIGIN && e.data && e.data.flisk === 'studio' && e.data.type === 'reply') onReply(e.data); };
    document.addEventListener('keydown', k); window.addEventListener('message', m);
    return () => { document.removeEventListener('keydown', k); window.removeEventListener('message', m); };
  }, [onClose, onReply]);
  return (
    <aside className="page-panel" aria-label="Studio photo editor">
      <HStack gap={1} align="center" justify="space-between" className="page-panel-bar">
        <Text weight="semibold">Studio</Text>
        <HStack gap={1}>
          <Button label="Open in a new tab" variant="ghost" size="sm" isIconOnly icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />} href="https://studio.flisk.si/#editor" target="_blank" />
          <Button label="Close Studio" variant="ghost" size="sm" isIconOnly icon={<Icon icon={XMarkIcon} size="sm" />} onClick={onClose} />
        </HStack>
      </HStack>
      <iframe ref={frameRef} title="Studio photo editor" src={first.current} allow="clipboard-read" className="page-panel-frame" />
    </aside>
  );
}
