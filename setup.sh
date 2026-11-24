#!/usr/bin/env bash
# One-time setup of a testers repo (run it from the repo you created from this template):
#  1. creates the key pair that encrypts results (private half stays on this machine)
#  2. sets the ARTIFACT_PASSPHRASE secret
#  3. asks for your Claude token (subscription) or API key and stores it as a secret
#  4. commits and pushes the public key
set -euo pipefail
command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com"; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login"; exit 1; }
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Setting up agent testers for $REPO"

KEYDIR="$HOME/.mobile-agent-testers"; mkdir -p "$KEYDIR"; chmod 700 "$KEYDIR"
PRIV="$KEYDIR/${REPO//\//_}.pem"
if [[ ! -f "$PRIV" ]]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$PRIV" 2>/dev/null
  chmod 600 "$PRIV"
  echo "Private key created: $PRIV (keep it safe, never commit it)"
fi
openssl pkey -in "$PRIV" -pubout -out results_public.pem

SECRETS=$(gh secret list --json name -q '.[].name' 2>/dev/null || true)
if ! grep -qx ARTIFACT_PASSPHRASE <<<"$SECRETS"; then
  openssl rand -hex 32 | gh secret set ARTIFACT_PASSPHRASE
  echo "Secret ARTIFACT_PASSPHRASE set"
fi
if ! grep -qxE 'CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY' <<<"$SECRETS"; then
  echo
  echo "Claude access. Either:"
  echo "  1) a Claude Pro/Max subscription: run 'claude setup-token' in another terminal and paste the token"
  echo "  2) an Anthropic API key (pay per token)"
  read -rp "Choose 1 or 2: " CHOICE
  NAME=$([[ "$CHOICE" = 2 ]] && echo ANTHROPIC_API_KEY || echo CLAUDE_CODE_OAUTH_TOKEN)
  read -rsp "Paste it (hidden): " VALUE; echo
  printf '%s' "$VALUE" | gh secret set "$NAME"
  unset VALUE
  echo "Secret $NAME set"
fi

if ! git diff --quiet -- results_public.pem 2>/dev/null || ! git ls-files --error-unmatch results_public.pem >/dev/null 2>&1; then
  git add results_public.pem && git commit -qm "Add results public key" && git push -q
  echo "Public key committed and pushed"
fi
cat <<MSG

Done. Run the demo (2 Android + 2 iOS testers on the demo app, about 30 min):
  gh workflow run agent-testers.yml
Then download and decrypt the reports:
  bash scripts/collect.sh \$(gh run list --workflow agent-testers.yml -L 1 --json databaseId -q '.[0].databaseId')
MSG
