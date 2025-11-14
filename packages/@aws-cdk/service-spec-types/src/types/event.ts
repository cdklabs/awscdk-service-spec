import { Entity, Reference, Relationship } from '@cdklabs/tskb';
import { PropertyType, Resource } from './resource';

export interface Event extends Entity {
  /**
   * The full name of the EventBridge schema
   *
   * @example aws.s3@ObjectCreated
   */
  readonly name: string;
  /**
   * EventBridge schema description
   */
  readonly description: string;
  /**
   * The source value for this event
   *
   * @example aws.s3
   */
  readonly source: string;
  /**
   * The detailType value for this event
   *
   * @example Object Created
   */
  readonly detailType: string;
  /**
   * Each item is a `ResourceField` describing which property (fieldName)
   * in the event payload contains a resource identifier and the associated
   * typed definition for that resource (the `type` reference).
   *
   * @example Object Created
   */
  readonly resourcesField: Array<ResourceField>;
  readonly properties: EventProperties;
}

export interface ResourceField {
  type: Reference<EventTypeDefinition>;
  fieldName?: string;
}

export type HasEvent = Relationship<Resource, Event>;

export type EventProperties = Record<string, EventProperty>;
export interface EventProperty {
  /**
   * The type of this property
   */
  type: PropertyType;
  /**
   * Is this property required
   *
   * @default false
   */
  required?: boolean;
}

export interface EventTypeDefinition extends Entity {
  /**
   * The name of the type
   *
   * @example ObjectCreated
   */
  readonly name: string;
  readonly properties: EventProperties;
}

export type EventUsesType = Relationship<Event, EventTypeDefinition>;
