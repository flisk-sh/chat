# Contributing

1. Open an issue or pick one labelled `ready-for-agent` / `ready-for-human`.
2. Branch from `main`, keep the change small, and add or update a test with it (`bun test`).
3. Run `bun run test` and `bun run check:radius` before pushing.
4. Open a pull request. The GEL guards and Check workflow must pass.

Decisions that change the product's shape get an ADR in `docs/adr/`.
