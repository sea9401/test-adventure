#!/usr/bin/env bash
# Build into the usual .next path while keeping the last successful build
# recoverable. If the new build fails, restore the previous output before the
# deploy workflow removes the maintenance page.
set -euo pipefail

cd "$(dirname "$0")/.."

PREVIOUS_BUILD=".next.previous"
ENV_PATH="${PRODUCTION_ENV_PATH:-/run/adventure-rpg/production.env}"

restore_previous_build() {
  local build_status=$?
  if [ "$build_status" -ne 0 ]; then
    rm -rf .next
    if [ -d "$PREVIOUS_BUILD" ]; then
      mv "$PREVIOUS_BUILD" .next
      echo "✓ previous Next build restored"
    fi
  fi
  exit "$build_status"
}

trap restore_previous_build EXIT

rm -rf "$PREVIOUS_BUILD"
if [ -d .next ]; then
  mv .next "$PREVIOUS_BUILD"
fi

NODE_OPTIONS=--max-old-space-size=2048 \
  node --env-file="$ENV_PATH" "$(command -v npm)" run build

rm -rf "$PREVIOUS_BUILD"
trap - EXIT
