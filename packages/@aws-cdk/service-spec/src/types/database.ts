import { EntityCollection, RelationshipCollection } from '@cdklabs/tskb';
import { Resource, Service, HasResource } from './resource';

export interface DatabaseSchema {
  readonly service: EntityCollection<Service>;
  readonly resource: EntityCollection<Resource>;
  readonly hasResource: RelationshipCollection<HasResource, DatabaseSchema, 'service', 'resource'>;
}