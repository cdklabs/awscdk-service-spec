import {
  EventProperties,
  EventProperty,
  Property,
  RichProperty,
  Service,
  SpecDatabase,
  Event,
  EventTypeDefinition,
} from '@aws-cdk/service-spec-types';
import { Entity, Reference } from '@cdklabs/tskb';
import { AllFieldsGiven } from './diff-helpers';
import { jsonschema } from './types';

// TODO: those aren't optional put them somehow required
export interface EventBuilderOptions {
  readonly source: string;
  readonly detailType: string;
  readonly description: string;
}

export class SpecBuilder {
  constructor(public readonly db: SpecDatabase) {}

  public eventBuilder(schemaName: string, options: EventBuilderOptions) {
    const existing = this.db.lookup('event', 'name', 'equals', schemaName);

    if (existing.length > 0) {
      return;
      // FIX: IMP when there's no service need to return something
      const event = existing.only();
      // if (!event.documentation && options.description) {
      //   event.documentation = options.description;
      // }
      // if (!event.primaryIdentifier) {
      //   event.primaryIdentifier = options.primaryIdentifier;
      // }

      return new EventBuilder(this.db, event);
    }

    // FIX: mocking a type just for not blocking the code generation, need to be removed

    const typeDef = this.db.allocate('eventTypeDefinition', {
      name: 'mockTypeName',
      properties: {
        mockFieldName: {
          type: {
            type: 'string',
          },
        },
      },
    });

    function ref<E extends Entity>(x: E | string): Reference<E> {
      return typeof x === 'string' ? { $ref: x } : { $ref: x.$id };
    }

    const typeDef2 = this.db.allocate('eventTypeDefinition', {
      name: 'mockTypeName2',
      properties: {
        mockFieldName: {
          type: {
            type: 'ref',
            reference: ref(typeDef),
          },
        },
      },
    });
    typeDef.name;
    const event = this.db.allocate('event', {
      // FIX: need to fix the bang?
      name: schemaName.split('@').pop()!,
      source: options.source,
      detailType: options.detailType,
      description: options.description,
      properties: {
        mockTypeName2: {
          type: {
            type: 'ref',
            reference: ref(typeDef2),
          },
        },
      },
      identifiersPath: ['mockTypeName2.mockTypeName'],
      // attributes: {},
    });

    this.db.link('eventUsesType', event, typeDef);
    this.db.link('eventUsesType', event, typeDef2);
    // mocking type ends
    //
    // TODO: add more information for the event

    const service = this.allocateService(schemaName);
    if (service == undefined) {
      // TODO: Maybe i need to return undefined
      return new EventBuilder(this.db, event);
    }
    const resource = this.allocateResource(service);
    // console.log('hasEvent link is creating...');
    // console.log({ resource: JSON.stringify(resource), event: JSON.stringify(event) });
    // TODO: should i return the entity only
    this.db.link('hasEvent', resource.entity, event);
    // TODO: Do i need to do this??
    // if (options.region) {
    //   const region = this.allocateRegion(options.region);
    //   this.db.link('regionHasResource', region, resource);
    //   this.db.link('regionHasService', region, service);
    // }

    return new EventBuilder(this.db, event);
  }

  // TODO: change name to get?
  private allocateService(eventSchemaName: string, eventTypeNameSeparator = '@') {
    const parts = eventSchemaName.split(eventTypeNameSeparator);
    // parts e.g. ["aws.s3", "ObjectCreated"]
    const serviceName = parts[0].replace('.', '-').toLowerCase();

    const services = this.db.lookup('service', 'name', 'equals', serviceName);

    if (services.length == 0) {
      return;
    }

    // TODO: i think only will do that for me
    // if (true) {
    //   throw Error(`This service doesn't existing in cloudformation ${serviceName}`);
    // }
    return services.only();
  }

