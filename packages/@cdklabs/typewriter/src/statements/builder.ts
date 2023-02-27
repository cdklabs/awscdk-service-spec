import { ObjectLiteral } from './objects';
import { LocalSymbol } from './references';
import { ReturnStatement, Statement } from './statements';

export function sym(name: string): LocalSymbol {
  return new LocalSymbol(name);
}

export function object(data: Record<string, Statement> = {}): Statement {
  return new ObjectLiteral(data);
}

export function ret(statement?: Statement): Statement {
  return new ReturnStatement(statement);
}
