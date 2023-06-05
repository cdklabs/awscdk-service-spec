import { ExpressionStatement, Statement } from './statements';
import { Expression } from '../expressions';

export function asStmt(x: Statement | Expression): Statement {
  if (x instanceof Statement) {
    return x;
  }
  return new ExpressionStatement(x);
}
