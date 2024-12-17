# @cdklabs/typewriter

Write code with an AST builder instead of string concatenation.

## Self-contained example

```ts
import { expr, stmt, FreeFunction, Module, TypeScriptRenderer } from '@cdklabs/typewriter';

// Create a new module
const scope = new Module('my-package');

// Add a function to the module ...
const fn = new FreeFunction(scope, {
    name: 'myFunction',
});

// ... add statements to the function body
fn.addBody(stmt.ret(expr.lit(1)));

// Emit the code
const renderer = new TypeScriptRenderer();
console.log(renderer.render(scope));
/**
 * Prints:
 *
 * function myFunction(): void {
 *   return 1;
 * }
 */
```

## Expression and statement builders - `expr` and `stmt`

The `expr` and `stmt` modules provide a set of functions to create expressions and statements programmatically.
These builders help you construct complex code structures with ease.

### Using the `expr` builder

The `expr` module contains functions for creating various types of expressions.
sHere are some examples:

```ts
import { expr } from '@cdklabs/typewriter';

// Create a literal expression
const literalExpr = expr.lit(42);

// Create an identifier
const identExpr = expr.ident('myVariable');

// Create an object literal
const objectExpr = expr.object({ key1: expr.lit('value1'), key2: expr.lit(2) });

// Create a function call
const callExpr = expr.builtInFn('console.log', expr.lit('Hello, world!'));

// Create a binary operation
const binOpExpr = expr.binOp(expr.lit(5), '+', expr.lit(3));
```

### Using `stmt` builder

The `stmt` module provides functions for creating various types of statements.
Here are some examples:

```ts
import { stmt } from '@cdklabs/typewriter';

// Create a return statement
const returnStmt = stmt.ret(expr.lit(42));

// Create an if statement
const ifStmt = stmt.if_(expr.binOp(expr.ident('x'), '>', expr.lit(0)))
  .then(stmt.expr(expr.builtInFn('console.log', expr.lit('Positive'))))
  .else(stmt.expr(expr.builtInFn('console.log', expr.lit('Non-positive'))));

// Create a variable declaration
const varDeclStmt = stmt.constVar(expr.ident('myVar'), expr.lit('Hello'));

// Create a for loop
const forLoopStmt = stmt.forConst(
  expr.ident('i'),
  expr.builtInFn('Array', expr.lit(5)),
  stmt.expr(expr.builtInFn('console.log', expr.ident('i')))
);

// Create a block of statements
const blockStmt = code.stmt.block(
  varDeclStmt,
  forLoopStmt,
  returnStmt
);
```

## Expression Proxy (`$E`)

The Expression Proxy (`$E`) is a mechanism that allows you to build expression trees by intercepting JavaScript operations and converting them into an AST (Abstract Syntax Tree). It provides a more natural way to write code generation expressions.

### Basic Usage

```typescript
import { $E, code } from '@cdklabs/typewriter';

// Create a proxy-wrapped expression
const expression = $E(someExpression);

// Method calls and property access will be converted to expression nodes
expression.someMethod();  // Becomes a method call expression
expression.someProperty;  // Becomes a property access expression
```

### How It Works

The Expression Proxy works through JavaScript's Proxy mechanism and handles three main types of operations:

1. **Property Access**: Accessing properties on the proxy creates property access expressions
2. **Method Calls**: Calling methods creates call expressions
3. **Construction**: Using `new` creates new instance expressions

### Example Usage

```ts
import { $E, code, Module, Type, TypeScriptRenderer } from '@cdklabs/typewriter';

const scope = new Module('example');

// Create a function that uses expression proxies
const fn = scope.addFunction({
  name: 'example',
  returnType: Type.STRING,
  parameters: [{ name: 'value', type: 'number' }],
  returnType: 'string',
});

// Using $E to create method chains
fn.addBody(
  code.stmt.ret(
    $E(code.expr.ident('value')).toString()
  )
);

// Renders as:
// function example(value: number): string {
//   return value.toString();
// }
```

### Key Features & best practices

1. Automatic Expression Building

```ts
// The proxy automatically converts operations into expression nodes
const proxy = $E(someExpression);
proxy.method();        // Creates a method call expression
proxy.property;        // Creates a property access expression
new proxy();          // Creates a new instance expression
```

2. Chaining Support

```ts
// Method chains are automatically converted to nested expressions
$E(baseExpression)
  .method1()
  .method2()
  .property;
```