  // TODO: change name to get?
  private allocateResource(service: Service) {
    const resource = this.eventDecider(service);

    return resource;
    // TODO: I have no idea what i'm doing now :D, how the resource will not be in the DB?
    // const resource = this.db.allocate('service', {
    //   name,
    //   shortName,
    //   capitalized,
    //   cloudFormationNamespace,
    // });

    // return resource;
  }

  // TODO: change name to resource decider?
  private eventDecider(service: Service) {
    // TODO: need to get all the requred property field names here
    const resources = this.db.follow('hasResource', service);
    if (service.name == 'aws-lambda') {
      console.log({ resources: JSON.stringify(resources, null, 2) });
    }

    // TODO: Change this to proper resource
    return resources[0];
  }
}
//
interface ObjectWithProperties {
  properties: EventProperties;
}

export class PropertyBagBuilder {
  protected candidateProperties: EventProperties = {};

  // @ts-ignore
  constructor(private readonly _propertyBag: ObjectWithProperties) {}

  public setProperty(name: string, prop: EventProperty) {
    console.log('Setting property', { prop, name });
    this.candidateProperties[name] = prop;
  }
  //
  //   /**
  //    * Delete a property from the builder
  //    *
  //    * This avoids committing it to the underlying property bag -- if the underlying
  //    * bag already has the property, it will not be removed.
  //    */
  //   public unsetProperty(name: string) {
  //     delete this.candidateProperties[name];
  //   }

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
    // if (prop.causesReplacement === 'no') {
    //   delete prop.causesReplacement;
    // }
  }
}

export class EventBuilder extends PropertyBagBuilder {
  private eventTypeDefinitions = new Map<string, EventTypeDefinition>();
  private typesCreatedHere = new Set<string>();
  //
  // /**
  //  * Keep a copy of all properties configured here
  //  *
  //  * We'll need some of them later to turn them into attributes.
  //  */
  // private allProperties: ResourceProperties = {};
  //
  // private candidateAttributes: ResourceProperties = {};
  //

