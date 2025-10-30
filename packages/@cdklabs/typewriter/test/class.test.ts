import { Block, ClassType, MemberVisibility, Module, TypeScriptRenderer } from '../src';

const renderer = new TypeScriptRenderer();
let scope: Module;

beforeEach(() => {
  scope = new Module('typewriter.test');
});

test('class with a private constructor', () => {
  const c = new ClassType(scope, {
    name: 'MyClass',
  });
  c.addInitializer({
    visibility: MemberVisibility.Private,
    body: new Block(),
  });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    class MyClass {
      private constructor() {

      }
    }"
  `);
});
