#!/usr/bin/env bash
# CI가 만든 아키텍처 중립 .next 아티팩트를 검증한 뒤 원자적으로 교체한다.
# 네이티브 런타임 모듈(sharp 등)은 아티팩트에 넣지 않고 EC2의 ARM64 node_modules를 쓴다.
set -Eeuo pipefail

cd "$(dirname "$0")/.."

ARCHIVE="${PRODUCTION_BUILD_ARCHIVE:?PRODUCTION_BUILD_ARCHIVE is required}"
CHECKSUM="${PRODUCTION_BUILD_CHECKSUM:?PRODUCTION_BUILD_CHECKSUM is required}"
EXPECTED_SHA="${DEPLOY_SHA:?DEPLOY_SHA is required}"
PREVIOUS_BUILD=".next.previous"
INCOMING_BUILD=".next.incoming.${EXPECTED_SHA}"
SWAPPED=0

if [[ ! "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "✗ invalid DEPLOY_SHA: $EXPECTED_SHA" >&2
  exit 1
fi

for file in "$ARCHIVE" "$CHECKSUM"; do
  if [ ! -f "$file" ]; then
    echo "✗ production build artifact missing: $file" >&2
    exit 1
  fi
done

cleanup_or_restore() {
  local status=$?
  trap - EXIT
  rm -rf "$INCOMING_BUILD"
  if [ "$status" -ne 0 ] && [ "$SWAPPED" -eq 1 ]; then
    rm -rf .next
    if [ -d "$PREVIOUS_BUILD" ]; then
      mv "$PREVIOUS_BUILD" .next
      echo "✓ previous Next build restored"
    fi
  fi
  exit "$status"
}
trap cleanup_or_restore EXIT

echo "▶ [prod] verify CI build checksum"
archive_directory="$(cd "$(dirname "$ARCHIVE")" && pwd)"
archive_name="$(basename "$ARCHIVE")"
checksum_directory="$(cd "$(dirname "$CHECKSUM")" && pwd)"
checksum_name="$(basename "$CHECKSUM")"
if [ "$archive_directory" != "$checksum_directory" ]; then
  echo "✗ archive and checksum must be in the same directory" >&2
  exit 1
fi
checksum_target="$(awk 'NR == 1 { print $2 }' "$CHECKSUM")"
checksum_target="${checksum_target#\*}"
if [ "$checksum_target" != "$archive_name" ]; then
  echo "✗ checksum targets '$checksum_target', expected '$archive_name'" >&2
  exit 1
fi
(cd "$archive_directory" && sha256sum --check "$checksum_name")

echo "▶ [prod] inspect CI build archive paths"
while IFS= read -r entry; do
  case "$entry" in
    /*|../*|*/../*|*/..)
      echo "✗ unsafe archive entry: $entry" >&2
      exit 1
      ;;
  esac
done < <(tar -tzf "$ARCHIVE")

rm -rf "$INCOMING_BUILD"
mkdir "$INCOMING_BUILD"
tar -xzf "$ARCHIVE" \
  --directory "$INCOMING_BUILD" \
  --no-same-owner \
  --no-same-permissions

for required_path in \
  DEPLOY_SHA \
  DEPLOY_ARTIFACT.json \
  BUILD_ID \
  required-server-files.json \
  server \
  static; do
  if [ ! -e "$INCOMING_BUILD/$required_path" ]; then
    echo "✗ incomplete production build: missing $required_path" >&2
    exit 1
  fi
done

artifact_sha="$(tr -d '\r\n' < "$INCOMING_BUILD/DEPLOY_SHA")"
if [ "$artifact_sha" != "$EXPECTED_SHA" ]; then
  echo "✗ artifact SHA $artifact_sha does not match deploy SHA $EXPECTED_SHA" >&2
  exit 1
fi

echo "▶ [prod] atomically install CI build $EXPECTED_SHA"
rm -rf "$PREVIOUS_BUILD"
if [ -d .next ]; then
  mv .next "$PREVIOUS_BUILD"
fi
mv "$INCOMING_BUILD" .next
SWAPPED=1

trap - EXIT
echo "✓ [prod] CI build installed"
