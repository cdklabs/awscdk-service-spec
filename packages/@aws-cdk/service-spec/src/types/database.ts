import {
  Database,
  emptyCollection,
  emptyIndex,
  emptyRelationship,
  EntityCollection,
  RelationshipCollection,
  stringCmp,
} from '@cdklabs/tskb';
import {
  Resource,
  Service,
  HasResource,
  Region,
  RegionHasResource,
  RegionHasService,
  TypeDefinition,
  UsesType,
} from './resource';

export interface DatabaseSchema {
  readonly service: EntityCollection<Service, 'name'>;
  readonly region: EntityCollection<Region>;
  readonly resource: EntityCollection<Resource, 'cloudFormationType'>;
  readonly typeDefinition: EntityCollection<TypeDefinition>;
  readonly hasResource: RelationshipCollection<HasResource, DatabaseSchema, 'service', 'resource'>;
  readonly regionHasResource: RelationshipCollection<RegionHasResource, DatabaseSchema, 'region', 'resource'>;
  readonly regionHasService: RelationshipCollection<RegionHasService, DatabaseSchema, 'region', 'service'>;
  readonly usesType: RelationshipCollection<UsesType, DatabaseSchema, 'resource', 'typeDefinition'>;
}

export function emptyDatabase() {
  return new Database<DatabaseSchema>({
    resource: emptyCollection({
      cloudFormationType: emptyIndex('cloudFormationType', stringCmp),
    }),
    region: emptyCollection({}),
    service: emptyCollection({
      name: emptyIndex('name', stringCmp),
    }),
    typeDefinition: emptyCollection({}),

    hasResource: emptyRelationship('service', 'resource'),
    regionHasResource: emptyRelationship('region', 'resource'),
    regionHasService: emptyRelationship('region', 'service'),
    usesType: emptyRelationship('resource', 'typeDefinition'),
  });
}

export type SpecDatabase = ReturnType<typeof emptyDatabase>;
