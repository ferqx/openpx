# Real Eval V0 Implementation Plan

Date: 2026-04-10
Status: Working
Related milestone: M1-M3
Roadmap entrypoint: `ROADMAP.md`
Active design:
- `docs/active/eval-system-framework.md`
- `docs/active/system-execution-framework.md`
Baseline work package:
- `docs/work-packages/minimal-real-eval-checklist.md`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a V0 real agent eval lane that can run a small set of real-task scenarios through the existing runtime, capture real run traces, produce outcome and trajectory checks, and write review items without polluting the default deterministic `eval:core` gate.

**Architecture:** Reuse the existing `src/eval/` scenario/store/result pipeline wherever the data model already matches V0 needs, but introduce a distinct real-eval entrypoint, scenario registry, and trace capture path. V0 stays intentionally narrow: single-sample real runs first, replay-friendly post-run inspection second, and review queue integration third. UI, release gates, suite orchestration expansion, and long-term operator workflows stay out of scope.

**Tech Stack:** TypeScript, Bun, LangGraph.js, SQLite via `bun:sqlite`, existing OpenPX runtime/control-plane stores

---

## Scope Rules

- Do not merge the real eval lane into the default deterministic `eval:core` command.
- Do not add operator UI, release gate, canary gate, or trend-reporting work in this plan.
- Do not introduce a second canonical review queue system; reuse the existing eval review queue unless blocked.
- Do not require multi-sample statistics for V0. Single real runs plus replay/review are sufficient.
- Do not mock the tool path for V0 real scenarios. Tool targets may be sandboxed, but the runtime policy/approval/execution plumbing must remain real.
- Do not add `any` or `as any`; remove nearby violations if touched.

## Planned File Map

### Real Eval Lane Entry

- Create: `src/real-eval/run-suite.ts`
- Create: `src/real-eval/suite-runner.ts`
- Create: `src/real-eval/scenarios.ts`
- Create: `src/real-eval/real-eval-schema.ts`
- Create: `tests/real-eval/runner.test.ts`

### Real Sample Execution

- Create: `src/real-eval/sample-runner.ts`
- Create: `src/real-eval/trace.ts`
- Create: `src/real-eval/replay.ts`
- Modify: `src/app/bootstrap.ts`
- Modify: `src/runtime/service/runtime-service.ts`
- Modify: `src/eval/eval-schema.ts`
- Test: `tests/real-eval/sample-runner.test.ts`
- Test: `tests/runtime/interrupt-resume.test.ts`
- Test: `tests/runtime/approval-gate.test.ts`

### Real Checks And Review Integration

- Create: `src/real-eval/evaluation.ts`
- Create: `src/real-eval/review-queue.ts`
- Modify: `src/eval/review-queue.ts`
- Modify: `src/persistence/ports/eval-store-port.ts`
- Modify: `src/persistence/sqlite/sqlite-eval-store.ts`
- Test: `tests/real-eval/evaluation.test.ts`
- Test: `tests/real-eval/review-queue.test.ts`

### Docs And Command Wiring

- Modify: `package.json`
- Modify: `docs/work-packages/minimal-real-eval-checklist.md`

## Task 1: Add A Separate Real Eval Lane Entrypoint

**Files:**
- Create: `src/real-eval/run-suite.ts`
- Create: `src/real-eval/suite-runner.ts`
- Create: `src/real-eval/scenarios.ts`
- Create: `src/real-eval/real-eval-schema.ts`
- Modify: `package.json`
- Test: `tests/real-eval/runner.test.ts`

- [ ] **Step 1: Write the failing runner tests**

  Add test coverage for:
  - a dedicated real-eval command entrypoint
  - a distinct suite id that is not `core-eval-suite`
  - command output that identifies the run as the real eval lane
  - no baseline-compare requirement for V0 single-run execution

