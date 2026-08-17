const assert = require('node:assert/strict')
const router = require('../src/modules/customers/routes')

const routes = router.stack
  .filter((layer) => layer.route)
  .map((layer) => ({ path: layer.route.path, methods: layer.route.methods }))

const detailIndex = routes.findIndex((route) => route.path === '/:id' && route.methods.get)
assert.notEqual(detailIndex, -1, 'GET /customers/:id must be registered')

const devicesIndex = routes.findIndex((route) => route.path === '/:id/devices' && route.methods.get)
assert.ok(devicesIndex < detailIndex, 'specific customer GET routes must precede /:id')

console.log('customer routes: ok')
