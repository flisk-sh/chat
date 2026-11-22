// A 100 x 30 px scene at the end of each + menu row: a short loop that shows what the row does. SVG and CSS only.
const bar = (n) => Array.from({length: n}, (_, i) => i);

export function Demo({kind}) {
  return (
    <svg className={'demo demo-' + kind} viewBox="0 0 100 30" width="100" height="30" aria-hidden="true" focusable="false">
      {kind === 'dictate' && (<>
        <g className="d-voice">{bar(9).map((i) => <rect key={i} className="d-bar" style={{animationDuration: (0.45 + (i * 37) % 5 * 0.08) + 's', animationDelay: -(i * 0.11) + 's'}} x={3 + i * 4.4} y="5" width="2.4" height="20" rx="1.2" />)}</g>
        <path className="d-arrow" d="M44 11l5 4-5 4" />
        <g className="d-text"><rect x="55" y="7" width="40" height="3.4" rx="1.7" /><rect x="55" y="13.3" width="30" height="3.4" rx="1.7" /><rect x="55" y="19.6" width="36" height="3.4" rx="1.7" /><rect className="d-caret" x="93" y="19" width="1.8" height="5" /></g>
      </>)}
      {kind === 'talk' && (<>
        <g className="t-you">{bar(5).map((i) => <rect key={i} className="t-barL" style={{animationDelay: (i * 0.07) + 's'}} x={8 + i * 5} y="6" width="2.6" height="18" rx="1.3" />)}</g>
        <circle className="t-ring" cx="50" cy="15" r="5" /><circle className="t-ring t-r2" cx="50" cy="15" r="5" />
        <circle className="t-orb" cx="50" cy="15" r="5.5" />
        <g className="t-ai">{bar(5).map((i) => <rect key={i} className="t-barR" style={{animationDelay: (i * 0.07) + 's'}} x={67 + i * 5} y="6" width="2.6" height="18" rx="1.3" />)}</g>
      </>)}
      {kind === 'attach' && (<>
        {bar(3).map((i) => (
          <g key={i} className="a-card" style={{animationDelay: (i * 0.42) + 's', transform: 'translate(' + (6 + i * 15) + 'px,4px)'}}>
            <path d="M0 2.5Q0 0 2.5 0H9l6 6v15.5Q15 24 12.5 24h-10Q0 24 0 21.5Z" /><path d="M9 0v6h6" /><path d="M3.5 13h8M3.5 17h5.5" />
          </g>
        ))}
        <circle className="a-badge" cx="62" cy="15" r="8" /><path className="a-tick" d="M58.4 15.2l2.6 2.7 4.8-5.6" />
        <path className="a-clip" d="M82 21V10a5 5 0 0 1 10 0v12a3.2 3.2 0 0 1-6.4 0V11.5" />
      </>)}
      {kind === 'computers' && (<>
        {bar(3).map((i) => (
          <g key={i} className={'c-pc c-pc' + i} style={{transform: 'translate(' + (6 + i * 31) + 'px,3px)'}}>
            <rect className="c-scr" x="0" y="0" width="26" height="16" rx="2" /><path d="M13 16v4M7 20h12" />
            <rect className="c-fill" x="3" y="12" width="20" height="2" rx="1" /><circle className="c-led" cx="22" cy="3.4" r="1.4" />
          </g>
        ))}
        <path className="c-rail" d="M6 27H94" /><circle className="c-task" cx="6" cy="27" r="2.6" />
      </>)}
      {kind === 'model' && (<>
        <path className="m-spark" d="M12 4c.6 5.4 2.6 7.4 8 8-5.4.6-7.4 2.6-8 8-.6-5.4-2.6-7.4-8-8 5.4-.6 7.4-2.6 8-8Z" />
        <g className="m-lines"><rect className="m-l1" x="30" y="6" width="62" height="3.6" rx="1.8" /><rect className="m-l2" x="30" y="13.2" width="48" height="3.6" rx="1.8" /><rect className="m-l3" x="30" y="20.4" width="56" height="3.6" rx="1.8" /></g>
        <rect className="m-caret" x="30" y="19.6" width="2" height="5.2" />
      </>)}
    </svg>
  );
}
