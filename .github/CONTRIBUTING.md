# Contributing

Thanks for helping with chat.flisk.si. It is a Cloudflare Worker written in JavaScript, run with [bun](https://bun.sh).

## Pick something to do

- New here? Start with an issue labelled [`good first issue`](https://github.com/flisk-sh/chat/labels/good%20first%20issue). Each one is small and says what is wrong.
- Other open work is labelled `ready-for-human` or `ready-for-agent`.
- Say in a comment that you are taking it, so two people do not do the same one.
- Found a bug? Open an issue first with what you did, what you saw and what you expected.

## Set up

```bash
git clone https://github.com/flisk-sh/chat.git
cd chat
bun install
bun test
```

`bun install` also points git at `.githooks`: a pre-commit radius check and a pre-push test run, the same as CI. You need no keys to run the tests.

## Make the change

1. Branch from `main` and keep the change small: one fix per pull request.
2. Add or update a test with it.
3. Run `bun run test` and `bun run check:radius` before you push.
4. Sign off your commits (`git commit -s`).
5. Open a pull request that says what changed and why. The GEL guards and the Check workflow must pass.

Decisions that change the product's shape get a short note in `docs/adr/`.

## Report a security problem

Do not open a public issue. See [SECURITY.md](SECURITY.md).
