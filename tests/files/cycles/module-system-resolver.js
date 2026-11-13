var path = require('path');

var nodeResolver = require('eslint-import-resolver-node');

// Simulates resolvers that take the module system into account, with an alias:
// `module-system-lib` is `module-system/src/shim.js` for an `import`, and the `module-system-impl` package otherwise.
exports.resolve = function (modulePath, sourceFile, config) {
  if (modulePath === 'module-system-lib') {
    return {
      found: true,
      path: config && config.moduleSystem === 'import'
        ? path.join(__dirname, 'module-system/src/shim.js')
        : path.join(__dirname, 'module-system/node_modules/module-system-impl/index.js'),
    };
  }
  return nodeResolver.resolve(modulePath, sourceFile, config);
};

exports.interfaceVersion = 2;
