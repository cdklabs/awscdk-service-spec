import { Expression } from '../expression';
import { EqualsExpression, JsLiteralExpression, NotExpression, ObjectLiteral } from '../expressions/objects';
import { Identifier } from './identifier';

export function sym(name: string): Identifier {
  return new Identifier(name);
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
