import { $E, FreeFunction, Module, Type, TypeScriptRenderer, code } from '../src';

const renderer = new TypeScriptRenderer();
let scope: Module;

beforeEach(() => {
  scope = new Module('typewriter.test');
});

describe('expression proxy', () => {
  test('can proxy methods to an expression', () => {
    const fn = new FreeFunction(scope, {
      name: 'freeFunction',
      returnType: Type.STRING,
    });

    fn.addBody(code.stmt.ret($E(code.expr.lit(1)).convertToString()));

    expect(renderer.render(scope)).toMatchInlineSnapshot(`
      "/* eslint-disable prettier/prettier, quote-props, quotes, comma-spacing, max-len */
      // @ts-ignore TS6133
      function freeFunction(): string {
        return 1.convertToString();
      }"
    `);
  });
});