  // @ts-ignore
  constructor(public readonly db: SpecDatabase, private readonly event: Event) {
    super(event);
    // this.indexExistingTypeDefinitions();
  }
  //
  // public get cloudFormationType(): string {
  //   return this.event.cloudFormationType;
  // }
  //
  // public setProperty(name: string, prop: Property) {
  //   super.setProperty(name, prop);
  //   this.allProperties[name] = prop;
  // }
  //
  // public setAttribute(name: string, attr: Attribute) {
  //   this.candidateAttributes[name] = attr;
  // }
  //
  // public unsetAttribute(name: string) {
  //   delete this.candidateAttributes[name];
  // }
  //
  // /**
  //  * Mark the given properties as attributes instead
  //  *
  //  * These can be simple property names (`Foo`, `Bar`), but they can also be
  //  * compound property names (`Foo/Bar`), and the compound property names can
  //  * contain array wildcards (`Foo/*­/Bar`).
  //  *
  //  * In the CloudFormation resource spec, compound property names are separated
  //  * by periods (`Foo.Bar`).
  //  *
  //  * In upconverted CloudFormation resource specs -> registry specs, the compound
  //  * property name references may contain a period, while the actual property name
  //  * in the properties bag has the periods stripped: attributeName is `Foo.Bar`,
  //  * but the actual property name is `FooBar`.
  //  *
  //  * The same deep property name may occur multiple times (`Foo`, `Foo/Bar`, `Foo/Baz`).
  //  */
  // public markAsAttributes(props: string[]) {
  //   for (const propName of props) {
  //     if (this.candidateProperties[propName]) {
  //       this.setAttribute(propName, this.candidateProperties[propName]);
  //       this.unsetProperty(propName);
  //       continue;
  //     }
  //
  //     // In case of a half-upconverted legacy spec, the property might also
  //     // exist with a name that has any `.` stripped.
  //     const strippedName = stripPeriods(propName);
  //     if (this.candidateProperties[strippedName]) {
  //       // The ACTUAL name is still the name with '.' in it, but we copy the type
  //       // from the stripped name.
  //       this.setAttribute(propName, this.candidateProperties[strippedName]);
  //       this.unsetProperty(strippedName);
  //       continue;
  //     }
  //
  //     // Otherwise assume the name represents a compound attribute
  //     // In the Registry spec, compound attributes will look like 'Container/Prop'.
  //     // In the legacy spec they will look like 'Container.Prop'.
  //     // Some Registry resources incorrectly use '.' as well.
  //     // We accept both here, but turn them both into '.'-separated.
  //     //
  //     // Sometimes this contains a `*`, to indicate that it could be any element in an array.
  //     // We can't currently support those, so we drop them (ex: `Subscribers/*/Status`).
  //     //
  //     // We don't remove the top-level properties from the resource, we just add the attributes.
  //     const propPath = propName.split(/[\.\/]/);
  //     const propWithPeriods = propPath.join('.');
  //     if (propPath.includes('*')) {
  //       // Skip unrepresentable
  //       continue;
  //     }
  //
  //     try {
  //       const prop = this.propertyDeep(...propPath);
  //       if (prop) {
  //         this.setAttribute(propWithPeriods, prop);
  //
  //         // FIXME: not sure if we need to delete property `Foo` if the only
  //         // attribute reference we got is `Foo/Bar`. Let's not for now.
  //       }
  //     } catch (e: any) {
  //       // We're catching any errors from propertyDeep because CloudFormation allows schemas
  //       // where attribute properties are not part of the spec anywhere else. Although it is
  //       // likely a bad schema, CDK forges ahead by just dropping the attribute.
  //       // Example: `ProviderDetails` typed as `Map<string,string>` and `"readOnlyProperties: ['/properties/ProviderDetails/Attribute']"`
  //       console.log(`Attribute cannot be found in the spec. Error returned: ${e}.`);
  //     }
  //   }
  // }
  //
  // /**
  //  * Mark the given properties as immutable
  //  *
  //  * This be a top-level property reference, or a deep property reference, like `Foo` or
  //  * `Foo/Bar`.
  //  */
  // public markAsImmutable(props: string[]) {
  //   for (const propName of props) {
  //     const propPath = propName.split(/\//);
  //
  //     try {
  //       const prop = this.propertyDeep(...propPath);
  //       if (prop) {
  //         prop.causesReplacement = 'yes';
  //       }
  //     } catch {
  //       if (!this.event.additionalReplacementProperties) {
  //         this.event.additionalReplacementProperties = [];
  //       }
  //       this.event.additionalReplacementProperties.push(propPath);
  //     }
  //   }
  // }
  //
  // public markDeprecatedProperties(...props: string[]) {
  //   for (const propName of props) {
  //     (this.candidateProperties[propName] ?? {}).deprecated = Deprecation.WARN;
  //   }
  // }
  //
  // public setTagInformation(tagInfo: TagInformation) {
  //   this.event.tagInformation = tagInfo;
  // }
  //
  // public propertyDeep(...fieldPath: string[]): Property | undefined {
  //   // The property bag we're searching in. Start by searching 'allProperties', not
  //   // the current set of resource props (as markAsAttributes may have deleted some of them)
  //   let currentBag: ResourceProperties = this.allProperties;
  //
  //   for (let i = 0; i < fieldPath.length - 1; i++) {
  //     const prop = currentBag[fieldPath[i]];
  //     if (!prop) {
  //       throw new Error(
  //         `${this.event.cloudFormationType}: no definition for property: ${fieldPath.slice(0, i + 1).join('/')}`,
  //       );
  //     }
  //
  //     let propType = prop.type;
  //
  //     // Handle '*'s
  //     while (fieldPath[i + 1] === '*') {
  //       if (propType.type !== 'array' && propType.type !== 'map') {
  //         throw new Error(
  //           `${this.event.cloudFormationType}: ${fieldPath.join('/')}: expected array but ${fieldPath
  //             .slice(0, i + 1)
  //             .join('/')} is a ${new RichPropertyType(propType).stringify(this.db)}`,
  //         );
  //       }
  //
  //       propType = propType.element;
  //       i += 1;
  //     }
  //
  //     if (propType.type !== 'ref') {
  //       throw new Error(
  //         `${this.event.cloudFormationType}: ${fieldPath.join('/')}: expected type definition but ${fieldPath
  //           .slice(0, i + 1)
  //           .join('/')} is a ${new RichPropertyType(propType).stringify(this.db)}`,
  //       );
  //     }
  //
  //     const typeDef = this.db.get('typeDefinition', propType.reference);
  //     currentBag = typeDef.properties;
  //   }
  //
  //   return currentBag[fieldPath[fieldPath.length - 1]];
  // }
  //
  public eventTypeDefinitionBuilder(
    typeName: string,
    options?: { description?: string; schema?: jsonschema.RecordLikeObject },
  ) {
    const existing = this.eventTypeDefinitions.get(typeName);
    // const description = options?.description;
    const freshInSession = !this.typesCreatedHere.has(typeName);
    this.typesCreatedHere.add(typeName);

    if (existing) {
      // if (!existing.documentation && description) {
      //   existing.documentation = description;
      // }
      const properties = options?.schema?.properties ?? {};
      // If db already contains typeName's type definition, we want to additionally
      // check if the schema matches the type definition. If the schema includes new
      // properties, we want to add them to the type definition.
      if (!Object.keys(properties).every((element) => Object.keys(existing.properties).includes(element))) {
        return {
          eventTypeDefinitionBuilder: new EventTypeDefinitionBuilder(this.db, existing),
          freshInDb: true,
          freshInSession: true,
        };
      }
      return {
        eventTypeDefinitionBuilder: new EventTypeDefinitionBuilder(this.db, existing),
        freshInDb: false,
        freshInSession,
      };
    }

    const typeDef = this.db.allocate('eventTypeDefinition', {
      name: typeName,
      properties: {},
    });
    this.db.link('eventUsesType', this.event, typeDef);
    this.eventTypeDefinitions.set(typeName, typeDef);

    const builder = new EventTypeDefinitionBuilder(this.db, typeDef);
    return { eventTypeDefinitionBuilder: builder, freshInDb: true, freshInSession };
  }

