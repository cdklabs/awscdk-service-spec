import { Module, stmt, expr, ClassType } from '../src';

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
