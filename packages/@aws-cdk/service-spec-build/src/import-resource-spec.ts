import {
  CloudFormationResourceSpecification,
  SAMResourceSpecification,
  resourcespec,
} from '@aws-cdk/service-spec-sources';
import {
  Attribute,
  PropertyType,
  Resource,
  ResourceProperties,
  RichAttribute,
  RichProperty,
  RichSpecDatabase,
  SpecDatabase,
  TypeDefinition,
} from '@aws-cdk/service-spec-types';
import { ref } from '@cdklabs/tskb';

//////////////////////////////////////////////////////////////////////

type AnyPropertyType = resourcespec.PropertyType | resourcespec.SAMPropertyType;
type AnyTypeAlias = resourcespec.SingleTypeAlias | resourcespec.SAMSingleTypeAlias;
type AnyTypeDefinition = resourcespec.CfnTypeDefinition | resourcespec.SAMTypeDefinition;

/**
 * Base importer for CFN and SAM (legacy) resource specs
 *
 * PropertyType definitions are either object types, or type aliases to something like `Array<Something>`.
 */
abstract class ResourceSpecImporterBase<Spec extends CloudFormationResourceSpecification | SAMResourceSpecification> {
  protected readonly typeDefs = new Map<string, TypeDefinition>();
  protected readonly thisResourcePropTypes = new Map<string, AnyPropertyType>();
  protected readonly thisPropTypeAliases = new Map<string, AnyTypeAlias>();

  protected constructor(
    protected readonly db: SpecDatabase,
    protected readonly specification: Spec,
    protected readonly resourceName: string,
  ) {
    for (const [fqn, spec] of Object.entries(this.specification.PropertyTypes)) {
      const [typeResourceName, typeDefName] = fqn.split('.');
      if (this.resourceName !== typeResourceName) {
        continue;
      }
      if (resourcespec.isPropType(spec)) {
        this.thisResourcePropTypes.set(typeDefName, spec);
      } else {
        this.thisPropTypeAliases.set(typeDefName, spec);
      }
    }
  }

  protected abstract deriveType(spec: AnyTypeDefinition): PropertyType;

  public importResourceOldTypes() {
    const res = this.db.lookup('resource', 'cloudFormationType', 'equals', this.resourceName);
    if (res.length === 0) {
      console.log(`Cannot patch ${this.resourceName}: not in CloudFormation Schema`);
      return;
    }

    this.doTypeDefinitions(res.only());
    this.doResource(res.only());
  }

  protected doTypeDefinitions(res: Resource) {
    this.allocateMissingTypeDefs(res);

    for (const [propTypeName, propType] of this.thisResourcePropTypes.entries()) {
      const typeDef = this.typeDefs.get(propTypeName);
      if (!typeDef) {
        throw new Error(`Missing typeDef for ${propTypeName}`);
      }
      this.addOrEnrichProperties(propType.Properties ?? {}, typeDef.properties);
    }
  }

  protected doResource(res: Resource) {
    const resourceSpec = this.specification.ResourceTypes[this.resourceName];
    this.addOrEnrichProperties(resourceSpec.Properties ?? {}, res.properties);
    this.addOrEnrichAttributes(resourceSpec.Attributes ?? {}, res.attributes);
  }

  protected allocateMissingTypeDefs(resource: Resource) {
    for (const td of new RichSpecDatabase(this.db).resourceTypeDefs(this.resourceName)) {
      this.typeDefs.set(td.name, td);
    }

    for (const [typeDefName, _] of this.thisResourcePropTypes.entries()) {
      const existing = this.typeDefs.get(typeDefName);
      if (existing) {
        existing.mustRenderForBwCompat = true;
        continue;
      }

      const typeDef = this.db.allocate('typeDefinition', {
        name: typeDefName,
        properties: {},
        mustRenderForBwCompat: true,
      });

      this.db.link('usesType', resource, typeDef);
      this.typeDefs.set(typeDefName, typeDef);
    }
  }

