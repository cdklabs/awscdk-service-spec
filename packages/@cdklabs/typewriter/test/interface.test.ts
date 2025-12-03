import { InterfaceType, Module, StructType, TypeScriptRenderer } from '../src';

const renderer = new TypeScriptRenderer();
let scope: Module;

beforeEach(() => {
  scope = new Module('typewriter.test');
});

test('can update some interface spec fields after initial creation', () => {
  const c = new InterfaceType(scope, {
    name: 'MyInterface',
  });

  c.update({
    export: true,
    extends: [scope.type('Interface1'), scope.type('Interface2')],
  });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    export interface MyInterface extends Interface1, Interface2 {

    }"
  `);
});

test('struct can extend struct', () => {
  new StructType(scope, {
    name: 'MyStruct',
    extends: [scope.type('AnotherStruct')],
  });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    /**
     * @struct
     */
    interface MyStruct extends AnotherStruct {

    }"
  `);
});

test('struct can extend multiple structs', () => {
  new StructType(scope, {
    name: 'MyStruct',
    extends: [scope.type('AnotherStruct'), scope.type('SecondStruct')],
  });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    /**
     * @struct
     */
    interface MyStruct extends AnotherStruct, SecondStruct {

    }"
  `);
});
