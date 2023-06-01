import { asStmt } from './private';
import { Statement, StatementSeparator } from './statements';
import { Expression } from '../expression';

export class Block extends Statement {
  public static with(...stmts: Array<Statement | Expression>) {
    const ret = new Block();
    ret.add(...stmts.map(asStmt));
    return ret;
  }

  private readonly _statements: Statement[] = [];

  public add(...stmts: Statement[]) {
    this._statements.push(...stmts);
  }

  /**
   * Return statements with unnecessary separators removed
   *
   * We remove separators:
   *
   * - At the beginning
   * - At the end
   * - More than one in sequence
   */
  public get statements(): Statement[] {
    const ret = [...this._statements];
    let i = 0;
    while (i < ret.length) {
      if (
        ret[i] instanceof StatementSeparator &&
        (i === 0 || i === ret.length - 1 || ret[i - 1] instanceof StatementSeparator)
      ) {
        ret.splice(i, 1);
      } else {
        i += 1;
      }
    }

    return ret;
  }
}
