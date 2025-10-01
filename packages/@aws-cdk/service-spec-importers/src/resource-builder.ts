import {
  Attribute,
  Deprecation,
  Property,
  Resource,
  ResourceProperties,
  RichProperty,
  RichPropertyType,
  SpecDatabase,
  TagInformation,
  TypeDefinition,
} from '@aws-cdk/service-spec-types';
import { AllFieldsGiven } from './diff-helpers';
import { jsonschema } from './types';

/**
 * Options for the resourceBuilder API
 */
export interface ResourceBuilderOptions {
  description?: string;
  region?: string;
  primaryIdentifier?: string[];
}

/**
 * Adds resources and types to a spec database
 */
export class SpecBuilder {
  constructor(public readonly db: SpecDatabase) {}

  public resourceBuilder(typeName: string, options: ResourceBuilderOptions = {}) {
    const existing = this.db.lookup('resource', 'cloudFormationType', 'equals', typeName);

    if (existing.length > 0) {
      const resource = existing.only();
      if (!resource.documentation && options.description) {
        resource.documentation = options.description;
      }
      if (!resource.primaryIdentifier) {
        resource.primaryIdentifier = options.primaryIdentifier;
      }

      return new ResourceBuilder(this.db, resource);
    }

    const resource = this.db.allocate('resource', {
      cloudFormationType: typeName,
      documentation: options.description,
      name: last(typeName.split('::')),
      primaryIdentifier: options.primaryIdentifier,
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
    const cloudFormationNamespace = `${parts[0]}${resourceTypeNameSeparator}${parts[1]}`;

    // Name hack for legacy reasons (only affects names, not cloudFormationNamespace)
    if (parts[0] === 'AWS' && parts[1] === 'Serverless') {
      parts[1] = 'SAM';
    }

    const name = `${parts[0]}-${parts[1]}`.toLowerCase();
    const capitalized = parts[1];
    const shortName = capitalized.toLowerCase();

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

interface ObjectWithProperties {
  properties: ResourceProperties;
}

export class PropertyBagBuilder {
  protected candidateProperties: ResourceProperties = {};

  constructor(private readonly _propertyBag: ObjectWithProperties) {}

  public setProperty(name: string, prop: Property) {
    this.candidateProperties[name] = prop;
  }

  /**
   * Delete a property from the builder
   *
   * This avoids committing it to the underlying property bag -- if the underlying
   * bag already has the property, it will not be removed.
   */
  public unsetProperty(name: string) {
    delete this.candidateProperties[name];
  }

  /**
   * Commit the property and attribute changes to the underlying property bag.
   */
  public commit(): ObjectWithProperties {
    for (const [name, prop] of Object.entries(this.candidateProperties)) {
      this.commitProperty(name, prop);
    }

    return this._propertyBag;
  }

  private commitProperty(name: string, prop: Property) {
    if (this._propertyBag.properties[name]) {
      this.mergeProperty(this._propertyBag.properties[name], prop);
    } else {
      this._propertyBag.properties[name] = prop;
    }
    this.simplifyProperty(this._propertyBag.properties[name]);
  }

  protected mergeProperty(prop: Property, updates: Property) {
    // This handles merges that are trivial scalar overwrites. All
    // fields must be represented, if you have special code to handle
    // a field, put it in here as 'undefined' and add code to handle it below.
    copyDefined({
      causesReplacement: updates.causesReplacement,
      defaultValue: updates.defaultValue,
      deprecated: updates.deprecated,
      documentation: updates.documentation,
      required: updates.required,
      scrutinizable: updates.scrutinizable,
      relationshipRefs: updates.relationshipRefs,

      // These will be handled specially below
      previousTypes: undefined,
      type: undefined,
    });

    // Special field handling
    for (const type of updates.previousTypes ?? []) {
      new RichProperty(prop).updateType(type);
    }
    new RichProperty(prop).updateType(updates.type);

    function copyDefined(upds: AllFieldsGiven<Partial<Property>>) {
      for (const [key, value] of Object.entries(upds)) {
        if (value !== undefined) {
          (prop as any)[key] = value;
        }
      }
    }
  }

  /**
   * Remove settings that are equal to their defaults
   */
  protected simplifyProperty(prop: Property) {
    if (!prop.required) {
      delete prop.required;
    }
    if (prop.causesReplacement === 'no') {
      delete prop.causesReplacement;
    }
  }
}

export class ResourceBuilder extends PropertyBagBuilder {
  private typeDefinitions = new Map<string, TypeDefinition>();
  private typesCreatedHere = new Set<string>();

  /**
   * Keep a copy of all properties configured here
   *
   * We'll need some of them later to turn them into attributes.
   */
  private allProperties: ResourceProperties = {};

  private candidateAttributes: ResourceProperties = {};

  constructor(public readonly db: SpecDatabase, private readonly resource: Resource) {
    super(resource);
    this.indexExistingTypeDefinitions();
  }

  public get cloudFormationType(): string {
    return this.resource.cloudFormationType;
  }

  public setProperty(name: string, prop: Property) {
    super.setProperty(name, prop);
    this.allProperties[name] = prop;
  }

  public setAttribute(name: string, attr: Attribute) {
    this.candidateAttributes[name] = attr;
  }

  public unsetAttribute(name: string) {
    delete this.candidateAttributes[name];
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
      if (this.candidateProperties[propName]) {
        this.setAttribute(propName, this.candidateProperties[propName]);
        this.unsetProperty(propName);
        continue;
      }

      // In case of a half-upconverted legacy spec, the property might also
      // exist with a name that has any `.` stripped.
      const strippedName = stripPeriods(propName);
      if (this.candidateProperties[strippedName]) {
        // The ACTUAL name is still the name with '.' in it, but we copy the type
        // from the stripped name.
        this.setAttribute(propName, this.candidateProperties[strippedName]);
        this.unsetProperty(strippedName);
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

      try {
        const prop = this.propertyDeep(...propPath);
        if (prop) {
          this.setAttribute(propWithPeriods, prop);

          // FIXME: not sure if we need to delete property `Foo` if the only
          // attribute reference we got is `Foo/Bar`. Let's not for now.
        }
      } catch (e: any) {
        // We're catching any errors from propertyDeep because CloudFormation allows schemas
        // where attribute properties are not part of the spec anywhere else. Although it is
        // likely a bad schema, CDK forges ahead by just dropping the attribute.
        // Example: `ProviderDetails` typed as `Map<string,string>` and `"readOnlyProperties: ['/properties/ProviderDetails/Attribute']"`
        console.log(`Attribute cannot be found in the spec. Error returned: ${e}.`);
      }
    }
  }

  /**
   * Mark the given properties as immutable
   *
   * This be a top-level property reference, or a deep property reference, like `Foo` or
   * `Foo/Bar`.
   */
  public markAsImmutable(props: string[]) {
    for (const propName of props) {
      const propPath = propName.split(/\//);

      try {
        const prop = this.propertyDeep(...propPath);
        if (prop) {
          prop.causesReplacement = 'yes';
        }
      } catch {
        if (!this.resource.additionalReplacementProperties) {
          this.resource.additionalReplacementProperties = [];
        }
        this.resource.additionalReplacementProperties.push(propPath);
      }
    }
  }

  public markDeprecatedProperties(...props: string[]) {
    for (const propName of props) {
      (this.candidateProperties[propName] ?? {}).deprecated = Deprecation.WARN;
    }
  }

  public setTagInformation(tagInfo: TagInformation) {
    this.resource.tagInformation = tagInfo;
  }

  public propertyDeep(...fieldPath: string[]): Property | undefined {
    // The property bag we're searching in. Start by searching 'allProperties', not
    // the current set of resource props (as markAsAttributes may have deleted some of them)
    let currentBag: ResourceProperties = this.allProperties;

    for (let i = 0; i < fieldPath.length - 1; i++) {
      const prop = currentBag[fieldPath[i]];
      if (!prop) {
        throw new Error(
          `${this.resource.cloudFormationType}: no definition for property: ${fieldPath.slice(0, i + 1).join('/')}`,
        );
      }

      let propType = prop.type;

      // Handle '*'s
      while (fieldPath[i + 1] === '*') {
        if (propType.type !== 'array' && propType.type !== 'map') {
          throw new Error(
            `${this.resource.cloudFormationType}: ${fieldPath.join('/')}: expected array but ${fieldPath
              .slice(0, i + 1)
              .join('/')} is a ${new RichPropertyType(propType).stringify(this.db)}`,
          );
        }

        propType = propType.element;
        i += 1;
      }

      if (propType.type !== 'ref') {
        throw new Error(
          `${this.resource.cloudFormationType}: ${fieldPath.join('/')}: expected type definition but ${fieldPath
            .slice(0, i + 1)
            .join('/')} is a ${new RichPropertyType(propType).stringify(this.db)}`,
        );
      }

      const typeDef = this.db.get('typeDefinition', propType.reference);
      currentBag = typeDef.properties;
    }

    return currentBag[fieldPath[fieldPath.length - 1]];
  }

  public typeDefinitionBuilder(
    typeName: string,
    options?: { description?: string; schema?: jsonschema.RecordLikeObject },
  ) {
    const existing = this.typeDefinitions.get(typeName);
    const description = options?.description;
    const freshInSession = !this.typesCreatedHere.has(typeName);
    this.typesCreatedHere.add(typeName);

    if (existing) {
      if (!existing.documentation && description) {
        existing.documentation = description;
      }
      const properties = options?.schema?.properties ?? {};
      // If db already contains typeName's type definition, we want to additionally
      // check if the schema matches the type definition. If the schema includes new
      // properties, we want to add them to the type definition.
      if (!Object.keys(properties).every((element) => Object.keys(existing.properties).includes(element))) {
        return {
          typeDefinitionBuilder: new TypeDefinitionBuilder(this.db, existing),
          freshInDb: true,
          freshInSession: true,
        };
      }
      return {
        typeDefinitionBuilder: new TypeDefinitionBuilder(this.db, existing),
        freshInDb: false,
        freshInSession,
      };
    }

    const typeDef = this.db.allocate('typeDefinition', {
      name: typeName,
      documentation: description,
      properties: {},
    });
    this.db.link('usesType', this.resource, typeDef);
    this.typeDefinitions.set(typeName, typeDef);

    const builder = new TypeDefinitionBuilder(this.db, typeDef);
    return { typeDefinitionBuilder: builder, freshInDb: true, freshInSession };
  }

  /**
   * Commit the property and attribute changes to the resource.
   */
  public commit(): Resource {
    // Commit properties
    super.commit();

    for (const [name, attr] of Object.entries(this.candidateAttributes)) {
      this.commitAttribute(name, attr);
    }

    return this.resource;
  }

  private commitAttribute(name: string, attr: Attribute) {
    if (this.resource.attributes[name]) {
      this.mergeProperty(this.resource.attributes[name], attr);
    } else {
      this.resource.attributes[name] = attr;
    }
    this.simplifyProperty(this.resource.attributes[name]);
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

export type TypeDefinitionFields = Pick<TypeDefinition, 'documentation' | 'mustRenderForBwCompat'>;

export class TypeDefinitionBuilder extends PropertyBagBuilder {
  private readonly fields: TypeDefinitionFields = {};

  constructor(public readonly db: SpecDatabase, private readonly typeDef: TypeDefinition) {
    super(typeDef);
  }

  public setFields(fields: TypeDefinitionFields) {
    Object.assign(this.fields, fields);
  }

  public commit(): TypeDefinition {
    super.commit();
    Object.assign(this.typeDef, this.fields);
    return this.typeDef;
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
