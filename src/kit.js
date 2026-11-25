// The Flisk app kit: the look of Astryx (Meta's design system, the "neutral" theme: github.com/meta/astryx) as plain CSS, so a
// page the model writes as ONE html file looks like a real app (sidebar, stat cards, tables, badges, kanban) instead of a
// blank form. The values are Astryx's own tokens (--color-*, --radius-*, Figtree), light and dark through light-dark().
// A page asks for it with <!--astryx--> in its <head>; siteResponse puts the CSS in at serve time, so the model's page stays
// small and a later change to the kit reaches pages that are already published.
export const KIT_MARK = '<!--astryx-->';

export const KIT_TOKENS = `:root{color-scheme:light dark;--bg:light-dark(#f1f1f1,#141414);--surface:light-dark(#fff,#1f1f1f);--raised:light-dark(#fff,#262626);--muted:light-dark(#f6f6f6,#1b1b1b);--text:light-dark(#000,#fff);--text2:light-dark(#474747,#a8a8a8);--line:light-dark(#00000014,#ffffff1a);--line2:light-dark(#d4d4d4,#525252);--accent:light-dark(#1b1b1b,#f1f1f1);--on-accent:light-dark(#fff,#111);--info:light-dark(#0074e2,#6d9cfe);--ok:light-dark(#198100,#64af4c);--err:light-dark(#c9303a,#ff705d);--warn:light-dark(#8a6400,#ffce2f);--blue:light-dark(#b9d7ff,#253c5a);--blue-t:light-dark(#003978,#88bcff);--green:light-dark(#bce0bb,#2b422b);--green-t:light-dark(#00490b,#90ca90);--orange:light-dark(#ffc7a1,#503424);--orange-t:light-dark(#622700,#ff9e55);--red:light-dark(#ffc4be,#5b2b28);--red-t:light-dark(#76000c,#ff9890);--purple:light-dark(#f7d5ff,#4a2f51);--purple-t:light-dark(#5c0e6c,#e496f6);--shadow:0 1px 2px #0000000d,0 4px 14px #0000000f}`;
export const KIT_CSS = `${KIT_TOKENS}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--text);font:15px/1.5 Figtree,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{margin:0;font-weight:650;letter-spacing:-.01em;line-height:1.25}h1{font-size:26px}h2{font-size:20px}h3{font-size:16px}p{margin:0}a{color:var(--info)}
small,.sub{color:var(--text2);font-size:13px}
.app{display:grid;grid-template-columns:232px 1fr;min-height:100vh}
.side{background:var(--surface);border-right:1px solid var(--line);padding:18px 12px;display:flex;flex-direction:column;gap:4px;position:sticky;top:0;height:100vh;overflow:auto}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px;padding:4px 10px 16px}
.brand i{width:28px;height:28px;border-radius:0;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;font-style:normal;font-size:14px}
.nav{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:0;color:var(--text2);text-decoration:none;font-weight:550;cursor:pointer;border:0;background:none;font:inherit;text-align:left;width:100%}
.nav:hover{background:var(--muted);color:var(--text)}.nav.on{background:var(--muted);color:var(--text);box-shadow:inset 3px 0 0 var(--accent)}
.nav b{margin-left:auto;font-size:12px;background:var(--line);padding:0 8px;border-radius:0;font-weight:600}
.spacer{flex:1}
.main{min-width:0;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:12px;padding:14px 28px;border-bottom:1px solid var(--line);background:var(--surface);position:sticky;top:0;z-index:5}
.top h1{font-size:20px;margin-right:auto}
.page{padding:24px 28px 56px;display:flex;flex-direction:column;gap:20px;max-width:1240px;width:100%}
.card{background:var(--raised);border:1px solid var(--line);border-radius:0;box-shadow:var(--shadow);padding:18px}
.card>h3,.card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}
.stat{background:var(--raised);border:1px solid var(--line);border-radius:0;padding:16px;box-shadow:var(--shadow)}
.stat small{display:block;margin-bottom:6px}.stat b{font-size:28px;font-weight:700;letter-spacing:-.02em;line-height:1.1}
.stat em{font-style:normal;font-size:12px;font-weight:600;margin-left:8px;color:var(--ok)}.stat em.down{color:var(--err)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.col{display:flex;flex-direction:column;gap:10px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:0;border:1px solid var(--line2);background:var(--raised);color:var(--text);font:inherit;font-weight:600;cursor:pointer}
.btn:hover{background:var(--muted)}.btn:active{transform:translateY(1px)}
.btn.primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}.btn.primary:hover{opacity:.9}
.btn.ghost{border-color:transparent;background:none}.btn.danger{color:var(--err)}.btn.sm{padding:4px 10px;font-size:13px}
input,select,textarea{font:inherit;color:var(--text);background:var(--raised);border:1px solid var(--line2);border-radius:0;padding:9px 12px;min-width:0;width:100%}
input:focus,select:focus,textarea:focus,.btn:focus-visible,.nav:focus-visible{outline:2px solid var(--info);outline-offset:1px}
label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--text2)}
.search{max-width:280px}
.table{width:100%;border-collapse:collapse}.table th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--text2);font-weight:600;padding:8px 12px;border-bottom:1px solid var(--line)}
.table td{padding:12px;border-bottom:1px solid var(--line);vertical-align:middle}.table tr:last-child td{border-bottom:0}.table tbody tr:hover{background:var(--muted)}
.wrap{overflow-x:auto}
.badge{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:0;font-size:12px;font-weight:650;background:var(--line);color:var(--text2);white-space:nowrap}
.badge.blue{background:var(--blue);color:var(--blue-t)}.badge.green{background:var(--green);color:var(--green-t)}.badge.orange{background:var(--orange);color:var(--orange-t)}.badge.red{background:var(--red);color:var(--red-t)}.badge.purple{background:var(--purple);color:var(--purple-t)}
.avatar{width:32px;height:32px;border-radius:50%;display:inline-grid;place-items:center;font-size:13px;font-weight:700;background:var(--purple);color:var(--purple-t);flex:none}
.avatar.b{background:var(--blue);color:var(--blue-t)}.avatar.g{background:var(--green);color:var(--green-t)}.avatar.o{background:var(--orange);color:var(--orange-t)}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line)}.tab{padding:9px 14px;border:0;background:none;font:inherit;font-weight:600;color:var(--text2);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}.tab.on{color:var(--text);border-bottom-color:var(--accent)}
.board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(250px,1fr);gap:14px;overflow-x:auto;align-items:start}
.lane{background:var(--muted);border:1px solid var(--line);border-radius:0;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:120px}
.lane>h3{display:flex;justify-content:space-between;font-size:14px}.lane .card{padding:12px;box-shadow:none;cursor:grab}
.bar{height:8px;border-radius:0;background:var(--line);overflow:hidden}.bar>i{display:block;height:100%;background:var(--accent);border-radius:0}
.empty{text-align:center;color:var(--text2);padding:36px 12px}
dialog{border:1px solid var(--line);border-radius:0;background:var(--raised);color:var(--text);padding:22px;width:min(440px,92vw);box-shadow:0 20px 60px #0006}dialog::backdrop{background:#0008}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--accent);color:var(--on-accent);padding:10px 16px;border-radius:0;font-weight:600;box-shadow:var(--shadow);z-index:20}
.game{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;background:radial-gradient(1200px 600px at 50% -10%,light-dark(#fff,#2a2a2a),var(--bg))}
.game canvas{max-width:100%;border-radius:0;border:1px solid var(--line2);background:#0b0b0f;box-shadow:0 12px 40px #0004;touch-action:none}
.hud{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.hud .badge{font-size:14px;padding:4px 14px}
@media(max-width:760px){.app{grid-template-columns:1fr}.side{position:static;height:auto;flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--line);padding:10px}.brand{padding:4px 8px}.spacer{display:none}.nav{width:auto}.top{padding:12px 16px;flex-wrap:wrap}.page{padding:16px 16px 48px}}`;

