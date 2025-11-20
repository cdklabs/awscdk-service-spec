import {
  EventProperties,
  EventProperty,
  SpecDatabase,
  Event,
  EventTypeDefinition,
  ResourceField,
} from '@aws-cdk/service-spec-types';
import { jsonschema } from './types';

export interface EventBuilderOptions {
  readonly source: string;
  readonly detailType: string;
  readonly description: string;
}

export class SpecBuilder {
  constructor(public readonly db: SpecDatabase) {}

  public eventTypeDefinitionBuilder(
    typeName: string,
    // @ts-ignore
    options?: { description?: string; schema?: jsonschema.RecordLikeObject },
  ) {
    // const existing = this.db.lookup('eventTypeDefinition', 'name', 'equals', typeName);

    // TODO: Check with Rico if it make sense
    // if (existing.length > 0) {
    //   const typeDef = existing.only();
    //   const properties = options?.schema?.properties ?? {};
    //
    //   // Check if schema has new properties not in existing type definition
    //   const hasNewProperties = !Object.keys(properties).every((element) =>
    //     Object.keys(typeDef.properties).includes(element),
    //   );
    //
    //   return {
    //     eventTypeDefinitionBuilder: new EventTypeDefinitionBuilder(this.db, typeDef),
    //     freshInDb: hasNewProperties,
    //     freshInSession: false,
    //   };
    // }

    const typeDef = this.db.allocate('eventTypeDefinition', {
      name: typeName,
      properties: {},
    });

    return {
      eventTypeDefinitionBuilder: new EventTypeDefinitionBuilder(this.db, typeDef),
      freshInDb: true,
      freshInSession: true,
    };
  }

  public eventBuilder(schemaName: string, options: EventBuilderOptions & { rootProperty: EventTypeDefinition }) {
    const existing = this.db.lookup('event', 'name', 'equals', schemaName);

    if (existing.length > 0) {
      throw new Error('Two events has the same exact name');
    }

    const event = this.db.allocate('event', {
      name: schemaName,
      source: options.source,
      detailType: options.detailType,
      description: options.description,
      rootProperty: { $ref: options.rootProperty.$id },
      resourcesField: [],
    });

    return new EventBuilder(this.db, event);
  }
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
  private eventTypeDefinitions = new Map<string, EventTypeDefinition>();
  private typesCreatedHere = new Set<string>();
  private typesToLink: EventTypeDefinition[] = [];

  constructor(public readonly db: SpecDatabase, private readonly event: Event) {
    // Pass the event itself as the property bag since it has both properties and resourcesField
    super(event as any);
  }

  /**
   * Register a type definition to be linked to this event when committed
   */
  public linkTypesToEvent(typeDef: EventTypeDefinition) {
    this.typesToLink.push(typeDef);
    this.eventTypeDefinitions.set(typeDef.name, typeDef);
  }

  /**
   * Link this event to a CloudFormation resource
   * Adds resource field metadata and creates the resourceHasEvent relationship
   */
  public linkResourceToEvent(resource: any, resourceField: ResourceField) {
    this.addResourceField(resourceField);
    this.db.link('resourceHasEvent', resource, this.event);
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
    this.db.link('eventUsesType', this.event, typeDef);
    this.eventTypeDefinitions.set(typeName, typeDef);

    const builder = new EventTypeDefinitionBuilder(this.db, typeDef);
    return { eventTypeDefinitionBuilder: builder, freshInDb: true, freshInSession };
  }

  /**
   * Commit the property and attribute changes to the event.
   */
  public commit(): Event {
    if (this.resourcesField.length > 0) {
      (this.event as any).resourcesField = this.resourcesField;
    }

    for (const typeDef of this.typesToLink) {
      this.db.link('eventUsesType', this.event, typeDef);
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
