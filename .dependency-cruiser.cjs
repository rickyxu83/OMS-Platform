// @ts-check

const PACKAGE_ROOTS = [
  ['backend-modules', 'backend/src/modules'],
  ['frontend-packages', 'frontend-admin/src/packages'],
]

function deepModuleRules([name, root]) {
  const internals = `^${root}/[^/]+/[^/]+/`
  return [
    {
      name: `${name}-entrypoint-boundary-from-app`,
      comment: 'Code outside a module may import its root entry points, never subfolder implementation.',
      severity: 'error',
      from: { pathNot: `^${root}/` },
      to: { path: internals },
    },
    {
      name: `${name}-entrypoint-boundary-across-modules`,
      comment: 'A module may reach another module only through its root entry points.',
      severity: 'error',
      from: { path: `^${root}/([^/]+)/`, pathNot: `^${root}/[^/]+/tests/` },
      to: { path: internals, pathNot: `^${root}/$1/` },
    },
    {
      name: `${name}-tests-through-entrypoints`,
      comment: 'Tests exercise modules through root entry points, including their own module.',
      severity: 'error',
      from: { path: `^${root}/([^/]+)/tests/` },
      to: { path: internals, pathNot: `^${root}/$1/tests/` },
    },
    {
      name: `${name}-tests-folder-is-private`,
      comment: 'Only tests may import files under a tests folder.',
      severity: 'error',
      from: { pathNot: `^${root}/[^/]+/tests/` },
      to: { path: `^${root}/[^/]+/tests/` },
    },
  ]
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...PACKAGE_ROOTS.flatMap(deepModuleRules),
    {
      name: 'no-circular',
      comment: 'No dependency cycles.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.boundaries.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
  },
}
