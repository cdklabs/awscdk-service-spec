import { IScope } from './scope';
import { DeclarationKind, TypeDeclaration, TypeSpec } from './type-declaration';

export interface EnumMemberSpec {
  readonly name: string;
  readonly value?: string | number;
  readonly docs?: string;
}

export interface EnumSpec extends TypeSpec {
  readonly members?: EnumMemberSpec[];
  readonly const?: boolean;
}

export class EnumType extends TypeDeclaration {
  public readonly kind = DeclarationKind.Enum;
  private readonly _members = new Array<EnumMemberSpec>();

  public get modifiers(): Array<string> {
    const modifiers = [];
    if (this.spec.export) {
      modifiers.push('export');
    }
    if (this.spec.const) {
      modifiers.push('const');
    }
    return modifiers;
  }

  public get members(): ReadonlyArray<EnumMemberSpec> {
    return this._members;
  }

  public constructor(public scope: IScope, public readonly spec: EnumSpec) {
    super(scope, spec);
    spec.members?.forEach((m) => this.addMember(m));
  }

  public addMember(spec: EnumMemberSpec): void {
    this._members.push(spec);
  }
}
