#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-check}"
ROLE_NAME="${EC2_INSTANCE_ROLE_NAME:-MsmsgeProdDbBackupEc2Role}"
POLICY_ARN="${SSM_CORE_POLICY_ARN:-arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore}"

if [[ "$MODE" != "check" && "$MODE" != "apply" ]]; then
  echo "usage: $0 [check|apply]" >&2
  exit 64
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI is required." >&2
  exit 69
fi

attached_policy="$({
  aws iam list-attached-role-policies \
    --role-name "$ROLE_NAME" \
    --query "AttachedPolicies[?PolicyArn=='$POLICY_ARN'].PolicyArn | [0]" \
    --output text
})"

if [[ "$attached_policy" == "$POLICY_ARN" ]]; then
  echo "SSM managed-instance core policy is attached to $ROLE_NAME."
  exit 0
fi

if [[ "$MODE" == "check" ]]; then
  echo "SSM managed-instance core policy is not attached to $ROLE_NAME." >&2
  echo "Re-run with 'apply' using an AWS administrator identity after reviewing the role." >&2
  exit 3
fi

aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "$POLICY_ARN"

attached_policy="$({
  aws iam list-attached-role-policies \
    --role-name "$ROLE_NAME" \
    --query "AttachedPolicies[?PolicyArn=='$POLICY_ARN'].PolicyArn | [0]" \
    --output text
})"

if [[ "$attached_policy" != "$POLICY_ARN" ]]; then
  echo "Policy attachment could not be verified." >&2
  exit 1
fi

echo "Attached $POLICY_ARN to $ROLE_NAME."
echo "Restart amazon-ssm-agent, then verify the instance appears as Online in Systems Manager."
