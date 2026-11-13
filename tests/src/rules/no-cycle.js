import { parsers, test as _test, testFilePath, testVersion as _testVersion } from '../utils';

import { RuleTester } from '../rule-tester';
import flatMap from 'array.prototype.flatmap';
import sinon from 'sinon';
import { expect } from 'chai';
import StronglyConnectedComponentsBuilder from '../../../src/scc';
import ExportMapBuilder from '../../../src/exportMap/builder';

const ruleTester = new RuleTester();
const rule = require('rules/no-cycle');

const error = (message) => ({ message });

const test = (def) => _test({
  filename: testFilePath('./cycles/depth-zero.js'),
  ...def,
});
const testVersion = (specifier, t) => _testVersion(specifier, () => ({
  filename: testFilePath('./cycles/depth-zero.js'),
  ...t(),
}));

const testDialects = ['es6'];

const cases = {
  valid: [].concat(
    // this rule doesn't care if the cycle length is 0
    test({ code: 'import foo from "./foo.js"' }),

    test({ code: 'import _ from "lodash"' }),
    test({ code: 'import foo from "@scope/foo"' }),
    test({ code: 'var _ = require("lodash")' }),
    test({ code: 'var find = require("lodash.find")' }),
    test({ code: 'var foo = require("./foo")' }),
    test({ code: 'var foo = require("../foo")' }),
    test({ code: 'var foo = require("foo")' }),
    test({ code: 'var foo = require("./")' }),
    test({ code: 'var foo = require("@scope/foo")' }),
    test({ code: 'var bar = require("./bar/index")' }),
    test({ code: 'var bar = require("./bar")' }),
    test({
      code: 'var bar = require("./bar")',
      filename: '<text>',
    }),
    // A filename that is not on disk used to throw a TypeError and abort the whole run;
    // it is the normal case for `eslint --stdin --stdin-filename=not-yet-written.js` and `ESLint#lintText`,
    // and the `<text>` case above does not cover it, only linting text with no filename at all.
    // The distinct settings keep this test's SCC cache entries away from the other tests',
    // since the cycle fixtures' on-disk contents differ from the `code` being linted.
    test({
      code: 'import { foo } from "./es6/depth-one"',
      filename: testFilePath('./cycles/does-not-exist-on-disk.js'),
      settings: { 'import/cache': { lifetime: 30 } },
    }),
    test({
      code: 'import { foo } from "cycles/external/depth-one"',
      options: [{ ignoreExternal: true }],
      settings: {
        'import/resolver': 'webpack',
        'import/external-module-folders': ['cycles/external'],
      },
    }),
    test({
      code: 'import { foo } from "./external-depth-two"',
      options: [{ ignoreExternal: true }],
      settings: {
        'import/resolver': 'webpack',
        'import/external-module-folders': ['cycles/external'],
      },
    }),
    test({
      code: 'import { shared } from "@myorg/shared"',
      filename: testFilePath('./cycles/monorepo/packages/@myorg/app/index.js'),
      options: [{ ignoreExternal: true }],
    }),

    flatMap(testDialects, (testDialect) => [
      test({
        code: `import { foo } from "./${testDialect}/depth-two"`,
        options: [{ maxDepth: 1 }],
      }),
      test({
        code: `import { foo, bar } from "./${testDialect}/depth-two"`,
        options: [{ maxDepth: 1 }],
      }),
      test({
        code: `import("./${testDialect}/depth-two").then(function({ foo }) {})`,
        options: [{ maxDepth: 1 }],
        parser: parsers.BABEL_OLD,
      }),
      test({
        code: `import type { FooType } from "./${testDialect}/depth-one"`,
        parser: parsers.BABEL_OLD,
      }),
      test({
        code: `import type { FooType, BarType } from "./${testDialect}/depth-one"`,
        parser: parsers.BABEL_OLD,
      }),
      test({
        code: `function bar(){ return import("./${testDialect}/depth-one"); } // #2265 1`,
        options: [{ allowUnsafeDynamicCyclicDependency: true }],
        parser: parsers.BABEL_OLD,
      }),
      test({
        code: `import { foo } from "./${testDialect}/depth-one-dynamic"; // #2265 2`,
        options: [{ allowUnsafeDynamicCyclicDependency: true }],
        parser: parsers.BABEL_OLD,
      }),
    ].concat(parsers.TS_NEW ? [
      test({
        code: `function bar(){ return import("./${testDialect}/depth-one"); } // #2265 3`,
        options: [{ allowUnsafeDynamicCyclicDependency: true }],
        parser: parsers.TS_NEW,
      }),
      test({
        code: `import { foo } from "./${testDialect}/depth-one-dynamic"; // #2265 4`,
        options: [{ allowUnsafeDynamicCyclicDependency: true }],
        parser: parsers.TS_NEW,
      }),
    ] : [])),

    test({
      code: 'import { bar } from "./flow-types"',
      parser: parsers.BABEL_OLD,
    }),
    test({
      code: 'import { bar } from "./flow-types-only-importing-type"',
      parser: parsers.BABEL_OLD,
    }),
    test({
      code: 'import { bar } from "./flow-types-only-importing-multiple-types"',
      parser: parsers.BABEL_OLD,
    }),
    test({
      code: 'import { bar } from "./flow-typeof"',
      parser: parsers.BABEL_OLD,
    }),
  ),

  invalid: [].concat(
    test({
      code: 'import { bar } from "./flow-types-some-type-imports"',
      parser: parsers.BABEL_OLD,
      errors: [error(`Dependency cycle detected.`)],
    }),
    test({
      code: 'import { foo } from "cycles/external/depth-one"',
      errors: [error(`Dependency cycle detected.`)],
      settings: {
        'import/resolver': 'webpack',
        'import/external-module-folders': ['cycles/external'],
      },
    }),
    test({
      code: 'import { foo } from "./external-depth-two"',
      errors: [error(`Dependency cycle via cycles/external/depth-one:1`)],
      settings: {
        'import/resolver': 'webpack',
        'import/external-module-folders': ['cycles/external'],
      },
    }),
    // A package in `node_modules` that `import/internal-regex` makes internal, like a symlinked workspace package:
    // with `ignoreExternal`, the rule still follows the import of it.
    test({
      code: 'import { shared } from "@myorg/shared"',
      filename: testFilePath('./cycles/monorepo/packages/@myorg/app/index.js'),
      options: [{ ignoreExternal: true }],
      settings: { 'import/internal-regex': '^@myorg/' },
      errors: [error(`Dependency cycle detected.`)],
    }),
    test({
      code: 'import { shared } from "@myorg/shared"',
      filename: testFilePath('./cycles/monorepo/packages/@myorg/app/index.js'),
      errors: [error(`Dependency cycle detected.`)],
    }),
    // A `node_modules` folder that is not in a package root holds internal modules,
    // so with `ignoreExternal`, the rule still follows the import of one.
    test({
      code: 'import { lib } from "src-node-modules-lib"',
      filename: testFilePath('./cycles/src-node-modules/src/a.js'),
      options: [{ ignoreExternal: true }],
      errors: [error(`Dependency cycle detected.`)],
    }),
    // With `ignoreExternal`, the SCC graph leaves out imports that look external by their name and path,
    // but the rule classifies the imports of every module by resolving their names from the linted file.
    // Here `collide` is `src/collide.js` for `src/a.js`, but `packages/x/node_modules/collide` for `packages/x/m.js`,
    // whose import of it the rule therefore follows.
    test({
      code: 'import { m } from "../packages/x/m"',
      filename: testFilePath('./cycles/nested-package/src/a.js'),
      options: [{ ignoreExternal: true }],
      settings: { 'import/resolver': { node: { moduleDirectory: ['node_modules', 'src'] } } },
      errors: [error(`Dependency cycle via collide:2`)],
    }),
    // A `node_modules` folder in the root of a package nested in the linted file's package holds internal modules.
    test({
      code: 'import { lib } from "only-in-x"',
      filename: testFilePath('./cycles/nested-package/src/b.js'),
      options: [{ ignoreExternal: true }],
      settings: { 'import/resolver': { node: { paths: [testFilePath('./cycles/nested-package/packages/x/node_modules')] } } },
      errors: [error(`Dependency cycle detected.`)],
    }),
    // From `src/a.js`, `nested-root-lib` is the internal `src/node_modules/nested-root-lib`,
    // so the rule follows the import of `packages/b/node_modules/nested-root-lib` by that name.
    test({
      code: 'import { b } from "../packages/b"',
      filename: testFilePath('./cycles/nested-package-root/src/a.js'),
      options: [{ ignoreExternal: true }],
      errors: [error(`Dependency cycle via nested-root-lib:1`)],
    }),
    // `src/b.js` imports the same module by a bare name and by a relative path, which the rule follows.
    test({
      code: 'import { b } from "./b"',
      filename: testFilePath('./cycles/mixed-declarations/src/a.js'),
      options: [{ ignoreExternal: true }],
      errors: [error(`Dependency cycle via ../node_modules/mixed-lib:2`)],
    }),
    // Same as the `collide` case above, but the linted file's own path fails to resolve (#3221),
    // so the graph comes from the imported module.
    test({
      code: 'import { m } from "../packages/x/m"',
      filename: testFilePath('./cycles/nested-package/src/a.js'),
      options: [{ ignoreExternal: true }],
      settings: { 'import/resolver': {
        [testFilePath('./cycles/own-path-blind-resolver.js')]: { onlyFilename: 'a.js', moduleDirectory: ['node_modules', 'src'] },
      } },
      errors: [error(`Dependency cycle via collide:2`)],
    }),
    // The resolver resolves `module-system-lib` to an internal module for an `import`,
    // so the rule follows the import, which the graph leaves out.
    test({
      code: 'import lib from "module-system-lib"; import { local } from "./local"',
      filename: testFilePath('./cycles/module-system/src/a.js'),
      options: [{ ignoreExternal: true }],
      settings: { 'import/resolver': { [testFilePath('./cycles/module-system-resolver.js')]: {} } },
      errors: [error(`Dependency cycle detected.`)],
    }),
    // With `commonjs`, the graph has no edges for `require` calls, so it keeps the imports of external modules, as before:
    // here, only the import of `required-ext` connects `src/c.js` and `src/required.js` in it.
    test({
      code: 'import ext from "required-ext"; import { local } from "./local"; var required = require("./required")',
      filename: testFilePath('./cycles/nested-package/src/c.js'),
      options: [{ ignoreExternal: true, commonjs: true }],
      errors: [error(`Dependency cycle detected.`)],
    }),
    // When the resolver cannot resolve the linted file's own path (#3221),
    // no SCC graph can be built from either end,
    // and the rule must fall back to traversing everything rather than skipping the check.
    test({
      code: 'import { foo } from "./es6/depth-one"',
      settings: { 'import/resolver': './cycles/own-path-blind-resolver' },
      errors: [error(`Dependency cycle detected.`)],
    }),
    // Same, but only the linted file's own path fails to resolve;
    // the graph rooted at the import cannot see the linted buffer's own edges,
    // so it must not feed the same-SCC shortcut, and the cycle must still be found.
    test({
      code: 'import { foo } from "./es6/depth-one"',
      settings: { 'import/resolver': { './cycles/own-path-blind-resolver': { onlyFilename: 'depth-zero.js' } } },
      errors: [error(`Dependency cycle detected.`)],
    }),

    // Ensure behavior does not change for those tests, with or without `
    flatMap(testDialects, (testDialect) => flatMap([
      {},
      { allowUnsafeDynamicCyclicDependency: true },
    ], (opts) => [
      test({
        code: `import { foo } from "./${testDialect}/depth-one"`,
        options: [{ ...opts }],
        errors: [error(`Dependency cycle detected.`)],
      }),
      test({
        code: `import { foo } from "./${testDialect}/depth-one"`,
        options: [{ ...opts, maxDepth: 1 }],
        errors: [error(`Dependency cycle detected.`)],
      }),
      test({
        code: `const { foo } = require("./${testDialect}/depth-one")`,
        errors: [error(`Dependency cycle detected.`)],
        options: [{ ...opts, commonjs: true }],
      }),
      test({
        code: `require(["./${testDialect}/depth-one"], d1 => {})`,
        errors: [error(`Dependency cycle detected.`)],
        options: [{ ...opts, amd: true }],
      }),
      test({
        code: `define(["./${testDialect}/depth-one"], d1 => {})`,
        errors: [error(`Dependency cycle detected.`)],
        options: [{ ...opts, amd: true }],
      }),
      test({
        code: `import { foo } from "./${testDialect}/depth-one-reexport"`,
        options: [{ ...opts }],
        errors: [error(`Dependency cycle detected.`)],
      }),
      test({
        code: `import { foo } from "./${testDialect}/depth-two"`,
        options: [{ ...opts }],
        errors: [error(`Dependency cycle via ./depth-one:1`)],
      }),
      test({
        code: `import { foo } from "./${testDialect}/depth-two"`,
        options: [{ ...opts, maxDepth: 2 }],
        errors: [error(`Dependency cycle via ./depth-one:1`)],
      }),
      test({
        code: `const { foo } = require("./${testDialect}/depth-two")`,
        errors: [error(`Dependency cycle via ./depth-one:1`)],
        options: [{ ...opts, commonjs: true }],
      }),
      test({
        code: `import { two } from "./${testDialect}/depth-three-star"`,
        options: [{ ...opts }],
        errors: [error(`Dependency cycle via ./depth-two:1=>./depth-one:1`)],
      }),
      test({
        code: `import one, { two, three } from "./${testDialect}/depth-three-star"`,
        options: [{ ...opts }],
        errors: [error(`Dependency cycle via ./depth-two:1=>./depth-one:1`)],
      }),
      test({
        code: `import { bar } from "./${testDialect}/depth-three-indirect"`,
        options: [{ ...opts }],
        errors: [error(`Dependency cycle via ./depth-two:1=>./depth-one:1`)],
      }),
      test({
        code: `import { bar } from "./${testDialect}/depth-three-indirect"`,
        options: [{ ...opts }],
        errors: [error(`Dependency cycle via ./depth-two:1=>./depth-one:1`)],
        parser: parsers.BABEL_OLD,
      }),
      test({
        code: `import { foo } from "./${testDialect}/depth-two"`,
        options: [{ ...opts, maxDepth: Infinity }],
        errors: [error(`Dependency cycle via ./depth-one:1`)],
      }),
      test({
        code: `import { foo } from "./${testDialect}/depth-two"`,
        options: [{ ...opts, maxDepth: '∞' }],
        errors: [error(`Dependency cycle via ./depth-one:1`)],
      }),
    ]).concat([
      test({
        code: `import("./${testDialect}/depth-three-star")`,
        errors: [error(`Dependency cycle via ./depth-two:1=>./depth-one:1`)],
        parser: parsers.BABEL_OLD,
      }),
      test({
        code: `import("./${testDialect}/depth-three-indirect")`,
        errors: [error(`Dependency cycle via ./depth-two:1=>./depth-one:1`)],
        parser: parsers.BABEL_OLD,
      }),
      test({
        code: `function bar(){ return import("./${testDialect}/depth-one"); } // #2265 5`,
        errors: [error(`Dependency cycle detected.`)],
        parser: parsers.BABEL_OLD,
      }),
    ]).concat(
      testVersion('> 3', () => ({ // Dynamic import is not properly caracterized with eslint < 4
        code: `import { foo } from "./${testDialect}/depth-one-dynamic"; // #2265 6`,
        errors: [error(`Dependency cycle detected.`)],
        parser: parsers.BABEL_OLD,
      })),
    ).concat(parsers.TS_NEW ? [
      test({
        code: `function bar(){ return import("./${testDialect}/depth-one"); } // #2265 7`,
        errors: [error(`Dependency cycle detected.`)],
        parser: parsers.TS_NEW,
      }),
      test({
        code: `import { foo } from "./${testDialect}/depth-one-dynamic"; // #2265 8`,
        errors: [error(`Dependency cycle detected.`)],
        parser: parsers.TS_NEW,
      }),
    ] : [])),

    test({
      code: 'import { bar } from "./flow-types-depth-one"',
      parser: parsers.BABEL_OLD,
      errors: [error(`Dependency cycle via ./flow-types-depth-two:4=>./es6/depth-one:1`)],
    }),
    test({
      code: 'import { foo } from "./intermediate-ignore"',
      errors: [
        {
          message: 'Dependency cycle via ./ignore:1',
          line: 1,
        },
      ],
    }),
    test({
      code: 'import { foo } from "./ignore"',
      errors: [
        {
          message: 'Dependency cycle detected.',
          line: 1,
        },
      ],
    }),
  ),
};

