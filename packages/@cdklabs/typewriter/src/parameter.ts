import { Callable } from './callable';
import { Type } from './type';

export interface ParameterSpec {
  name: string;
  type: Type;
}

export class Parameter {
  public constructor(public readonly scope: Callable, public readonly spec: ParameterSpec) {}

  public get name(): string {
    return this.spec.name;
  }

  public get type(): Type {
    return this.spec.type;
  }
}
