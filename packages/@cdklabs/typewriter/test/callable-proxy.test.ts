import { Module, Type, expr, ClassType, TypeScriptRenderer, stmt, CallableProxy } from '../src';

describe('CallableProxy', () => {
  let scope: Module;
  let classType: ClassType;
  let renderer: TypeScriptRenderer;

  beforeEach(() => {
    scope = new Module('test.scope');
    classType = new ClassType(scope, { name: 'TestClass' });
    renderer = new TypeScriptRenderer({ disabledEsLintRules: [] });
  });

  describe('fromName', () => {
    test('creates callable from name', () => {
      const callable = CallableProxy.fromName('testFunction', scope);
      const result = callable.invoke();
      classType.addInitializer({
        body: stmt.block(result.asStmt()),
      });

      expect(renderer.render(scope)).toMatchInlineSnapshot(`
        "class TestClass {
          public constructor() {
            testFunction();
          }
        }"
      `);
    });

    test('can call with arguments', () => {
      const callable = CallableProxy.fromName('testFunction', scope);
      const result = callable.invoke(expr.str('arg1'), expr.num(42));
      classType.addInitializer({
        body: stmt.block(result.asStmt()),
      });

      expect(renderer.render(scope)).toMatchInlineSnapshot(`
        "class TestClass {
          public constructor() {
            testFunction("arg1", 42);
          }
        }"
      `);
    });
  });

  describe('fromMethod', () => {
    test('creates callable from static method', () => {
      const method = classType.addMethod({
        name: 'staticMethod',
        returnType: Type.STRING,
        static: true,
      });

      const callable = CallableProxy.fromMethod(method);
      const result = callable.invoke();

      classType.addInitializer({
        body: stmt.block(result.asStmt()),
      });

      expect(renderer.render(scope)).toMatchInlineSnapshot(`
        "class TestClass {
          public static staticMethod(): string;

          public constructor() {
            TestClass.staticMethod();
          }
        }"
      `);
    });

    test('creates callable from member method', () => {
      const method = classType.addMethod({
        name: 'memberMethod',
        returnType: Type.STRING,
        static: false,
      });

      const callable = CallableProxy.fromMethod(method);
      const result = callable.invoke();
      classType.addInitializer({
        body: stmt.block(result.asStmt()),
      });

      expect(renderer.render(scope)).toMatchInlineSnapshot(`
        "class TestClass {
          public constructor() {
            this.memberMethod();
          }

          public memberMethod(): string;
        }"
      `);
    });

    test('can use Method directly', () => {
      const method = classType.addMethod({
        name: 'memberMethod',
        returnType: Type.STRING,
        static: false,
      });

      classType.addInitializer({
        body: stmt.block(method.invoke()),
      });

      expect(renderer.render(scope)).toMatchInlineSnapshot(`
        "class TestClass {
          public constructor() {
            this.memberMethod();
          }

          public memberMethod(): string;
        }"
      `);
    });
  });
});
