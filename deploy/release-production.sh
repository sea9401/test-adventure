#!/usr/bin/env bash
# Canonical production release after the requested revision is checked out.
# GitHub Actions에서 검증된 .next를 받아 짧게 교체한다. 아티팩트가 없는 EC2 수동
# 실행에서는 기존 자원 제한 빌드를 비상 fallback으로 유지한다.
set -Eeuo pipefail

cd "$(dirname "$0")/.."

PRODUCTION_ENV_PATH="${PRODUCTION_ENV_PATH:-/run/adventure-rpg/production.env}"
WEB_PUSH_ENV_PATH="${WEB_PUSH_ENV_PATH:-/etc/adventure-rpg/web-push.env}"
PRODUCTION_SERVICE="${PRODUCTION_SERVICE:-adventure-rpg}"
STAGING_SERVICE="${STAGING_SERVICE:-adventure-rpg-test}"
BUILD_UNIT="${PRODUCTION_BUILD_UNIT:-adventure-production-build.service}"
PRODUCTION_BUILD_ARCHIVE="${PRODUCTION_BUILD_ARCHIVE:-}"
PRODUCTION_BUILD_CHECKSUM="${PRODUCTION_BUILD_CHECKSUM:-}"

export PRODUCTION_ENV_PATH

MAINTENANCE_ENABLED=0
SERVICES_PAUSED=0
STAGING_WAS_ACTIVE=0
STAGING_PAUSED=0
BUILD_SWAPPED=0
DEPLOY_FINISHED=0

sync_production_env() {
  sudo install -d -o ec2-user -g ec2-user -m 0700 \
    "$(dirname "$PRODUCTION_ENV_PATH")"
  node scripts/sync-production-env-from-ssm.mjs "$PRODUCTION_ENV_PATH"
}

wait_for_production_health() {
  local label="$1"
  local attempts="${2:-20}"
  local attempt
  local code

  for attempt in $(seq 1 "$attempts"); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
      http://127.0.0.1:3000/api/health || true)"
    code="${code:-000}"
    if [ "$code" = "200" ]; then
      echo "  health 200 ($label try $attempt)"
      return 0
    fi
    echo "  health $code — $label wait $attempt/$attempts"
    sleep 3
  done
  return 1
}

recover_on_failure() {
  local status=$?
  trap - EXIT

  if [ "$DEPLOY_FINISHED" -eq 1 ]; then
    exit "$status"
  fi

  echo "✗ [prod] deploy failed (exit=$status); restoring services" >&2
  sudo systemctl stop "$BUILD_UNIT" >/dev/null 2>&1 || true

  if [ "$SERVICES_PAUSED" -eq 1 ]; then
    sudo systemctl stop "$PRODUCTION_SERVICE" >/dev/null 2>&1 || true
    if [ "$BUILD_SWAPPED" -eq 1 ] && [ -d .next.previous ]; then
      rm -rf .next.failed
      if [ -d .next ]; then
        mv .next .next.failed
      fi
      mv .next.previous .next
      rm -rf .next.failed
      echo "✓ [prod] previous Next build restored"
    fi
    sudo systemctl start "$PRODUCTION_SERVICE" || true
    if [ "$STAGING_PAUSED" -eq 1 ]; then
      sudo systemctl start "$STAGING_SERVICE" || true
    fi
  fi

  if [ "$MAINTENANCE_ENABLED" -eq 1 ]; then
    if wait_for_production_health "recovery" 20; then
      bash deploy/maintenance.sh off || true
      echo "✓ [prod] previous service restored; maintenance disabled"
    else
      echo "✗ [prod] recovery health failed; maintenance remains enabled" >&2
    fi
  fi

  exit "$status"
}
trap recover_on_failure EXIT

echo "▶ [prod] cleanup stale Next builds"
pkill -f '[n]ext build' || true
sudo systemctl stop "$BUILD_UNIT" >/dev/null 2>&1 || true
sudo systemctl reset-failed "$BUILD_UNIT" >/dev/null 2>&1 || true

echo "▶ [prod] sync production env from SSM"
sync_production_env

echo "▶ [prod] install AWS RDS CA bundle"
DATABASE_CA_CERT_PATH="$(
  grep '^DATABASE_CA_CERT_PATH=' "$PRODUCTION_ENV_PATH" | \
    cut -d= -f2- | tr -d '"'
)"
export DATABASE_CA_CERT_PATH
bash deploy/install-rds-ca.sh

echo "▶ [prod] production env preflight"
(
  set -a
  # shellcheck disable=SC1090
  source "$PRODUCTION_ENV_PATH"
  # shellcheck disable=SC1090
  source "$WEB_PUSH_ENV_PATH"
  set +a
  node scripts/check-production-env.mjs
)

if sudo systemctl is-active --quiet "$STAGING_SERVICE"; then
  STAGING_WAS_ACTIVE=1
fi

