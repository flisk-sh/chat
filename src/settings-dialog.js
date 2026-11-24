// The settings dialog: a modal over the chat with a left list of sections (and a "Search settings" box that filters it) and the
// chosen section on the right as grouped rows (label + hint + control). It shows only what chat already has: the account, the AI
// behind pull request reviews, the GitHub reviews help, and the link to the computers. The same file serves both pages (the classic
// page and the Astryx page), so it carries its own tokens, which read the page's own colours when the page has them.
//
// The server renders the inside (settingsPanel) and GET /settings/panel hands it out; SETTINGS_JS builds the dialog around it.
import { UK } from './i18n.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const SETTINGS_SECTIONS = ['account', 'usage', 'ai', 'github', 'computers'];
export const COMPUTERS_URL = 'https://fleet.flisk.si/console?section=providers';
const COMMANDS = [
  ['@flisk-chat review', 'Reads the changes and posts a review. Takes about 20 seconds.'],
  ['@flisk-chat review run', "The same, and also runs the project's lint and tests on one of your computers. The results are posted when it finishes."],
  ['@flisk-chat auto on', 'Reviews every new pull request in this repo by itself. Write @flisk-chat auto off to stop.'],
];
// What the search box looks in, besides the section's name.
const WORDS = {
  account: 'account sign in sign out log out github login profile',
  usage: 'usage left today limit free tasks pictures photos voice talk quota daily reset',
  ai: 'ai model api key provider openrouter claude anthropic openai reviews save delete',
  github: 'github reviews pull request install app commands comment copy repo',
  computers: 'computers fleet providers connect sandbox machine',
};
// Left list, grouped like the Astryx settings-dialog template: a small heading, then the sections with an icon each.
const GROUPS = [['Account', ['account', 'usage']], ['Chat', ['ai', 'github', 'computers']]];
const ICONS = {
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  usage: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  ai: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  github: '<path d="M9 19c-4 1.5-4-2-6-2m12 4v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  computers: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
};
const icon = (id) => `<svg class="sd-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[id] || ''}</svg>`;
const NAMES = { account: 'Account', usage: 'Usage today', ai: 'AI for reviews', github: 'GitHub reviews', computers: 'Computers' };

// Ukrainian lives in i18n.js (the page script reads it too); here the server uses it for ?lang=uk.
const tr = (lang) => (s) => (lang === 'uk' ? UK[s] || s : s);

// One row: label and hint on the left, the control on the right.
const row = (label, hint, control, forId = '') =>
  `<div class="sd-row"><div class="sd-lab">${forId ? `<label for="${forId}">${label}</label>` : `<span class="sd-name">${label}</span>`}${hint ? `<p class="sd-hint">${hint}</p>` : ''}</div><div class="sd-ctl">${control}</div></div>`;
const group = (title, body) => `<div class="sd-group"${title ? ` role="group" aria-label="${esc(title)}"` : ''}>${title ? `<h4>${esc(title)}</h4>` : ''}${body}</div>`;

