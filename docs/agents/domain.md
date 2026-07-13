# Domain Docs

This repository uses the single-context domain documentation layout.

## Before exploring, read these

- `CONTEXT.md` at the repository root
- Relevant ADRs under `docs/adr/`

If these files don't exist, proceed silently. The `domain-modeling` workflow creates them lazily when terminology or architectural decisions are resolved.
```text
/
├── CONTEXT.md
├── docs/adr/
└── backend/
    frontend-admin/
```

## Vocabulary

Use domain concepts as defined in `CONTEXT.md`. Avoid introducing synonyms that conflict with its glossary.

If a needed concept is missing, reconsider whether it belongs to the project vocabulary or note it for the `domain-modeling` workflow.

## ADR conflicts

If proposed work contradicts an existing ADR, explicitly identify the conflict rather than silently overriding the decision.
