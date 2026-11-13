import calculateScc from '@rtsao/scc';
import { hashObject } from 'eslint-module-utils/hash';
import resolve from 'eslint-module-utils/resolve';
import ExportMapBuilder from './exportMap/builder';
import childContext from './exportMap/childContext';
import { looksLikeExternalModule } from './core/importType';

let cache = new Map();
// for each graph built with `ignoreExternal`, the names of the imports that it leaves out
const leftOutNames = new WeakMap();
const noNames = new Set();

export default class StronglyConnectedComponentsBuilder {
  static clearCache() {
    cache = new Map();
  }

  /** @returns {Set<string>} the names of the imports that the given graph leaves out as external */
  static leftOutOf(scc) {
    return scc && leftOutNames.get(scc) || noNames;
  }

  static get(source, context, options) {
    const path = resolve(source, context);
    if (path == null) { return null; }
    return StronglyConnectedComponentsBuilder.for(childContext(path, context), options);
  }

  static for(context, { ignoreExternal = false } = {}) {
    const settingsHash = hashObject({
      settings: context.settings,
      parserOptions: context.parserOptions || context.languageOptions && context.languageOptions.parserOptions,
      parserPath: context.parserPath,
      languageOptions: context.languageOptions,
      ignoreExternal,
    }).digest('hex');
    const cacheKey = context.path + settingsHash;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const scc = StronglyConnectedComponentsBuilder.calculate(context, ignoreExternal);
    const visitedFiles = Object.keys(scc);
    visitedFiles.forEach((filePath) => cache.set(filePath + settingsHash, scc));
    return scc;
  }

  static calculate(context, ignoreExternal) {
    const exportMap = ExportMapBuilder.for(context);
    const external = ignoreExternal ? { settings: context.settings, leftOut: new Set() } : null;
    const adjacencyList = this.exportMapToAdjacencyList(exportMap, external);
    const calculatedScc = calculateScc(adjacencyList);
    const scc = StronglyConnectedComponentsBuilder.calculatedSccToPlainObject(calculatedScc);
    if (external) { leftOutNames.set(scc, external.leftOut); }
    return scc;
  }

  /**
   * @param {{ settings: object, leftOut: Set<string> } | null} external when given (`ignoreExternal`),
   *   leave out the imports of modules that look external by their name and resolved path (`looksLikeExternalModule`),
   *   and add their names to `leftOut`
   * @returns {Map<string, Set<string>>} for each dep, what are its direct deps
   */
  static exportMapToAdjacencyList(initialExportMap, external) {
    const adjacencyList = new Map();
    // BFS
    function visitNode(exportMap) {
      if (!exportMap) {
        return;
      }
      exportMap.imports.forEach((v, importedPath) => {
        const from = exportMap.path;
        const to = importedPath;

        // Ignore type-only imports, because we care only about SCCs of value imports.
        // With `ignoreExternal`, also ignore imports of external modules, which `no-cycle` usually doesn't follow:
        // following them here would parse the dependencies' own dependencies.
        const externalNames = [];
        const toTraverse = [...v.declarations].filter(({ source, isOnlyImportingTypes }) => {
          if (isOnlyImportingTypes) { return false; }
          if (external && looksLikeExternalModule(source.value, to, external.settings)) {
            externalNames.push(source.value);
            return false;
          }
          return true;
        });
        if (toTraverse.length === 0) {
          externalNames.forEach((name) => external.leftOut.add(name));
          return;
        }

        if (!adjacencyList.has(from)) {
          adjacencyList.set(from, new Set());
        }

        if (adjacencyList.get(from).has(to)) {
          return; // prevent endless loop
        }
        adjacencyList.get(from).add(to);
        visitNode(v.getter());
      });
    }
    visitNode(initialExportMap);
    // Fill gaps
    adjacencyList.forEach((values) => {
      values.forEach((value) => {
        if (!adjacencyList.has(value)) {
          adjacencyList.set(value, new Set());
        }
      });
    });
    return adjacencyList;
  }

  /** @returns {Record<string, number>} for each key, its SCC's index */
  static calculatedSccToPlainObject(sccs) {
    const obj = {};
    sccs.forEach((scc, index) => {
      scc.forEach((node) => {
        obj[node] = index;
      });
    });
    return obj;
  }
}