  protected addOrEnrichProperties(
    source: Record<string, resourcespec.Property | resourcespec.SAMProperty>,
    into: ResourceProperties,
  ) {
    for (const [name, propSpec] of Object.entries(source)) {
      const existingProp = into[name];
      const type = this.deriveType(propSpec);

      if (!existingProp) {
        // A fully missing property
        into[name] = {
          type,
          required: propSpec.Required,
        };
      } else {
        // Old-typed property
        new RichProperty(existingProp).addPreviousType(type);
      }
    }
  }

  protected addOrEnrichAttributes(source: Record<string, resourcespec.Attribute>, into: Record<string, Attribute>) {
    for (const [name, attrSpec] of Object.entries(source)) {
      const existingAttr = into[name];
      const type = this.deriveType(attrSpec);

      if (!existingAttr) {
        // Fully missing attr
        into[name] = { type };
      } else {
        // Old-typed attr
        new RichAttribute(existingAttr).addPreviousType(type);
      }
    }
  }
}

//////////////////////////////////////////////////////////////////////

export interface ImportResourceSpecOptions {
  readonly db: SpecDatabase;
  readonly specification: CloudFormationResourceSpecification;
}

/**
 * Load the (legacy) resource specification into the database
 *
 * The types get added to the "previous types" of properties.
 */
export class ResourceSpecImporter extends ResourceSpecImporterBase<CloudFormationResourceSpecification> {
  public static importOldTypes(options: ImportResourceSpecOptions) {
    for (const resourceName of Object.keys(options.specification.ResourceTypes)) {
      new ResourceSpecImporter(resourceName, options).importResourceOldTypes();
    }
  }

  private constructor(resourceName: string, options: ImportResourceSpecOptions) {
    super(options.db, options.specification, resourceName);
  }

  protected deriveType(spec: resourcespec.CfnTypeDefinition): PropertyType {
    const self = this;
    return derive(spec.Type, spec.PrimitiveType);

    function derive(type?: string, primitiveType?: string): PropertyType {
      switch (type) {
        case 'Tag':
          return { type: 'tag' };
        case 'List':
          return { type: 'array', element: derive(spec.ItemType, spec.PrimitiveItemType) };
        case 'Map':
          return { type: 'map', element: derive(spec.ItemType, spec.PrimitiveItemType) };
        case undefined:
          // Fallthrough for PrimitiveType
          break;
        default:
          // Either an alias or a PropType
          const alias = self.thisPropTypeAliases.get(type);
          if (alias) {
            return self.deriveType(alias);
          }

          const typeDef = self.typeDefs.get(type);
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

//////////////////////////////////////////////////////////////////////

export interface ImportSAMSpecOptions {
  readonly db: SpecDatabase;
  readonly specification: SAMResourceSpecification;
}

/**
 * Load the (legacy) resource specification into the database
 */
export class SAMSpecImporter extends ResourceSpecImporterBase<SAMResourceSpecification> {
  public static importOldTypes(options: ImportSAMSpecOptions) {
    for (const resourceName of Object.keys(options.specification.ResourceTypes)) {
      new SAMSpecImporter(resourceName, options).importResourceOldTypes();
    }
  }

  private constructor(resourceName: string, options: ImportSAMSpecOptions) {
    super(options.db, options.specification, resourceName);
  }

  protected deriveType(spec: resourcespec.SAMTypeDefinition): PropertyType {
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
        case 'List':
          return { type: 'array', element: deriveItemTypes() };
        case 'Map':
          return { type: 'map', element: deriveItemTypes() };
        case 'Json':
          // Json should be a primitive type, but occasionally occurs as a Type
          return { type: 'json' };
        default:
          // Either an alias or a PropType
          const alias = self.thisPropTypeAliases.get(type);
          if (alias) {
            return self.deriveType(alias);
          }

          const typeDef = self.typeDefs.get(type);
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