// The page with the kit in: <!--astryx--> (or a <link> to /_kit/astryx.css) becomes the <style>; a page that has neither is left as it is.
export function withKit(html) {
  const s = String(html);
  const style = `<style id="astryx">${KIT_CSS}</style>`;
  const link = /<link\b[^>]*astryx\.css[^>]*>/i;
  if (s.includes(KIT_MARK)) return s.replace(KIT_MARK, () => style);
  if (link.test(s)) return s.replace(link, () => style);
  return s;
}

// What the model is told about the kit. Short on purpose: the free model writes about 8 KB.
export const KIT_GUIDE = `STYLE: put ${KIT_MARK} inside <head> (it brings the Astryx design system look, light and dark: do NOT write your own CSS for what it covers). Use its classes:
- shell: <div class="app"><aside class="side"><div class="brand"><i>C</i>Name</div><button class="nav on">Dashboard <b>3</b></button><button class="nav">Contacts</button><span class="spacer"></span></aside><div class="main"><header class="top"><h1>Title</h1><input class="search" placeholder="Search"><button class="btn primary">Add</button></header><main class="page">...</main></div></div>
- <div class="stats"><div class="stat"><small>Deals</small><b>24</b><em>+12%</em></div></div>; <div class="card"><h3>Title <button class="btn sm">Action</button></h3>...</div>; <div class="grid"> of cards
- <div class="wrap"><table class="table"><thead><tr><th>..</th></tr></thead><tbody>..</tbody></table></div>; <span class="badge green|blue|orange|red|purple">Won</span>; <span class="avatar">AB</span> (initials; also .b .g .o)
- buttons .btn .btn.primary .btn.ghost .btn.danger .btn.sm; <label>Name<input></label>; <select>; <dialog> opened with showModal(); tabs: <div class="tabs"><button class="tab on">All</button></div>; kanban: <div class="board"><div class="lane"><h3>Todo <span class="badge">3</span></h3><div class="card">..</div></div></div>; progress: <div class="bar"><i style="width:60%"></i></div>; <div class="empty">Nothing yet</div>.
Make it feel like a real product (Linear, Notion, Stripe dashboard): a sidebar with 3 or 4 views that really switch, stat cards computed from the data, a searchable table or board, a dialog to add and edit, badges for status, initials avatars. Never a landing page.`;
