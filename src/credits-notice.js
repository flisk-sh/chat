// Low-credits notice shown above the chat. Styled with the existing .limit card.
// The top-up is a beta stub: it opens the bring-your-own-key setup, since paid top-up
// is not built yet. Returns '' when there is no balance to report or credits are fine.
export const LOW_CREDITS_THRESHOLD = 0.2; // share of the allowance left

export function creditsNotice(credits) {
  if (!credits || !(credits.total > 0)) return '';
  const left = Math.max(0, credits.left || 0);
  if (left / credits.total > LOW_CREDITS_THRESHOLD) return '';
  const empty = left <= 0;
  const title = empty ? 'Out of credits' : 'Running low on credits';
  const body = empty
    ? 'Add your own provider key to keep running tasks. Paid top-up is not live yet.'
    : 'Add your own provider key to keep running tasks without a limit.';
  return `<div class="limit credits-notice" role="status"><div class="ic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 5v4l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></div><div style="flex:1;min-width:0"><b>${title}</b><p>${body}</p><div class="acts"><a class="btn go" href="#setup">Use my own key (BYOK)</a><a class="btn" href="#setup" title="Beta: paid top-up is not live yet">Top up credits <small>(beta)</small></a></div></div></div>`;
}