// The inside of the dialog for one visitor. `saved` is the AI they stored (never its key), `form` what they typed after a refused save.
export function settingsPanel({ login = '', anon = false, saved = null, stored = false, limit = 5, section = '', flash = '', error = '', form = {}, lang = '', keyPages, appUrl, themeNote = '', usage = [], history = {} } = {}) {
  const t = tr(lang);
  const named = !!login && !anon && !/^anon-/i.test(String(login));
  const cur = SETTINGS_SECTIONS.includes(section) ? section : 'account';
  const who = login ? `<b>@${esc(login)}</b>` : '';

  const account = group('', named
    ? row(t('GitHub account'), t('Signed in as {login}').replace('{login}', `<b>@${esc(login)}</b>`), '<a class="sd-btn" href="/auth/signout">' + t('Sign out') + '</a>')
    : row(t('Not signed in'), t('Signing in with GitHub is optional. It keeps your chats and unlocks reviews of your pull requests.'), '<a class="sd-btn go" href="/auth/start">' + t('Sign in with GitHub') + '</a>'));

  const keyLinks = Object.entries(keyPages).map(([v, [n, u]]) => `<a class="sd-keylink" href="${u}" target="_blank" rel="noopener" data-for="${v}"${(form.ai || saved?.ai || 'openrouter') === v ? '' : ' hidden'}>${t('Get your {name} key').replace('{name}', esc(n))}</a>`).join('');
  const curLine = saved
    ? t('Reviews for {login} use {model} ({ai}) with your key. You pay your provider; no daily limit.').replace('{login}', who).replace('{model}', `<b>${esc(saved.model)}</b>`).replace('{ai}', esc(saved.ai))
    : t('Reviews for {login} use the free Flisk Wolf model: {n} a day, and only the first part of a big diff.').replace('{login}', who).replace('{n}', String(limit));
  const aiBody = !named
    ? group('', row(t('Your own AI'), t('Sign in with GitHub to choose your own AI for reviews.'), '<a class="sd-btn go" href="/auth/start">' + t('Sign in with GitHub') + '</a>'))
    : group(t('Current AI'), `<p class="sd-cur">${curLine}</p>`) +
      (stored
        ? group(t('Your own AI'), `<form method="post" action="/reviews/save" class="sd-form" data-sd-form>
${row(t('AI'), t('Which company runs the model that writes your reviews.'), `<select name="ai" id="sd-ai" class="sd-in">${Object.entries(keyPages).map(([v, [n]]) => `<option value="${v}"${(form.ai || saved?.ai) === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select><p class="sd-keylinks">${keyLinks}</p>`, 'sd-ai')}
${row(t('Model name'), t('For example anthropic/claude-sonnet-5.5'), `<input class="sd-in" id="sd-model" name="model" required maxlength="80" placeholder="anthropic/claude-sonnet-5.5" autocomplete="off" value="${esc(form.model ?? saved?.model ?? '')}">`, 'sd-model')}
${row(t('API key'), t('The key is encrypted before it is stored and never shown again.'), '<input class="sd-in" id="sd-key" name="key" type="password" required minlength="8" maxlength="300" autocomplete="off">', 'sd-key')}
<div class="sd-actions"><button class="sd-btn go" type="submit">${t('Save for reviews')}</button></div></form>`)
        : group('', `<p class="sd-hint">${t('Saving a key is not switched on yet.')}</p>`)) +
      (saved ? group('', `<form method="post" action="/reviews/delete" data-sd-form>${row(t('Delete my saved key'), t('Deleting the key puts reviews back on the free Flisk Wolf model.'), `<button class="sd-btn" type="submit">${t('Delete my saved key')}</button>`)}</form>`) : '');

  const cmds = COMMANDS.map(([c, d]) => `<li class="sd-cmd"><code>${esc(c)}</code><button type="button" class="sd-btn" data-sd-copy="${esc(c)}" aria-label="${esc(t('Copy') + ' ' + c)}">${t('Copy')}</button><span>${t(d)}</span></li>`).join('');
  const github = group('', `<p class="sd-lead">${t('Chat reads your pull request and writes a review on GitHub: a summary, comments on the exact lines, one-click fixes and a verdict. You ask for it by writing a comment.')}</p>`) +
    group('', row('1. ' + t('Install the app once'), t('Pick the repos you want it on.'), `<a class="sd-btn go" href="${appUrl}/installations/new" target="_blank" rel="noopener">${t('Install the GitHub App')}</a>`)) +
    group(t('Commands'), `<p class="sd-hint">2. ${t('Open any pull request on GitHub and write one of these in the comment box at the bottom, then press Comment.')}</p><ul class="sd-cmds">${cmds}</ul>`) +
    group('', row('3. ' + t('Read the review'), t('Nothing is merged or changed for you.'), `<a class="sd-btn" href="${appUrl}" target="_blank" rel="noopener">${t('View on GitHub')}</a><a class="sd-btn" href="https://github.com/settings/installations" target="_blank" rel="noopener">${t('Manage installed repos')}</a>`)) +
    `<p class="sd-hint">${t('Only people who can push to the repo can ask. Reviews use the AI chosen in AI for reviews. A model can be wrong, so read before you merge.')}</p>`;

  const computers = group('', row(t('Your computers'), t('Connect the computers and cloud accounts where chat runs your tasks. This opens in Fleet, in a new tab.'), `<a class="sd-btn go" href="${COMPUTERS_URL}" target="_blank" rel="noopener">${t('Open Computers')}</a>`));

  // What is left of today's free allowance. The numbers come from the same counters the gates use; the counters are not exact across data
  // centres, so "about" is honest. Everything resets at midnight UTC.
  const USAGE_NAMES = { tasks: ['Free tasks', 'Questions, pages and apps on the free Flisk Wolf model.'], pictures: ['Pictures', 'Photos and drawings made for you.'], talk: ['Voice chats', 'Talking with chat out loud.'] };
  // A ring: the share of today's allowance used. Green while there is room, red when it is used up.
  const ring = (u) => {
    const frac = u.limit ? Math.min(1, u.used / u.limit) : 0, C = 2 * Math.PI * 26;
    return `<svg class="sd-ring" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${esc(`${u.used} / ${u.limit}`)}"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--sd-line)" stroke-width="7"/>${frac > 0 ? `<circle cx="32" cy="32" r="26" fill="none" stroke="${frac >= 1 ? 'var(--sd-red)' : 'var(--sd-accent)'}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/>` : ''}</svg>`;
  };
  const tile = (u) => {
    const left = Math.max(0, u.limit - u.used), name = (USAGE_NAMES[u.key] || [u.key])[0];
    return `<div class="sd-tile"><div><p class="sd-tl">${t(name)}</p><p class="sd-tv"><b>${left}</b> <span>${t('left of')} ${u.limit}</span></p><p class="sd-ts">${u.used} ${t('used today')}</p></div>${ring(u)}</div>`;
  };
  // Bars of the last days, with the daily limit as a dashed line (the pictures: the one allowance chat keeps a history for).
  const bars = (pts, limit) => {
    if (!pts.length) return '';
    const W = 560, H = 190, L = 30, B = 24, T = 14, top = Math.max(limit, ...pts.map((p) => p.n), 1), slot = (W - L - 8) / pts.length, y = (v) => T + (H - T - B) * (1 - v / top);
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const grid = [0, Math.ceil(top / 2), top].map((v) => `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--sd-line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
    const cols = pts.map((p, i) => { const x = L + i * slot + slot * 0.2, w = slot * 0.6, last = i === pts.length - 1; return `<rect x="${x.toFixed(1)}" y="${y(p.n).toFixed(1)}" width="${w.toFixed(1)}" height="${(H - B - y(p.n)).toFixed(1)}" rx="3" fill="${last ? 'var(--sd-accent)' : 'var(--sd-line2)'}"/><text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${DAYS[new Date(`${p.day}T00:00:00Z`).getUTCDay()]}</text>`; }).join('');
    const cap = `<line x1="${L}" x2="${W}" y1="${y(limit)}" y2="${y(limit)}" stroke="var(--sd-red)" stroke-dasharray="5 4"/><text class="sd-capl" x="${W}" y="${y(limit) - 5}" text-anchor="end">${t('Limit')} ${limit}</text>`;
    return `<svg class="sd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(pts.map((p) => `${p.day}: ${p.n}`).join(', '))}">${grid}${cols}${cap}</svg>`;
  };
  const pic = usage.find((u) => u.key === 'pictures');
  const chart = pic && history.pictures?.length ? `<div class="sd-card"><p class="sd-tl">${t('Pictures, last 7 days')}</p>${bars(history.pictures, pic.limit)}</div>` : '';
  const usagePane = (usage.length ? `<div class="sd-tiles">${usage.map(tile).join('')}</div>${chart}` : group('', `<p class="sd-hint">${t('Usage is not available right now.')}</p>`)) +
    `<p class="sd-hint sd-note">${t('Counts reset every day at midnight UTC.')} ${named ? '' : t('Signing in with GitHub gives more free tasks, and keeps your chats.')}</p>` +
    (named ? '' : group('', row(t('More free tasks'), t('No card. Keeps your chats too.'), '<a class="sd-btn go" href="/auth/start">' + t('Sign in with GitHub') + '</a>'))) +
    group('', row(t('AI model and keys'), t('Flisk Wolf is free, or add your own key.'), `<button type="button" class="sd-btn" data-sd-model>${t('Choose the AI')}</button>`));

  const bodies = { account, usage: usagePane, ai: aiBody, github, computers };
  const msg = error ? `<p class="sd-flash sd-bad" role="alert">${esc(t('Not saved: {why}').replace('{why}', error))}</p>` : flash === 'saved' ? `<p class="sd-flash" role="status">${t('Saved. Your next review uses this AI.')}</p>` : flash === 'deleted' ? `<p class="sd-flash" role="status">${t('Deleted. Reviews use the free Flisk Wolf model again.')}</p>` : '';
  const tab = (id) => `<button type="button" role="tab" class="sd-tab" id="sd-t-${id}" aria-controls="sd-p-${id}" aria-selected="${id === cur}" tabindex="${id === cur ? 0 : -1}" data-sec="${id}" data-kw="${esc((NAMES[id] + ' ' + t(NAMES[id]) + ' ' + WORDS[id]).toLowerCase())}">${icon(id)}<span>${t(NAMES[id])}</span></button>`;
  const tabs = GROUPS.map(([g, ids]) => `<div class="sd-g"><p class="sd-gl">${t(g)}</p>${ids.map(tab).join('')}</div>`).join('');
  const panes = SETTINGS_SECTIONS.map((id) => `<section role="tabpanel" class="sd-pane" id="sd-p-${id}" aria-labelledby="sd-t-${id}" tabindex="0"${id === cur ? '' : ' hidden'}><h3>${t(NAMES[id])}</h3>${id === cur || (error && id === 'ai') ? msg : ''}<div class="sd-err" role="alert" hidden></div>${bodies[id]}</section>`).join('');
  return `<div class="sd-wrap" data-copied="${esc(t('Copied'))}" data-copy="${esc(t('Copy'))}" data-copyfail="${esc(t('Select and copy'))}" data-saving="${esc(t('Saving…'))}" data-neterr="${esc(t('Could not reach the server. Try again.'))}" data-whyfmt="${esc(t('Not saved: {why}'))}">
<aside class="sd-side"><div class="sd-top"><h2 id="sd-title">${t('Settings')}</h2><button type="button" class="sd-x" data-sd-close aria-label="${esc(t('Close settings'))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
<div class="sd-find"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" class="sd-q" placeholder="${esc(t('Search settings'))}" aria-label="${esc(t('Search settings'))}" autocomplete="off" spellcheck="false"></div>
<div class="sd-tabs" role="tablist" aria-orientation="vertical" aria-label="${esc(t('Settings sections'))}">${tabs}</div><p class="sd-none" role="status" hidden>${t('No settings match')}</p></aside>
<div class="sd-main">${panes}</div></div>`;
}

export const SETTINGS_CSS = `
.sd{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(10,10,12,.5);font-family:var(--sans,system-ui,-apple-system,'Segoe UI',sans-serif);font-size:14px;line-height:1.45;
--sd-bg:var(--panel,#fff);--sd-side:var(--side,#F4F3EF);--sd-line:var(--line,#E3E0D6);--sd-line2:var(--line2,#D3D0C5);--sd-ink:var(--ink,#1B1B18);--sd-dim:var(--dim,#6B6960);--sd-accent:var(--green,#2F7D4A);--sd-on:var(--flisk-on-accent,#fff);--sd-field:var(--bg,#fff);--sd-red:var(--red,#B42318);--sd-tint:var(--tint,#EAF3DE);color:var(--sd-ink)}
.sd[hidden]{display:none}
.sd[data-sd=dark]{--sd-bg:var(--panel,#1C1C1F);--sd-side:var(--side,#141416);--sd-line:var(--line,#2E2E33);--sd-line2:var(--line2,#3D3D44);--sd-ink:var(--ink,#EDEDEE);--sd-dim:var(--dim,#A0A0A6);--sd-accent:var(--green,#E8E8EA);--sd-on:var(--flisk-on-accent,#111);--sd-field:var(--bg,#0E0E10);--sd-red:var(--red,#F2746B);--sd-tint:var(--tint,#1F3326)}
.sd *{box-sizing:border-box}
.sd-box{display:flex;width:min(900px,100%);height:min(640px,100%);background:var(--sd-bg);border:1px solid var(--sd-line);border-radius:var(--radius);box-shadow:0 30px 80px -30px rgba(0,0,0,.6);overflow:hidden;outline:0;min-width:0}
.sd-wrap{display:grid;grid-template-columns:230px minmax(0,1fr);width:100%;min-width:0;min-height:0}
.sd-side{background:var(--sd-side);border-right:1px solid var(--sd-line);padding:16px 12px;display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto}
.sd-top{display:flex;align-items:center;justify-content:space-between;padding:0 4px}.sd-top h2{margin:0;font-size:16px;font-weight:600}
.sd-x{display:inline-grid;place-items:center;width:32px;height:32px;border:0;border-radius:var(--radius);background:none;color:var(--sd-dim);cursor:pointer}.sd-x:hover{background:var(--sd-line);color:var(--sd-ink)}
.sd-find{position:relative;display:flex;align-items:center}.sd-find svg{position:absolute;left:10px;color:var(--sd-dim);pointer-events:none}
.sd-q{width:100%;padding:8px 10px 8px 32px;border:1px solid var(--sd-line2);border-radius:var(--radius);background:var(--sd-field);color:var(--sd-ink);font:inherit;font-size:16px}
.sd-tabs{display:flex;flex-direction:column;gap:12px}.sd-g{display:flex;flex-direction:column;gap:2px}.sd-g[hidden]{display:none}.sd-gl{margin:0 10px 4px;font-size:12px;font-weight:600;color:var(--sd-dim)}.sd-tab{display:flex;align-items:center;gap:10px}
.sd-tab{text-align:left;border:0;border-radius:var(--radius);background:none;color:var(--sd-dim);padding:8px 10px;font:inherit;cursor:pointer}.sd-tab:hover{background:var(--sd-line);color:var(--sd-ink)}.sd-tab[aria-selected=true]{background:var(--sd-bg);color:var(--sd-ink);font-weight:600;box-shadow:inset 0 0 0 1px var(--sd-line2)}.sd-tab[hidden]{display:none}
.sd-none{margin:4px 10px;color:var(--sd-dim);font-size:13px}
.sd-main{overflow:auto;padding:22px 28px 28px;min-width:0;min-height:0}
.sd-pane{outline:0}.sd-pane h3{margin:0 0 14px;font-size:20px;font-weight:600;letter-spacing:-.01em}
.sd-group{border:1px solid var(--sd-line);border-radius:var(--radius);margin:0 0 16px;padding:0 16px}.sd-group h4{margin:12px 0 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--sd-dim)}
.sd-group>p{margin:12px 0}
.sd-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:8px 20px;align-items:center;padding:14px 0;border-top:1px solid var(--sd-line)}.sd-group>.sd-row:first-child,.sd-group>h4+.sd-row,.sd-form>.sd-row:first-child,.sd-group>form>.sd-row:first-child{border-top:0}
.sd-lab label,.sd-name{font-weight:500;display:block}.sd-hint{margin:2px 0 0;color:var(--sd-dim);font-size:13px}.sd-lead{color:var(--sd-dim);margin:12px 0}
.sd-ctl{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;align-items:center}.sd-form .sd-ctl{flex-direction:column;align-items:stretch}
.sd-in{width:100%;padding:8px 10px;border:1px solid var(--sd-line2);border-radius:var(--radius);background:var(--sd-field);color:var(--sd-ink);font:inherit;font-size:16px}
.sd-keylinks{margin:0;font-size:13px;text-align:right}.sd-keylink{color:var(--sd-ink)}
.sd-cur{color:var(--sd-ink)}
.sd-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:0 0 16px}.sd-tile{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--sd-line);border-radius:var(--radius);padding:14px 16px}
.sd-tl,.sd-ts{margin:0}.sd-tl{font-weight:600}.sd-tv{margin:6px 0 2px;white-space:nowrap}.sd-tv b{font-size:26px;font-weight:600}.sd-tv span,.sd-ts{color:var(--sd-dim);font-size:13px}
.sd-card{border:1px solid var(--sd-line);border-radius:var(--radius);padding:14px 16px 8px;margin:0 0 16px}.sd-chart{width:100%;height:auto;display:block;margin-top:8px}.sd-chart text{fill:var(--sd-dim);font-size:11px}.sd-chart .sd-capl{fill:var(--sd-red)}.sd-note{margin:0 0 16px}
.sd-actions{display:flex;justify-content:flex-end;padding:12px 0 14px;border-top:1px solid var(--sd-line)}
.sd-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--sd-line2);background:var(--sd-bg);color:var(--sd-ink);border-radius:var(--radius);padding:7px 14px;font:inherit;text-decoration:none;cursor:pointer;min-height:36px}.sd-btn:hover{border-color:var(--sd-ink)}.sd-btn.go{background:var(--sd-accent);border-color:var(--sd-accent);color:var(--sd-on)}.sd-btn[disabled]{opacity:.6;cursor:default}
.sd-cmds{list-style:none;margin:8px 0 14px;padding:0;display:grid;gap:8px}.sd-cmd{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center;border:1px solid var(--sd-line);border-radius:var(--radius);padding:10px 12px;background:var(--sd-field)}.sd-cmd code{font:600 13px var(--mono,ui-monospace,Menlo,monospace);overflow-wrap:anywhere}.sd-cmd span{grid-column:1/-1;color:var(--sd-dim);font-size:13px}
.sd-flash{margin:0 0 14px;padding:8px 12px;border:1px solid var(--sd-line);border-radius:var(--radius);background:var(--sd-tint)}.sd-bad,.sd-err{background:none;border-color:var(--sd-red);color:var(--sd-red)}.sd-err{margin:0 0 14px;padding:8px 12px;border:1px solid var(--sd-red);border-radius:var(--radius)}.sd-err[hidden]{display:none}
.sd-loading{margin:auto;padding:40px;color:var(--sd-dim)}.sd-failed{margin:auto;padding:30px;text-align:center;display:grid;gap:12px;justify-items:center}
.sd :focus-visible{outline:2px solid var(--sd-accent);outline-offset:2px}
html.sd-lock,html.sd-lock body{overflow:hidden}
@media (max-width:760px){
.sd{padding:0;align-items:stretch}.sd-box{width:100%;height:100%;border:0;border-radius:0}
.sd-wrap{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.sd-side{min-width:0}
.sd-side{border-right:0;border-bottom:1px solid var(--sd-line);padding:12px 12px 8px;gap:8px;overflow:visible}
.sd-tabs{flex-direction:row;overflow-x:auto;gap:6px;padding-bottom:2px}.sd-tab{white-space:nowrap;flex:none}
.sd-main{padding:16px 16px calc(24px + env(safe-area-inset-bottom))}
.sd-row{grid-template-columns:1fr}.sd-ctl,.sd-keylinks{justify-content:flex-start;text-align:left}
}
@media (prefers-reduced-motion:no-preference){.sd:not([hidden]){animation:sd-in .12s ease-out}@keyframes sd-in{from{opacity:0}}}
`;

// Browser side. Written as a function so it is checked by the same tools as the rest of the code, then sent as text.
function settingsClient() {
  var OPEN = 'a[href="/reviews"],a[href="/settings"],a[href^="/reviews#"],a[href^="/settings#"],[data-open-settings]';
  var root = null, box = null, opener = null, inerted = [], section = '', seq = 0;
  var lang = function () {
    if (window.__LANG) return window.__LANG;
    var ls = ''; try { ls = localStorage.getItem('chat_lang') || ''; } catch (e) { /* private mode */ }
    if (ls) return ls === 'uk' ? 'uk' : 'en';
    var nav = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    return window.__GEO === 'UA' || nav.some(function (l) { return /^uk\b/i.test(l); }) ? 'uk' : 'en';
  };
  // Dark or light: whatever the page paints behind the chat, so every look of the page gets a matching dialog.
  var dark = function () {
    var r = document.documentElement;
    if (r.dataset.theme === 'earth') return true;
    var seen = function (el) { while (el) { var c = getComputedStyle(el).backgroundColor, m = /rgba?\(([^)]+)\)/.exec(c); if (m) { var p = m[1].split(',').map(parseFloat); if (p.length < 4 || p[3] > 0.5) return p; } el = el.parentElement; } return null; };
    var p = seen(document.elementFromPoint(innerWidth / 2, innerHeight / 2)) || seen(document.body);
    if (p) return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) < 140;
    return matchMedia('(prefers-color-scheme: dark)').matches;
  };
  var focusable = function () {
    return Array.prototype.filter.call(root.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'), function (n) {
      return n.tabIndex >= 0 && !n.disabled && !n.closest('[hidden]') && n.getClientRects().length > 0;
    });
  };
  var build = function () {
    root = document.createElement('div'); root.className = 'sd'; root.hidden = true;
    root.innerHTML = '<div class="sd-box" role="dialog" aria-modal="true" aria-labelledby="sd-title" tabindex="-1"></div>';
    box = root.firstChild; document.body.appendChild(root);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKey);
  };
  var show = function (section0, flash) {
    section = section0 || section || 'account';
    var url = '/settings/panel?lang=' + lang() + '&section=' + encodeURIComponent(section) + (flash ? '&ok=' + flash : '');
    var mine = ++seq;
    return fetch(url, { credentials: 'same-origin', headers: { accept: 'text/html' } }).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (h) {
      if (mine !== seq || root.hidden) return;
      var hadFocus = box.contains(document.activeElement);
      box.innerHTML = h; box.removeAttribute('aria-busy');
      onChange({ target: box.querySelector('#sd-ai') || document.body });
      if (hadFocus || document.activeElement === box || document.activeElement === document.body) { var t = box.querySelector('.sd-tab[aria-selected=true]'); if (t) t.focus(); }
      var cur = box.querySelector('.sd-tab[aria-selected=true]'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }).catch(function () {
      if (mine !== seq || root.hidden) return;
      box.innerHTML = '<div class="sd-failed"><h2 id="sd-title">' + (lang() === 'uk' ? 'Налаштування' : 'Settings') + '</h2><p role="alert">' + (lang() === 'uk' ? 'Не вдалося завантажити налаштування. Спробуйте ще раз.' : 'Could not load the settings. Try again.') + '</p><button type="button" class="sd-btn" data-sd-close>' + (lang() === 'uk' ? 'Закрити' : 'Close') + '</button></div>';
      box.removeAttribute('aria-busy'); var b = box.querySelector('button'); if (b) b.focus();
    });
  };
  var open = function (sec, from, flash) {
    if (!root) build();
    if (!root.hidden) { show(sec, flash); return; }
    opener = from || document.activeElement;
    root.setAttribute('data-sd', dark() ? 'dark' : 'light');
    box.setAttribute('aria-busy', 'true');
    box.innerHTML = '<p class="sd-loading" id="sd-title">' + (lang() === 'uk' ? 'Завантаження…' : 'Loading…') + '</p>';
    root.hidden = false; document.documentElement.classList.add('sd-lock');
    inerted = [];
    Array.prototype.forEach.call(document.body.children, function (n) { if (n !== root && !n.inert && !/^(SCRIPT|STYLE|LINK)$/.test(n.tagName)) { n.inert = true; inerted.push(n); } });
    box.focus();
    show(sec, flash);
  };
  var close = function () {
    if (!root || root.hidden) return;
    seq++; root.hidden = true; document.documentElement.classList.remove('sd-lock');
    inerted.forEach(function (n) { n.inert = false; }); inerted = [];
    if (/^\/(settings|reviews)$/.test(location.pathname)) { try { history.replaceState(null, '', '/'); } catch (e) { /* ignore */ } }
    var o = opener; opener = null;
    if (o && o.isConnected && o.focus) o.focus();
  };
  var select = function (id, focus) {
    section = id;
    Array.prototype.forEach.call(box.querySelectorAll('.sd-tab'), function (t) { var on = t.dataset.sec === id; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
    Array.prototype.forEach.call(box.querySelectorAll('.sd-pane'), function (p) { p.hidden = p.id !== 'sd-p-' + id; });
  };
  var filter = function (q) {
    q = q.trim().toLowerCase();
    var tabs = box.querySelectorAll('.sd-tab'), first = null, cur = null, n = 0;
    Array.prototype.forEach.call(tabs, function (t) {
      var hit = !q || t.dataset.kw.indexOf(q) >= 0; t.hidden = !hit;
      if (hit) { n++; if (!first) first = t; if (t.getAttribute('aria-selected') === 'true') cur = t; }
    });
    Array.prototype.forEach.call(box.querySelectorAll('.sd-g'), function (g) { g.hidden = !g.querySelector('.sd-tab:not([hidden])'); });
    box.querySelector('.sd-none').hidden = n > 0;
    if (!cur && first) select(first.dataset.sec);
  };
  var onInput = function (e) { if (e.target.classList.contains('sd-q')) filter(e.target.value); };
  var onChange = function (e) {
    if (e.target.id !== 'sd-ai') return;
    Array.prototype.forEach.call(box.querySelectorAll('.sd-keylink'), function (a) { a.hidden = a.dataset.for !== e.target.value; });
  };
  var onKey = function (e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      var f = focusable(); if (!f.length) { e.preventDefault(); box.focus(); return; }
      var a = document.activeElement;
      if (e.shiftKey && (a === f[0] || a === box)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (e.target.getAttribute && e.target.getAttribute('role') === 'tab' && /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) {
      var vis = Array.prototype.filter.call(box.querySelectorAll('.sd-tab'), function (t) { return !t.hidden; });
      var i = vis.indexOf(e.target), d = /^(ArrowUp|ArrowLeft)$/.test(e.key) ? -1 : 1;
      var j = e.key === 'Home' ? 0 : e.key === 'End' ? vis.length - 1 : (i + d + vis.length) % vis.length;
      e.preventDefault(); if (vis[j]) select(vis[j].dataset.sec, true);
    }
  };
  var copy = function (b) {
    var text = b.dataset.sdCopy, w = box.firstChild.dataset, back = function (s) { b.textContent = s; setTimeout(function () { b.textContent = w.copy; }, 1500); };
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { back(w.copied); }).catch(function () { back(w.copyfail); });
  };
  var onClick = function (e) {
    var el = e.target.closest ? e.target.closest('[data-sd-close],[data-sd-copy],[data-sd-model],.sd-tab') : null;
    if (!el) return;
    if (el.hasAttribute('data-sd-close')) close();
    else if (el.hasAttribute('data-sd-model')) { close(); window.dispatchEvent(new CustomEvent('flisk:model')); }
    else if (el.hasAttribute('data-sd-copy')) copy(el);
    else select(el.dataset.sec);
  };
  var onSubmit = function (e) {
    var f = e.target; if (!f.hasAttribute || !f.hasAttribute('data-sd-form')) return;
    e.preventDefault();
    var w = box.firstChild.dataset, btn = f.querySelector('button[type=submit]'), pane = f.closest('.sd-pane'), err = pane.querySelector('.sd-err'), label = btn.textContent;
    err.hidden = true; btn.disabled = true; btn.textContent = w.saving;
    var done = function () { btn.disabled = false; btn.textContent = label; };
    fetch(f.action, { method: 'POST', body: new FormData(f), credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return [r.ok, j]; }); })
      .then(function (res) {
        if (res[0]) { show(section, res[1].flash || 'saved'); return; }
        done(); err.textContent = (w.whyfmt || '{why}').replace('{why}', res[1].error || w.neterr); err.hidden = false;
      }).catch(function () { done(); err.textContent = w.neterr; err.hidden = false; });
  };
  var fromLink = function (a) { var m = /#(github|ai|account|usage|computers)$/.exec(a.getAttribute('href') || ''); return m ? m[1] : (a.getAttribute('data-open-settings') || ''); };
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest(OPEN) : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (a.target && a.target !== '_self')) return;
    e.preventDefault(); if (a.tagName === 'A') e.stopPropagation(); open(fromLink(a), a);
  }, true);
  var auto = function () {
    if (!/^\/(settings|reviews)$/.test(location.pathname)) return;
    var q = new URLSearchParams(location.search).get('ok'), h = /^#(github|ai|account|usage|computers)$/.exec(location.hash);
    open(h ? h[1] : q ? 'ai' : '', null, /^(saved|deleted)$/.test(q || '') ? q : '');
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root && !root.hidden) { e.preventDefault(); close(); } });
  window.__openSettings = function (s) { open(s || ''); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
}

// Wrangler bundles with keepNames, which puts __name(fn, 'x') calls inside settingsClient's text; the page has no __name, so the
// gear threw "__name is not defined" and opened nothing. Give the snippet a do-nothing one in its own scope (as earth.js does).
export const SETTINGS_JS = `;(function(){var __name=function(f){return f};(${settingsClient.toString()})();})();`;
