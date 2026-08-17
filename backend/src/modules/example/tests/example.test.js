const assert = require('assert')
const { moduleGreeting } = require('../index')

assert.equal(moduleGreeting('OMS'), 'Hello, OMS')