- [ ] **Step 2: Run the new runner tests to verify failure**

  Run: `bun test tests/real-eval/runner.test.ts`
  Expected: FAIL because the `src/real-eval/` entry modules do not exist yet.

- [ ] **Step 3: Create the minimal real eval schema**

  Add a V0 schema module that defines:
  - real suite ids
  - real scenario family ids
  - real run classification fields needed by V0
  - lightweight parsing helpers for command payloads

  Keep the schema intentionally smaller than the long-term future-expansion object model.

- [ ] **Step 4: Add the real scenario registry**

  Create a real scenario registry that:
  - exposes the first V0 scenario ids
  - maps each scenario to a real-task shell plus the control semantics it must cover
  - keeps real scenarios separate from `src/eval/scenarios.ts`

  Start with 2-3 runnable scenarios:
  - approval-gated bugfix loop
  - reject-and-replan task loop
  - interrupt-resume work loop

- [ ] **Step 5: Implement the real suite runner**

  Build a dedicated runner that:
  - accepts a real suite id and optional scenario id
  - resolves a run root and eval data dir
  - invokes the real sample runner path instead of `runScenarioSuite`
  - prints a summary clearly labeled as real eval lane output

- [ ] **Step 6: Wire the command into package scripts**

  Add a script such as:

  ```json
  "eval:real": "bun run src/real-eval/run-suite.ts"
  ```

  Keep `eval:core`, `eval:suite`, and `eval:review` unchanged.

- [ ] **Step 7: Re-run the runner tests**

  Run: `bun test tests/real-eval/runner.test.ts`
  Expected: PASS

## Task 2: Run A Single Real Sample And Capture Minimal Trace

**Files:**
- Create: `src/real-eval/sample-runner.ts`
- Create: `src/real-eval/trace.ts`
- Create: `src/real-eval/replay.ts`
- Modify: `src/app/bootstrap.ts`
- Modify: `src/runtime/service/runtime-service.ts`
- Modify: `src/eval/eval-schema.ts`
- Test: `tests/real-eval/sample-runner.test.ts`
- Test: `tests/runtime/approval-gate.test.ts`
- Test: `tests/runtime/interrupt-resume.test.ts`

- [ ] **Step 1: Write failing sample-runner tests**

  Add coverage for a single real scenario run that:
  - creates a real thread/run/task path
  - records `thread_id`, `run_id`, `task_id`, and scenario id
  - captures approval / rejection / resume / recovery milestones
  - emits enough trace data for replay-oriented inspection

- [ ] **Step 2: Run the sample-runner tests to verify failure**

  Run: `bun test tests/real-eval/sample-runner.test.ts`
  Expected: FAIL because the real sample runner and trace helpers do not exist yet.

- [ ] **Step 3: Add the minimal real-run trace shape**

  Create a trace helper that records only the V0-required fields:
  - `thread_id`
  - `run_id`
  - `task_id`
  - `worker_id` when present
  - `scenario_id`
  - user goal
  - approval requested / resolved
  - rejection reason / replan entry
  - artifact generated / verified / committed
  - recovery boundary
  - resume boundary
  - side-effect milestone

- [ ] **Step 4: Implement single-sample execution**

  Add a real sample runner that:
  - prepares a sandbox workspace or repo fixture
  - boots a real app context using the real model/tool path
  - runs one scenario to terminal or suspicious state
  - persists the collected trace payload alongside the result summary

- [ ] **Step 5: Add replay-friendly inspection hooks**

  Create replay helpers that can:
  - load the stored trace for one real sample
  - re-run outcome and trajectory inspection without redoing the live model/tool invocation
  - support review/debug workflows later without changing the V0 run path

- [ ] **Step 6: Tighten runtime regression coverage**

  Extend focused runtime tests so the real-sample path still respects:
  - approval gate semantics
  - interrupt/resume consistency
  - no duplicate destructive side effects across recovery boundaries

