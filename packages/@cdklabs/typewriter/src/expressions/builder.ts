import { Identifier } from './identifier';
import { InvokeCallable } from './invoke';
import { Expression, Splat, SymbolReference } from '../expression';
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

export function ident(identifier: string): Identifier {
  return new Identifier(identifier);
}

export function sym(symb: ThingSymbol): Expression {
  return new SymbolReference(symb);
}

export function list(es: Expression[]): Expression {
  return new ListLiteral(es);
}

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

export function not(operand: Expression): Expression {
  return new NotExpression(operand);
}

export function eq(left: Expression, right: Expression): Expression {
  return binOp(left, '===', right);
}

export function lit(value: any): Expression {
  return new JsLiteralExpression(value);
}

export function destructuringArray(...names: Expression[]) {
  return new DestructuringBind(Structure.Array, names);
}

export function destructuringObject(...names: Expression[]) {
  return new DestructuringBind(Structure.Object, names);
}

export function builtInFn(jsBuiltIn: string, ...args: Expression[]) {
  return new InvokeCallable(new Identifier(jsBuiltIn), args);
}

export function this_() {
  return new ThisInstance();
}

export function type(x: Type) {
  if (!x.symbol) {
    throw new Error(`Cannot reference type ${x}. Not a user-defined type.`);
  }
  return sym(x.symbol);
}

export function cond(condition: Expression, thenExpression?: Expression, elseExpression?: Expression): Ternary {
  return new Ternary(condition, thenExpression, elseExpression);
}

export const NULL = new Null();
export const UNDEFINED = new Undefined();

export function binOp(lhs: Expression, op: string, rhs: Expression) {
  return new BinOp(lhs, op, rhs);
}

export function isObject(op: Expression) {
  return new IsObject(op);
}

export function strConcat(...ops: Expression[]): Expression {
  return new StrConcat(ops);
}
