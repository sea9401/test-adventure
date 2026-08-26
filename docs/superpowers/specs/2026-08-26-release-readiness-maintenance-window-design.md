# Release Readiness and Maintenance Window Design

## Context

The August 26 release advertised a 15-minute maintenance window, but users saw
the maintenance page for about an hour. The production swap itself took about
one minute. Most elapsed time came from pull-request CI failures, the required
post-merge `main` CI run, and a follow-up release-probe fix. Maintenance had
been enabled manually before those preparation steps were complete.

The existing deployment workflow already downloads and transfers the verified
production artifact while the live service remains available. The canonical
release script enables maintenance immediately before stopping the production
runtime. The main gap is therefore the operator sequence used before the
workflow starts, rather than the artifact swap mechanism.

## Goal

Keep routine user-visible maintenance within the announced 15-minute window by
finishing all fallible release preparation before maintenance begins. In a
normal artifact-based deployment, the expected maintenance exposure is one to
five minutes, leaving buffer for health and public-surface verification.

## Non-goals

- Redesigning or sharding the full CI suite.
- Automatically deploying after a merge or successful CI run.
- Automatically disabling maintenance after deployment or rollback.
- Preventing an operator from enabling maintenance immediately for an incident.
- Performing a production deployment or changing the current maintenance state.

## Release flow

### 1. Prepare while the service remains live

Complete the following steps without manually enabling maintenance:

1. Consolidate or squash the requested work.
2. Run proportionate local verification.
3. Push the release branch and open or update the pull request.
4. Resolve all pull-request CI failures.
5. Merge to `main`.
6. Wait for the exact merged `main` SHA to pass CI and produce its immutable
   production artifact.

CI duration and corrective work may exceed the announced maintenance duration,
but they do not count as user-visible downtime because the existing production
revision remains available.

### 2. Establish release readiness

A routine release is ready only when all of the following are true:

- the intended revision is merged into `main`;
- the exact 40-character `main` SHA is known;
- the successful `main` push CI run for that SHA exists;
- the non-expired `production-next-<SHA>` artifact exists; and
- the user has explicitly requested deployment.

The operator should report readiness before starting the user-visible
maintenance window. A maintenance notice can then be timed against the swap,
not against uncertain PR or CI work.

### 3. Deploy and begin maintenance just in time

Dispatch the existing deployment workflow with the ready SHA. The workflow
continues to verify the exact revision, download and checksum the artifact, and
transfer it to EC2 while the live service remains available. The canonical
release script performs its safe preflight work, then enables maintenance
immediately before stopping and replacing the production runtime.

No separate `bash deploy/maintenance.sh on` command should run before this
workflow during a routine release.

### 4. Verify and release separately

After the swap, verify the exact deployed SHA, application and database health,
and the public maintenance surface. Maintenance remains enabled after a
successful deployment or rollback. Run `bash deploy/maintenance.sh off` only
after the user gives a separate explicit instruction to disable it, then verify
the normal public surface.

## Immediate-maintenance exception

If the user explicitly says to enable maintenance **now** or an incident makes
continued public access unsafe, enable it immediately even when release
readiness has not been established. A generic request such as "enable
maintenance and deploy" does not imply immediate activation; it follows the
routine just-in-time sequence above.

If preparation later fails while maintenance is already active, do not disable
maintenance automatically. Report the failure and wait for an explicit
maintenance-off instruction, preserving the existing safety rule.

## Guardrails and documentation

Update the repository operator instructions to distinguish:

- routine deployment maintenance, which starts only after release readiness and
  immediately before the runtime swap; and
- explicitly immediate or incident maintenance, which can start at once.

The instructions must retain the current requirements that deployment needs an
explicit user request and maintenance-off needs a separate explicit user
instruction.

## Verification design

Extend the production operations surface tests to assert that:

- operator instructions prohibit routine maintenance before the exact `main`
  CI artifact is ready;
- only an explicit "now" or incident instruction permits early maintenance;
- the deployment workflow transfers the verified artifact before invoking the
  production release; and
- the release script enables maintenance before stopping the production
  service, while never disabling it automatically.

These tests protect the ordering contract without making emergency maintenance
dependent on a release artifact.

## Expected result

Long-running CI, retries, and release fixes may still delay when a deployment is
ready, but they will no longer extend routine user-visible maintenance. The
announced window covers only the controlled production swap and verification.
