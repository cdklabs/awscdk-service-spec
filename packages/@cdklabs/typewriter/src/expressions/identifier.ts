import { Expression } from '../expression';
import { ObjectLike, ObjectReference } from './objects';

export class Identifier implements Expression {
  readonly comments?: string[];

  public constructor(public readonly name: string) {}

  public asObject(): ObjectLike {
    return new ObjectReference(this);
  }
}
