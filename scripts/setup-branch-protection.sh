#!/usr/bin/env bash
# Configures GitHub branch protection on `main` so that:
#   - direct push to main is forbidden
#   - PR is required
#   - the `build` job from .github/workflows/ci.yml must pass before merge
#   - force push and branch deletion are disabled
#
# Pre-requisites:
#   - gh CLI installed
#   - gh auth login completed (run once: gh auth login)

set -euo pipefail

REPO="ostepeniev/ALiSiO-Hotel-PMS"
BRANCH="main"

# Resolve gh command (Windows install location vs PATH).
GH=""
for candidate in "gh" "/c/Program Files/GitHub CLI/gh.exe"; do
  if command -v "$candidate" >/dev/null 2>&1 || [ -x "$candidate" ]; then
    GH="$candidate"
    break
  fi
done

if [ -z "$GH" ]; then
  echo "❌ gh CLI not found. Install: https://cli.github.com/"
  exit 1
fi

if ! "$GH" auth status >/dev/null 2>&1; then
  echo "❌ gh CLI not authenticated. Run: $GH auth login"
  exit 1
fi

echo "→ Configuring branch protection for $REPO @ $BRANCH"

"$GH" api -X PUT "repos/$REPO/branches/$BRANCH/protection" \
  -H "Accept: application/vnd.github+json" \
  -F "required_status_checks[strict]=true" \
  -F "required_status_checks[contexts][]=build" \
  -F "enforce_admins=false" \
  -F "required_pull_request_reviews[required_approving_review_count]=0" \
  -F "required_pull_request_reviews[dismiss_stale_reviews]=false" \
  -F "required_pull_request_reviews[require_code_owner_reviews]=false" \
  -F "restrictions=" \
  -F "allow_force_pushes=false" \
  -F "allow_deletions=false" \
  -F "required_linear_history=false" \
  -F "required_conversation_resolution=false"

echo ""
echo "✓ Branch protection configured for $BRANCH"
echo "  - Direct push: DISABLED"
echo "  - PR required: YES"
echo "  - Required check: build (from ci.yml)"
echo "  - Force push: DISABLED"
echo "  - Branch deletion: DISABLED"
echo ""
echo "Verify at: https://github.com/$REPO/settings/branches"
