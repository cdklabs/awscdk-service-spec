import { SpecDatabase, PropertyType, Resource, TypeDefinition, Attribute, Property } from '@aws-cdk/service-spec';
import {
  ClassType,
  Expression,
  Module,
  PrimitiveType,
  RichScope,
  StructType,
  Type,
  TypeDeclaration,
} from '@cdklabs/typewriter';
import { CDK_CORE } from './cdk';
import { TypeDefinitionTypeBuilder } from './typedefinition-type-builder';
import { structNameFromTypeDefinition } from '../naming/conventions';

export interface TypeConverterOptions {
  readonly db: SpecDatabase;
  readonly resource: Resource;
  readonly resourceClass: ClassType;
  readonly typeDefinitionConverter: TypeDefinitionConverter;
}

/**
 * Build a type for a TypeDefinition
 *
 * Building happens in two stages to deal with potential recursive type references.
 */
export type TypeDefinitionConverter = (
  typeDef: TypeDefinition,
  converter: TypeConverter,
) => { structType: StructType; build: () => void };

export interface TypeConverterForResourceOptions extends Omit<TypeConverterOptions, 'typeDefinitionConverter'> {
  readonly resource: Resource;
  readonly resourceClass: ClassType;
}

/**
 * Converts types from the spec model to typewriter
 *
 * Converts types in the scope of a single resource.
 */
export class TypeConverter {
  /**
   * Make a type converter for a resource that uses a default TypeDefinition builder for this resource scope
   */
  public static forResource(opts: TypeConverterForResourceOptions) {
    return new TypeConverter({
      ...opts,
      typeDefinitionConverter: (typeDefinition, converter) => {
        // Defensive programming: we have some current issues in the database
        // that would lead to duplicate definitions. Short-circuit that by checking if the
        // type already exists and return that instead.
        const existing = new RichScope(opts.resourceClass).tryFindTypeByName(
          structNameFromTypeDefinition(typeDefinition),
        );
        if (existing) {
          return {
            structType: existing as StructType,
            build: () => {},
          };
        }

        const builder = new TypeDefinitionTypeBuilder({
          resource: opts.resource,
          resourceClass: opts.resourceClass,
          converter,
          typeDefinition,
        });

        return {
          structType: builder.structType,
          build: () => builder.makeMembers(),
        };
      },
    });
  }

  public readonly db: SpecDatabase;
  public readonly module: Module;
  private readonly typeDefinitionConverter: TypeDefinitionConverter;
  private readonly typeDefCache = new Map<TypeDefinition, StructType>();

  constructor(options: TypeConverterOptions) {
    this.db = options.db;
    this.typeDefinitionConverter = options.typeDefinitionConverter;
    this.module = Module.of(options.resourceClass);
  }

  /**
   * Return the appropriate typewriter type for a servicespec type
   */
  public typeFromProperty(property: Property): Type {
    const typeHistory = [...(property.previousTypes ?? []), property.type];
    // For backwards compatibility reasons we always have to use the original type
    return this.typeFromSpecType(typeHistory[0]);
  }

  public typeFromSpecType(type: PropertyType): Type {
    switch (type?.type) {
      case 'string':
        return Type.STRING;
      case 'number':
      case 'integer':
        return Type.NUMBER;
      case 'boolean':
        return Type.BOOLEAN;
      case 'date-time':
        return Type.DATE_TIME;
      case 'array':
        return Type.arrayOf(this.typeFromSpecType(type.element));
      case 'map':
        return Type.mapOf(this.typeFromSpecType(type.element));
      case 'ref':
        const ref = this.db.get('typeDefinition', type.reference.$ref);
        return this.obtainTypeDefinitionType(ref).type;
      case 'union':
        return Type.unionOf(...type.types.map((t) => this.typeFromSpecType(t)));
      case 'json':
      default:
        return Type.ANY;
    }
  }

  private obtainTypeDefinitionType(ref: TypeDefinition): TypeDeclaration {
    const existing = this.typeDefCache.get(ref);
    if (existing) {
      return existing;
    }

    const ret = this.typeDefinitionConverter(ref, this);
    // First stage: hold on to this type so we can resolve recursive references eagerly
    this.typeDefCache.set(ref, ret.structType);
    // Finish building it
    ret.build();
    return ret.structType;
  }

  /**
   * For a given type, returned a resolvable version of the type
   *
   * We do this by checking if the type can be represented directly by a Token (e.g. `Token.asList(value))`).
   * If not we recursively apply a type union with `cdk.IResolvable` to the type.
   */
  public makeTypeResolvable(type: Type): Type {
    if (isTokenizableType(type) || isTagType(type)) {
      return type;
    }

    if (type.primitive) {
      return Type.unionOf(type, CDK_CORE.IResolvable);
    }

    if (type.arrayOfType) {
      return Type.unionOf(Type.arrayOf(this.makeTypeResolvable(type.arrayOfType)), CDK_CORE.IResolvable);
    }

    if (type.mapOfType) {
      return Type.unionOf(Type.mapOf(this.makeTypeResolvable(type.mapOfType)), CDK_CORE.IResolvable);
    }

    if (type.unionOfTypes) {
      return Type.unionOf(...type.unionOfTypes, CDK_CORE.IResolvable);
    }

    return Type.unionOf(type, CDK_CORE.IResolvable);
  }
}

export interface MappedProperty {
  readonly name: string;
  readonly memberOptional: boolean;
  readonly validateRequired: boolean;
  readonly memberImmutable: boolean;

  /** The type of this property on the props type */
  readonly propsType: Type;
  /** The type of this property on the class */
  readonly memberType: Type;
  /** Given the props value, produce the member value */
  readonly initializer: (props: Expression) => Expression;

  /**
   * Lowercase property name(s) and expression(s) to render to get this property into CFN
   *
   * We will do a separate conversion of the casing of the props object, so don't do that here.
   */
  readonly cfnValueToRender: Record<string, Expression>;
  readonly docsSummary?: string;
}

export interface MappedAttribute {
  /** The name of the CloudFormation attribute */
  attrName: string;
  attr: Attribute;
  /** The name of the property used in generated code */
  name: string;
  type: Type;
  tokenizer: Expression;
}

/**
 * Is the given type a builtin tag
 */
function isTagType(type: Type): boolean {
  return type.fqn === CDK_CORE.CfnTag.fqn || type.arrayOfType?.fqn === CDK_CORE.CfnTag.fqn;
}

/**
 * Only string, string[] and number can be represented by a token
 */
function isTokenizableType(type: Type): boolean {
  return (
    type.primitive === PrimitiveType.String ||
    type.arrayOfType?.primitive === PrimitiveType.String ||
    type.primitive === PrimitiveType.Number
  );
}
