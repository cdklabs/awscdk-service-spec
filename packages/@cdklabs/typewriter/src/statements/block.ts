import { Statement } from '.';

export class Block implements Statement {
  public readonly comments?: string[];

  public readonly statements: Statement[] = [];

  public add(...stmts: Statement[]) {
    this.statements.push(...stmts);
  }
}
