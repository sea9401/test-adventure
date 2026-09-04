# Unexplored Region Mockup Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the existing interactive 미개척지 HTML mockup so its copy, node effects, monster-pool weighting, trace crafting, achievements, and personal-boss summary match the approved design.

**Architecture:** Keep the mockup as one dependency-free HTML document. Extend its existing data-driven node catalog and render functions rather than rebuilding the accepted open network; compute effective base/specialized-pool weights from active nodes and expose the result in the sidebar. Add a compact trace-vault panel to demonstrate the 1,000/2,500 crafting loop without implementing game backend behavior.

**Tech Stack:** Static HTML, CSS, inline JavaScript, inline SVG icons, Playwright smoke verification.

## Global Constraints

- Do not deploy.
- Preserve the accepted open-network layout and intuitive SVG icon language.
- All nodes cost one exploration point; the mockup cap remains 40 points.
- Basic monster weight is at least 30%, and specialized monster weights total at most 70%.
- Remove pack-count and guaranteed-pack language because one hunt resolves one monster.
- Static mockup work does not need production TDD; verify structure, calculations, interactions, and prohibited legacy copy through the existing Playwright smoke script.

---

### Task 1: Refresh the interactive mockup

**Files:**
- Modify: `docs/superpowers/unexplored-region-node-mockup.html`
- Modify: `/tmp/check-unexplored-mockup.js`
- Sync after verification: `/mnt/c/Users/sea94/OneDrive/바탕 화면/미개척지 탐사 노드 목업.html`
- Sync after verification: `/mnt/c/Users/sea94/OneDrive/바탕 화면/미개척지 사냥 사건 노드 목업.html`

**Interfaces:**
- Consumes: approved 40-point node design, twelve specialized pool definitions, 30/70 pool-weight cap, five deep keystones, and the personal-boss trace loop.
- Produces: a self-contained browser mockup whose `nodes`, `edges`, `poolCatalog`, `upperCatalog`, active presets, and sidebar summaries remain inspectable by the Playwright smoke script.

- [x] **Step 1: Update static labels and catalog data**

Replace guaranteed-pack and monster-count wording with pool appearance weights. Give each pool three monster roles and four local enhancements: material yield, +10 requested appearance weight, 20% extra-trace chance, and a risk/reward modifier. Replace the old deep-node catalog with `우두머리의 흔적`, `정예 서식지`, `황금 탐사대`, `수집가의 길`, and `버려진 무기고`.

- [x] **Step 2: Extend layout and rendering**

Add a current-distribution summary and trace-vault cards. Implement a deterministic weight calculation with base weight `max(30, 100 - specializedTotal)` and shared enhancement headroom, then render effective percentages for active pools. Keep stored trace values visible even when a pool is inactive and show crafting requirements as `흔적 1,000 / 최대 2,500` plus theme material and gold.

- [x] **Step 3: Preserve the accepted graph while adding local trace choices**

Add one trace enhancer to each pool without changing the shared corridor topology. Ensure all new enhancer nodes require their pool core, remain connected, have intuitive icons, and are included by the focus/mixed preset builder without exceeding 40 points.

- [x] **Step 4: Update browser assertions and run the smoke check**

Update expected node/category counts and assert: no browser errors; no duplicate, missing, or unreachable nodes; every node has an icon; both presets spend 40 points; focus/mixed presets activate two/three pools; minimum pool and upper-node distances remain 7 and 25; calculated specialized weight never exceeds 70%; base weight never drops below 30%; trace cards total twelve; and prohibited legacy phrases do not appear.

Run:

```bash
node /tmp/check-unexplored-mockup.js
```

Expected: exit code 0 with `"failures": []`.

- [x] **Step 5: Inspect rendered screenshots and sync the approved file**

Inspect focus and mixed screenshots for collisions, clipped sidebar content, readable labels, and correct active-pool percentages. Copy the verified HTML to both existing desktop mockup filenames and confirm their SHA-256 hashes equal the repository file.

- [x] **Step 6: Review and commit**

Run `git diff --check`, inspect the scoped diff, and commit the plan plus mockup with:

```bash
git add docs/superpowers/plans/2026-08-27-unexplored-region-mockup-refresh.md docs/superpowers/unexplored-region-node-mockup.html
git commit -m "docs: align unexplored mockup with final design"
```
