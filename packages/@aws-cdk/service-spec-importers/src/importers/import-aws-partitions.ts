import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { AwsPartitionsSource } from '../types';

/**
 * Import AWS partitions and regions data into the database
 *
 * Creates Partition entities with all metadata fields and Region entities,
 * linking them via the hasRegion relationship.
 *
 * @param db The specification database to import into
 * @param source The loaded AWS partitions source data
 */
export function importAwsPartitions(db: SpecDatabase, source: AwsPartitionsSource) {
  for (const partitionData of source.partitions) {
    // Look up existing partition or create new one with all metadata
    const existingPartitions = db.lookup('partition', 'partition', 'equals', partitionData.id);
    const partition =
      existingPartitions.length > 0
        ? existingPartitions[0]
        : db.allocate('partition', {
            partition: partitionData.id,
            dnsSuffix: partitionData.outputs.dnsSuffix,
            dualStackDnsSuffix: partitionData.outputs.dualStackDnsSuffix,
            regionRegex: partitionData.regionRegex,
            supportsFIPS: partitionData.outputs.supportsFIPS,
            supportsDualStack: partitionData.outputs.supportsDualStack,
          });

    // Create Region entities for each region in the partition
    for (const [regionName, regionData] of Object.entries(partitionData.regions)) {
      // Look up existing region or create new one
      const existingRegions = db.lookup('region', 'name', 'equals', regionName);
      const region =
        existingRegions.length > 0
          ? existingRegions[0]
          : db.allocate('region', {
              name: regionName,
              description: regionData.description,
            });

      // Link region to partition via hasRegion relationship
      db.link('hasRegion', partition, region);
    }
  }
}
