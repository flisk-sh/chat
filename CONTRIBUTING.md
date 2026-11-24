# Contributing to flisk-chat

Thanks for helping improve flisk-chat.

## Getting Started

flisk-chat requires [Bun](https://bun.sh/) (v1.1+) or Node.js (>=20).

```bash
# Clone the repository
git clone https://github.com/flisk-sh/chat.git
cd chat

# Install dependencies
bun install
```

## Running Tests

Verify changes before submitting:

```bash
bun test
```

Or run test suites individually:

```bash
bun test test
node --test scripts/*.test.mjs evals/answers/*.test.mjs
```

## Developer Certificate of Origin (DCO)

All commits must be signed off to certify agreement with the [Developer Certificate of Origin](https://developercertificate.org/):

```bash
git commit -s -m "type(scope): concise description"
```

Use `git commit -s` (or `--signoff`) so git adds `Signed-off-by: Your Name <email@example.com>`.

## Pull Request Guidelines

- Branch naming: `fix/<issue-id>-summary`, `feat/<summary>`, or `docs/<summary>`.
- Commit messages: Follow conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
- Keep changes focused and minimal (YAGNI).
- Reference associated issues in PR descriptions (e.g., `Closes #194`).
