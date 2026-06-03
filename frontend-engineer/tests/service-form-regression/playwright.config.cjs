// @ts-check
const { defineConfig } = require('@playwright/test')

/**
 * Prerequisites:
 * 1. cd backend && SEED_DEMO_PASSWORD=$RC_E2E_PASSWORD node scripts/seed-demo.js
 * 2. Start backend at http://127.0.0.1:3000
 * 3. cd frontend-engineer && npm run build && npm run preview -- --host 0.0.0.0 --port 4173
 * 4. cd frontend-engineer && npm run test:service-form-regression
 */
module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
})
