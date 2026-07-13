# Pattern Evidence Ledger

This ledger is the sole evidence source for the planned specification bootstrap. It records observable behavior, not preferred future architecture.

## API Routes

- `backend/src/app.js` centralizes module imports, shared middleware and `/api/v1/*` mounting; business routes precede the terminal not-found and error handlers. See `backend/src/app.js`.
- Feature modules export an `express.Router()` that composes route middleware before a controller, as shown by `backend/src/modules/attendance/routes.js` and `backend/src/modules/service-orders/routes.js`.
- Shared authentication, onboarding and auditing are frequently mount-level concerns in `backend/src/app.js`; operation-specific permissions and optional rate limits remain inside module routes. See `backend/src/app.js` and `backend/src/modules/service-orders/routes.js`.
- Public routes are explicitly separated: login is declared in `backend/src/modules/auth/routes.js`, the health endpoint is declared in `backend/src/app.js`, and signed customer access uses `backend/src/modules/service-orders/public-routes.js`.

## Authentication And Authorization

- `authenticate` accepts a Bearer JWT or session cookie, reloads the user and assigns `req.user`; it is defined in `backend/src/middleware/auth.js`.
- `requirePermission(...permissions)` is an any-of (OR) check, implemented through `hasAnyPermission` in `backend/src/middleware/auth.js` and `backend/src/permissions/store.js`.
- Business operations use route-level permissions in `backend/src/modules/attendance/routes.js` and `backend/src/modules/service-orders/routes.js`; explicitly fixed role groups are used for selected self-service or read cases in `backend/src/modules/announcements/routes.js` and `backend/src/modules/users/routes.js`.
- Authentication and authorization errors call `next(error)` in `backend/src/middleware/auth.js`, which reaches the global handler in `backend/src/middleware/error-handler.js`.

## Logging And Auditing

- The global error handler logs method, URL and original error for unhandled 500 responses while withholding internal messages in production; see `backend/src/middleware/error-handler.js`.
- Background work uses direct console logging: normal transitions use `console.log`, expected skip states use `console.warn`, and failures use `console.error` with context, as shown by `backend/src/services/scheduler.js`, `backend/src/modules/service-orders/controller.js` and `backend/src/modules/devices/controller.js`.
- Audit writes occur after the response finishes, sanitize sensitive fields, and do not change the business response when the audit write fails; see `backend/src/middleware/audit.js`.
- The code has no uniform logger library or payload schema, so no such requirement may be introduced.

## Tests And Checks

- `backend/package.json` defines `npm run check` as JavaScript syntax checks; `npm test` aliases that command and does not execute assertion scripts.
- Existing backend test scripts use CommonJS, `node:assert/strict`, environment setup and `require.cache` mocking in `backend/tests/auth-account-lockout.test.js` and `backend/tests/auth-login-rate-limit.test.js`.
- Those scripts must be invoked directly with Node when their assertions need to run; they are not run by `npm test`.
- `frontend-admin/package.json` exposes `dev`, `build` and `preview` only. `frontend-admin/tsconfig.json` supplies strict no-emit type checking. No frontend test dependency, config, or test file was found.

## Frontend Forms

- Forms use component-local controlled state: object or factory state for larger drafts in `frontend-admin/src/pages/Attendance.tsx` and `frontend-admin/src/pages/Users.tsx`; individual fields for small forms in `frontend-admin/src/pages/ChangePassword.tsx` and `frontend-admin/src/components/MySettingsDialog.tsx`.
- Forms reuse primitives from `frontend-admin/src/components/ui`, demonstrated by `frontend-admin/src/pages/Users.tsx`, `frontend-admin/src/pages/Attendance.tsx`, `frontend-admin/src/pages/ChangePassword.tsx`, and `frontend-admin/src/components/MySettingsDialog.tsx`.
- Representative submit handlers synchronously validate before requesting, use `saving` state around `try/catch/finally`, and disable submit controls while saving. See `frontend-admin/src/pages/Attendance.tsx`, `frontend-admin/src/pages/Users.tsx`, `frontend-admin/src/pages/ChangePassword.tsx`, and `frontend-admin/src/components/MySettingsDialog.tsx`.
- API calls use `frontend-admin/src/services/api.ts`, which supplies cookie credentials, transforms non-2xx errors and clears session state on 401. Callers retain `Error.message` with a contextual fallback; see `frontend-admin/src/pages/Attendance.tsx`, `frontend-admin/src/pages/Users.tsx`, and `frontend-admin/src/pages/ChangePassword.tsx`.
- Success handling varies by scenario: reset/reload, close/refresh, or refresh current user. This may be documented as a choice, not a fixed mechanism.
- Error presentation varies between `ErrorToast` and direct toast calls; no single presentation mechanism is a supported hard rule.
