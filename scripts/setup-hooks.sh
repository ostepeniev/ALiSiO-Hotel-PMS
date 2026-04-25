#!/usr/bin/env bash
# Activates repo-tracked git hooks. Run once per clone.

set -e

cd "$(dirname "$0")/.."
git config core.hooksPath .githooks

# Make sure the hook is executable (Unix only — Windows ignores the bit).
if [ -f .githooks/pre-commit ]; then
  chmod +x .githooks/pre-commit
fi

echo "✓ Git hooks activated (.githooks/)"
echo "  pre-commit: blocks TS syntax errors before they reach the repo"
echo ""
echo "To disable: git config --unset core.hooksPath"
