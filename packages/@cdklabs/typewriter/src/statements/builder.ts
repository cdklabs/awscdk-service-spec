import { Block } from './block';
import {
  AssignmentStatement,
  StatementSeparator,
  ExpressionStatement,
  ForLoop,
  IfThenElse,
  Mut,
  ReturnStatement,
  Statement,
  VariableDeclaration,
  ThrowStatement,
} from './statements';
import { DirectCode, Expression } from '../expressions';

export function ret(e?: Expression): Statement {
  return new ReturnStatement(e);
}

export function if_(condition: Expression) {
  return new IfThenElse(condition);
}

export function forConst(iter: Expression, iterable?: Expression, stmt?: Statement) {
  return new ForLoop(Mut.Immutable, iter, iterable, stmt);
}

export function assign(lhs: Expression, rhs: Expression) {
  return new AssignmentStatement(lhs, rhs);
}

export function constVar(lhs: Expression, rhs: Expression) {
  return new VariableDeclaration(Mut.Immutable, lhs, rhs);
}

export function letVar(lhs: Expression, rhs: Expression) {
  return new VariableDeclaration(Mut.Mutable, lhs, rhs);
}

export function expr(exp: Expression) {
  return new ExpressionStatement(exp);
}

export function sep() {
  return new StatementSeparator();
}

export function block(...stmts: Array<Statement | Expression>) {
  return Block.with(...stmts);
}

export function throw_(error: Expression) {
  return new ThrowStatement(error);
}

/**
 * Insert a literal statement in the target code language
 *
 * (Internally uses an expression statement and the `directCode`
 * expression).
 */
export function directCode(code: string): Statement {
  return expr(new DirectCode(code));
}
