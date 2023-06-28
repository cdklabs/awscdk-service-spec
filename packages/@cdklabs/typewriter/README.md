# @cdklabs/typewriter

Write typed code.

## Example

```ts
import { code, FreeFunction, Module, TypeScriptRenderer } from '@cdklabs/typewriter';

// Create a new module
const scope = new Module('my-package');

// Add a function to the module ...
const fn = new FreeFunction(scope, {
    name: 'myFunction',
});

// ... add statements to the function body
fn.addBody(code.stmt.ret(code.expr.lit(1)));

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
