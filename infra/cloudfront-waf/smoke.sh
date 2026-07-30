#!/usr/bin/env bash
# DNS 전환 전/후 CloudFront 공개 표면의 최소 동작과 캐시 정책을 확인한다.
set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "usage: $0 d123.cloudfront.net|msmsge.com" >&2
  exit 2
fi

if [[ "$TARGET" == *.cloudfront.net ]]; then
  url="https://$TARGET"
  host_args=(-H "Host: msmsge.com")
else
  url="https://$TARGET"
  host_args=()
fi

health_headers="$(mktemp)"
health_headers_second="$(mktemp)"
static_headers="$(mktemp)"
static_headers_second="$(mktemp)"
trap 'rm -f "$health_headers" "$health_headers_second" "$static_headers" "$static_headers_second"' EXIT

curl -fsS --max-time 20 "${host_args[@]}" -D "$health_headers" -o /dev/null "$url/api/health"
curl -fsS --max-time 20 "${host_args[@]}" -D "$health_headers_second" -o /dev/null "$url/api/health"
if grep -Eqi '^x-cache: Hit from cloudfront' "$health_headers" "$health_headers_second"; then
  echo "dynamic health request was cached unexpectedly" >&2
  exit 1
fi

html="$(curl -fsS --max-time 20 "${host_args[@]}" "$url/sign-in")"
static_path="$(printf '%s' "$html" | grep -Eo '/_next/static/[^"? ]+' | head -1 || true)"
if [ -z "$static_path" ]; then
  echo "could not discover a /_next/static asset" >&2
  exit 1
fi

curl -fsS --max-time 20 "${host_args[@]}" -D "$static_headers" -o /dev/null "$url$static_path"
curl -fsS --max-time 20 "${host_args[@]}" -D "$static_headers_second" -o /dev/null "$url$static_path"
if ! grep -Eqi '^x-cache: Hit from cloudfront' "$static_headers_second"; then
  echo "static asset was not served from CloudFront cache on the second request" >&2
  exit 1
fi

echo "health: $(awk 'NR == 1 {print $2}' "$health_headers")"
echo "static: $(awk 'NR == 1 {print $2}' "$static_headers") $static_path"
echo "static second x-cache: $(awk 'BEGIN{IGNORECASE=1} /^x-cache:/ {$1=""; sub(/^ /,""); print; exit}' "$static_headers_second")"
