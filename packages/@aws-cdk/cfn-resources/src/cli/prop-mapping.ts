import { expr, Type } from '@cdklabs/typewriter';
import { Expression, ObjectPropertyAccess } from '@cdklabs/typewriter';
import { PrimitiveType } from '@jsii/spec';
import { CDK_CORE } from './cdk/cdk';

/**
 * Retain a list of properties with their CloudFormation and TypeScript names
 */
export class PropMapping {
  private readonly cfn2ts: Record<string, string> = {};
  private readonly cfnTypes: Record<string, Type> = {};

  constructor() {}

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

  public mapProp(cfnName: string, struct: Expression): Expression {
    const value = new ObjectPropertyAccess(struct, this.cfn2ts[cfnName]);
    const type = this.cfnTypes[cfnName];
    if (!type) {
      throw new Error(`No type for ${cfnName}`);
    }

    return this.typeMapper(type).call(value);
  }

  private typeMapper(type: Type): Expression {
    if (type.isAny) {
      return CDK_CORE.objectToCloudFormation;
    }
    switch (type.primitive) {
      case PrimitiveType.String:
        return CDK_CORE.stringToCloudFormation;
      case PrimitiveType.Date:
        return CDK_CORE.dateToCloudFormation;
      case PrimitiveType.Number:
        return CDK_CORE.numberToCloudFormation;
      case PrimitiveType.Json:
        return CDK_CORE.objectToCloudFormation;
      case PrimitiveType.Any:
        return CDK_CORE.objectToCloudFormation;
      case PrimitiveType.Boolean:
        return CDK_CORE.booleanToCloudFormation;
    }

    if (type.arrayOfType) {
      return CDK_CORE.listMapper(this.typeMapper(type.arrayOfType));
    }

    if (type.mapOfType) {
      return CDK_CORE.hashMapper(this.typeMapper(type.mapOfType));
    }

    if (type.symbol) {
      return expr.sym(type.symbol);
    }

    return expr.ident(`/* @todo typeMapper(${type}) */`);
  }
}
