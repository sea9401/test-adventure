#!/usr/bin/env bash
# cutover-route53.sh가 저장한 한 레코드의 A 상태를 복원한다.
set -euo pipefail

backup="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BATCH_TOOL="$SCRIPT_DIR/../../scripts/route53-edge-change-batch.mjs"
: "${HOSTED_ZONE_ID:?Set HOSTED_ZONE_ID}"
if [ -z "$backup" ] || [ ! -f "$backup" ]; then
  echo "usage: $0 /path/to/route53-www-or-apex-backup.json" >&2
  exit 2
fi
command -v aws >/dev/null 2>&1 || { echo "aws CLI is required" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 2; }
[ -f "$BATCH_TOOL" ] || { echo "batch tool not found: $BATCH_TOOL" >&2; exit 2; }

change_batch="$(mktemp)"
trap 'rm -f "$change_batch"' EXIT
node "$BATCH_TOOL" rollback "$backup" >"$change_batch"

change_id="$(aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch "file://$change_batch" \
  --query ChangeInfo.Id \
  --output text)"
aws route53 wait resource-record-sets-changed --id "$change_id"
echo "Route53 rollback complete from $backup"
