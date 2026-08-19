# Frontend Deep Modules

Copy `example/` when a feature needs a package-level module:

```text
src/packages/<name>/
├── index.ts                 # entry point (public)
├── client.ts                # optional second entry point (public)
├── lib/                     # implementation (private)
└── tests/                   # tests and fixtures (private)
```

**Entry points.** Import a package only through files at its root. Files in any subfolder are private to that package. A package may expose several small root entry points.

**Implementation.** Keep behavior in `lib/`; files inside the same package may import one another freely. Code outside the package must not import `lib/`.

**Tests.** Tests import the package through root entry points, including tests for their own package. Test fixtures under `tests/` remain private to tests.

**No barrels or cycles.** Do not re-export a whole subtree through one giant `index.ts`; add focused root entry points instead. Dependency cycles are forbidden.

Run `npm run lint:boundaries` from the repository root.
