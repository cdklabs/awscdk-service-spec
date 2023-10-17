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
      this.mergeProperty(this._propertyBag.properties[name], prop);
    } else {
      this._propertyBag.properties[name] = prop;
    }
  }

  protected mergeProperty(prop: Property, updates: Property) {
    copyIfDef('defaultValue');
    copyIfDef('documentation');
    copyIfDef('deprecated');
    copyIfDef('scrutinizable');
    // FIXME: Might treat this as "incompatible change" ?
    copyIfDef('required');

    if (!new RichPropertyType(updates.type).javascriptEquals(prop.type)) {
      if (!prop.previousTypes) {
        prop.previousTypes = [];
      }
      prop.previousTypes.push(prop.type);
      prop.type = updates.type;
    }

    function copyIfDef<A extends keyof Property>(key: A) {
      if (updates[key] !== undefined) {
        prop[key] = updates[key];
      }
    }
  }
}

export class ResourceBuilder extends PropertyBagBuilder {
  private typeDefinitions = new Map<string, TypeDefinition>();

  /**
   * We maintain this for markAsAttributes: so we can look up property
   * definitions for properties that may have been removed from
   * `this.resource.properties` already.
   */
  private originalProperties: ResourceProperties = {};

  constructor(public readonly db: SpecDatabase, public readonly resource: Resource) {
    super(resource);
    this.indexExistingTypeDefinitions();
    Object.assign(this.originalProperties, resource.properties);
  }

  public setProperty(name: string, prop: Property) {
    super.setProperty(name, prop);

    // Keep a copy in 'originalProperties' as well.
    this.originalProperties[name] = this.resource.properties[name];
  }

  public setAttribute(name: string, attr: Attribute) {
    if (this.resource.attributes[name]) {
      this.mergeProperty(this.resource.attributes[name], attr);
    } else {
      this.resource.attributes[name] = attr;
    }
  }

  /**
   * Mark the given properties as attributes instead
   *
   * These can be simple property names (`Foo`, `Bar`), but they can also be
   * compound property names (`Foo/Bar`), and the compound property names can
   * contain array wildcards (`Foo/*­/Bar`).
   *
   * In the CloudFormation resource spec, compound property names are separated
   * by periods (`Foo.Bar`).
   *
   * In upconverted CloudFormation resource specs -> registry specs, the compound
   * property name references may contain a period, while the actual property name
   * in the properties bag has the periods stripped: attributeName is `Foo.Bar`,
   * but the actual property name is `FooBar`.
   *
   * The same deep property name may occur multiple times (`Foo`, `Foo/Bar`, `Foo/Baz`).
   */
  public markAsAttributes(props: string[]) {
    for (const propName of props) {
      if (this.originalProperties[propName]) {
        this.setAttribute(propName, this.originalProperties[propName]);
        delete this.resource.properties[propName];
        continue;
      }

      // In case of a half-upconverted legacy spec, the property might also
      // exist with a name that has any `.` stripped.
      const strippedName = stripPeriods(propName);
      if (this.originalProperties[strippedName]) {
        // The ACTUAL name is still the name with '.' in it, but we copy the type
        // from the stripped name.
        this.setAttribute(propName, this.originalProperties[strippedName]);
        delete this.resource.properties[strippedName];
        continue;
      }

      // Otherwise assume the name represents a compound attribute
      // In the Registry spec, compound attributes will look like 'Container/Prop'.
      // In the legacy spec they will look like 'Container.Prop'.
      // Some Registry resources incorrectly use '.' as well.
      // We accept both here, but turn them both into '.'-separated.
      //
      // Sometimes this contains a `*`, to indicate that it could be any element in an array.
      // We can't currently support those, so we drop them (ex: `Subscribers/*/Status`).
      //
      // We don't remove the top-level properties from the resource, we just add the attributes.
      const propPath = propName.split(/[\.\/]/);
      const propWithPeriods = propPath.join('.');
      if (propPath.includes('*')) {
        // Skip unrepresentable
        continue;
      }

      const prop = this.propertyDeep(...propPath);
      if (prop) {
        this.setAttribute(propWithPeriods, prop);

        // FIXME: not sure if we need to delete property `Foo` if the only
        // attribute reference we got is `Foo/Bar`. Let's not for now.
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
    // The property bag we're searching in. Start by searching 'originalProperties', not
    // the final set of resource props (as markAsAttributes may have deleted some of them)
    let currentBag: ResourceProperties = this.originalProperties;

    for (let i = 0; i < fieldPath.length - 1; i++) {
      const prop = currentBag[fieldPath[i]];
      if (!prop) {
        throw new Error(
          `${this.resource.cloudFormationType}: no definition for property: ${fieldPath.slice(0, i + 1).join('/')}`,
        );
      }
      if (prop.type.type !== 'ref') {
        throw new Error(
          `${this.resource.cloudFormationType}: expected reference for ${fieldPath.join('/')} but ${fieldPath
            .slice(0, i + 1)
            .join('/')} is a ${new RichPropertyType(prop.type).stringify(this.db)}`,
        );
      }

      const typeDef = this.db.get('typeDefinition', prop.type.reference);
      currentBag = typeDef.properties;
    }

    return currentBag[fieldPath[fieldPath.length - 1]];
  }

  public typeDefinitionBuilder(typeName: string, description?: string) {
    const existing = this.typeDefinitions.get(typeName);

    if (existing) {
      if (!existing.documentation && description) {
        existing.documentation = description;
      }
      return { typeDefinitionBuilder: new TypeDefinitionBuilder(this.db, existing), fresh: false };
    }

    const typeDef = this.db.allocate('typeDefinition', {
      name: typeName,
      documentation: description,
      properties: {},
    });
    this.db.link('usesType', this.resource, typeDef);
    this.typeDefinitions.set(typeName, typeDef);

    const builder = new TypeDefinitionBuilder(this.db, typeDef);
    return { typeDefinitionBuilder: builder, fresh: true };
  }

  /**
   * Index the existing type definitions currently in the DB
   */
  private indexExistingTypeDefinitions() {
    for (const { entity: typeDef } of this.db.follow('usesType', this.resource)) {
      this.typeDefinitions.set(typeDef.name, typeDef);
    }
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
function stripPeriods(name: string) {
  return name.split('.').join('');
}
