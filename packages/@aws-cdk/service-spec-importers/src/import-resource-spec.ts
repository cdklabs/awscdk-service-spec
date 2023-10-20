import { PropertyType, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec-types';
import { ref } from '@cdklabs/tskb';
import { PropertyBagBuilder, ResourceBuilder, SpecBuilder } from './resource-builder';
import { CloudFormationResourceSpecification, SAMResourceSpecification, resourcespec } from './types';

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
  protected readonly resourceBuilder: ResourceBuilder;
  private renderingUnusedTypes = false;

  protected constructor(
    protected readonly db: SpecDatabase,
    protected readonly specification: Spec,
    protected readonly resourceName: string,
  ) {
    this.renderingUnusedTypes = true; // FIXME: DON'T COMMIT, just for testing

    const specBuilder = new SpecBuilder(db);
    this.resourceBuilder = specBuilder.resourceBuilder(resourceName, {
      description: specification.ResourceTypes[resourceName].Documentation,
    });

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

  public importResource() {
    const resourceSpec = this.specification.ResourceTypes[this.resourceName];
    this.recurseProperties(resourceSpec.Properties ?? {}, this.resourceBuilder);
    this.handleAttributes(resourceSpec.Attributes ?? {});

    this.handleUnusedTypes();
  }

  /**
   * Return the type reference for a named type
   *
   * This usually identifies a type definition (which is a record with
   * properties), but sometimes it's just a named alias for a type like
   * `Array<Record>`.
   */
  protected namedType(typeName: string): PropertyType {
    const typeKey = `${this.resourceName}.${typeName}`;
    const typeSpec = this.specification.PropertyTypes[typeKey];
    if (!typeSpec) {
      throw new Error(`No such type: ${typeKey}`);
    }

    if (resourcespec.isPropType(typeSpec)) {
      return this.typeDefinition(typeName, typeSpec);
    } else {
      // Otherwise treat like an alias
      return this.deriveType(typeSpec);
    }
  }

  private typeDefinition(typeName: string, spec: AnyPropertyType): PropertyType {
    const { typeDefinitionBuilder, freshInDb, freshInSession } = this.resourceBuilder.typeDefinitionBuilder(typeName);

    if (freshInDb && this.renderingUnusedTypes) {
      typeDefinitionBuilder.typeDef.mustRenderForBwCompat = true;
    }

    if (freshInSession) {
      // Avoid recursion
      this.recurseProperties(spec.Properties ?? {}, typeDefinitionBuilder);
    }

    return { type: 'ref', reference: ref(typeDefinitionBuilder.typeDef) };
  }

  protected recurseProperties(
    source: Record<string, resourcespec.Property | resourcespec.SAMProperty>,
    into: PropertyBagBuilder,
  ) {
    for (const [name, propSpec] of Object.entries(source)) {
      const type = this.deriveType(propSpec);

      into.setProperty(name, {
        type,
        required: propSpec.Required,
      });
    }
  }

  protected handleAttributes(source: Record<string, resourcespec.Attribute>) {
    for (const [name, attrSpec] of Object.entries(source)) {
      const type = this.deriveType(attrSpec);
      this.resourceBuilder.setAttribute(name, { type });
    }
  }

  /**
   * Go over all type definitions we haven't used yet by recursing through all
   * properties, and emit them with a special flag
   */
  private handleUnusedTypes() {
    this.renderingUnusedTypes = true;
    const typePrefix = `${this.resourceName}.`;
    for (const fullName of Object.keys(this.specification.PropertyTypes ?? {}).filter((name) =>
      name.startsWith(typePrefix),
    )) {
      const typeName = fullName.substring(typePrefix.length);
      // Execute this for its side effect
      void this.namedType(typeName);
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
  public static importTypes(options: ImportResourceSpecOptions) {
    for (const resourceName of Object.keys(options.specification.ResourceTypes)) {
      new ResourceSpecImporter(resourceName, options).importResource();
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
          return self.namedType(type);
      }

      switch (primitiveType) {
        case 'String':
          return { type: 'string' };
        case 'Long':
          return { type: 'integer' };
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
  public static importTypes(options: ImportSAMSpecOptions) {
    for (const resourceName of Object.keys(options.specification.ResourceTypes)) {
      new SAMSpecImporter(resourceName, options).importResource();
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
          return self.namedType(type);
      }
    }

    function primitiveType(prim: string): PropertyType {
      switch (prim) {
        case 'String':
          return { type: 'string' };
        case 'Long':
          return { type: 'integer' };
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
