# Production Operations Rollout Plan

> **Execution note:** Use `superpowers:executing-plans` task by task. Repository instructions prohibit subagents, so this rollout is executed serially in the current isolated worktree.

**Goal:** Activate the remaining production-operation safeguards that can be applied without an application deployment, and leave AWS-admin-only changes reproducible and verifiable.

**Architecture:** Keep the existing GitHub uptime check and add an independent AWS Synthetics health check to the operations stack. Restrict the GitHub production environment to `main`. Treat RDS and IAM changes as separately verified AWS control-plane operations, never as application deployment side effects.

**Tech Stack:** GitHub Environments REST API, AWS CloudFormation, CloudWatch Synthetics, SNS, RDS, Systems Manager, Bash, cfn-lint.

## Global Constraints

- Do not deploy application code in this rollout; the user must explicitly request `배포`.
- Do not enable or disable maintenance mode.
- Do not change RDS availability, instance class, storage, or monitoring until the live RDS configuration and price impact are readable with an AWS administrator identity.
- Do not replace the working SSH deployment path until OIDC/SSM prerequisites and rollback access have been verified on the production instance.
- Do not expose secret values in command output, files, plans, or commits.
- Apply external changes only after a read-only preflight and verify their resulting state afterward.

---

### Task 1: Capture live-state preflight

**Files:**
- Modify: `docs/ops-runbook.md`

- [x] Verify the isolated worktree is clean and based on the latest operations-hardening commit.
- [x] Confirm GitHub authentication, repository identity, environment settings, secret names, rulesets, and recent deploy/uptime runs.
- [x] Confirm production SSH access and that `amazon-ssm-agent` is active.
- [x] Confirm the EC2 instance role identity and test whether it can read RDS and CloudFormation state.
- [x] Record the observed access boundary and rollout status without copying credentials or secret values.

### Task 2: Restrict production environment deployments

**External resource:** GitHub environment `msmsge.com`

- [x] Update the environment to use custom deployment branch policies.
- [x] Add exactly one branch policy for `main`.
- [x] Read the environment and branch policies back and verify that no other branch or tag is eligible.
- [x] Leave the existing main ruleset and exact-SHA CI gate unchanged.

### Task 3: Add an independent public health monitor

**Files:**
- Modify: `infra/operations/template.yaml`
- Modify: `docs/ops-runbook.md`
- Modify: `docs/release-readiness.md`

- [x] Add an opt-in CloudWatch Synthetics canary for `https://msmsge.com/api/health`.
- [x] Validate HTTP 200 plus `{ok:true, db:"ok"}` so a CDN-only response cannot count as healthy.
- [x] Add least-privilege canary execution IAM, encrypted artifact storage with retention, and an SNS-backed failure alarm.
- [x] Keep the canary parameterized and disabled by default so stack validation cannot silently create recurring cost.
- [x] Run `uvx cfn-lint infra/operations/template.yaml`.

### Task 4: Apply AWS alarm and monitor stack when authorized credentials exist

**External resource:** CloudFormation stack `adventure-rpg-production-operations`

- [x] With an AWS administrator/deployment identity, describe EC2 `i-093253c4b87d0164a`, RDS `adventure-rpg-db`, and any existing operations stack.
- [x] Create and inspect a CloudFormation change set. The initial canary-enabled set was replaced by `basic-alarms-email-20260813` after cost review; neither set contained application or database replacements.
- [x] Execute only if the change set creates or updates monitoring resources and does not replace application/database resources. (Applied with the external canary disabled.)
- [x] Verify stack completion, applicable alarm states, and SNS delivery. (The email subscription was confirmed and an SNS test message was received.)

**Stop condition:** The current EC2 role is denied `rds:DescribeDBInstances` and `cloudformation:DescribeStacks`; do not widen that runtime role merely to perform administration.

### Task 5: Audit and harden RDS safely

**External resource:** RDS DB instance `adventure-rpg-db`

**Files:**
- Create: `infra/operations/harden-rds.sh`
- Create: `src/lib/server/rdsProtectionScript.test.ts`
- Modify: `docs/ops-runbook.md`

- [x] Read `MultiAZ`, `DeletionProtection`, `BackupRetentionPeriod`, encryption, public accessibility, Performance Insights/Database Insights, storage autoscaling, pending modifications, and maintenance windows.
- [x] Add and test a guarded `check`/`apply-safe` tool that refuses non-available instances and existing pending modifications.
- [x] Enable deletion protection and at least seven days of automated backup retention if absent, using a reviewed no-immediate-apply change where supported. (Both were already configured; no RDS modification was required.)
- [ ] Price and schedule Multi-AZ separately; do not enable it as an incidental no-downtime change.
- [ ] Verify final configuration and latest restorable time.

**Stop condition:** No RDS modification is allowed until the current configuration and pending modifications can be read with an administrator identity.

### Task 6: Prepare OIDC and SSM deployment migration

**Files:**
- Modify: `docs/ops-runbook.md`
- Modify: `docs/production-secrets.md`

- [x] Verify the production instance is registered as a Systems Manager managed node, not merely running the agent. (`AmazonSSMManagedInstanceCore` was attached and the node is `Online`.)
- [x] Create a GitHub OIDC role restricted to `repo:sea9401/test-adventure:environment:msmsge.com` and the production instance.
- [ ] Move the four deployment-injected values into the existing SSM SecureString source before removing SSH secret use.
- [ ] Exercise an SSM read-only command, artifact transfer, deployment command, and rollback path in staging or a maintenance window.
- [ ] Remove `EC2_SSH_KEY` only after two successful SSM deployments and verified break-glass access.

### Task 7: Activate weekly restore verification with deployment approval

**External resource:** production EC2 systemd timer

- [ ] After the commit containing the restore scripts is explicitly deployed, install the service and timer through the normal release process.
- [ ] Run the service once manually and verify restore, integrity checks, cleanup, heartbeat, and alert behavior.
- [ ] Enable `adventure-backup-restore-test.timer` only after the manual run passes.
- [ ] Verify the next scheduled time and ensure maintenance mode is unchanged.

### Task 8: Final verification and commit

- [x] Run `uvx cfn-lint infra/operations/template.yaml`.
- [x] Run `npm run check-action-pins` and focused operations tests.
- [x] Run `git diff --check` and inspect `git status --short`.
- [x] Commit repository changes with a focused message.
- [ ] Report completed external changes separately from permission- or deployment-gated items.
