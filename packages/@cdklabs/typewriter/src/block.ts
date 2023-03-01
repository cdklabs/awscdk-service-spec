import { Expression } from './expression';
import { ExpressionStatement, ReturnStatement, Statement } from './statements';

export class Block implements Statement {
  public readonly comments?: string[];

  public readonly statements: Statement[] = [];

  public add(stmt: Statement) {
    this.statements.push(stmt);
  }

  public do(fn: (x: BlockBuilder) => void) {
    fn(new BlockBuilder(this));
  }
}

export class BlockBuilder {
  constructor(private readonly block: Block) {}

  public return_(x: Expression) {
    this.block.add(new ReturnStatement(x));
  }

  /**
   * Add an expression as a statement expression
   */
  public do(x: Expression) {
    this.block.add(new ExpressionStatement(x));
  }

  /**
   * Add an expression as a statement expression
   */
  public add(x: Expression) {
    this.do(x);
  }
}
