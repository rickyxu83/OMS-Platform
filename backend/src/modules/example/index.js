const { formatModuleGreeting } = require('./lib/impl')

function moduleGreeting(name) {
  return formatModuleGreeting(name)
}

module.exports = { moduleGreeting }
