import { Database, emptyCollection, emptyIndex, emptyRelationship, EntityCollection, RelationshipCollection, stringCmp } from '@cdklabs/tskb';
import { Resource, Service, HasResource, Region, RegionHasResource, TypeDefinition, UsesType } from './resource';

export interface DatabaseSchema {
  readonly service: EntityCollection<Service>;
  readonly region: EntityCollection<Region>;
  readonly resource: EntityCollection<Resource, 'cloudFormationType'>;
  readonly typeDefinition: EntityCollection<TypeDefinition>;
  readonly hasResource: RelationshipCollection<HasResource, DatabaseSchema, 'service', 'resource'>;
  readonly regionHasResource: RelationshipCollection<RegionHasResource, DatabaseSchema, 'region', 'resource'>;
  readonly usesType: RelationshipCollection<UsesType, DatabaseSchema, 'resource', 'typeDefinition'>;
}

export function emptyDatabase() {
  return new Database<DatabaseSchema>({
    resource: emptyCollection({
      cloudFormationType: emptyIndex('cloudFormationType', stringCmp),
    }),
    region: emptyCollection({}),
    service: emptyCollection({}),
    typeDefinition: emptyCollection({}),

    hasResource: emptyRelationship('service', 'resource'),
    regionHasResource: emptyRelationship('region', 'resource'),
    usesType: emptyRelationship('resource', 'typeDefinition'),
  });
}

export type SpecDatabase = ReturnType<typeof emptyDatabase>;