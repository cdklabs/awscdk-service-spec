import { Database, emptyCollection, emptyRelationship, EntityCollection, RelationshipCollection } from '@cdklabs/tskb';
import { Resource, Service, HasResource, Region, RegionHasResource } from './resource';

export interface DatabaseSchema {
  readonly service: EntityCollection<Service>;
  readonly region: EntityCollection<Region>;
  readonly resource: EntityCollection<Resource>;
  readonly hasResource: RelationshipCollection<HasResource, DatabaseSchema, 'service', 'resource'>;
  readonly regionHasResource: RelationshipCollection<RegionHasResource, DatabaseSchema, 'region', 'resource'>;
}

export function emptyDatabase() {
  return new Database<DatabaseSchema>({
    resource: emptyCollection(),
    region: emptyCollection(),
    service: emptyCollection(),
    hasResource: emptyRelationship('service', 'resource'),
    regionHasResource: emptyRelationship('region', 'resource'),
  });
}

export type SpecDatabase = ReturnType<typeof emptyDatabase>;