ruleTester.run('no-cycle', rule, {
  valid: flatMap(cases.valid, (testCase) => [
    testCase,
    {
      ...testCase,
      code: `${testCase.code} // disableScc=true`,
      options: [{
        ...testCase.options && testCase.options[0] || {},
        disableScc: true,
      }],
    },
  ]),

  invalid: flatMap(cases.invalid, (testCase) => [
    testCase,
    {
      ...testCase,
      code: `${testCase.code} // disableScc=true`,
      options: [{
        ...testCase.options && testCase.options[0] || {},
        disableScc: true,
      }],
    },
  ]),
});

describe('no-cycle: SCC graphs built with and without `ignoreExternal`', () => {
  // The graph built with `ignoreExternal` leaves out the import of `@myorg/shared`,
  // so it must not be reused for the same file and settings without `ignoreExternal`.
  before(() => StronglyConnectedComponentsBuilder.clearCache());

  const monorepoApp = {
    code: 'import { shared } from "@myorg/shared"',
    filename: testFilePath('./cycles/monorepo/packages/@myorg/app/index.js'),
  };
  ruleTester.run('no-cycle', rule, {
    // `valid` runs first, so the graph without the import is built and cached first
    valid: [test({ ...monorepoApp, options: [{ ignoreExternal: true }] })],
    invalid: [test({ ...monorepoApp, errors: [error('Dependency cycle detected.')] })],
  });
});

