import { Entity, Reference, Relationship } from '@cdklabs/tskb';
import { PropertyType, Resource } from './resource';

export interface Event extends Entity {
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly detailType: string;
  readonly identifiersPath: Array<IdentifierPath>;
  // TODO: i think i need some type related to typeDefinition
  readonly properties: EventProperties;
}

export type IdentifierPath = { type: Reference<EventTypeDefinition>; fieldName?: string };

export type HasEvent = Relationship<Resource, Event>;

// FIX: looks like having 2 properties aren't a good idea :D
export type EventProperties = Record<string, EventProperty>;
export interface EventProperty {
  type: PropertyType;
  //FIX: 99% this need to be deleted
  required?: boolean;
}

export interface EventTypeDefinition extends Entity {
  readonly name: string;
  readonly properties: EventProperties;
}

// export interface EventDefinitionReference {
//   readonly type: 'ref';
//   readonly reference: Reference<EventTypeDefinition>;
// }

export type EventUsesType = Relationship<Event, EventTypeDefinition>;
