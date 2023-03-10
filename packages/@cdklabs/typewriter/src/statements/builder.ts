import { Expression } from '../expression';
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
} from './statements';

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

export function expr(expr: Expression) {
  return new ExpressionStatement(expr);
}

export function sep() {
  return new StatementSeparator();
}
