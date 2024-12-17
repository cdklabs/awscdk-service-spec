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

## General Usage Recommendations

1. Start with a `Module`: Always begin by creating a `Module` instance, which will serve as the root of your code structure.

2. Use builders for expressions and statements: Utilize the `expr` and `stmt` builders to create expressions and statements. This approach provides better type safety and readability compared to string manipulation.

3. Leverage type information: When defining functions, properties, or variables, always specify their types using the `Type` class or its derivatives. This ensures type consistency in the generated code.

4. Structure your code hierarchically: Use classes like `Class`, `Interface`, and `Struct` to create complex type structures that mirror the desired output.

5. Render at the end: Build your entire code structure before rendering. Use the `TypeScriptRenderer` to generate the final TypeScript code only when your structure is complete.

6. Utilize documentation features: Add documentation to your generated code using the `docs` property available on many classes. This helps in generating well-documented TypeScript code.

7. Modularize your code generation: For large projects, consider splitting your code generation logic into multiple functions or classes, each responsible for generating a specific part of your TypeScript code.

8. Test your generated code: After generating the TypeScript code, it's a good practice to compile and test it to ensure it behaves as expected.
