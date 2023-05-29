import {
  Attribute,
  PropertyType,
  Resource,
  ResourceProperties,
  SpecDatabase,
  TypeDefinition,
} from '@aws-cdk/service-spec';
import { CloudFormationResourceSpecification, resourcespec } from '@aws-cdk/service-spec-sources';
import { ref } from '@cdklabs/tskb';
import { readCloudFormationRegistryServiceFromResource } from './import-cloudformation-registry';

export interface ImportResourceSpecOptions {
  readonly db: SpecDatabase;
  readonly specification: CloudFormationResourceSpecification;
}

/**
 * Load the (legacy) resource specification into the database
 */
export class ResourceSpecImporter {
  public static import(options: ImportResourceSpecOptions) {
    for (const resourceName of Object.keys(options.specification.ResourceTypes)) {
      new ResourceSpecImporter(resourceName, options).importResource();
    }
  }

  private readonly db: SpecDatabase;
  private readonly specification: CloudFormationResourceSpecification;
  private readonly typeDefCache = new Map<string, TypeDefinition>();
  private readonly resourceName: string;

  private constructor(resourceName: string, options: ImportResourceSpecOptions) {
    this.resourceName = resourceName;
    this.db = options.db;
    this.specification = options.specification;
  }

  private importResource() {
    const service = readCloudFormationRegistryServiceFromResource({
      db: this.db,
      resource: { typeName: this.resourceName },
    });

    const res = this.db.allocate('resource', {
      cloudFormationType: this.resourceName,
      name: last(this.resourceName.split('::')),
      attributes: {},
      properties: {},
    });

    this.db.link('hasResource', service, res);

    const resourceSpec = this.specification.ResourceTypes[this.resourceName];

    this.allocateTypeDefs(res);
    this.handleProperties(resourceSpec.Properties ?? {}, res.properties);

    for (const { entity: typeDef } of this.db.follow('usesType', res)) {
      const propType = this.specification.PropertyTypes[`${this.resourceName}.${typeDef.name}`];
      if (resourcespec.isPropType(propType)) {
        this.handleProperties(propType.Properties ?? {}, typeDef.properties);
      }
    }

    this.handleAttributes(resourceSpec.Attributes ?? {}, res.attributes);
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

  private handleAttributes(source: Record<string, resourcespec.Attribute>, into: Record<string, Attribute>) {
    for (const [name, attrSpec] of Object.entries(source)) {
      into[name] = {
        type: this.deriveType(attrSpec),
      };
    }
  }

  private deriveType(spec: resourcespec.Property | resourcespec.Attribute): PropertyType {
    const self = this;
    return derive(spec.Type, spec.PrimitiveType);

    function derive(type?: string, primitiveType?: string): PropertyType {
      switch (type) {
        case 'Tag':
          return { type: 'tag' };
        case 'Tags':
          return { type: 'array', element: { type: 'tag' } };
        case 'List':
          return { type: 'array', element: derive(spec.ItemType, spec.PrimitiveItemType) };
        case 'Map':
          return { type: 'map', element: derive(spec.ItemType, spec.PrimitiveItemType) };
        case undefined:
          // Fallthrough for PrimitiveType
          break;
        default:
          const typeDef = self.typeDefCache.get(type);
          if (!typeDef) {
            throw new Error(`Unrecognized type: ${self.resourceName}.${type}`);
          }
          return { type: 'ref', reference: ref(typeDef) };
      }

      switch (primitiveType) {
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
      }

      throw new Error(`Unparseable type: ${JSON.stringify(spec)}`);
    }
  }
}

function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}
