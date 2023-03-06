import { Expression } from '../expression';
import { IfThenElse, ReturnStatement, Statement } from './statements';

export function ret(statement?: Statement): Statement {
  return new ReturnStatement(statement);
}

export function if_(condition: Expression) {
  return new IfThenElse(condition);
}
