import { AliasedModuleImport, expr, Type } from '@cdklabs/typewriter';
import { Expression, InvokeCallable, ObjectPropertyAccess } from '@cdklabs/typewriter';
import { PrimitiveType } from '@jsii/spec';
import { mapperNameFromType } from './naming/conventions';

/**
 * Retain a list of properties with their CloudFormation and TypeScript names
 */
export class PropMapping {
  private readonly cfn2ts: Record<string, string> = {};
  private readonly cfnTypes: Record<string, Type> = {};

  constructor(private readonly core: AliasedModuleImport) {}

  public add(cfnName: string, tsName: string, type: Type) {
    this.cfn2ts[cfnName] = tsName;
    this.cfnTypes[cfnName] = type;
  }

  public cfnFromTs(): Array<[string, string]> {
    return Object.entries(this.cfn2ts);
  }

  public cfnProperties(): string[] {
    return Object.keys(this.cfn2ts);
  }

  public mapProp(cfnName: string, struct: Expression) {
    const value = new ObjectPropertyAccess(struct, this.cfn2ts[cfnName]);
    const type = this.cfnTypes[cfnName];
    if (!type) {
      throw new Error(`No type for ${cfnName}`);
    }

    const mapper = this.typeMapper(type);
    return new InvokeCallable(mapper, [value]);
  }

  private typeMapper(type: Type): Expression {
    if (type.isAny) {
      return this.core.prop('objectToCloudFormation');
    }
    switch (type.primitive) {
      case PrimitiveType.String:
        return this.core.prop('stringToCloudFormation');
      case PrimitiveType.Date:
        return this.core.prop('dateToCloudFormation');
      case PrimitiveType.Number:
        return this.core.prop('numberToCloudFormation');
      case PrimitiveType.Json:
        return this.core.prop('objectToCloudFormation');
      case PrimitiveType.Any:
        return this.core.prop('objectToCloudFormation');
      case PrimitiveType.Boolean:
        return this.core.prop('booleanToCloudFormation');
    }

    if (type.arrayOfType) {
      return this.core.invoke('listMapper', this.typeMapper(type.arrayOfType));
    }

    if (type.mapOfType) {
      return this.core.invoke('hashMapper', this.typeMapper(type.mapOfType));
    }

    if (type.declaration) {
      // We're just going to assume this thing lives in the same scope
      // FIXME: This should have been an object reference
      return expr.sym(mapperNameFromType(type.declaration));
    }

    return expr.sym(`/* @todo typeMapper(${type}) */`);
  }
}
