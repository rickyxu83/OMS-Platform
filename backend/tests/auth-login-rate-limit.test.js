const assert = require('node:assert/strict')

function clearBackendModuleCache() {
  const backendRoot = `${process.cwd()}/src/`
  for (const id of Object.keys(require.cache)) {
    if (id.startsWith(backendRoot)) delete require.cache[id]
  }
}

function loadAuthRoutes(disableLoginIpRateLimit) {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret'
  if (disableLoginIpRateLimit) {
    process.env.DISABLE_LOGIN_IP_RATE_LIMIT = 'true'
  } else {
    delete process.env.DISABLE_LOGIN_IP_RATE_LIMIT
  }
  clearBackendModuleCache()
  return require('../src/modules/auth/routes')
}

function getLoginHandlers(router) {
  const layer = router.stack.find((item) => item.route?.path === '/login' && item.route?.methods?.post)
  assert.ok(layer, 'POST /login route should exist')
  return layer.route.stack.map((item) => item.handle)
}

function hasRateLimitHandler(handlers) {
  return handlers.some((handler) => (
    typeof handler.resetKey === 'function' &&
    typeof handler.getKey === 'function'
  ))
}

{
  const router = loadAuthRoutes(false)
  assert.equal(hasRateLimitHandler(getLoginHandlers(router)), true, 'login should use IP rate limiting by default')
}

{
  const router = loadAuthRoutes(true)
  assert.equal(hasRateLimitHandler(getLoginHandlers(router)), false, 'login IP rate limiting should be disabled only when explicitly configured')
}
