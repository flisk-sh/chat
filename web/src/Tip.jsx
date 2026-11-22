import {createContext, useContext, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {Brand, BRAND_NAME} from './Brand.jsx';

// {on, show(text)}: Explain mode state shared by every Tip.
export const ExplainContext = createContext({on: false, show: () => {}});

const HOLD_MS = 600;

// Hover = small tooltip. Press and hold (finger or mouse) = a peek card that
// grows from the control, like iPhone's touch-and-hold preview.
export function Tip({text, title, brand, more, placement = 'above', children}) {
  const {on, show} = useContext(ExplainContext);
  const [peek, setPeek] = useState(null);
  const timer = useRef(0), start = useRef(null), held = useRef(false), el = useRef(null);
  const cancel = () => clearTimeout(timer.current);
  if (on) {
    return <span data-explain="1" onClickCapture={(e) => {e.preventDefault(); e.stopPropagation(); show(text);}}
      style={{display: 'inline-flex', flexShrink: 0, outline: '2px dashed #7aa2ff', outlineOffset: 2, borderRadius: 8}}>{children}</span>;
  }
  const down = (e) => {
    held.current = false;
    start.current = [e.clientX, e.clientY];
    cancel();
    timer.current = setTimeout(() => {
      held.current = true;
      const r = el.current.getBoundingClientRect();
      try { navigator.vibrate && navigator.vibrate(12); } catch (_) {}
      setPeek({x: r.left + r.width / 2, y: r.top + r.height / 2});
    }, HOLD_MS);
  };
  const move = (e) => {
    if (start.current && Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]) > 8) cancel();
  };
  return (
    <>
      <Tooltip content={text} placement={placement}>
        <span ref={el} onPointerDown={down} onPointerMove={move} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
          onContextMenu={(e) => e.preventDefault()}
          onClickCapture={(e) => {if (held.current) {e.preventDefault(); e.stopPropagation(); held.current = false;}}}
          style={{display: 'inline-flex', flexShrink: 0, WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none'}}>
          {children}
        </span>
      </Tooltip>
      {peek && createPortal(<Peek at={peek} title={title} brand={brand} text={text} more={more} onClose={() => setPeek(null)} />, document.body)}
    </>
  );
}

function Peek({at, title, brand, text, more, onClose}) {
  return (
    <div onPointerDown={onClose} style={{position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.28)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', animation: 'peekFade .18s ease-out'}}>
      <style>{`@keyframes peekFade{from{opacity:0}to{opacity:1}}
@keyframes peekGrow{from{transform:scale(.3);opacity:.4}to{transform:scale(1);opacity:1}}`}</style>
      <div style={{position: 'absolute', left: '50%', top: '50%', width: 'min(340px, calc(100vw - 32px))', marginLeft: 'calc(min(340px, calc(100vw - 32px)) / -2)', transform: 'translateY(-50%)'}}>
        <div style={{transformOrigin: `${at.x - (innerWidth - Math.min(340, innerWidth - 32)) / 2}px ${at.y - innerHeight / 2 + 80}px`, animation: 'peekGrow .28s cubic-bezier(.2,.9,.3,1.2)',
          background: '#fff', color: '#111', borderRadius: 22, padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,.35)'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8}}>
            {brand && <Brand name={brand} size={40} />}
            <div style={{fontSize: 18, fontWeight: 650}}>{title || BRAND_NAME[brand] || 'What this does'}</div>
          </div>
          <div style={{fontSize: 16, lineHeight: 1.4}}>{text}</div>
          {more && <div style={{fontSize: 14, lineHeight: 1.4, color: '#555', marginTop: 10, paddingTop: 10, borderTop: '1px solid #eee'}}>{more}</div>}
          <div style={{fontSize: 12, color: '#999', marginTop: 12}}>Tap anywhere to close</div>
        </div>
      </div>
    </div>
  );
}
