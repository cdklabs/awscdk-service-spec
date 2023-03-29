import { Database, entityCollection, fieldIndex, stringCmp } from '@cdklabs/tskb';
import { IsAugmentedResource, ResourceAugmentation } from './augmentations';
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
      region: entityCollection<Region>(),
      service: entityCollection<Service>().index({
        name: fieldIndex('name', stringCmp),
      }),
      typeDefinition: entityCollection<TypeDefinition>(),
      augmentations: entityCollection<ResourceAugmentation>(),
    },
    (r) => ({
      hasResource: r.relationship<HasResource>('service', 'resource'),
      regionHasResource: r.relationship<RegionHasResource>('region', 'resource'),
      regionHasService: r.relationship<RegionHasService>('region', 'service'),
      usesType: r.relationship<UsesType>('resource', 'typeDefinition'),
      isAugmented: r.relationship<IsAugmentedResource>('resource', 'augmentations'),
    }),
  );
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
