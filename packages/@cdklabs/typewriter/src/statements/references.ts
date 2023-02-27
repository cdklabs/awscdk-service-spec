import { ObjectLike, ObjectReference } from './objects';

export class LocalSymbol {
  public constructor(public readonly name: string) {}

  public asObject(): ObjectLike {
    return new ObjectReference(this);
  }
}
