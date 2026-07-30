#!/usr/bin/env bash
# AWS CloudShell 또는 전용 배포 세션에서 CloudFront/WAF 기반을 생성·갱신한다.
set -euo pipefail

AWS_REGION="us-east-1"
STACK_NAME="${STACK_NAME:-msmsge-production-edge}"
TEMPLATE_FILE="${TEMPLATE_FILE:-infra/cloudfront-waf/template.yaml}"
WAF_MODE="${WAF_MODE:-Count}"

if [ "$WAF_MODE" != "Count" ] && [ "$WAF_MODE" != "Block" ]; then
  echo "WAF_MODE must be Count or Block" >&2
  exit 2
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required" >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 2
fi

if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "template not found: $TEMPLATE_FILE" >&2
  exit 2
fi

stack_exists=0
if aws cloudformation describe-stacks \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" >/dev/null 2>&1; then
  stack_exists=1
fi

parameters=("WafMode=$WAF_MODE")
if [ "$stack_exists" -eq 0 ]; then
  : "${HOSTED_ZONE_ID:?Set HOSTED_ZONE_ID to the Route53 public hosted zone ID}"
  : "${ORIGIN_VERIFY_SECRET:?Set ORIGIN_VERIFY_SECRET to a 32-128 character alphanumeric/_/- secret}"
  parameters+=("HostedZoneId=$HOSTED_ZONE_ID" "OriginVerifySecret=$ORIGIN_VERIFY_SECRET")
  if [ -n "${ORIGIN_EIP:-}" ]; then
    parameters+=("OriginEip=$ORIGIN_EIP")
  fi
fi

echo "stack=$STACK_NAME region=$AWS_REGION waf_mode=$WAF_MODE"
aws cloudformation deploy \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE_FILE" \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${parameters[@]}"

aws cloudformation describe-stacks \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output table

distribution_id=$(aws cloudformation describe-stacks \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue | [0]" \
  --output text)
web_acl_arn=$(aws cloudformation describe-stacks \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='WebAclArn'].OutputValue | [0]" \
  --output text)

if [ "$distribution_id" = "None" ] || [ "$web_acl_arn" = "None" ]; then
  echo "stack outputs are missing DistributionId or WebAclArn" >&2
  exit 1
fi

DISTRIBUTION_ID="$distribution_id" WEB_ACL_ARN="$web_acl_arn" \
  node infra/cloudfront-waf/configure-logging.mjs --apply

if [ "$WAF_MODE" = "Count" ]; then
  echo "WAF is observing only. Review sampled requests for 24-48 hours before WAF_MODE=Block."
else
  echo "WAF blocking is enabled. Monitor 403, 429, 5xx, sign-in, and game actions."
fi
