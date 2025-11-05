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

test('can update some class spec fields after initial creation', () => {
  const c = new ClassType(scope, {
    name: 'MyClass',
  });

  c.update({
    abstract: true,
    extends: scope.type('SomeBase'),
    implements: [scope.type('Interface1'), scope.type('Interface2')],
    export: true,
  });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    export abstract class MyClass extends SomeBase implements Interface1, Interface2 {

    }"
  `);
});
