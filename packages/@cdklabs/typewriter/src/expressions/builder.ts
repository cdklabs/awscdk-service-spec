import { Expression, SymbolReference } from '../expression';
import {
  DestructuringBind,
  EqualsExpression,
  JsLiteralExpression,
  NotExpression,
  ObjectLiteral,
  Structure,
  ThisInstance,
} from '../expressions/objects';
import { ThingSymbol } from '../symbol';
import { Type } from '../type';
import { Identifier } from './identifier';
import { InvokeCallable } from './invoke';

export function ident(name: string): Identifier {
  return new Identifier(name);
}

export function sym(sym: ThingSymbol): Expression {
  return new SymbolReference(sym);
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
