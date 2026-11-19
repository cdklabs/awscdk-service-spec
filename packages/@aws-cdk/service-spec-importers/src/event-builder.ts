import {
  EventProperties,
  EventProperty,
  SpecDatabase,
  Event,
  EventTypeDefinition,
  ResourceField,
  Resource,
  Service,
} from '@aws-cdk/service-spec-types';
import { jsonschema } from './types';

export interface EventBuilderOptions {
  readonly source: string;
  readonly detailType: string;
  readonly description: string;
}

interface ObjectWithProperties {
  properties: EventProperties;
}

export class PropertyBagBuilder {
  protected candidateProperties: EventProperties = {};
  protected resourcesField: Array<ResourceField> = [];

  constructor(private readonly _propertyBag: ObjectWithProperties) {}

  public setProperty(name: string, prop: EventProperty) {
    this.candidateProperties[name] = prop;
  }

  protected addResourceField(resourceField: ResourceField) {
    this.resourcesField.push(resourceField);
  }

  /**
   * Commit the property and attribute changes to the underlying property bag.
   */
  protected commitProperties(): ObjectWithProperties {
    for (const [name, prop] of Object.entries(this.candidateProperties)) {
      this.commitProperty(name, prop);
    }

    if ('resourcesField' in this._propertyBag && this.resourcesField.length > 0) {
      (this._propertyBag as any).resourcesField = this.resourcesField;
    }

    return this._propertyBag;
  }

  private commitProperty(name: string, prop: EventProperty) {
    if (this._propertyBag.properties[name]) {
      this.mergeProperty(this._propertyBag.properties[name], prop);
    } else {
      this._propertyBag.properties[name] = prop;
    }
    this.simplifyProperty(this._propertyBag.properties[name]);
  }

  protected mergeProperty(prop: EventProperty, updates: EventProperty) {
    if (updates.required !== undefined) {
      prop.required = updates.required;
    }

    // Update type - EventProperty doesn't support previousTypes
    if (updates.type) {
      prop.type = updates.type;
    }
  }

  /**
   * Remove settings that are equal to their defaults
   */
  protected simplifyProperty(prop: EventProperty) {
    if (!prop.required) {
      delete prop.required;
    }
  }
}

export class EventBuilder extends PropertyBagBuilder {
  public static allocateEvent(
    db: SpecDatabase,
    schemaName: string,
    options: EventBuilderOptions & { rootProperty: EventTypeDefinition },
  ): EventBuilder {
    const existing = db.lookup('event', 'name', 'equals', schemaName);

    if (existing.length > 0) {
      throw new Error('Two events has the same exact name');
    }

    const event = db.allocate('event', {
      name: schemaName,
      source: options.source,
      detailType: options.detailType,
      description: options.description,
      rootProperty: { $ref: options.rootProperty.$id },
      resourcesField: [],
    });

    return new EventBuilder(db, schemaName, options, event);
  }

  public static createBuilder(db: SpecDatabase, schemaName: string, options: EventBuilderOptions): EventBuilder {
    const existing = db.lookup('event', 'name', 'equals', schemaName);

    if (existing.length > 0) {
      throw new Error('Two events has the same exact name');
    }

    return new EventBuilder(db, schemaName, options, null);
  }

  private eventTypeDefinitions = new Map<string, EventTypeDefinition>();
  private typesCreatedHere = new Set<string>();
  private typesToLink: EventTypeDefinition[] = [];
  private resourcesToLink: Array<Resource> = [];
  private serviceToLink?: Service;

  private constructor(
    public readonly db: SpecDatabase,
    private readonly schemaName: string,
    private readonly options: EventBuilderOptions,
    private event: Event | null,
  ) {
    super((event || { properties: {} }) as any);
  }

  public allocateEvent(rootProperty: EventTypeDefinition): void {
    if (this.event) {
      throw new Error('Event already allocated');
    }

    this.event = this.db.allocate('event', {
      name: this.schemaName,
      source: this.options.source,
      detailType: this.options.detailType,
      description: this.options.description,
      rootProperty: { $ref: rootProperty.$id },
      resourcesField: [],
    });

    (this as any)._propertyBag = this.event;
  }

  public linkTypesToEvent(typeDef: EventTypeDefinition) {
    this.typesToLink.push(typeDef);
    this.eventTypeDefinitions.set(typeDef.name, typeDef);
  }

  public linkResourceToEvent(resource: Resource, resourceField: ResourceField) {
    this.resourcesToLink.push(resource);
    this.addResourceField(resourceField);
  }

  public linkServiceToEvent(service: Service) {
    this.serviceToLink = service;
  }

  public eventTypeDefinitionBuilder(
    typeName: string,
    options?: { description?: string; schema?: jsonschema.RecordLikeObject },
  ) {
    const existing = this.eventTypeDefinitions.get(typeName);
    const freshInSession = !this.typesCreatedHere.has(typeName);
    this.typesCreatedHere.add(typeName);

    if (existing) {
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

    // Link to event if it's already allocated
    if (this.event) {
      this.db.link('eventUsesType', this.event, typeDef);
    }

    this.eventTypeDefinitions.set(typeName, typeDef);

    const builder = new EventTypeDefinitionBuilder(this.db, typeDef);
    return { eventTypeDefinitionBuilder: builder, freshInDb: true, freshInSession };
  }

  public commit(): Event {
    if (!this.event) {
      throw new Error('Cannot commit before event is allocated');
    }

    if (this.resourcesField.length > 0) {
      (this.event as any).resourcesField = this.resourcesField;
    }

    for (const typeDef of this.typesToLink) {
      this.db.link('eventUsesType', this.event, typeDef);
    }

    for (const resource of this.resourcesToLink) {
      this.db.link('resourceHasEvent', resource, this.event);
    }

    if (this.serviceToLink != undefined) {
      this.db.link('serviceHasEvent', this.serviceToLink, this.event);
    }

    return this.event;
  }
}

export class EventTypeDefinitionBuilder extends PropertyBagBuilder {
  constructor(public readonly db: SpecDatabase, private readonly typeDef: EventTypeDefinition) {
    super(typeDef);
  }

  public commit(): EventTypeDefinition {
    this.commitProperties();
    return this.typeDef;
  }
}
