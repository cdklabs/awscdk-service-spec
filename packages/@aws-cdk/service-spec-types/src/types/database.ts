import { promises as fs } from 'fs';
import { gunzipSync } from 'zlib';
import { Database, entityCollection, fieldIndex, stringCmp } from '@cdklabs/tskb';
import { IsAugmentedResource, ResourceAugmentation } from './augmentations';
import { ResourceHasEvent, Event, EventUsesType, EventTypeDefinition } from './event';
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
  TypeDefinition,
  PropertyType,
  Region,
  HasResource,
  RegionHasResource,
  RegionHasService,
  UsesType,
} from './resource';

export function emptyDatabase() {
  return new Database(
    {
      resource: entityCollection<Resource>().index({
        cloudFormationType: fieldIndex('cloudFormationType', stringCmp),
      }),
      region: entityCollection<Region>().index({
        name: fieldIndex('name', stringCmp),
      }),
      service: entityCollection<Service>().index({
        name: fieldIndex('name', stringCmp),
        cloudFormationNamespace: fieldIndex('cloudFormationNamespace', stringCmp),
      }),
      eventTypeDefinition: entityCollection<EventTypeDefinition>(),
      typeDefinition: entityCollection<TypeDefinition>(),
      augmentations: entityCollection<ResourceAugmentation>(),
      metric: entityCollection<Metric>().index({
        name: fieldIndex('name', stringCmp),
        namespace: fieldIndex('namespace', stringCmp),
        dedupKey: fieldIndex('dedupKey', stringCmp),
      }),
      dimensionSet: entityCollection<DimensionSet>().index({
        dedupKey: fieldIndex('dedupKey', stringCmp),
      }),
      event: entityCollection<Event>().index({
        name: fieldIndex('name', stringCmp),
      }),
    },
    (r) => ({
      hasResource: r.relationship<HasResource>('service', 'resource'),
      regionHasResource: r.relationship<RegionHasResource>('region', 'resource'),
      regionHasService: r.relationship<RegionHasService>('region', 'service'),
      usesType: r.relationship<UsesType>('resource', 'typeDefinition'),
      isAugmented: r.relationship<IsAugmentedResource>('resource', 'augmentations'),
      usesDimensionSet: r.relationship<UsesDimensionSet>('metric', 'dimensionSet'),
      resourceHasMetric: r.relationship<ResourceHasMetric>('resource', 'metric'),
      serviceHasMetric: r.relationship<ServiceHasMetric>('service', 'metric'),
      resourceHasDimensionSet: r.relationship<ResourceHasDimensionSet>('resource', 'dimensionSet'),
      serviceHasDimensionSet: r.relationship<ServiceHasDimensionSet>('service', 'dimensionSet'),
      resourceHasEvent: r.relationship<ResourceHasEvent>('resource', 'event'),
      eventUsesType: r.relationship<EventUsesType>('event', 'eventTypeDefinition'),
    }),
  );
}

export async function loadDatabase(pathToDb: string) {
  const db = emptyDatabase();
  const contents = await fs.readFile(pathToDb);
  const json = pathToDb.endsWith('.gz') ? gunzipSync(contents).toString('utf-8') : contents.toString('utf-8');
  db.load(JSON.parse(json));
  return db;
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
  public resourceByType(cfnType: string, operation = 'resourceByType'): Resource {
    const res = this.db.lookup('resource', 'cloudFormationType', 'equals', cfnType);
    if (res.length === 0) {
      throw new Error(`${operation}: no such resource: ${cfnType}`);
    }
    return res[0];
  }

  /**
   * All type definitions used by a certain resource
   */
  public resourceTypeDefs(cfnType: string): readonly TypeDefinition[] {
    const resource = this.db.lookup('resource', 'cloudFormationType', 'equals', cfnType).only();
    return this.db.follow('usesType', resource).map((x) => x.entity);
  }

  /**
   * Find a type definition from a given property type
   */
  public tryFindDef(type: PropertyType): TypeDefinition | undefined {
    return type.type === 'ref' ? this.db.get('typeDefinition', type.reference.$ref) : undefined;
  }
}
