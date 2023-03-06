import { Expression } from '../expression';
import { EqualsExpression, JsLiteralExpression, NotExpression, ObjectLiteral } from '../expressions/objects';
import { LocalSymbol } from '../expressions/references';

export function sym(name: string): LocalSymbol {
  return new LocalSymbol(name);
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
