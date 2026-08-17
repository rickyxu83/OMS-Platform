# Backend Deep Modules

Copy `example/` when adding a backend module:

```text
backend/src/modules/<name>/
├── index.js                 # entry point (public)
├── routes.js                # optional HTTP entry point (public)
├── lib/                     # implementation (private)
└── tests/                   # co-located tests and fixtures (private)
```

**Entry points.** Import a module only through files at its root. Files in any subfolder are private to that module. Several focused root entry points are allowed.

**Implementation.** Keep controllers, stores, parsers, and calculations in `lib/`; code inside the same module may import its own implementation freely.

**Tests.** Tests import behavior through root entry points, including their own module. Test fixtures under `tests/` are private to tests.

**No barrels or cycles.** Do not re-export an entire subtree through one large entry point; expose only the small interface callers need. Dependency cycles are forbidden.

Run `npm run lint:boundaries` from the repository root.
