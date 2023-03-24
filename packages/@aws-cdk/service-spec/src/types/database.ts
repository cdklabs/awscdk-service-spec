import {
  Database,
  emptyCollection,
  emptyIndex,
  emptyRelationship,
  EntityCollection,
  RelationshipCollection,
  stringCmp,
} from '@cdklabs/tskb';
import { IsAugmentedResource, ResourceAugmentation } from './augmentations';
import {
  DimensionSet,
  Metric,
  ResourceHasDimensionSet,
  ServiceHasDimensionSet,
  UsesDimensionSet,
  ResourceHasMetric,
  ServiceHasMetric,
} from './metrics';
import {
  Resource,
  Service,
  HasResource,
  Region,
  RegionHasResource,
  RegionHasService,
  TypeDefinition,
  UsesType,
  PropertyType,
} from './resource';

export interface DatabaseSchema {
  readonly service: EntityCollection<Service, 'name'>;
  readonly region: EntityCollection<Region>;
  readonly resource: EntityCollection<Resource, 'cloudFormationType'>;
  readonly typeDefinition: EntityCollection<TypeDefinition>;
  readonly augmentations: EntityCollection<ResourceAugmentation>;
  readonly metric: EntityCollection<Metric, 'name' | 'namespace' | 'dedupKey'>;
  readonly dimensionSet: EntityCollection<DimensionSet, 'dedupKey'>;

  readonly hasResource: RelationshipCollection<HasResource, DatabaseSchema, 'service', 'resource'>;
  readonly regionHasResource: RelationshipCollection<RegionHasResource, DatabaseSchema, 'region', 'resource'>;
  readonly regionHasService: RelationshipCollection<RegionHasService, DatabaseSchema, 'region', 'service'>;
  readonly usesType: RelationshipCollection<UsesType, DatabaseSchema, 'resource', 'typeDefinition'>;
  readonly isAugmented: RelationshipCollection<IsAugmentedResource, DatabaseSchema, 'resource', 'augmentations'>;
  readonly usesDimensionSet: RelationshipCollection<UsesDimensionSet, DatabaseSchema, 'metric', 'dimensionSet'>;
  readonly resourceHasMetric: RelationshipCollection<ResourceHasMetric, DatabaseSchema, 'resource', 'metric'>;
  readonly serviceHasMetric: RelationshipCollection<ServiceHasMetric, DatabaseSchema, 'service', 'metric'>;

  readonly resourceHasDimensionSet: RelationshipCollection<
    ResourceHasDimensionSet,
    DatabaseSchema,
    'resource',
    'dimensionSet'
  >;
  readonly serviceHasDimensionSet: RelationshipCollection<
    ServiceHasDimensionSet,
    DatabaseSchema,
    'service',
    'dimensionSet'
  >;
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
    augmentations: emptyCollection({}),
    metric: emptyCollection({
      name: emptyIndex('name', stringCmp),
      namespace: emptyIndex('namespace', stringCmp),
      dedupKey: emptyIndex('dedupKey', stringCmp),
    }),
    dimensionSet: emptyCollection({
      dedupKey: emptyIndex('dedupKey', stringCmp),
    }),
    hasResource: emptyRelationship('service', 'resource'),
    regionHasResource: emptyRelationship('region', 'resource'),
    regionHasService: emptyRelationship('region', 'service'),
    usesType: emptyRelationship('resource', 'typeDefinition'),
    isAugmented: emptyRelationship('resource', 'augmentations'),
    usesDimensionSet: emptyRelationship('metric', 'dimensionSet'),
    resourceHasMetric: emptyRelationship('resource', 'metric'),
    serviceHasMetric: emptyRelationship('service', 'metric'),
    resourceHasDimensionSet: emptyRelationship('resource', 'dimensionSet'),
    serviceHasDimensionSet: emptyRelationship('service', 'dimensionSet'),
  });
}

export type SpecDatabase = ReturnType<typeof emptyDatabase>;

/**
 * Helpers for working with a SpecDatabase
 */
export class RichSpecDatabase {
  constructor(private readonly db: SpecDatabase) {}

  /**
   * Find all resources of a given type
   */
  public resourcesByType(cfnType: string): readonly Resource[] {
    return this.db.lookup('resource', 'cloudFormationType', 'equals', cfnType);
  }

  /**
   * Find a type definition from a given property type
   */
  public tryFindDef(type: PropertyType): TypeDefinition | undefined {
    return type.type === 'ref' ? this.db.get('typeDefinition', type.reference.$ref) : undefined;
  }
}
