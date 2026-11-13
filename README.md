# chat.flisk.si

Ask for a task or a website. A free model plans it, a real computer from [fleet](https://github.com/flisk-sh/fleet) does it, you get the result and a live link.

- Sign in with GitHub, nothing else. No keys to create.
- The model is [Flisk Inference](https://inference.flisk.si) (`flisk-wolf-chat`, free).
- Computers come from your own sandbox account (Daytona, Upstash Box, E2B, Isorun): paste one key the first time a task needs a computer. It is stored encrypted in fleet.
- "Make a website": the model writes one `index.html`, chat stores it and serves it at `/s/<id>` in a sandbox (no cookies, noindex, 7 days, 5 per person, 200 KB).
- 20 tasks a day per person.

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
bunx wrangler@4 deploy
```

MIT licence.
