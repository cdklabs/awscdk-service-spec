import {
  Attribute,
  Deprecation,
  Property,
  Resource,
  ResourceProperties,
  RichPropertyType,
  SpecDatabase,
  TagInformation,
  TypeDefinition,
} from '@aws-cdk/service-spec-types';

/**
 * Adds resources and types to a spec database
 */
export class SpecBuilder {
  constructor(public readonly db: SpecDatabase) {}

  public resourceBuilder(typeName: string, options: { description?: string; region?: string } = {}) {
    const existing = this.db.lookup('resource', 'cloudFormationType', 'equals', typeName);

    if (existing.length > 0) {
      const resource = existing.only();
      if (!resource.documentation && options.description) {
        resource.documentation = options.description;
      }
      return new ResourceBuilder(this.db, resource);
    }

    const resource = this.db.allocate('resource', {
      cloudFormationType: typeName,
      documentation: options.description,
      name: last(typeName.split('::')),
      attributes: {},
      properties: {},
    });

    const service = this.allocateService(typeName);
    this.db.link('hasResource', service, resource);

    if (options.region) {
      const region = this.allocateRegion(options.region);
      this.db.link('regionHasResource', region, resource);
      this.db.link('regionHasService', region, service);
    }

    return new ResourceBuilder(this.db, resource);
  }

  private allocateService(resourceTypeName: string, resourceTypeNameSeparator = '::') {
    const parts = resourceTypeName.split(resourceTypeNameSeparator);

    const name = `${parts[0]}-${parts[1]}`.toLowerCase();
    const capitalized = parts[1];
    const shortName = capitalized.toLowerCase();
    const cloudFormationNamespace = `${parts[0]}${resourceTypeNameSeparator}${parts[1]}`;

    const existing = this.db.lookup('service', 'name', 'equals', name);

    if (existing.length !== 0) {
      return existing.only();
    }

    const service = this.db.allocate('service', {
      name,
      shortName,
      capitalized,
      cloudFormationNamespace,
    });

    return service;
  }

  private allocateRegion(regionName: string) {
    const existing = this.db.lookup('region', 'name', 'equals', regionName);
    if (existing.length > 0) {
      return existing.only();
    }

    return this.db.allocate('region', {
      name: regionName,
    });
  }
}

export class PropertyBagBuilder {
  constructor(private readonly _propertyBag: { properties: ResourceProperties }) {}

  public setProperty(name: string, prop: Property) {
    if (this._propertyBag.properties[name]) {
      this.mergeProperties(this._propertyBag.properties[name], prop);
    } else {
      this._propertyBag.properties[name] = prop;
    }
  }

  protected mergeProperties(prop: Property, updates: Property) {
    // FIXME: Must consider incompatible type updates
    Object.assign(prop, updates);
  }
}

export class ResourceBuilder extends PropertyBagBuilder {
  private typeDefinitions = new Map<string, TypeDefinitionBuilder>();

  constructor(public readonly db: SpecDatabase, public readonly resource: Resource) {
    super(resource);
  }

  public setAttribute(name: string, attr: Attribute) {
    if (this.resource.attributes[name]) {
      this.mergeProperties(this.resource.attributes[name], attr);
    } else {
      this.resource.attributes[name] = attr;
    }
  }

  /**
   * Mark the given properties as attributes instead
   *
   * These can be simple property names ('Foo', 'Bar'), but they can also be compound
   * property names ('Foo/Bar').
   */
  public markAsAttributes(...props: string[]) {
    for (const propName of props) {
      if (this.resource.properties[propName]) {
        this.resource.attributes[propName] = this.resource.properties[propName];
        delete this.resource.properties[propName];
        continue;
      }

      // The property might also exist with a name that has any `.` stripped.
      const sanitizedName = attributeNameToPropertyName(propName);
      if (this.resource.properties[sanitizedName]) {
        this.resource.attributes[sanitizedName] = this.resource.properties[sanitizedName];
        delete this.resource.properties[sanitizedName];
        continue;
      }

      // Otherwise assume the name represents a compound attribute
      // In the Registry spec, compound attributes will look like 'Container/Prop'.
      // In the legacy spec they will look like 'Container.Prop'.
      // Some Registry resources incorrectly use '.' as well.
      // We accept both here.
      //
      // We don't remove the top-level properties from the resource, we just add the attributes.
      const prop = this.propertyDeep(...propName.split(/[\.\/]/));
      if (prop) {
        this.resource.attributes[sanitizedName] = prop;
      }
    }
  }

  public markDeprecatedProperties(...props: string[]) {
    for (const propName of props) {
      (this.resource.properties[propName] ?? {}).deprecated = Deprecation.WARN;
    }
  }

  public setTagInformation(tagInfo: TagInformation) {
    this.resource.tagInformation = tagInfo;
  }

  public propertyDeep(...fieldPath: string[]): Property | undefined {
    let current: Resource | TypeDefinition = this.resource;
    for (let i = 0; i < fieldPath.length - 1; i++) {
      const prop = current.properties[fieldPath[i]];
      if (!prop) {
        throw new Error(
          `${this.resource.cloudFormationType}: no definition for: ${fieldPath.slice(0, i + 1).join('/')}`,
        );
      }
      if (prop.type.type !== 'ref') {
        throw new Error(
          `${this.resource.cloudFormationType}: expected reference for ${fieldPath.join('/')} but ${fieldPath
            .slice(0, i + 1)
            .join('/')} is a ${new RichPropertyType(prop.type).stringify(this.db)}`,
        );
      }
      current = this.db.get('typeDefinition', prop.type.reference);
    }

    return current.properties[fieldPath[fieldPath.length - 1]];
  }

  public typeDefinitionBuilder(typeName: string, description?: string) {
    const existing = this.typeDefinitions.get(typeName);

    if (existing) {
      if (!existing.typeDef.documentation && description) {
        existing.typeDef.documentation = description;
      }
      return { typeDefinitionBuilder: existing, fresh: false };
    }

    const typeDef = this.db.allocate('typeDefinition', {
      name: typeName,
      documentation: description,
      properties: {},
    });
    this.db.link('usesType', this.resource, typeDef);

    const builder = new TypeDefinitionBuilder(this.db, typeDef);
    this.typeDefinitions.set(typeName, builder);
    return { typeDefinitionBuilder: builder, fresh: true };
  }
}

export class TypeDefinitionBuilder extends PropertyBagBuilder {
  constructor(public readonly db: SpecDatabase, public readonly typeDef: TypeDefinition) {
    super(typeDef);
  }
}

function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}

/**
 * Turns a compound name into its property equivalent
 * Compliance.Type -> ComplianceType
 */
function attributeNameToPropertyName(name: string) {
  return name.split('.').join('');
}
