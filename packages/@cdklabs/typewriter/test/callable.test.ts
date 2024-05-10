import { TypeScriptRenderer, Module, FreeFunction, code } from '../src';

const renderer = new TypeScriptRenderer();
let scope: Module;

beforeEach(() => {
  scope = new Module('typewriter.test');
});

describe('free functions', () => {
  test('can export a free function', () => {
    const fn = new FreeFunction(scope, {
      name: 'freeFunction',
      export: true,
    });

    fn.addBody(code.comment('test comment'));

    expect(renderer.render(scope)).toMatchInlineSnapshot(`
      "/* eslint-disable prettier/prettier,max-len */
      // @ts-ignore TS6133
      export function freeFunction(): void {
        // test comment
      }"
    `);
  });
});
