import { Entity, Relationship } from '@cdklabs/tskb';
import { PropertyType, Resource, TypeDefinition } from './resource';

export interface Event extends Entity {
  readonly name: string;
  readonly source: string;
  readonly detailType: string;
  readonly identifiersPath: Array<string>;
  // TODO: i think i need some type related to typeDefinition
  readonly properties: EventProperties;
}

export type HasEvent = Relationship<Resource, Event>;

// FIX: looks like having 2 properties aren't a good idea :D
export type EventProperties = Record<string, EventProperty>;
export interface EventProperty {
  type: PropertyType;
}

export type EventUsesType = Relationship<Event, TypeDefinition>;