describe('no-cycle: an SCC graph shared by linted files in different directories', () => {
  // With `ignoreExternal`, the graph built for `packages/x/entry.js` leaves out the import of `collide`,
  // which is external from `packages/x`, but internal from `src`, so it is not safe to use for `src/a.js`.
  before(() => StronglyConnectedComponentsBuilder.clearCache());

  const settings = { 'import/resolver': { node: { moduleDirectory: ['node_modules', 'src'] } } };
  ruleTester.run('no-cycle', rule, {
    // `valid` runs first, so the graph is built from `packages/x/entry.js` and cached for `src/a.js` first
    valid: [test({
      code: 'import { a } from "../../src/a"',
      filename: testFilePath('./cycles/nested-package/packages/x/entry.js'),
      options: [{ ignoreExternal: true }],
      settings,
    })],
    invalid: [test({
      code: 'import { m } from "../packages/x/m"',
      filename: testFilePath('./cycles/nested-package/src/a.js'),
      options: [{ ignoreExternal: true }],
      settings,
      errors: [error(`Dependency cycle via collide:2`)],
    })],
  });
});

describe('no-cycle: with `ignoreExternal`, external modules are not parsed', () => {
  const app = testFilePath('./cycles/monorepo/packages/@myorg/app/index.js');
  const shared = testFilePath('./cycles/monorepo/node_modules/@myorg/shared/index.js');

  const lintAndCheck = (options, parsesShared) => describe(JSON.stringify(options), () => {
    before(() => {
      StronglyConnectedComponentsBuilder.clearCache();
      sinon.spy(ExportMapBuilder, 'for');
    });
    after(() => ExportMapBuilder.for.restore());

    ruleTester.run('no-cycle', rule, {
      valid: [test({ code: 'import { shared } from "@myorg/shared"; import { local } from "./local"', filename: app, options: [options] })],
      invalid: [],
    });

    describe('afterwards', () => {
      it(`has parsed the linted file, ${parsesShared ? 'and' : 'but not'} the external module`, () => {
        const parsed = ExportMapBuilder.for.args.map(([context]) => context.path);
        expect(parsed).to.include(app);
        expect(parsed.includes(shared)).to.equal(parsesShared);
      });
    });
  });

  lintAndCheck({ ignoreExternal: true }, false);
  // with these, the reports depend on more of the graph than the imports the rule follows, so it is built in full
  lintAndCheck({ ignoreExternal: true, commonjs: true }, true);
  lintAndCheck({ ignoreExternal: true, amd: true }, true);
  lintAndCheck({ ignoreExternal: true, allowUnsafeDynamicCyclicDependency: true }, true);
});
