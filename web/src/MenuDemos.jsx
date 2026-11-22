// A scene at the end of each + menu row: a tiny working UI that plays one short story on a 5 s timeline, with a cursor and spring
// easing. It rests at 100 x 30 px and zooms to about 2.6x while the row is hovered or focused. SVG and CSS only.
const n = (k) => Array.from({length: k}, (_, i) => i);
const Cursor = ({cls}) => <path className={'cur ' + cls} d="M0 0v13l3.4-3 2.6 5.6 2.2-1L5.6 9H10Z" />;

export function Demo({kind}) {
  return (
    <span className="demo-wrap" aria-hidden="true">
      <svg className={'demo demo-' + kind} viewBox="0 0 200 60" width="100" height="30" focusable="false">
        <rect className="bg" x="1" y="1" width="198" height="58" rx="5" />
        {kind === 'dictate' && (<>
          <circle className="rip" cx="24" cy="30" r="10" /><circle className="rip r2" cx="24" cy="30" r="10" />
          <g className="mic"><circle cx="24" cy="30" r="10" /><path d="M24 25v6M20.5 29.2a3.5 3.5 0 0 0 7 0M24 33.2v2.3" /></g>
          <g>{n(9).map((i) => <rect key={i} className="wv" style={{animationDelay: (i * 0.06) + 's', '--h': (10 + (i * 7) % 5 * 4) + 'px'}} x={44 + i * 5} y="22" width="2.6" height="16" rx="1.3" />)}</g>
          <rect className="ln l1" x="94" y="19" width="92" height="5" rx="2.5" /><rect className="ln l2" x="94" y="29" width="70" height="5" rx="2.5" /><rect className="ln l3" x="94" y="39" width="82" height="5" rx="2.5" />
          <rect className="caret" x="94" y="38" width="2" height="7" />
          <Cursor cls="dc" />
        </>)}
        {kind === 'talk' && (<>
          <g className="ri"><circle cx="100" cy="30" r="9" /><circle cx="100" cy="30" r="9" className="g2" /></g>
          <g className="ro"><circle cx="100" cy="30" r="9" /><circle cx="100" cy="30" r="9" className="g2" /></g>
          <circle className="orb" cx="100" cy="30" r="8" />
          <g>{n(7).map((i) => <rect key={i} className="you" style={{animationDelay: (i * 0.05) + 's'}} x={14 + i * 6} y="18" width="3" height="24" rx="1.5" />)}</g>
          <g>{n(7).map((i) => <rect key={i} className="ai" style={{animationDelay: (i * 0.05) + 's'}} x={146 + i * 6} y="18" width="3" height="24" rx="1.5" />)}</g>
          <path className="lab" d="M10 10h20M170 50h20" />
        </>)}
        {kind === 'attach' && (<>
          <rect className="zone" x="116" y="9" width="76" height="42" rx="5" />
          <path className="plus" d="M154 24v12M148 30h12" />
          {n(3).map((i) => <g key={i} className="chip" style={{animationDelay: (i * 0.14) + 's', transform: 'translate(' + (124 + i * 22) + 'px,19px)'}}><path d="M0 3Q0 0 3 0h7l6 6v15q0 3-3 3H3q-3 0-3-3Z" /><path d="M3.5 13h9M3.5 17.5h6" /></g>)}
          <circle className="ok" cx="180" cy="17" r="5" /><path className="tk" d="M177.4 17l2 2 3.4-4" />
          <g className="fc"><path d="M0 3Q0 0 3 0h12l7 7v19q0 3-3 3H3q-3 0-3-3Z" /><path d="M15 0v7h7M5 15h12M5 20.5h8" /></g>
          <Cursor cls="ac" />
        </>)}
        {kind === 'computers' && (<>
          <g className="task"><rect x="8" y="23" width="36" height="14" rx="7" /><path d="M16 30h14" /></g>
          <circle className="hub" cx="76" cy="30" r="4.5" />
          <path className="pt" d="M44 30H71.5" />
          <path className="pt q1" d="M80.5 30L112 14.5" /><path className="pt q2" d="M80.5 30H112" /><path className="pt q3" d="M80.5 30L112 45.5" />
          {[0, 1, 2].map((i) => (
            <g key={i} className={'pc pc' + i}><rect className="card" x="114" y={7 + i * 16.5} width="78" height="13" rx="3" /><circle className="led" cx="121" cy={13.5 + i * 16.5} r="2" /><rect className="trk" x="128" y={11.5 + i * 16.5} width="56" height="4" rx="2" /><rect className="bar" x="128" y={11.5 + i * 16.5} width="56" height="4" rx="2" /></g>
          ))}
          <circle className="job" r="3.2" />
        </>)}
        {kind === 'model' && (<>
          <rect className="hl" x="8" y="8" width="52" height="13" rx="6.5" />
          {['wolf', 'claude', 'gpt'].map((k, i) => <g key={k} className={'pill p' + i}><circle cx={18 + i * 56} cy="14.5" r="3" /><rect x={25 + i * 56} y="12.7" width="24" height="3.6" rx="1.8" /></g>)}
          {n(3).map((m) => <g key={m} className={'st s' + m}><rect className="tx a" x="12" y="30" width="170" height="4.4" rx="2.2" /><rect className="tx b" x="12" y="38.5" width="136" height="4.4" rx="2.2" /><rect className="tx c" x="12" y="47" width="156" height="4.4" rx="2.2" /></g>)}
          <path className="spk" d="M186 12c.4 3.4 1.6 4.6 5 5-3.4.4-4.6 1.6-5 5-.4-3.4-1.6-4.6-5-5 3.4-.4 4.6-1.6 5-5Z" />
        </>)}
      </svg>
    </span>
  );
}
