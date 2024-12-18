import { FreeFunction, Module, TypeScriptRenderer } from '../src';

const renderer = new TypeScriptRenderer();
let scope: Module;

beforeEach(() => {
  scope = new Module('typewriter.test');
});

describe('functions', () => {
  test('functions are implicitly not exported', () => {
    new FreeFunction(scope, {
      name: 'freeFunction',
    });

    expect(renderer.render(scope)).toMatchInlineSnapshot(`
      "/* eslint-disable prettier/prettier, @stylistic/max-len */
      // @ts-ignore TS6133
      function freeFunction(): void;"
    `);
  });

  test('functions can be explicitly exported', () => {
    new FreeFunction(scope, {
      name: 'freeFunction',
      export: true,
    });

    expect(renderer.render(scope)).toMatchInlineSnapshot(`
      "/* eslint-disable prettier/prettier, @stylistic/max-len */
      // @ts-ignore TS6133
      export function freeFunction(): void;"
    `);
  });

  test('functions can be explicitly not exported', () => {
    new FreeFunction(scope, {
      name: 'freeFunction',
      export: false,
    });

    expect(renderer.render(scope)).toMatchInlineSnapshot(`
      "/* eslint-disable prettier/prettier, @stylistic/max-len */
      // @ts-ignore TS6133
      function freeFunction(): void;"
    `);
  });
});
