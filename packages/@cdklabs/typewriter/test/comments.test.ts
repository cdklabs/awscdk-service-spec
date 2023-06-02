import { $E, code, FreeFunction, Module, TypeScriptRenderer } from '../src';

const renderer = new TypeScriptRenderer();
let scope: Module;

beforeEach(() => {
  scope = new Module('typewriter.test');
});

describe('statements', () => {
  test('can have a standalone comment', () => {
    const fn = new FreeFunction(scope, {
      name: 'freeFunction',
    });

    fn.addBody(code.comment('test comment'));

    expect(renderer.render(scope)).toMatchInlineSnapshot(`
      "/* eslint-disable prettier/prettier,max-len */
      // @ts-ignore TS6133
      function freeFunction(): void {
        // test comment
      }"
    `);
  });

  test('can put a comment before a statement', () => {
    const fn = new FreeFunction(scope, {
      name: 'freeFunction',
    });

    fn.addBody(code.commentOn(code.stmt.ret(code.expr.lit(1)), 'test comment'));

    expect(renderer.render(scope)).toMatchInlineSnapshot(`
      "/* eslint-disable prettier/prettier,max-len */
      // @ts-ignore TS6133
      function freeFunction(): void {
        // test comment
        return 1;
      }"
    `);
  });
});

describe('expressions', () => {
  test('can put a comment before an expression', () => {
    const fn = new FreeFunction(scope, {
      name: 'freeFunction',
    });

    fn.addBody(code.stmt.ret(code.commentOn(code.expr.lit(1), 'test comment')));

    expect(renderer.render(scope)).toMatchInlineSnapshot(`
      "/* eslint-disable prettier/prettier,max-len */
      // @ts-ignore TS6133
      function freeFunction(): void {
        return /* test comment */ 1;
      }"
    `);
  });

  test('can put a comment before a list value expression', () => {
    const fn = new FreeFunction(scope, {
      name: 'freeFunction',
    });

    fn.addBody(
      code.stmt.ret(
        code.expr.list([
          code.expr.lit('foo'),
          code.commentOn(code.expr.lit('bar'), 'test comment'),
          code.expr.lit('baz'),
        ]),
      ),
    );

    expect(renderer.render(scope)).toMatchInlineSnapshot(`
      "/* eslint-disable prettier/prettier,max-len */
      // @ts-ignore TS6133
      function freeFunction(): void {
        return ["foo", /* test comment */ "bar", "baz"];
      }"
    `);
  });

  test('can put a comment before an expression proxy', () => {
    const fn = new FreeFunction(scope, {
      name: 'freeFunction',
    });

    fn.addBody(code.stmt.ret(code.commentOn($E(code.expr.lit(1)).convertToString(), 'test comment')));

    expect(renderer.render(scope)).toMatchInlineSnapshot(`
      "/* eslint-disable prettier/prettier,max-len */
      // @ts-ignore TS6133
      function freeFunction(): void {
        return /* test comment */ 1.convertToString();
      }"
    `);
  });
});
