import { Callable } from './callable';
import { TypeReference, TypeReferenceSpec } from './type-ref';

export interface ParameterSpec {
  name: string;
  type: TypeReferenceSpec;
}

export class Parameter {
  public constructor(public readonly scope: Callable, public readonly spec: ParameterSpec) {}

  public get name(): string {
    return this.spec.name;
  }

  public get type(): TypeReference {
    return new TypeReference(this.scope.scope, this.spec.type);
  }
}
