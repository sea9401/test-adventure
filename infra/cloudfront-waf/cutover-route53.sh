#!/usr/bin/env bash
# apex 또는 www 레코드를 CloudFront alias로 전환하고 기존 값을 JSON으로 보관한다.
set -euo pipefail

CLOUDFRONT_ZONE_ID="Z2FDTNDATAQYW2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BATCH_TOOL="$SCRIPT_DIR/../../scripts/route53-edge-change-batch.mjs"
RECORD="${1:-}"
: "${HOSTED_ZONE_ID:?Set HOSTED_ZONE_ID}"
: "${DISTRIBUTION_DOMAIN:?Set DISTRIBUTION_DOMAIN (for example d123.cloudfront.net)}"

if [ "$RECORD" != "www" ] && [ "$RECORD" != "apex" ]; then
  echo "usage: $0 www|apex" >&2
  exit 2
fi
if ! [[ "$DISTRIBUTION_DOMAIN" =~ ^[a-z0-9.-]+\.cloudfront\.net$ ]]; then
  echo "invalid CloudFront distribution domain: $DISTRIBUTION_DOMAIN" >&2
  exit 2
fi
command -v aws >/dev/null 2>&1 || { echo "aws CLI is required" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 2; }
[ -f "$BATCH_TOOL" ] || { echo "batch tool not found: $BATCH_TOOL" >&2; exit 2; }

if [ "$RECORD" = "www" ]; then
  fqdn="www.msmsge.com."
else
  fqdn="msmsge.com."
fi

state_dir="${EDGE_STATE_DIR:-$PWD/.edge-state}"
mkdir -p "$state_dir"
chmod 700 "$state_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$state_dir/route53-${RECORD}-${timestamp}.json"

aws route53 list-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --query "ResourceRecordSets[?Name == '$fqdn' && Type == 'A']" \
  --output json >"$backup"
chmod 600 "$backup"

change_batch="$(mktemp)"
trap 'rm -f "$change_batch"' EXIT
node "$BATCH_TOOL" cutover "$backup" "$fqdn" "$DISTRIBUTION_DOMAIN." "$CLOUDFRONT_ZONE_ID" \
  >"$change_batch"

change_id="$(aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch "file://$change_batch" \
  --query ChangeInfo.Id \
  --output text)"
aws route53 wait resource-record-sets-changed --id "$change_id"

echo "cutover complete: $fqdn -> $DISTRIBUTION_DOMAIN"
echo "rollback backup: $backup"
