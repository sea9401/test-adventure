#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-check}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
DB_INSTANCE_ID="${RDS_DB_INSTANCE_ID:-adventure-rpg-db}"
MIN_BACKUP_RETENTION_DAYS="${RDS_MIN_BACKUP_RETENTION_DAYS:-7}"

if [[ "$MODE" != "check" && "$MODE" != "apply-safe" ]]; then
  echo "usage: $0 [check|apply-safe]" >&2
  exit 64
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI is required." >&2
  exit 69
fi

state="$({
  aws rds describe-db-instances \
    --region "$AWS_REGION" \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --query 'DBInstances[0].[DBInstanceStatus,MultiAZ,DeletionProtection,BackupRetentionPeriod,StorageEncrypted,PubliclyAccessible,PerformanceInsightsEnabled,MonitoringInterval,MaxAllocatedStorage,PreferredMaintenanceWindow,LatestRestorableTime]' \
    --output text
})"

IFS=$'\t' read -r \
  db_status multi_az deletion_protection backup_retention storage_encrypted \
  publicly_accessible performance_insights monitoring_interval max_allocated_storage \
  maintenance_window latest_restorable_time <<< "$state"

pending_modifications="$({
  aws rds describe-db-instances \
    --region "$AWS_REGION" \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --query 'DBInstances[0].PendingModifiedValues' \
    --output json
})"
pending_compact="${pending_modifications//$'\n'/}"
pending_compact="${pending_compact// /}"

printf '%s\n' \
  "DB instance: $DB_INSTANCE_ID ($db_status)" \
  "Multi-AZ: $multi_az" \
  "Deletion protection: $deletion_protection" \
  "Backup retention days: $backup_retention" \
  "Storage encrypted: $storage_encrypted" \
  "Publicly accessible: $publicly_accessible" \
  "Performance Insights: $performance_insights" \
  "Enhanced monitoring interval: $monitoring_interval" \
  "Storage autoscaling maximum: $max_allocated_storage" \
  "Maintenance window: $maintenance_window" \
  "Latest restorable time: $latest_restorable_time" \
  "Pending modifications: $pending_modifications"

if [[ "$MODE" == "check" ]]; then
  exit 0
fi

if [[ "$db_status" != "available" ]]; then
  echo "RDS instance must be available before applying protection changes." >&2
  exit 5
fi

if [[ "$pending_compact" != "{}" ]]; then
  echo "Refusing to mix protection changes with existing pending modifications." >&2
  exit 4
fi

modify_args=(
  rds modify-db-instance
  --region "$AWS_REGION"
  --db-instance-identifier "$DB_INSTANCE_ID"
  --no-apply-immediately
)

if [[ "$deletion_protection" != "True" ]]; then
  modify_args+=(--deletion-protection)
fi

if (( backup_retention < MIN_BACKUP_RETENTION_DAYS )); then
  modify_args+=(--backup-retention-period "$MIN_BACKUP_RETENTION_DAYS")
fi

if (( ${#modify_args[@]} == 7 )); then
  echo "Deletion protection and backup retention already meet the safe floor."
  exit 0
fi

aws "${modify_args[@]}" >/dev/null
echo "Submitted deletion-protection and backup-retention changes without forcing pending modifications to apply immediately."
echo "Multi-AZ, instance class, storage, and performance monitoring were not changed."