  /**
   * Commit the property and attribute changes to the resource.
   */
  public commit(): Event {
    // Commit properties
    super.commit();

    // for (const [name, attr] of Object.entries(this.candidateAttributes)) {
    //   this.commitAttribute(name, attr);
    // }

    return this.event;
  }

  // private commitAttribute(name: string, attr: Attribute) {
  //   if (this.event.attributes[name]) {
  //     this.mergeProperty(this.event.attributes[name], attr);
  //   } else {
  //     this.event.attributes[name] = attr;
  //   }
  //   this.simplifyProperty(this.event.attributes[name]);
  // }

  // /**
  //  * Index the existing type definitions currently in the DB
  //  */
  // private indexExistingTypeDefinitions() {
  //   for (const { entity: typeDef } of this.db.follow('usesType', this.event)) {
  //     this.typeDefinitions.set(typeDef.name, typeDef);
  //   }
  // }
}

// export type EventTypeDefinitionFields = Pick<EventTypeDefinition, 'documentation' | 'mustRenderForBwCompat'>;

export class EventTypeDefinitionBuilder extends PropertyBagBuilder {
  // private readonly fields: EventTypeDefinitionFields = {};

  // @ts-ignore
  constructor(public readonly db: SpecDatabase, private readonly typeDef: EventTypeDefinition) {
    super(typeDef);
  }

  // public setFields(fields: EventTypeDefinitionFields) {
  //   Object.assign(this.fields, fields);
  // }

  public commit(): EventTypeDefinition {
    super.commit();
    // Object.assign(this.typeDef, this.fields);
    return this.typeDef;
  }
}

// function last<A>(xs: A[]): A {
//   return xs[xs.length - 1];
// }

/**
 * Turns a compound name into its property equivalent
 * Compliance.Type -> ComplianceType
 */
// function stripPeriods(name: string) {
//   return name.split('.').join('');
// }
