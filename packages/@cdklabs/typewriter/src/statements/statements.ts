import { Expression } from '../expression';

export interface Statement {
  readonly comments?: string[];
}

export class ReturnStatement implements Statement {
  readonly comments?: string[];

  public constructor(public readonly expression?: Expression) {}
}

export class ExpressionStatement implements Statement {
  readonly comments?: string[];

  public constructor(public readonly expression: Expression) {}
}
