import { Expression, Splat, SymbolReference } from './expressions';
import { Identifier } from './identifier';
import { InvokeCallable } from './invoke';
import {
  BinOp,
  DestructuringBind,
  DirectCode,
  IsObject,
  JsLiteralExpression,
  ListLiteral,
  NotExpression,
  Null,
  ObjectLiteral,
  ObjectPropertyAccess,
  StrConcat,
  Structure,
  Ternary,
  ThisInstance,
  Undefined,
} from '../expressions/objects';
import { ThingSymbol } from '../symbol';
import { Type } from '../type';

/**
 * Insert direct code, bypassing all translation
 */
export function directCode(code: string): Expression {
  return new DirectCode(code);
}

/**
 * An identifier: `<identifier>`
 */
export function ident(identifier: string): Identifier {
  return new Identifier(identifier);
}

/**
 * A property access: `<lhs>.<prop>`
 */
export function get(lhs: Expression, prop: string) {
  return new ObjectPropertyAccess(lhs, prop);
}

/**
 * Reference a symbol and render its name: `<identifier>` (will add imports if necessary)
 */
export function sym(symb: ThingSymbol): Expression {
  return new SymbolReference(symb);
}

/**
 * A list/array literal: `[<el>, ...]`
 */
export function list(es: Expression[]): Expression {
  return new ListLiteral(es);
}

/**
 * An object literal: `{ <key>: <value>, ... }`
 */
export function object(
  ...parts: Array<Record<string, Expression> | Array<readonly [string, Expression]> | Splat>
): Expression {
  return new ObjectLiteral(
    parts.flatMap(
      (part): Array<Splat | readonly [string, Expression]> =>
        part instanceof Splat ? [part] : Array.isArray(part) ? part : Object.entries(part),
    ),
  );
}

/**
 * A splat expression: `...<operand>`
 */
export function splat(operand: Expression): Splat {
  return new Splat(operand);
}

/**
 * A negation expression: `!<operand>`
 */
export function not(operand: Expression): Expression {
  return new NotExpression(operand);
}

/**
 * Equality: `<left> === <right>`
 */
export function eq(left: Expression, right: Expression): Expression {
  return binOp(left, '===', right);
}

/**
 * Render a JavaScript value as a literal
 */
export function lit(value: any): Expression {
  return new JsLiteralExpression(value);
}

/**
 * Render a JavaScript value as a string
 */
export function str(value: any): Expression {
  return lit(String(value));
}

/**
 * Render a JavaScript value as a number
 */
export function num(value: number): Expression {
  return lit(value);
}

/**
 * An array for use in a destructuring assignment: `[<name>, ...]`
 */
export function destructuringArray(...names: Expression[]) {
  return new DestructuringBind(Structure.Array, names);
}

/**
 * An object for use in a destructuring assignment: `{ <name>, ... }`
 */
export function destructuringObject(...names: Expression[]) {
  return new DestructuringBind(Structure.Object, names);
}

/**
 * Call a function that does not need to be imported: `<jsBuiltIn>(<args>, ...)`
 */
export function builtInFn(jsBuiltIn: string, ...args: Expression[]) {
  return new InvokeCallable(new Identifier(jsBuiltIn), args);
}

/**
 * Reference to the current object: `this`
 */
export function this_() {
  return new ThisInstance();
}

/**
 * A symbol that refers to a type (will add imports if necessary)
 */
export function type(x: Type) {
  if (!x.symbol) {
    throw new Error(`Cannot reference type ${x}. Not a user-defined type.`);
  }
  return sym(x.symbol);
}

/**
 * A ternary expression: `<condition> ? <then> : <else>`
 */
export function cond(condition: Expression, thenExpression?: Expression, elseExpression?: Expression): Ternary {
  return new Ternary(condition, thenExpression, elseExpression);
}

/**
 * `null`
 */
export const NULL = new Null();

/**
 * `undefined`
 */
export const UNDEFINED = new Undefined();

/**
 * Binary operator: `<lhs> <op> <rhs>`
 */
export function binOp(lhs: Expression, op: string, rhs: Expression) {
  return new BinOp(lhs, op, rhs);
}

/**
 * Type test: `<op> && typeof <op> === 'object' && !Array.isArray(<op>)`
 */
export function isObject(op: Expression) {
  return new IsObject(op);
}

/**
 * Concatenation: `<op> + <op> + ...`
 */
export function strConcat(...ops: Expression[]): Expression {
  return new StrConcat(ops);
}