echo "▶ [prod] nginx maintenance on"
bash deploy/maintenance.sh on
MAINTENANCE_ENABLED=1
SERVICES_PAUSED=1

if [ -n "$PRODUCTION_BUILD_ARCHIVE" ]; then
  echo "▶ [prod] stop production runtime for CI artifact swap"
else
  echo "▶ [prod] stop Next.js runtimes for fallback build memory"
fi
if [ -z "$PRODUCTION_BUILD_ARCHIVE" ] && [ "$STAGING_WAS_ACTIVE" -eq 1 ]; then
  sudo systemctl stop "$STAGING_SERVICE"
  STAGING_PAUSED=1
fi
sudo systemctl stop "$PRODUCTION_SERVICE"

# adventure-rpg.service owns /run/adventure-rpg through RuntimeDirectory.
# An explicit stop removes that directory, including the env file synced above
# for preflight. Recreate it for the detached build; ExecStartPre refreshes it
# once more when production starts.
echo "▶ [prod] resync production env after RuntimeDirectory cleanup"
sync_production_env

echo "▶ [prod] deps"
bash deploy/install-deps.sh

if [ -n "$PRODUCTION_BUILD_ARCHIVE" ]; then
  echo "▶ [prod] install verified CI build"
  bash deploy/install-production-build.sh
  BUILD_SWAPPED=1
else
  echo "▶ [prod] resource-bounded fallback build"
  bash deploy/build-production.sh
fi

echo "▶ [prod] db migrate"
node --env-file="$PRODUCTION_ENV_PATH" src/db/migrate.mjs

echo "▶ [prod] sync systemd units"
sudo install -d -m 0755 /usr/local/libexec/adventure-rpg
sudo install -m 0755 scripts/sync-production-env-from-ssm.mjs \
  /usr/local/libexec/adventure-rpg/sync-production-env-from-ssm.mjs
sudo install -m 0644 deploy/adventure-rpg.service \
  /etc/systemd/system/adventure-rpg.service
sudo install -m 0644 deploy/adventure-rpg-test.service \
  /etc/systemd/system/adventure-rpg-test.service
sudo install -m 0644 deploy/adventure-resource-monitor.service \
  /etc/systemd/system/adventure-resource-monitor.service
sudo install -m 0644 deploy/adventure-resource-monitor.timer \
  /etc/systemd/system/adventure-resource-monitor.timer
sudo systemctl daemon-reload
sudo systemctl enable --now adventure-resource-monitor.timer

echo "▶ [prod] start production"
sudo systemctl start "$PRODUCTION_SERVICE"
sleep 2
sudo systemctl --no-pager status "$PRODUCTION_SERVICE" | head -n 4

echo "▶ [prod] smoke"
if ! wait_for_production_health "startup" 20; then
  echo "✗ SMOKE FAIL: /api/health is not 200" >&2
  exit 1
fi

SIGN_IN_CODE="$(
  curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
    http://127.0.0.1:3000/sign-in || true
)"
[ "$SIGN_IN_CODE" = "200" ] || {
  echo "✗ SMOKE FAIL: /sign-in → ${SIGN_IN_CODE:-000}" >&2
  exit 1
}
echo "  /sign-in 200"

CRON_SECRET="$(
  grep '^CRON_SECRET=' "$PRODUCTION_ENV_PATH" | cut -d= -f2- | tr -d '"'
)"
OPS_CODE="$(
  curl -s -o /dev/null -w '%{http_code}' --max-time 8 -X POST \
    -H "Authorization: Bearer $CRON_SECRET" \
    http://127.0.0.1:3000/api/v2/cron/deploy-smoke || true
)"
[ "$OPS_CODE" = "200" ] || {
  echo "✗ SMOKE FAIL: deploy-smoke → ${OPS_CODE:-000}" >&2
  exit 1
}
echo "  deploy-smoke 200"

echo "▶ [prod] sync application crontab"
crontab deploy/crontab.txt
systemctl is-active --quiet crond
for path in \
  /api/v2/cron/ops-retention \
  /api/v2/cron/ops-daily-report; do
  crontab -l | grep -Fq "$path" || {
    echo "✗ CRON SYNC FAIL: $path missing" >&2
    exit 1
  }
done
echo "  application crontab synced"
sudo systemctl start adventure-resource-monitor.service

if [ "$STAGING_PAUSED" -eq 1 ]; then
  echo "▶ [prod] restore staging runtime"
  sudo systemctl start "$STAGING_SERVICE"
fi

if [ "$BUILD_SWAPPED" -eq 1 ]; then
  rm -rf .next.previous
fi

echo "▶ [prod] nginx maintenance off"
bash deploy/maintenance.sh off
MAINTENANCE_ENABLED=0
SERVICES_PAUSED=0
DEPLOY_FINISHED=1
trap - EXIT
echo "✓ [prod] smoke pass · done"
