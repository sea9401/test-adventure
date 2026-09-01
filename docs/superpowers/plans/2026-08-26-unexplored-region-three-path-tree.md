# Unexplored Region Three-Artery Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the standalone unexplored-region mockup around one bottom starting point, three neutral arteries, and six optional content clusters.

**Architecture:** Keep the single HTML artifact. Generate the shared roads, two horizontal bridge layers, and ten-node content clusters from declarative JavaScript data, then reuse the existing SVG renderer and interaction panel.

**Tech Stack:** HTML, CSS, browser-native SVG and JavaScript, Playwright acceptance checks.

## Global Constraints

- Do not deploy.
- Preserve the base eight-monster pool and simultaneous special families.
- Keep the three starting paths mechanically equal.
- Keep 40 as a provisional point cap.

---

### Task 1: Replace the graph model

**Files:**
- Modify: `docs/superpowers/unexplored-region-node-mockup.html`

- [x] **Step 1:** Move `탐사 시작` to the bottom and connect it to exactly three first road nodes.
- [x] **Step 2:** Generate three equal three-node starting paths, pass-through artery nodes, and lower/upper bridge paths.
- [x] **Step 3:** Generate six optional ten-node circular clusters in the approved two-layer placement.
- [x] **Step 4:** Update monster unlock IDs and encounter-weight milestones for the cluster model.
- [x] **Step 5:** Replace specialization labels with artery and content-cluster labels.

### Task 2: Verify and deliver

**Files:**
- Modify: `docs/superpowers/unexplored-region-node-mockup.html`
- Copy after verification: `C:\Users\sea94\OneDrive\바탕 화면\미개척지 탐사 노드 목업.html`

- [x] **Step 1:** Verify script syntax and graph counts.
- [x] **Step 2:** Verify three direct starting edges, three equal common paths, six clusters, pass-through roads, and bridge connectivity.
- [x] **Step 3:** Verify 11%→19%→26%→38% encounter milestones and exact 100% totals.
- [x] **Step 4:** Capture and inspect a 1440px screenshot.
- [x] **Step 5:** Copy the verified HTML to the desktop, compare hashes, and commit.
