// A 100 x 30 px demo at the end of each + menu row: a hint of what the row does, drawn with CSS only.
const bars = (n) => Array.from({length: n}, (_, i) => <i key={i} style={{animationDelay: (i * 0.09) + 's'}} />);

export function Demo({kind}) {
  return (
    <span className={'demo demo-' + kind} aria-hidden="true">
      {kind === 'dictate' && <>{bars(14)}</>}
      {kind === 'talk' && <><b /><b /><b /></>}
      {kind === 'attach' && <><s /><s /><s /></>}
      {kind === 'computers' && <><u /><u /><u /></>}
      {kind === 'model' && <><em /><em /><em /></>}
    </span>
  );
}
