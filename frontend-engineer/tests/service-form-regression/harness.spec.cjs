const { test, expect } = require('@playwright/test')
test('QA harness boots and renders login page', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('#app')).toBeAttached()
})
