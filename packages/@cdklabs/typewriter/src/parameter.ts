import { CallableDeclaration } from './callable';
import { Identifier } from './expressions';
import { Type } from './type';

export interface ParameterSpec {
  name: string;
  type: Type;
  documentation?: string;
  optional?: boolean;
}

/**
 * It's just neat if Parameter extends Identifier so you can use it directly in the body definition
 */
export class Parameter extends Identifier {
  public readonly documentation?: string;

  public constructor(public readonly scope: CallableDeclaration, public readonly spec: ParameterSpec) {
    super(spec.name);
    this.documentation = spec.documentation;
  }

  public get optional(): boolean {
    return this.spec.optional ?? false;
  }

  public get type(): Type {
    return this.spec.type;
  }
}