3. Use for Dynamic Expressions

```ts
// Good: Using $E for dynamic method calls
$E(baseExpression).dynamicMethod();

// Less ideal: Manual expression building
code.expr.call(code.expr.prop(baseExpression, 'dynamicMethod'));
```

4. Combine with Static Code Generation

```ts
// Mixing static and dynamic expressions
code.stmt.ret(
  $E(code.expr.lit('hello'))
    .toUpperCase()
    .concat($E(code.expr.lit(' world')))
);

```

5. Maintains Type Safety

```ts
// The proxy maintains type information from the original expression
const typedExpression = $E(code.expr.lit(42));
// TypeScript will provide proper type hints for number methods
```

### Limitations

- Cannot intercept JavaScript operators (like `+`, `-`, `*`, etc.)
- Only handles method calls, property access, and construction operations
- May make code generation logic less explicit compared to direct expression building

### When to Use

Use Expression Proxy when:

- Building complex method chains
- Working with dynamic property access
- Creating fluent interfaces in generated code
- Simplifying expression tree construction

Use direct expression building when:

- Working with operators
- Needing explicit control over the expression tree
- Building simple, static expressions

This feature is particularly useful when generating code that involves method chaining or complex property access patterns, as it provides a more natural and readable way to construct expression trees compared to manually building them using the expression builder API.

## TypeScriptRenderer

The `TypeScriptRenderer` is a crucial component of the @cdklabs/typewriter library, responsible for generating TypeScript code from the abstract syntax tree (AST) you've built using the library's constructs.

### Purpose

The `TypeScriptRenderer` takes the code objects you've created (such as modules, classes, interfaces, and functions) and transforms them into valid TypeScript code. It handles the intricacies of proper indentation, syntax, and structure, ensuring that the output is correct and readable.

### Usage

Here's an example of how to use the `TypeScriptRenderer`:

```ts
import { Module, TypeScriptRenderer, FreeFunction, code } from '@cdklabs/typewriter';

// Create a scope
const scope = new Module('myModule');

// Add a function to the scope
const myFunction = new FreeFunction(scope, {
  name: 'greet',
  parameters: [{ name: 'name', type: 'string' }],
  returnType: 'string',
});

// Add function body
myFunction.addBody(
  code.stmt.ret(code.expr.strConcat(code.expr.lit('Hello, '), code.expr.ident('name'), code.expr.lit('!')))
);

// Create a renderer instance
const renderer = new TypeScriptRenderer();

// Render the scope
const generatedCode = renderer.render(scope);

console.log(generatedCode);
// Output:
// function greet(name: string): string {
//   return "Hello, " + name + "!";
// }
```

### ESLint Rule Management

The `TypeScriptRenderer` also provides functionality for managing ESLint rules in the generated code. This is particularly useful when you need to disable certain linting rules for generated code. By default, the `prettier/prettier` and `max-len` ESLint rules are disabled.

You can customize the ESLint rule management using the `eslintRules` option when creating a `TypeScriptRenderer` instance:

```ts
const renderer = new TypeScriptRenderer({
  eslintRules: {
    '@typescript-eslint/comma-dangle': 'off',
    'max-len': 'off',
  },
});
```

This feature allows you to fine-tune the linting behavior for your generated code, ensuring it meets your project's coding standards while accommodating the nature of generated code.

## General Usage Recommendations

1. Start with a `Module`: Always begin by creating a `Module` instance, which will serve as the root of your code structure.

2. Use builders for expressions and statements: Utilize the `expr` and `stmt` builders to create expressions and statements. This approach provides better type safety and readability compared to string manipulation.

3. Leverage type information: When defining functions, properties, or variables, always specify their types using the `Type` class or its derivatives. This ensures type consistency in the generated code.

4. Structure your code hierarchically: Use classes like `Class`, `Interface`, and `Struct` to create complex type structures that mirror the desired output.

5. Render at the end: Build your entire code structure before rendering. Use the `TypeScriptRenderer` to generate the final TypeScript code only when your structure is complete.

6. Utilize documentation features: Add documentation to your generated code using the `docs` property available on many classes. This helps in generating well-documented TypeScript code.

7. Modularize your code generation: For large projects, consider splitting your code generation logic into multiple functions or classes, each responsible for generating a specific part of your TypeScript code.

8. Test your generated code: After generating the TypeScript code, it's a good practice to compile and test it to ensure it behaves as expected.
