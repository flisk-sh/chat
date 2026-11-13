# chat.flisk.si

Ask for a task or a website. A free model plans it, a real computer from [fleet](https://github.com/flisk-sh/fleet) does it, you get the result and a live link.

- Sign in with GitHub, nothing else. No keys to create.
- The model is [Flisk Inference](https://inference.flisk.si) (`flisk-wolf-chat`, free).
- Computers come from your own sandbox account (Daytona, Upstash Box, E2B, Isorun): paste one key the first time a task needs a computer. It is stored encrypted in fleet.
- "Make a website": the model writes one `index.html`, chat stores it and serves it at `/s/<id>` in a sandbox (no cookies, noindex, 7 days, 5 per person, 200 KB).
- 20 tasks a day per person.

## Review your pull requests

Chat reviews a pull request when you ask: a summary, comments on exact lines, one-click suggested fixes and a verdict.

1. Install the [flisk-chat GitHub App](https://github.com/apps/flisk-chat/installations/new) on your repos (once).
2. Open a pull request and write one of these in a comment:

| Comment | What happens |
| --- | --- |
| `@flisk-chat review` | Reads the diff and posts one review (about 20 seconds). |
| `@flisk-chat review run` | The same, and also checks the PR out on one of your computers, runs install, lint, typecheck and tests, and posts the output. |
| `@flisk-chat auto on` | Reviews every new non-draft pull request in that repo by itself, with your AI and limit. `auto off` stops it. |

- Only people who can push to the repo can ask. Nothing runs on a pull request unless someone asks, or `auto on` was written in that repo.
- Write `@flisk-chat`, not `@chat` (that pings a real GitHub user).
- Which AI: the free Flisk Wolf model (10 reviews a day per person, first 14 KB of the diff), or your own OpenRouter, Claude or OpenAI key. Save it at [chat.flisk.si/reviews](https://chat.flisk.si/reviews) (Settings), or tick "Also use this AI for PR reviews" in the chat key box. The key is encrypted with `KEY_SECRET` and one button deletes it.
- `auto on` only works if the App also subscribes to the **Pull request** event.

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
