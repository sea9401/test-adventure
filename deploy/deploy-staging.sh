#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

ENV_PATH="${STAGING_ENV_PATH:-$PWD/.env.production.local}"
DEPLOY_SHA="${DEPLOY_SHA:?DEPLOY_SHA is required}"
PREVIOUS_BUILD="$PWD/.next.staging-previous"
FAILED_BUILD="$PWD/.next.staging-failed"
SERVICE="adventure-rpg-test"

if [[ ! "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "✗ DEPLOY_SHA must be a full 40-character commit SHA"
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$DEPLOY_SHA" ]; then
  echo "✗ checked-out revision does not match DEPLOY_SHA"
  exit 1
fi
if [ ! -f "$ENV_PATH" ]; then
  echo "✗ staging env is missing: $ENV_PATH"
  exit 1
fi

node --env-file="$ENV_PATH" scripts/check-staging-env.mjs

restore_previous_build() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    echo "✗ staging deploy failed; restoring the previous build"
    sudo systemctl stop "$SERVICE" || true
    rm -rf -- "$FAILED_BUILD"
    if [ -d "$PWD/.next" ]; then
      mv "$PWD/.next" "$FAILED_BUILD"
    fi
    if [ -d "$PREVIOUS_BUILD" ]; then
      mv "$PREVIOUS_BUILD" "$PWD/.next"
    fi
    sudo systemctl start "$SERVICE" || true
  fi
  exit "$status"
}
trap restore_previous_build EXIT

sudo systemctl stop "$SERVICE"
rm -rf -- "$PREVIOUS_BUILD" "$FAILED_BUILD"
if [ -d "$PWD/.next" ]; then
  mv "$PWD/.next" "$PREVIOUS_BUILD"
fi

echo "▶ [staging] dependencies"
bash deploy/install-deps.sh

echo "▶ [staging] resource-capped build"
sudo systemd-run \
  --unit=adventure-staging-build \
  --wait \
  --collect \
  --uid=ec2-user \
  --gid=ec2-user \
  --working-directory="$PWD" \
  -p CPUQuota=100% \
  -p MemoryHigh=1100M \
  -p MemoryMax=1300M \
  -p Nice=10 \
  --setenv="BUILD_ID=$DEPLOY_SHA" \
  --setenv="NODE_OPTIONS=--max-old-space-size=1152" \
  /usr/bin/npm run build

echo "▶ [staging] migrations"
node --env-file="$ENV_PATH" src/db/migrate.mjs

echo "▶ [staging] service"
sudo install -m 0644 deploy/adventure-rpg-test.service \
  /etc/systemd/system/adventure-rpg-test.service
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE"
sudo systemctl start "$SERVICE"

ok=0
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 8 http://127.0.0.1:3002/api/health >/dev/null; then
    ok=1
    echo "  health 200 (try $attempt)"
    break
  fi
  sleep 3
done
if [ "$ok" != "1" ]; then
  echo "✗ staging health check failed"
  exit 1
fi

actual_build_id="$({
  curl -fsS \
    -H "Host: test.msmsge.com" \
    -H "X-Forwarded-Proto: https" \
    http://127.0.0.1:3002/api/version
} | node -e '
  let body = "";
  process.stdin.on("data", (chunk) => { body += chunk; });
  process.stdin.on("end", () => console.log(JSON.parse(body).buildId));
')"
if [ "$actual_build_id" != "$DEPLOY_SHA" ]; then
  echo "✗ staging build ID mismatch"
  exit 1
fi

rm -rf -- "$PREVIOUS_BUILD" "$FAILED_BUILD"
trap - EXIT
echo "✓ [staging] deployed $DEPLOY_SHA"
