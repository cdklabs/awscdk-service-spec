import { InterfaceType, Module, TypeScriptRenderer } from '../src';

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
