# Connecting computers without copying API keys

Status: proposal, 2026-11-13. Nothing here is built yet.

## The problem

To run a task, chat.flisk.si needs a computer from one of the user's own providers (Upstash Box, E2B, Daytona, Vercel Sandbox and others). Today the user signs up at the provider, finds its API-key page, copies the key and pastes it into chat. Chat hands the key to fleet, and fleet stores it encrypted. The user and their friends hate this step.

Three rules limit what we can do:

- **The key must be the user's own.** Providers' terms forbid one Flisk account shared among users.
- **Flisk cannot create provider accounts for people.** Each person signs up themselves.
- **Fleet makes every provider call on its own server.** So fleet must hold a usable key while a task runs.

The third rule means no option below can honestly be called "zero-knowledge" while fleet does the work. Section 3 says exactly what each option can claim.

## 1. Providers that can connect with one click (no key)

| Provider | One-click route | Works today? | Catch |
|---|---|---|---|
| **Vercel Sandbox** | "Sign in with Vercel" (OAuth). A project-level **Sandboxes: Read and Write** permission exists. The access token lasts 1 hour and refreshes for 30 days. | **No.** Vercel marks API permissions for Sign in with Vercel as private beta, so Flisk must ask Vercel for access. Vercel's integration tokens (the older marketplace flow) list no sandbox scope. | Hobby (free) plan: sandboxes last at most 45 minutes, 5 active-CPU hours a month. Sandbox needs a project, which chat can create through the API. |
| **Cloudflare** (Sandbox SDK / Containers) | Public OAuth clients for other apps, live since 2026-06-03. Anyone can register one. Making it public needs a DNS TXT proof of the domain, and no review is described. | OAuth: **yes**. Computers: only for paying users. | Sandbox SDK needs the **Workers Paid plan ($5 a month)**. Chat would have to deploy a Worker, a Durable Object and a container image into the user's account. Public links for ports need the user's own domain with wildcard DNS. Too heavy for a free first try. |
| **GitHub Codespaces** | Already have it: add the `codespace` scope to the GitHub sign-in chat has. Free accounts get 120 core-hours a month. | Technically yes, but **we should not**. | 1) GitHub's Codespaces terms forbid offering Codespaces for commercial purposes and hosting production-facing apps; use must be for developing that repository's own project. 2) No REST API runs a command or reads a file. Chat would need a helper started by the dev container that dials out to fleet. 3) Ports can only be made public by `gh`'s undocumented API; they start private. |
| Daytona | No OAuth. It does have an organizations API and managed keys that can mint child keys. | Only as a partner deal | That makes Flisk the account holder (reseller), which is a business conversation, not a sign-in flow. |
| Blaxel | Its sign-in server ([OpenID config](https://api.blaxel.ai/v0/.well-known/openid-configuration)) advertises the code flow with PKCE and open client registration. | Unknown: the docs only describe it for Blaxel's own CLI. | Worth one email to Blaxel asking whether a third-party app may use it. If yes, Blaxel could become one click. |
| Fly Sprites | Fly runs OAuth with client registration and PKCE ([fly.io/auth.md](https://fly.io/auth.md)), documented for MCP clients. | Unknown for a web app like chat | Same: ask Fly first. |
| E2B, Upstash Box, Morph, Tensorlake, Freestyle, Modal, Runloop, CodeSandbox, Northflank | No OAuth or "Sign in with X" for other apps found. Their CLIs' browser logins are for their own CLI only. | No | Key only. See section 2. |

Sources: [Sign in with Vercel](https://vercel.com/docs/sign-in-with-vercel), [its scopes](https://vercel.com/docs/sign-in-with-vercel/scopes-and-permissions), [Vercel Sandbox auth](https://vercel.com/docs/sandbox/concepts/authentication), [Sandbox pricing](https://vercel.com/docs/sandbox/pricing), [Cloudflare public OAuth clients](https://developers.cloudflare.com/changelog/post/2026-06-03-public-oauth-clients/), [Cloudflare Sandbox SDK](https://developers.cloudflare.com/sandbox/), [Sandbox preview URLs](https://developers.cloudflare.com/sandbox/concepts/preview-urls/), [GitHub OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps), [Codespaces REST](https://docs.github.com/en/rest/codespaces/codespaces), [GitHub additional product terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features), [Codespaces billing](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces), [Daytona organizations](https://www.daytona.io/docs/organizations/).

**Bottom line:** today no provider can be connected with one click and no key. Vercel is the closest; it needs Vercel to admit Flisk to the private beta. Applying costs nothing and is the user's call.

## 2. Key-only providers: the least painful way to capture a key

What a user meets at each provider, checked 2026-11-13. "?" = not found in the docs. "Browser calls" is a CORS preflight we sent from `Origin: https://chat.flisk.si` with no key.

| Provider | Free to start | Key page (deep link) | Key looks like | Browser calls |
|---|---|---|---|---|
| Upstash Box | 10 boxes, 5 CPU-hours a month | console.upstash.com (no deep link found) | `box_…` | yes |
| E2B | $100 once, no card | console.e2b.dev/?tab=keys | `e2b_…` (not in official docs) | no |
| Daytona | $200, no card | app.daytona.io/dashboard/keys (name, expiry, permissions; shown once) | ? | yes |
| Vercel Sandbox | Hobby: 5 CPU-hours, 45-minute sessions | vercel.com/account/tokens, **plus** the team and project ids | `vcp_…` | yes |
| Blaxel | up to $200 | app.blaxel.ai/profile/security | ? | no |
| Morph | ? | cloud.morph.so/web/api-keys | ? | yes |
| Tensorlake | 1 small sandbox | cloud.tensorlake.ai, then a project | `tl_apiKey_…` | no |
| Freestyle | ? | dash.freestyle.sh | ? | yes |
| Runloop | ? | platform.runloop.ai/settings#api-keys | `ak_…` / `rk_…` | yes |
| Fly Sprites | $1 trial for 7 days | sprites.dev/account | `org/id/secret` | no |
| Northflank | free sandbox plan | app.northflank.com/s/account/api/tokens (needs a role an admin made first) | a JWT, `eyJ…` | yes |
| Modal | $30 a month | modal.com/settings/tokens | two values, `ak-…` + `as-…` | no REST API |

Two things follow:

- **Prefixes are not reliable enough to be the only signal.** Daytona, Blaxel, Morph and Freestyle publish none. Chat already knows which provider the user is connecting, because they pressed that provider's "Get a key" button. The prefix only double-checks it.
- **Most keys are shown once.** If the user closes the provider tab before copying, they must make a new key. The card should say "Copy it before you close the page".

Sources: per-provider docs listed in [the research notes](#sources-for-section-2).

### The options

| Option | Clicks for the user | Works in | Build cost | Verdict |
|---|---|---|---|---|
| **A. Deep link + paste anywhere** | "Get a key" opens the provider's key page in a new tab. The user creates the key and presses Copy, then comes back to chat and presses Cmd/Ctrl+V once. Chat recognises the provider from the key's prefix, checks the key, saves it and resumes the task. No box to find and no Save button. | Every browser. The page's `paste` event needs no permission prompt anywhere. | Small: chat only (page script + one route). | **Do first** |
| B. A + read the clipboard on return | Same, but chat reads the clipboard when the tab gets focus again, so even the Ctrl+V goes away. | Chromium after the user grants the clipboard permission once. Firefox and Safari show a "Paste" menu and need a click each time. | Small on top of A | Optional add-on to A for Chrome, behind a one-time "Let chat read a copied key" button |
| C. Browser extension that picks up the new key on the provider's page | Create the key at the provider and it appears in chat by itself. | Chrome and Edge: the site can talk to the extension (`externally_connectable`). Firefox: only through a content script and `postMessage`. Safari: a separate app. | Large: one page reader per provider, Chrome Web Store review (days to weeks, longer with access to many sites), breaks whenever a provider changes its page. The user must install and trust an extension that reads their provider dashboards, which is a bigger trust ask than pasting a key. | Not now. Revisit if A's numbers show people still drop off. |
| D. Hand-off to a password manager | None saved: no browser lets a website ask 1Password, Bitwarden or iCloud Keychain to store or fill an arbitrary API key. `PasswordCredential` is Chromium-only and username/password-shaped. The "Save in 1Password" button covers logins, cards and wallets; API keys need a 1Password partner integration. | — | — | No |

Sources: [MDN Clipboard API security](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API), [Chrome Web Store review](https://developer.chrome.com/docs/webstore/review-process), [Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use), [externally_connectable](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable), [Firefox lacks it](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/externally_connectable), [Save in 1Password button](https://www.1password.dev/web/add-1password-button-website), [PasswordCredential support](https://caniuse.com/mdn-api_passwordcredential).

## 3. The honest security model

Where the key lives decides what we may say. "Zero-knowledge" in a web app always means trusting the JavaScript the site serves: whoever can change chat's page can change it to send the key elsewhere at the moment the user unlocks it. That is true for every option below and for every password manager's web vault too.

| Model | Where the key is | What we CAN say | What we CANNOT say |
|---|---|---|---|
| **1. Server vault (today)** | Fleet's database, AES-GCM, encrypted with one fleet secret (`PROVIDER_KEYS_SECRET`). Fleet decrypts it whenever it needs it. | "Keys are encrypted at rest. A copy of the database alone does not reveal them. Disconnect deletes the key." | Not zero-knowledge. Anyone with fleet's secret and database (Flisk, or an attacker in fleet's Worker) can read every key at any time, with no user present. |
| **2. Passkey-locked keys, sent for one task** | Chat stores only ciphertext. The data key that opens it is wrapped by the user's passkey, using the WebAuthn PRF extension. The browser unlocks the key when a task starts and sends it with that task. Fleet already accepts per-call keys (`X-<Provider>-Key` headers) and never writes them anywhere. | "**Zero-knowledge at rest**: when you are not running a task, Flisk holds only ciphertext it cannot open. A full copy of our servers and databases reveals no key. Your key reaches our servers only for the task you started." | Not zero-knowledge during a task: chat and fleet hold the plain key in memory while the task runs. A changed page script could steal it at unlock time. Nothing can run on the user's computers while they are away, such as cleaning up kept live apps. |
| 2b. Same, but the lock is a browser-only key (no passkey) | Ciphertext and a non-extractable WebCrypto key in IndexedDB, as chat already does for AI keys. | The same claim as 2, on that one browser. | Works on one device only: a new laptop or a cleared browser means pasting again. |
| **3. Calls from the user's browser** | Only in the user's browser. Fleet never sees it. | "**Your key never leaves your browser.**" This is true zero-knowledge for the key, still trusting chat's page script. | Only works where the provider's API allows calls from a browser (CORS). That is 7 of 12 checked: Upstash, Daytona, Vercel, Morph, Freestyle, Runloop and Northflank, but not E2B, Blaxel, Tensorlake or Sprites. The tab must stay open for the whole task. It loses fleet's routing, the "cheapest first" choice and cleanup. Every provider would need a second, browser-side adapter. |
| 4. OAuth token (Vercel, Cloudflare when used) | A scoped token from the provider, kept as in 1 or 2. | "You approve exactly what Flisk may do at the provider's own page, and you can revoke it there at any time. We never see your password or a full-account key." | Whatever 1 or 2 can't say about where the token is kept. |

Practical facts about option 2:

- **Support (late 2026):** Chrome and Edge 116+, Safari 18 (use 18.4+), Firefox 139+, Google Password Manager, iCloud Keychain and 1Password return PRF. Bitwarden (on Mac and iOS), Dashlane, NordPass and Windows 10 do not. Chat must fall back to 2b or 1 when the passkey gives no PRF value.
- **Recovery:** one random data key encrypts the provider keys. Each passkey wraps its own copy of that data key, as Bitwarden does. Ask users to add a second passkey. If every passkey is gone, the honest answer is "delete and paste your keys again": provider keys can always be reissued, so no recovery code is needed.
- **A warning from the spec side:** a WebAuthn co-editor asks sites not to encrypt user data with passkeys, because people delete passkeys without knowing the data goes with them. Because our data is replaceable, this risk is small. Still, chat should say so when the user turns the lock on, and publish a short page about it.
- **What breaks:** the hourly clean-up of kept live apps (chat#98: Upstash boxes kept 7 days) needs a key with no user present. Option: keep only the Upstash key in the server vault while the user has a live app, and say so, or delete kept boxes the next time the user opens chat.

Sources: [caniuse PRF](https://caniuse.com/mdn-api_credentialscontainer_create_publickey_option_extensions_prf), [Corbado PRF matrix](https://www.corbado.com/blog/passkeys-prf-webauthn), [Bitwarden log in with passkeys](https://bitwarden.com/help/login-with-passkeys/), ["Please stop using passkeys for encrypting user data"](https://blog.timcappalli.me/p/passkeys-prf-warning).

## 4. Ranked recommendation

Score = fewest clicks per provider × the most honest strong claim × lowest build cost.

1. **One paste, anywhere (2A), for every key provider, plus a one-part Vercel key.** For E2B, Daytona, Upstash and the rest, this cuts the step to: open the page, create, copy, come back, press Ctrl+V. Chat finds the provider by the key's prefix, checks it and continues the task. Vercel drops from "token:project:team" to the token alone: chat looks up the team and creates a `flisk-chat` project itself. Claim: unchanged (server vault). Cost: small, chat only, no fleet deploy.
2. **Passkey lock (3.2), opt-in, then default where PRF works.** Gives the "zero-knowledge at rest" claim in plain words. Chat stores ciphertext in D1 and sends keys per task with the headers fleet already accepts. Cost: medium (chat page + D1 table + two routes), no fleet change. Falls back to 3.2b, then the server vault.
3. **Apply for Sign in with Vercel's private beta, and ask Blaxel and Fly whether their open OAuth may be used by chat (the user's call; three emails or forms).** For each that says yes, "Connect" becomes one click with a revocable, scoped token.
4. **Cloudflare OAuth**, only for users who already pay for Workers ($5 a month). Later.
5. **Browser extension (2C)**: only if the numbers from 1 show people still give up at the key page.
6. **Not doing:** Codespaces as hidden computers (GitHub's terms), password-manager hand-off (no browser supports it), browser-only calls (3.3) for now (a second adapter per provider, and the tab must stay open).

## 5. Proposed first PR: "One paste to connect"

Chat only (`src/page.js`, `src/index.js`, a new `src/keyshape.js`, tests). No fleet change, no new secrets.

- **`src/keyshape.js`:** each provider's exact key-page URL (section 2) and, where known, its key prefix. `looksLike(provider, text)` catches an obvious wrong paste, such as a GitHub token or an E2B key pasted for Daytona. Unit-tested with fake keys.
- **Connect card:** one "Get a key" button per provider opens the key page in a new tab and remembers which provider was picked. While the card is open, a `paste` listener on the whole page catches a pasted key, with no input box to click, and sends it to `/api/connect` for that provider. A prefix that clearly belongs to another provider gets "That looks like an E2B key: connect E2B instead?".
- **Return hint:** when the tab regains focus after "Get a key", the card says "Press Ctrl+V (⌘V on Mac) to connect".
- **Check before saving:** `/api/connect` asks fleet for a cheap check before it stores the key, so a wrong key fails on the spot, not mid-task. If fleet has no check route, list one call per provider in the PR and do the check in chat.
- **Vercel token only:** chat calls Vercel's API with the token to find the team and create or reuse a `flisk-chat` project, then stores `token:project:team` as fleet expects today.
- **Tests:** prefix detection, the connect route (recognised, unknown, rejected key), the Vercel lookup with fake replies, and "every inline page script parses".

### Sources for section 2

[Upstash Box quickstart](https://upstash.com/docs/box/overall/quickstart.md), [Upstash Box pricing](https://upstash.com/pricing/box), [E2B API key](https://docs.e2b.dev/api-key), [E2B pricing](https://e2b.dev/pricing), [Daytona authentication](https://www.daytona.io/docs/en/authentication), [Daytona API keys](https://www.daytona.io/docs/en/api-keys), [Vercel create a token](https://vercel.com/docs/rest-api/authentication/create-an-auth-token), [Blaxel access tokens](https://docs.blaxel.ai/Security/Access-tokens), [Morph API keys](https://cloud.morph.so/docs/documentation/setup/api-keys), [Tensorlake authentication](https://docs.tensorlake.ai/platform/authentication.md), [Freestyle CLI](https://www.freestyle.sh/docs/cli), [Runloop quickstart](https://docs.runloop.ai/docs/tutorials/quickstart.md), [Sprites authentication](https://docs.fly.io/sprites/cli/authentication), [Northflank API tokens](https://northflank.com/docs/v1/application/secure/manage-api-tokens), [Modal tokens](https://modal.com/docs/cli/latest/token).

Before building: ask the user. Two calls are theirs: whether to apply for Vercel's beta, and whether the passkey lock (item 2) should come right after this PR or first.
