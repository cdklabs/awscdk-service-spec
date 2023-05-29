import {
  PropertyType,
  Resource,
  ResourceProperties,
  Service,
  SpecDatabase,
  TypeDefinition,
} from '@aws-cdk/service-spec';
import { SAMResourceSpecification, resourcespec } from '@aws-cdk/service-spec-sources';
import { ref } from '@cdklabs/tskb';

export interface ImportSAMSpecOptions {
  readonly db: SpecDatabase;
  readonly specification: SAMResourceSpecification;
}

/**
 * Load the (legacy) resource specification into the database
 */
export class SAMSpecImporter {
  public static import(options: ImportSAMSpecOptions) {
    for (const resourceName of Object.keys(options.specification.ResourceTypes)) {
      new SAMSpecImporter(resourceName, options).importResource();
    }
  }

  private readonly db: SpecDatabase;
  private readonly specification: SAMResourceSpecification;
  private readonly typeDefCache = new Map<string, TypeDefinition>();
  private readonly resourceName: string;

  private constructor(resourceName: string, options: ImportSAMSpecOptions) {
    this.resourceName = resourceName;
    this.db = options.db;
    this.specification = options.specification;
  }

  private importResource() {
    const service = this.createSamService();

    const res = this.db.allocate('resource', {
      cloudFormationType: this.resourceName,
      name: last(this.resourceName.split('::')),
      attributes: {},
      properties: {},
    });

    this.db.link('hasResource', service, res);

    this.allocateTypeDefs(res);
    this.handleProperties(this.specification.ResourceTypes[this.resourceName].Properties ?? {}, res.properties);

    for (const { entity: typeDef } of this.db.follow('usesType', res)) {
      const propType = this.specification.PropertyTypes[`${this.resourceName}.${typeDef.name}`];
      if (resourcespec.isPropType(propType)) {
        this.handleProperties(propType.Properties ?? {}, typeDef.properties);
      }
    }
  }

  private createSamService(): Service {
    return this.db.findOrAllocate('service', 'name', 'equals', {
      name: 'aws-sam',
      shortName: 'sam',
      capitalized: 'SAM',
      cloudFormationNamespace: 'AWS::Serverless',
    });
  }

  private allocateTypeDefs(resource: Resource) {
    for (const typeDefFqn of Object.keys(this.specification.PropertyTypes)) {
      const [typeResourceName, typeDefName] = typeDefFqn.split('.');
      if (this.resourceName !== typeResourceName) {
        continue;
      }

      const typeDef = this.db.allocate('typeDefinition', {
        name: typeDefName,
        properties: {},
      });

      this.db.link('usesType', resource, typeDef);
      this.typeDefCache.set(typeDefName, typeDef);
    }
  }

  private handleProperties(source: Record<string, resourcespec.Property>, into: ResourceProperties) {
    for (const [name, propSpec] of Object.entries(source)) {
      into[name] = {
        type: this.deriveType(propSpec),
        required: propSpec.Required,
      };
    }
  }

  private deriveType(spec: resourcespec.SAMProperty): PropertyType {
    const self = this;

    return maybeUnion([
      ...(spec.PrimitiveTypes ?? []).map(primitiveType),
      ...(spec.Type ? [namedType(spec.Type)] : []),
      ...(spec.PrimitiveType ? [primitiveType(spec.PrimitiveType)] : []),
      ...(spec.Types ?? []).map(namedType),
    ]);

    function deriveItemTypes() {
      return maybeUnion([
        ...(spec.PrimitiveItemType ? [primitiveType(spec.PrimitiveItemType)] : []),
        ...(spec.ItemType ? [namedType(spec.ItemType)] : []),
        ...(spec.PrimitiveItemTypes ?? []).map(primitiveType),
        ...(spec.ItemTypes ?? []).map(namedType),
        ...(spec.InclusivePrimitiveItemTypes ?? []).map(primitiveType),
        ...(spec.InclusiveItemTypes ?? []).map(namedType),
      ]);
    }

    function namedType(type: string): PropertyType {
      switch (type) {
        case 'Tag':
          return { type: 'tag' };
        case 'Tags':
          return { type: 'array', element: { type: 'tag' } };
        case 'List':
          return { type: 'array', element: deriveItemTypes() };
        case 'Map':
          return { type: 'map', element: deriveItemTypes() };
        case 'Json':
          // Json should be a primitive type, but occasionally occurs as a Type
          return { type: 'json' };
        default:
          const typeDef = self.typeDefCache.get(type);
          if (!typeDef) {
            throw new Error(`Unrecognized type: ${self.resourceName}.${type}`);
          }
          return { type: 'ref', reference: ref(typeDef) };
      }
    }

    function primitiveType(prim: string): PropertyType {
      switch (prim) {
        case 'String':
          return { type: 'string' };
        case 'Long':
          return { type: 'number' };
        case 'Integer':
          return { type: 'integer' };
        case 'Double':
          return { type: 'number' };
        case 'Boolean':
          return { type: 'boolean' };
        case 'Timestamp':
          return { type: 'date-time' };
        case 'Json':
          return { type: 'json' };
        case 'Map':
          // Map occurs as an item sometimes, interpret as Json
          return { type: 'json' };
      }
      throw new Error(`Unknown primitive type: ${prim} in resource ${self.resourceName}`);
    }
  }
}

function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}

function maybeUnion(types: PropertyType[]): PropertyType {
  switch (types.length) {
    case 0:
      throw new Error('Oops, no types');
    case 1:
      return types[0];
    default:
      return { type: 'union', types };
  }
}
