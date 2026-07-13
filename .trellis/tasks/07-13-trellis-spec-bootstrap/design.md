# Design: Evidence-First Spec Bootstrap

## Boundary

This task changes only Trellis task and specification documents. It does not alter application source, tests, configuration, dependencies, or deployment assets.

## Evidence Contract

Each normative convention in a generated spec must include a concrete repository-relative source path. The rule may describe only behavior directly observable in that source. A subject that lacks sufficient evidence remains undocumented rather than receiving a generic recommendation.

## Minimal Spec Surface

The evidence supports this minimal final surface:

- `backend/directory-structure.md`: route mounting, `modules/<feature>/routes.js`, controller boundary, and layered middleware placement.
- `backend/logging-guidelines.md`: 500 error logging, background-task logging levels, and audit sanitization/non-blocking writes.
- `backend/quality-guidelines.md`: permission choice, public-route isolation, and the actual backend check/test commands.
- `frontend/component-guidelines.md`: form state, UI primitives, validation, submit lifecycle, API access, feedback and post-success updates.
- `frontend/quality-guidelines.md`: current frontend build/type checks and absence of frontend automated-test conventions.
- Backend and frontend indexes: links only to the evidence-backed guides above.

Unfilled templates outside this surface will be removed from the relevant index, not populated speculatively. No rule will prescribe a form library, frontend test framework, logger library, database convention, hook convention, or global state convention.

## Validation Shape

- Confirm every requested subject has at least one source example.
- Confirm every rule includes a source path that exists in the repository.
- Confirm the selected indexes resolve to existing guides and do not advertise unfilled templates.
- Confirm the task manifests have real research entries before task activation.
- Confirm this task's diff is limited to `.trellis/` paths and has no whitespace errors.

## Rollback

Because this is documentation-only, rollback consists of reverting only this task's `.trellis/` documentation changes. No runtime migration or deployment action is involved.
