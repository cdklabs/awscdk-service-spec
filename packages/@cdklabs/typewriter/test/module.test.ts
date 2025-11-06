import { Module, stmt, expr, ClassType, TypeScriptRenderer } from '../src';

test('module starts out empty', () => {
  const module = new Module('x');
  expect(module.isEmpty()).toEqual(true);
});

test('module is not empty with a statement', () => {
  const module = new Module('x');
  module.addInitialization(stmt.constVar(expr.ident('x'), expr.lit(42)));
  expect(module.isEmpty()).toEqual(false);
});

test('module is not empty with a type', () => {
  const module = new Module('x');
  new ClassType(module, {
    name: 'Foo',
  });
  expect(module.isEmpty()).toEqual(false);
});

test('newline between types and initialization', () => {
  const module = new Module('x');
  new ClassType(module, {
    name: 'Foo',
  });
  module.addInitialization(stmt.constVar(expr.ident('x'), expr.lit(42)));

  const ts = new TypeScriptRenderer();
  expect(ts.render(module)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    class Foo {

    }
    const x = 42;"
  `);
});
