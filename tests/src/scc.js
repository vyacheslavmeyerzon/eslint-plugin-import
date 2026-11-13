import sinon from 'sinon';
import { expect } from 'chai';
import StronglyConnectedComponentsBuilder from '../../src/scc';
import ExportMapBuilder from '../../src/exportMap/builder';
import * as path from 'path';
import { testContext, testFilePath } from './utils';

function exportMapFixtureBuilder(path, imports, isOnlyImportingTypes = false) {
  return {
    path,
    imports: new Map(imports.map((imp) => [imp.path, { getter: () => imp, declarations: [{ isOnlyImportingTypes }] }])),
  };
}

describe('Strongly Connected Components Builder', () => {
  afterEach(() => ExportMapBuilder.for.restore());
  afterEach(() => StronglyConnectedComponentsBuilder.clearCache());

  describe('When getting an SCC', () => {
    const source = '';
    const context = {
      settings: {},
      parserOptions: {},
      parserPath: '',
    };

    describe('Given two files', () => {
      describe('When they don\'t value-cycle', () => {
        it('Should return foreign SCCs', () => {
          sinon.stub(ExportMapBuilder, 'for').returns(
            exportMapFixtureBuilder('foo.js', [exportMapFixtureBuilder('bar.js', [])]),
          );
          const actual = StronglyConnectedComponentsBuilder.for(source, context);
          expect(actual).to.deep.equal({ 'foo.js': 1, 'bar.js': 0 });
        });
      });

      describe('When they do value-cycle', () => {
        it('Should return same SCC', () => {
          sinon.stub(ExportMapBuilder, 'for').returns(
            exportMapFixtureBuilder('foo.js', [
              exportMapFixtureBuilder('bar.js', [
                exportMapFixtureBuilder('foo.js', [exportMapFixtureBuilder('bar.js', [])]),
              ]),
            ]),
          );
          const actual = StronglyConnectedComponentsBuilder.for(source, context);
          expect(actual).to.deep.equal({ 'foo.js': 0, 'bar.js': 0 });
        });
      });

      describe('When they type-cycle', () => {
        it('Should return foreign SCCs', () => {
          sinon.stub(ExportMapBuilder, 'for').returns(
            exportMapFixtureBuilder('foo.js', [
              exportMapFixtureBuilder('bar.js', [
                exportMapFixtureBuilder('foo.js', []),
              ], true),
            ]),
          );
          const actual = StronglyConnectedComponentsBuilder.for(source, context);
          expect(actual).to.deep.equal({ 'foo.js': 1, 'bar.js': 0 });
        });
      });
    });

    describe('Given three files', () => {
      describe('When they form a line', () => {
        describe('When A -> B -> C', () => {
          it('Should return foreign SCCs', () => {
            sinon.stub(ExportMapBuilder, 'for').returns(
              exportMapFixtureBuilder('foo.js', [
                exportMapFixtureBuilder('bar.js', [
                  exportMapFixtureBuilder('buzz.js', []),
                ]),
              ]),
            );
            const actual = StronglyConnectedComponentsBuilder.for(source, context);
            expect(actual).to.deep.equal({ 'foo.js': 2, 'bar.js': 1, 'buzz.js': 0 });
          });
        });

        describe('When A -> B <-> C', () => {
          it('Should return 2 SCCs, A on its own', () => {
            sinon.stub(ExportMapBuilder, 'for').returns(
              exportMapFixtureBuilder('foo.js', [
                exportMapFixtureBuilder('bar.js', [
                  exportMapFixtureBuilder('buzz.js', [
                    exportMapFixtureBuilder('bar.js', []),
                  ]),
                ]),
              ]),
            );
            const actual = StronglyConnectedComponentsBuilder.for(source, context);
            expect(actual).to.deep.equal({ 'foo.js': 1, 'bar.js': 0, 'buzz.js': 0 });
          });
        });

        describe('When A <-> B -> C', () => {
          it('Should return 2 SCCs, C on its own', () => {
            sinon.stub(ExportMapBuilder, 'for').returns(
              exportMapFixtureBuilder('foo.js', [
                exportMapFixtureBuilder('bar.js', [
                  exportMapFixtureBuilder('buzz.js', []),
                  exportMapFixtureBuilder('foo.js', []),
                ]),
              ]),
            );
            const actual = StronglyConnectedComponentsBuilder.for(source, context);
            expect(actual).to.deep.equal({ 'foo.js': 1, 'bar.js': 1, 'buzz.js': 0 });
          });
        });

        describe('When A <-> B <-> C', () => {
          it('Should return same SCC', () => {
            sinon.stub(ExportMapBuilder, 'for').returns(
              exportMapFixtureBuilder('foo.js', [
                exportMapFixtureBuilder('bar.js', [
                  exportMapFixtureBuilder('foo.js', []),
                  exportMapFixtureBuilder('buzz.js', [
                    exportMapFixtureBuilder('bar.js', []),
                  ]),
                ]),
              ]),
            );
            const actual = StronglyConnectedComponentsBuilder.for(source, context);
            expect(actual).to.deep.equal({ 'foo.js': 0, 'bar.js': 0, 'buzz.js': 0 });
          });
        });
      });

      describe('When they form a loop', () => {
        it('Should return same SCC', () => {
          sinon.stub(ExportMapBuilder, 'for').returns(
            exportMapFixtureBuilder('foo.js', [
              exportMapFixtureBuilder('bar.js', [
                exportMapFixtureBuilder('buzz.js', [
                  exportMapFixtureBuilder('foo.js', []),
                ]),
              ]),
            ]),
          );
          const actual = StronglyConnectedComponentsBuilder.for(source, context);
          expect(actual).to.deep.equal({ 'foo.js': 0, 'bar.js': 0, 'buzz.js': 0 });
        });
      });

      describe('When they form a Y', () => {
        it('Should return 3 distinct SCCs', () => {
          sinon.stub(ExportMapBuilder, 'for').returns(
            exportMapFixtureBuilder('foo.js', [
              exportMapFixtureBuilder('bar.js', []),
              exportMapFixtureBuilder('buzz.js', []),
            ]),
          );
          const actual = StronglyConnectedComponentsBuilder.for(source, context);
          expect(actual).to.deep.equal({ 'foo.js': 2, 'bar.js': 0, 'buzz.js': 1 });
        });
      });

      describe('When they form a Mercedes', () => {
        it('Should return 1 SCC', () => {
          sinon.stub(ExportMapBuilder, 'for').returns(
            exportMapFixtureBuilder('foo.js', [
              exportMapFixtureBuilder('bar.js', [
                exportMapFixtureBuilder('foo.js', []),
                exportMapFixtureBuilder('buzz.js', []),
              ]),
              exportMapFixtureBuilder('buzz.js', [
                exportMapFixtureBuilder('foo.js', []),
                exportMapFixtureBuilder('bar.js', []),
              ]),
            ]),
          );
          const actual = StronglyConnectedComponentsBuilder.for(source, context);
          expect(actual).to.deep.equal({ 'foo.js': 0, 'bar.js': 0, 'buzz.js': 0 });
        });
      });
    });
  });
});

