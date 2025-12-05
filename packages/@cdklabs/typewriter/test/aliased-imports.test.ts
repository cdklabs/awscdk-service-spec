import { Module, TypeScriptRenderer } from '../src';

test('selective import with alias using tuple', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.importSelective(target, [['foo', 'bar']]);

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { foo as bar } from "source";"
  `);
});

test('selective import with multiple aliases using tuples', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.importSelective(target, [
    ['foo', 'bar'],
    ['baz', 'qux'],
  ]);

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { foo as bar, baz as qux } from "source";"
  `);
});

test('selective import with mixed regular and aliased', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.importSelective(target, ['regular', ['foo', 'bar']]);

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { regular, foo as bar } from "source";"
  `);
});

test('aliased import creates proper symbol link', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.importSelective(target, [['foo', 'bar']]);

  const sym = target.symbolToExpression({ name: 'foo', scope: source } as any);
  expect(sym).toBeDefined();
});

test('addAliasedImport method still works', () => {
  const source = new Module('source');
  const target = new Module('target');

  const imp = source.importSelective(target, []);
  imp.addAliasedImport('foo', 'bar');

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { foo as bar } from "source";"
  `);
});
