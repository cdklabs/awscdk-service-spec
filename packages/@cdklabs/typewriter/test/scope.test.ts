import { ClassType, DummyScope, FreeFunction, Module, TypeDeclarationStatement, TypeScriptRenderer } from '../src';

const renderer = new TypeScriptRenderer();
let scope: Module;

beforeEach(() => {
  scope = new Module('typewriter.test');
});

test('renders a class inside a free function', () => {
  const fn = new FreeFunction(scope, {
    name: 'freeFunction',
  });

  fn.addBody(
    new TypeDeclarationStatement(
      new ClassType(new DummyScope(), {
        name: 'MyClass',
      }),
    ),
  );

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    // @ts-ignore TS6133
    function freeFunction(): void {
      class MyClass {

      }
    }"
  `);
});

test('renders a class inside a class method', () => {
  const outerClass = new ClassType(scope, {
    name: 'OuterClass',
    export: true,
  });

  const method = outerClass.addMethod({
    name: 'doSomething',
  });

  method.addBody(
    new TypeDeclarationStatement(
      new ClassType(new DummyScope(), {
        name: 'MyClass',
      }),
    ),
  );

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    export class OuterClass {
      public doSomething(): void {
        class MyClass {

        }
      }
    }"
  `);
});
