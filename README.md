# chat.flisk.si

Ask for a task or a website. A free model plans it, a real computer from [fleet](https://github.com/flisk-sh/fleet) does it, you get the result and a live link.

- Sign in with GitHub, nothing else. No keys to create.
- The model is [Flisk Inference](https://inference.flisk.si) (`flisk-wolf-chat`, free).
- Computers come from your own sandbox account (Daytona, Upstash Box, E2B, Isorun): paste one key the first time a task needs a computer. It is stored encrypted in fleet.
- With no sandbox account connected, a task runs on the **browser computer**: a small Linux inside the visitor's own tab (fleet's `/browserpod/`, WebAssembly). No key, no cost. It has busybox `sh` only: no internet, Python, Node or Flisk, and no public link for a port, so it fits "make a website" and file tasks. The page opens a WebSocket to `/api/run`; chat thinks, the tab runs each step (`src/browserpod.js`). `BROWSER_POD_URL` moves it, and an empty value turns it off. Try it locally with no keys: `bun scripts/dev-browser-pod.mjs <path to fleet>/web`.
- "Make a website": the model writes one `index.html`, chat stores it and serves it at `/s/<id>` in a sandbox (no cookies, noindex, 7 days, 5 per person, 200 KB).
- 20 tasks a day per person.

## Pull request reviews

Chat can review pull requests when someone comments `@flisk-chat review`. How to use it is in the Flisk contributor guide: [Review a pull request](https://github.com/flisk-sh/flisk/blob/main/docs/contributing/04-review-a-pr.md#review-with-flisk-chat). Setup for this repo is in the deploy list below.

## Run the tests

```bash
bun test
```

## Widgets and tools

Answers can come as cards (weather, charts, running services). See [docs/add-a-widget.md](docs/add-a-widget.md) to add a widget or a tool.

## Deploy

```bash
bunx wrangler@4 d1 create flisk-chat        # put the id in wrangler.toml
bunx wrangler@4 d1 execute flisk-chat --remote --file schema.sql
bunx wrangler@4 secret put GITHUB_CLIENT_ID
bunx wrangler@4 secret put GITHUB_CLIENT_SECRET   # OAuth app, callback https://chat.flisk.si/auth/callback
bunx wrangler@4 secret put SESSION_SECRET
bunx wrangler@4 secret put FLEET_SERVICE_SECRET   # same value as CHAT_SERVICE_SECRET on fleet
bunx wrangler@4 secret put INFERENCE_KEY
bunx wrangler@4 secret put KEY_SECRET            # long random; encrypts saved AI keys, never change it
# PR reviews: a GitHub App with webhook https://chat.flisk.si/github/webhook (see wrangler.toml), then
bunx wrangler@4 secret put GITHUB_APP_ID
bunx wrangler@4 secret put GITHUB_APP_KEY         # the .pem as PKCS#8: openssl pkcs8 -topk8 -nocrypt -in app.pem
bunx wrangler@4 secret put GITHUB_WEBHOOK_SECRET
bunx wrangler@4 deploy
```

MIT licence.
