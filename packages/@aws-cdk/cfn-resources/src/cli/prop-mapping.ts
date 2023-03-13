import { expr, IsNotNullish, Type, UNDEFINED } from '@cdklabs/typewriter';
import { Expression, ObjectPropertyAccess } from '@cdklabs/typewriter';
import { PrimitiveType } from '@jsii/spec';
import { CDK_CORE } from './cdk/cdk';
import { cfnParserNameFromType, cfnProducerNameFromType } from './naming/conventions';

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

  public produceProperty(cfnName: string, struct: Expression): Expression {
    const value = new ObjectPropertyAccess(struct, this.cfn2ts[cfnName]);
    const type = this.cfnTypes[cfnName];
    if (!type) {
      throw new Error(`No type for ${cfnName}`);
    }

    return this.typeProducer(type).produce.call(value);
  }

  public parseProperty(cfnName: string, propsObj: Expression): Expression {
    const value = new ObjectPropertyAccess(propsObj, cfnName);
    const type = this.cfnTypes[cfnName];
    if (!type) {
      throw new Error(`No type for ${cfnName}`);
    }

    return expr.cond(new IsNotNullish(value)).then(this.typeProducer(type).parse.call(value)).else(UNDEFINED);
  }

  private typeProducer(type: Type): Mapper {
    if (type.isAny) {
      return {
        produce: CDK_CORE.objectToCloudFormation,
        parse: CDK_CORE.helpers.FromCloudFormation.getAny,
      };
    }
    switch (type.primitive) {
      case PrimitiveType.String:
        return {
          produce: CDK_CORE.stringToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getString,
        };
      case PrimitiveType.Date:
        return {
          produce: CDK_CORE.dateToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getDate,
        };
      case PrimitiveType.Number:
        return {
          produce: CDK_CORE.numberToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getNumber,
        };
      case PrimitiveType.Json:
        return {
          produce: CDK_CORE.objectToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getAny,
        };
      case PrimitiveType.Any:
        return {
          produce: CDK_CORE.objectToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getAny,
        };
      case PrimitiveType.Boolean:
        return {
          produce: CDK_CORE.booleanToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getBoolean,
        };
    }

    if (type.arrayOfType) {
      return {
        produce: CDK_CORE.listMapper(this.typeProducer(type.arrayOfType).produce),
        parse: CDK_CORE.helpers.FromCloudFormation.getArray(this.typeProducer(type.arrayOfType).parse),
      };
    }

    if (type.mapOfType) {
      return {
        produce: CDK_CORE.hashMapper(this.typeProducer(type.mapOfType).produce),
        parse: CDK_CORE.helpers.FromCloudFormation.getMap(this.typeProducer(type.mapOfType).parse),
      };
    }

    if (type.symbol) {
      return {
        produce: expr.sym(type.symbol.changeName(cfnProducerNameFromType)),
        parse: expr.sym(type.symbol.changeName(cfnParserNameFromType)),
      };
    }

    return {
      produce: expr.ident(`/* @todo typeMapper(${type}) */`),
      parse: expr.ident(`/* @todo typeMapper(${type}) */`),
    };
  }
}

interface Mapper {
  readonly produce: Expression;
  readonly parse: Expression;
}