describe('Strongly Connected Components Builder with `ignoreExternal`', () => {
  const monorepo = testFilePath('cycles/monorepo');
  const app = path.join(monorepo, 'packages/@myorg/app/index.js');
  const shared = path.join(monorepo, 'node_modules/@myorg/shared/index.js');
  const context = { ...testContext(), parserPath: 'espree', parserOptions: { ecmaVersion: 2015, sourceType: 'module' } };
  afterEach(() => StronglyConnectedComponentsBuilder.clearCache());

  it('leaves the modules in `node_modules` out of the graph, and records the names of their imports', () => {
    const scc = StronglyConnectedComponentsBuilder.get(app, context, { ignoreExternal: true });
    expect(Object.keys(scc)).to.include(app);
    expect(Object.keys(scc).filter((file) => file.includes('node_modules'))).to.deep.equal([]);
    expect([...StronglyConnectedComponentsBuilder.leftOutOf(scc)]).to.deep.equal(['@myorg/shared']);
  });

  it('keeps them without `ignoreExternal`', () => {
    const scc = StronglyConnectedComponentsBuilder.get(app, context);
    expect(scc).to.have.property(shared, scc[app]);
    expect(StronglyConnectedComponentsBuilder.leftOutOf(scc).size).to.equal(0);
  });
});
