import { Identifier } from './identifier';
import { InvokeCallable } from './invoke';
import { Expression, SymbolReference } from '../expression';
import {
  BinOp,
  DestructuringBind,
  EqualsExpression,
  JsLiteralExpression,
  NotExpression,
  Null,
  ObjectLiteral,
  Structure,
  Ternary,
  ThisInstance,
} from '../expressions/objects';
import { ThingSymbol } from '../symbol';
import { Type } from '../type';

export function ident(identifier: string): Identifier {
  return new Identifier(identifier);
}

export function sym(symb: ThingSymbol): Expression {
  return new SymbolReference(symb);
}

export function object(data?: Record<string, Expression> | Array<readonly [string, Expression]>): Expression {
  return new ObjectLiteral(Array.isArray(data) ? Object.fromEntries(data) : data ?? {});
}

export function not(operand: Expression): Expression {
  return new NotExpression(operand);
}

export function eq(left: Expression, right: Expression): Expression {
  return new EqualsExpression(left, right);
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

export function binOp(lhs: Expression, op: string, rhs: Expression) {
  return new BinOp(lhs, op, rhs);
}