- [ ] **Step 7: Re-run the sample and runtime tests**

  Run: `bun test tests/real-eval/sample-runner.test.ts tests/runtime/approval-gate.test.ts tests/runtime/interrupt-resume.test.ts`
  Expected: PASS

## Task 3: Add V0 Real Outcome And Trajectory Checks

**Files:**
- Create: `src/real-eval/evaluation.ts`
- Create: `src/real-eval/review-queue.ts`
- Modify: `src/eval/review-queue.ts`
- Modify: `src/persistence/ports/eval-store-port.ts`
- Modify: `src/persistence/sqlite/sqlite-eval-store.ts`
- Test: `tests/real-eval/evaluation.test.ts`
- Test: `tests/real-eval/review-queue.test.ts`

- [ ] **Step 1: Write failing evaluation tests**

  Add V0 coverage for:
  - approval-gated bugfix loop outcome success
  - reject-and-replan task-loop outcome success
  - current package artifact ownership correctness
  - interrupt-resume suspicious or fail classification when recovery drifts

- [ ] **Step 2: Run the evaluation tests to verify failure**

  Run: `bun test tests/real-eval/evaluation.test.ts tests/real-eval/review-queue.test.ts`
  Expected: FAIL because the real evaluation and review queue helpers do not exist yet.

- [ ] **Step 3: Implement the V0 real checks**

  Add one primary outcome check and one primary trajectory rule per scenario family.

  Outcome checks:
  - approved execution completes the real task after returning to the graph
  - rejected execution re-enters replan/resume instead of terminating
  - generated artifact belongs to the current work package
  - resumed execution reaches the expected terminal or bounded intermediate state

  Trajectory rules:
  - no graph-bypass after approval
  - no control-plane short-circuit after rejection
  - no artifact truth leakage from the previous package
  - no duplicated side effects or visible-state drift after recovery

- [ ] **Step 4: Reuse the existing review queue persistence**

  Extend the eval store and queue writer so the real lane can write review items without creating a second queue system.

  Required fields:
  - scenario id
  - run id
  - failure class
  - impacted object
  - severity
  - next suggested action

- [ ] **Step 5: Support suspicious classification**

  Add V0 suspicious handling rules so:
  - single-run ambiguity does not get silently upgraded to pass
  - high-severity control-flow violations still override a superficially successful run
  - replay inspection can enrich a review item without forcing a second live execution

- [ ] **Step 6: Re-run the real evaluation tests**

  Run: `bun test tests/real-eval/evaluation.test.ts tests/real-eval/review-queue.test.ts tests/eval/review-queue.test.ts`
  Expected: PASS

## Task 4: Verify End-To-End V0 Real Eval Command Behavior

**Files:**
- Modify: tests only if command or type drift appears

- [ ] **Step 1: Run the real eval lane end-to-end test slice**

  Run: `bun test tests/real-eval/runner.test.ts tests/real-eval/sample-runner.test.ts tests/real-eval/evaluation.test.ts tests/real-eval/review-queue.test.ts`
  Expected: PASS

- [ ] **Step 2: Run deterministic eval regression**

  Run: `bun test tests/eval/runner.test.ts tests/eval/scenario-runner.test.ts tests/eval/review-queue.test.ts`
  Expected: PASS and no change in default deterministic lane semantics.

- [ ] **Step 3: Run typecheck**

  Run: `bun run typecheck`
  Expected: PASS

- [ ] **Step 4: Run the V0 real eval command manually**

  Run: `bun run eval:real --scenario approval-gated-bugfix-loop`
  Expected:
  - command exits successfully for a passing scenario
  - output is labeled as the real eval lane
  - result includes trace/review-oriented metadata
  - no baseline compare is required to execute the V0 lane

- [ ] **Step 5: Update the V0 checklist if file names or command names drifted**

  Keep `docs/work-packages/minimal-real-eval-checklist.md` aligned with the implemented entrypoint and scenario ids.

