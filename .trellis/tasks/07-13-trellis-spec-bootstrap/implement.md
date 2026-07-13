# Implementation Plan: Evidence-First Spec Bootstrap

1. Review `research/pattern-evidence.md` as the only source for candidate conventions.
2. Curate real task context entries in `implement.jsonl` and `check.jsonl` using the research evidence.
3. Replace only the five evidence-backed guide bodies identified in `design.md`; place a repository-relative source path on every normative rule.
4. Align backend and frontend indexes to those guides and remove links to unsupported template topics.
5. Verify citations, paths, links, placeholders, whitespace, and that no application files changed.

## Validation Commands

```bash
git diff --check
git diff --name-only
rg -n "To fill|TBD|_example" .trellis/spec .trellis/tasks/07-13-trellis-spec-bootstrap
rg -n "backend/|frontend-admin/" .trellis/spec/backend .trellis/spec/frontend
```

## Review Gates

- Before specification writing: evidence ledger confirms each requested subject.
- Before completion: every normative rule is checked against its cited source and the scoped diff contains only `.trellis/` changes.
