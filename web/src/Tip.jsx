import {createContext, useContext, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {Brand, BRAND_NAME} from './Brand.jsx';
import {Demo} from './MenuDemos.jsx';

// {on, show(text)}: Explain mode state shared by every Tip.
export const ExplainContext = createContext({on: false, show: () => {}});

const HOLD_MS = 600;

// Hover = small tooltip. Press and hold (finger or mouse) = a peek card that grows from the control, like iPhone's touch-and-hold
// preview. In Explain mode a plain press opens the same card, so every explained control looks the same however you reach it.
// `scene` names a live animated scene (see MenuDemos) shown inside the card; `scenes` lists several, one row each.
// `passThrough` keeps the control working in Explain mode (the button that leaves it).
export function Tip({text, title, brand, more, scene, scenes, passThrough, placement = 'above', children}) {
  const {on, show} = useContext(ExplainContext);
  const [peek, setPeek] = useState(null);
  const timer = useRef(0), start = useRef(null), held = useRef(false), el = useRef(null);
  const cancel = () => clearTimeout(timer.current);
  const open = () => {
    const r = el.current.getBoundingClientRect();
    try { navigator.vibrate && navigator.vibrate(12); } catch (_) {}
    if (on && show) show(text);
    setPeek({x: r.left + r.width / 2, y: r.top + r.height / 2});
  };
  const card = peek && createPortal(<Peek at={peek} title={title} brand={brand} text={text} more={more} scene={scene} scenes={scenes} onClose={() => setPeek(null)} />, document.body);
  if (on && !passThrough) {
    return (
      <>
        <span ref={el} data-explain="1" onPointerDownCapture={(e) => e.stopPropagation()} onMouseDownCapture={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(); } }} onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); open(); }}
          style={{display: 'inline-flex', flexShrink: 0, outline: '2px dashed #7aa2ff', outlineOffset: 2, borderRadius: 8}}>{children}</span>
        {card}
      </>
    );
  }
  const down = (e) => {
    held.current = false;
    start.current = [e.clientX, e.clientY];
    cancel();
    timer.current = setTimeout(() => { held.current = true; open(); }, HOLD_MS);
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
      {card}
    </>
  );
}

const CSS = `@keyframes peekFade{from{opacity:0}to{opacity:1}}
@keyframes peekGrow{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.03);opacity:1}100%{transform:scale(1)}}
@keyframes peekRise{from{transform:translateY(10px);opacity:0}to{transform:none;opacity:1}}
@keyframes peekPop{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
@keyframes peekReveal{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes peekRing{0%{transform:scale(.4);opacity:.9}100%{transform:scale(5);opacity:0}}
.peek-card>*{animation:peekRise .4s cubic-bezier(.2,.9,.3,1) both}
.peek-card>.peek-head{animation-delay:.12s}.peek-card>.peek-scene{animation:peekReveal .5s cubic-bezier(.2,.8,.2,1) .18s both}
.peek-card>.peek-text{animation-delay:.3s}.peek-card>.peek-more{animation-delay:.38s}.peek-card>.peek-hint{animation-delay:.5s}
.peek-brand{animation:peekPop .45s cubic-bezier(.3,1.5,.5,1) .15s both}
.peek-scene{color:#111;color-scheme:light;border:1px solid #e6e6e6;overflow:hidden;margin:2px 0 12px;border-radius:var(--radius)}
.peek-scene .demo-wrap,.peek-mini .demo-wrap{width:100%;height:auto;display:block}
.peek-scene .demo,.peek-mini .demo{position:static;width:100%;height:auto;display:block;transform:none!important;box-shadow:none!important}
.peek-row{display:flex;align-items:center;gap:12px;animation:peekRise .4s cubic-bezier(.2,.9,.3,1) both}
.peek-mini{flex:none;width:132px;border:1px solid #e6e6e6;overflow:hidden;color:#111;color-scheme:light;border-radius:var(--radius)}
@media (prefers-reduced-motion:reduce){.peek-card>*,.peek-brand,.peek-row{animation-duration:.01s;animation-delay:0s}}`;

function Peek({at, title, brand, text, more, scene, scenes, onClose}) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  const w = Math.min(scenes ? 380 : 340, innerWidth - 32);
  return (
    <div role="dialog" aria-modal="true" aria-label={title || BRAND_NAME[brand] || 'What this does'} onPointerDown={onClose}
      style={{position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.34)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', animation: 'peekFade .2s ease-out'}}>
      <style>{CSS}</style>
      <span aria-hidden="true" style={{position: 'absolute', left: at.x - 20, top: at.y - 20, width: 40, height: 40, borderRadius: '50%', border: '2px solid #7aa2ff', animation: 'peekRing .7s ease-out both', pointerEvents: 'none'}} />
      <div style={{position: 'absolute', left: '50%', top: '50%', width: w, marginLeft: -w / 2, transform: 'translateY(-50%)', maxHeight: '92vh', overflow: 'auto'}}>
        <div className="peek-card" style={{transformOrigin: `${at.x - (innerWidth - w) / 2}px ${at.y - innerHeight / 2 + 80}px`, animation: 'peekGrow .34s cubic-bezier(.2,.9,.3,1.1)',
          background: '#fff', color: '#111', colorScheme: 'light', borderRadius: 22, padding: 18, boxShadow: '0 24px 70px rgba(0,0,0,.4)'}}>
          <div className="peek-head" style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10}}>
            {brand && <span className="peek-brand" style={{display: 'inline-flex'}}><Brand name={brand} size={40} /></span>}
            <div style={{fontSize: 18, fontWeight: 650}}>{title || BRAND_NAME[brand] || 'What this does'}</div>
          </div>
          {scene && <div className="peek-scene"><Demo kind={scene} /></div>}
          <div className="peek-text" style={{fontSize: 16, lineHeight: 1.4}}>{text}</div>
          {scenes && <div style={{display: 'grid', gap: 10, marginTop: 12}}>
            {scenes.map((s, i) => (
              <div key={s.kind} className="peek-row" style={{animationDelay: (0.3 + i * 0.09) + 's'}}>
                <div className="peek-mini"><Demo kind={s.kind} /></div>
                <div><div style={{fontSize: 15, fontWeight: 600}}>{s.label}</div><div style={{fontSize: 13, lineHeight: 1.35, color: '#555'}}>{s.text}</div></div>
              </div>
            ))}
          </div>}
          {more && <div className="peek-more" style={{fontSize: 14, lineHeight: 1.4, color: '#555', marginTop: 10, paddingTop: 10, borderTop: '1px solid #eee'}}>{more}</div>}
          <div className="peek-hint" style={{fontSize: 12, color: '#999', marginTop: 12}}>Tap anywhere to close</div>
        </div>
      </div>
    </div>
  );
}
