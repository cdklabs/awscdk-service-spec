import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { importAwsPartitions } from '../src/importers/import-aws-partitions';
import { loadAwsPartitions } from '../src/loaders/load-aws-partitions';
import { AwsPartitionsSource } from '../src/types';

describe('loadAwsPartitions', () => {
  const validPartitionsPath = path.join(__dirname, '../../../..', 'sources/AwsPartitions/partitions.json');

  describe('loading valid partitions.json', () => {
    test('loads the actual partitions.json file successfully', async () => {
      const result = await loadAwsPartitions(validPartitionsPath);

      expect(result.value).toBeDefined();
      expect(result.value.version).toBeDefined();
      expect(result.value.partitions).toBeDefined();
      expect(Array.isArray(result.value.partitions)).toBe(true);
      expect(result.value.partitions.length).toBeGreaterThan(0);
    });

    test('partitions contain required fields', async () => {
      const result = await loadAwsPartitions(validPartitionsPath);

      for (const partition of result.value.partitions) {
        expect(partition.id).toBeDefined();
        expect(typeof partition.id).toBe('string');
        expect(partition.regionRegex).toBeDefined();
        expect(typeof partition.regionRegex).toBe('string');
        expect(partition.regions).toBeDefined();
        expect(typeof partition.regions).toBe('object');
        expect(partition.outputs).toBeDefined();
        expect(partition.outputs.dnsSuffix).toBeDefined();
        expect(partition.outputs.dualStackDnsSuffix).toBeDefined();
        expect(typeof partition.outputs.supportsFIPS).toBe('boolean');
        expect(typeof partition.outputs.supportsDualStack).toBe('boolean');
        expect(partition.outputs.implicitGlobalRegion).toBeDefined();
      }
    });

    test('includes expected partitions', async () => {
      const result = await loadAwsPartitions(validPartitionsPath);
      const partitionIds = result.value.partitions.map((p) => p.id);

      expect(partitionIds).toContain('aws');
      expect(partitionIds).toContain('aws-cn');
      expect(partitionIds).toContain('aws-us-gov');
    });

    test('aws partition contains expected regions', async () => {
      const result = await loadAwsPartitions(validPartitionsPath);
      const awsPartition = result.value.partitions.find((p) => p.id === 'aws');

      expect(awsPartition).toBeDefined();
      expect(awsPartition!.regions['us-east-1']).toBeDefined();
      expect(awsPartition!.regions['us-west-2']).toBeDefined();
      expect(awsPartition!.regions['eu-west-1']).toBeDefined();
    });
  });

  describe('loading invalid data', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aws-partitions-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('throws error for non-existent file', async () => {
      await expect(loadAwsPartitions('/non/existent/path.json')).rejects.toThrow();
    });

    test('throws error for invalid JSON', async () => {
      const invalidJsonPath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidJsonPath, 'not valid json {{{');

      await expect(loadAwsPartitions(invalidJsonPath)).rejects.toThrow();
    });

    test('rejects data missing required version field with validation enabled', async () => {
      const invalidDataPath = path.join(tempDir, 'missing-version.json');
      fs.writeFileSync(
        invalidDataPath,
        JSON.stringify({
          partitions: [],
        }),
      );

      await expect(loadAwsPartitions(invalidDataPath, { validate: true })).rejects.toThrow();
    });

    test('rejects data missing required partitions field with validation enabled', async () => {
      const invalidDataPath = path.join(tempDir, 'missing-partitions.json');
      fs.writeFileSync(
        invalidDataPath,
        JSON.stringify({
          version: '1.0',
        }),
      );

      await expect(loadAwsPartitions(invalidDataPath, { validate: true })).rejects.toThrow();
    });
  });

  describe('Property 1: Schema Validation', () => {
    /**
     * Property 1: Schema Validation
     * For any valid partitions.json file from the AWS SDK JS v3 source,
     * loading the file through the loader should succeed and return data
     * that conforms to the AwsPartitionsSource schema.
     *
     * Validates: Requirements 3.2, 3.3, 3.4, 5.2
     */
    test('valid partitions data conforms to schema', async () => {
      const result = await loadAwsPartitions(validPartitionsPath, { validate: true });

      // Verify the structure matches AwsPartitionsSource schema
      expect(typeof result.value.version).toBe('string');
      expect(Array.isArray(result.value.partitions)).toBe(true);

      // Each partition should have required fields
      for (const partition of result.value.partitions) {
        expect(typeof partition.id).toBe('string');
        expect(typeof partition.regionRegex).toBe('string');
        expect(typeof partition.regions).toBe('object');
        expect(typeof partition.outputs).toBe('object');
        expect(typeof partition.outputs.dnsSuffix).toBe('string');
        expect(typeof partition.outputs.dualStackDnsSuffix).toBe('string');
        expect(typeof partition.outputs.supportsFIPS).toBe('boolean');
        expect(typeof partition.outputs.supportsDualStack).toBe('boolean');
        expect(typeof partition.outputs.implicitGlobalRegion).toBe('string');
      }
    });
  });

  describe('Property 4: Loader Rejects Invalid Data', () => {
    /**
     * Property 4: Loader Rejects Invalid Data
     * For any JSON object that does not conform to the AwsPartitionsSource schema
     * (missing required fields, wrong types), the loader should return a failure
     * result when validation is enabled.
     *
     * Validates: Requirements 3.3, 5.2
     */
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aws-partitions-prop4-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('rejects empty object', async () => {
      const invalidPath = path.join(tempDir, 'empty.json');
      fs.writeFileSync(invalidPath, JSON.stringify({}));

      await expect(loadAwsPartitions(invalidPath, { validate: true })).rejects.toThrow();
    });

    test('rejects wrong type for version', async () => {
      const invalidPath = path.join(tempDir, 'wrong-version-type.json');
      fs.writeFileSync(
        invalidPath,
        JSON.stringify({
          version: 123,
          partitions: [],
        }),
      );

      await expect(loadAwsPartitions(invalidPath, { validate: true })).rejects.toThrow();
    });

    test('rejects wrong type for partitions', async () => {
      const invalidPath = path.join(tempDir, 'wrong-partitions-type.json');
      fs.writeFileSync(
        invalidPath,
        JSON.stringify({
          version: '1.0',
          partitions: 'not-an-array',
        }),
      );

      await expect(loadAwsPartitions(invalidPath, { validate: true })).rejects.toThrow();
    });
  });
});

describe('importAwsPartitions', () => {
  const TEST_REGION_REGEX = '^(us|eu|ap|sa|ca|me|af|il)-\\\\w+-\\\\d+$';

  function createTestPartitionsSource(overrides?: Partial<AwsPartitionsSource>): AwsPartitionsSource {
    return {
      version: '1.0',
      partitions: [
        {
          id: 'aws',
          regionRegex: TEST_REGION_REGEX,
          regions: {
            'us-east-1': { description: 'US East (N. Virginia)' },
            'us-west-2': { description: 'US West (Oregon)' },
          },
          outputs: {
            dnsSuffix: 'amazonaws.com',
            dualStackDnsSuffix: 'api.aws',
            supportsFIPS: true,
            supportsDualStack: true,
            implicitGlobalRegion: 'us-east-1',
          },
        },
      ],
      ...overrides,
    };
  }

  describe('importing creates Partition entities', () => {
    test('creates Partition entity with correct id', () => {
      const db = emptyDatabase();
      const source = createTestPartitionsSource();

      importAwsPartitions(db, source);

      const partitions = db.all('partition');
      expect(partitions.length).toBe(1);
      expect(partitions[0].partition).toBe('aws');
    });

    test('creates Partition entity with all metadata fields', () => {
      const db = emptyDatabase();
      const source = createTestPartitionsSource();

      importAwsPartitions(db, source);

      const partition = db.lookup('partition', 'partition', 'equals', 'aws')[0];
      expect(partition).toBeDefined();
      expect(partition.dnsSuffix).toBe('amazonaws.com');
      expect(partition.dualStackDnsSuffix).toBe('api.aws');
      expect(partition.regionRegex).toBe(TEST_REGION_REGEX);
      expect(partition.supportsFIPS).toBe(true);
      expect(partition.supportsDualStack).toBe(true);
    });

    test('creates multiple Partition entities for multiple partitions', () => {
      const db = emptyDatabase();
      const source: AwsPartitionsSource = {
        version: '1.0',
        partitions: [
          {
            id: 'aws',
            regionRegex: '^(us|eu)-\\\\w+-\\\\d+$',
            regions: { 'us-east-1': {} },
            outputs: {
              dnsSuffix: 'amazonaws.com',
              dualStackDnsSuffix: 'api.aws',
              supportsFIPS: true,
              supportsDualStack: true,
              implicitGlobalRegion: 'us-east-1',
            },
          },
          {
            id: 'aws-cn',
            regionRegex: '^cn-\\\\w+-\\\\d+$',
            regions: { 'cn-north-1': {} },
            outputs: {
              dnsSuffix: 'amazonaws.com.cn',
              dualStackDnsSuffix: 'api.amazonwebservices.com.cn',
              supportsFIPS: true,
              supportsDualStack: true,
              implicitGlobalRegion: 'cn-northwest-1',
            },
          },
        ],
      };

      importAwsPartitions(db, source);

      const partitions = db.all('partition');
      expect(partitions.length).toBe(2);
      expect(partitions.map((p) => p.partition).sort()).toEqual(['aws', 'aws-cn']);
    });
  });

  describe('importing creates Region entities', () => {
    test('creates Region entities for each region in partition', () => {
      const db = emptyDatabase();
      const source = createTestPartitionsSource();

      importAwsPartitions(db, source);

      const regions = db.all('region');
      expect(regions.length).toBe(2);
      expect(regions.map((r) => r.name).sort()).toEqual(['us-east-1', 'us-west-2']);
    });

    test('creates Region entity with description', () => {
      const db = emptyDatabase();
      const source = createTestPartitionsSource();

      importAwsPartitions(db, source);

      const region = db.lookup('region', 'name', 'equals', 'us-east-1')[0];
      expect(region).toBeDefined();
      expect(region.description).toBe('US East (N. Virginia)');
    });

    test('handles regions without description', () => {
      const db = emptyDatabase();
      const source: AwsPartitionsSource = {
        version: '1.0',
        partitions: [
          {
            id: 'aws',
            regionRegex: '^us-\\\\w+-\\\\d+$',
            regions: { 'us-east-1': {} },
            outputs: {
              dnsSuffix: 'amazonaws.com',
              dualStackDnsSuffix: 'api.aws',
              supportsFIPS: true,
              supportsDualStack: true,
              implicitGlobalRegion: 'us-east-1',
            },
          },
        ],
      };

      importAwsPartitions(db, source);

      const region = db.lookup('region', 'name', 'equals', 'us-east-1')[0];
      expect(region).toBeDefined();
      expect(region.description).toBeUndefined();
    });
  });

  describe('importing creates hasRegion relationships', () => {
    test('links regions to their partition', () => {
      const db = emptyDatabase();
      const source = createTestPartitionsSource();

      importAwsPartitions(db, source);

      const partition = db.lookup('partition', 'partition', 'equals', 'aws')[0];
      const linkedRegions = db.follow('hasRegion', partition);

      expect(linkedRegions.length).toBe(2);
      expect(linkedRegions.map((r) => r.entity.name).sort()).toEqual(['us-east-1', 'us-west-2']);
    });

    test('each partition has its own regions linked', () => {
      const db = emptyDatabase();
      const source: AwsPartitionsSource = {
        version: '1.0',
        partitions: [
          {
            id: 'aws',
            regionRegex: '^us-\\\\w+-\\\\d+$',
            regions: { 'us-east-1': {}, 'us-west-2': {} },
            outputs: {
              dnsSuffix: 'amazonaws.com',
              dualStackDnsSuffix: 'api.aws',
              supportsFIPS: true,
              supportsDualStack: true,
              implicitGlobalRegion: 'us-east-1',
            },
          },
          {
            id: 'aws-cn',
            regionRegex: '^cn-\\\\w+-\\\\d+$',
            regions: { 'cn-north-1': {}, 'cn-northwest-1': {} },
            outputs: {
              dnsSuffix: 'amazonaws.com.cn',
              dualStackDnsSuffix: 'api.amazonwebservices.com.cn',
              supportsFIPS: true,
              supportsDualStack: true,
              implicitGlobalRegion: 'cn-northwest-1',
            },
          },
        ],
      };

      importAwsPartitions(db, source);

      const awsPartition = db.lookup('partition', 'partition', 'equals', 'aws')[0];
      const awsCnPartition = db.lookup('partition', 'partition', 'equals', 'aws-cn')[0];

      const awsRegions = db.follow('hasRegion', awsPartition);
      const awsCnRegions = db.follow('hasRegion', awsCnPartition);

      expect(awsRegions.map((r) => r.entity.name).sort()).toEqual(['us-east-1', 'us-west-2']);
      expect(awsCnRegions.map((r) => r.entity.name).sort()).toEqual(['cn-north-1', 'cn-northwest-1']);
    });
  });

  describe('handles duplicate entities correctly', () => {
    test('reuses existing region entities', () => {
      const db = emptyDatabase();

      // Pre-create a region
      db.allocate('region', { name: 'us-east-1', description: 'Existing description' });

      const source = createTestPartitionsSource();
      importAwsPartitions(db, source);

      // Should still only have 2 regions (not 3)
      const regions = db.all('region');
      expect(regions.length).toBe(2);
    });

    test('reuses existing partition entities', () => {
      const db = emptyDatabase();

      // Pre-create a partition without metadata
      db.allocate('partition', { partition: 'aws' });

      const source = createTestPartitionsSource();
      importAwsPartitions(db, source);

      // Should still only have 1 partition
      const partitions = db.all('partition');
      expect(partitions.length).toBe(1);
    });
  });

  describe('Property 2: Import Creates Entities', () => {
    /**
     * Property 2: Import Creates Entities
     * For any valid AwsPartitionsSource object, importing it into an empty database should create:
     * - One Partition entity for each partition in the source
     * - One Region entity for each region across all partitions
     * - A hasRegion relationship linking each region to its partition
     *
     * Validates: Requirements 4.2, 6.2
     */
    test('creates correct number of entities and relationships', () => {
      const db = emptyDatabase();
      const source: AwsPartitionsSource = {
        version: '1.0',
        partitions: [
          {
            id: 'aws',
            regionRegex: '^us-\\\\w+-\\\\d+$',
            regions: {
              'us-east-1': { description: 'US East' },
              'us-west-2': { description: 'US West' },
              'eu-west-1': { description: 'EU West' },
            },
            outputs: {
              dnsSuffix: 'amazonaws.com',
              dualStackDnsSuffix: 'api.aws',
              supportsFIPS: true,
              supportsDualStack: true,
              implicitGlobalRegion: 'us-east-1',
            },
          },
          {
            id: 'aws-cn',
            regionRegex: '^cn-\\\\w+-\\\\d+$',
            regions: {
              'cn-north-1': { description: 'China North' },
              'cn-northwest-1': { description: 'China Northwest' },
            },
            outputs: {
              dnsSuffix: 'amazonaws.com.cn',
              dualStackDnsSuffix: 'api.amazonwebservices.com.cn',
              supportsFIPS: true,
              supportsDualStack: true,
              implicitGlobalRegion: 'cn-northwest-1',
            },
          },
        ],
      };

      importAwsPartitions(db, source);

      // Verify partition count
      const partitions = db.all('partition');
      expect(partitions.length).toBe(2);

      // Verify region count
      const regions = db.all('region');
      expect(regions.length).toBe(5);

      // Verify relationships
      for (const partition of partitions) {
        const linkedRegions = db.follow('hasRegion', partition);
        const expectedRegionCount = source.partitions.find((p) => p.id === partition.partition)!;
        expect(linkedRegions.length).toBe(Object.keys(expectedRegionCount.regions).length);
      }
    });
  });

  describe('Property 3: Import Round-Trip Consistency', () => {
    /**
     * Property 3: Import Round-Trip Consistency
     * For any valid partitions source with N partitions and M total regions, after importing:
     * - The database should contain exactly N partition entities
     * - The database should contain at least M region entities
     * - Each partition entity should be linked to all its regions via the hasRegion relationship
     *
     * Validates: Requirements 6.2, 7.2
     */
    test('maintains consistency between source and database state', () => {
      const db = emptyDatabase();
      const source: AwsPartitionsSource = {
        version: '1.0',
        partitions: [
          {
            id: 'aws',
            regionRegex: '^us-\\\\w+-\\\\d+$',
            regions: {
              'us-east-1': {},
              'us-west-2': {},
            },
            outputs: {
              dnsSuffix: 'amazonaws.com',
              dualStackDnsSuffix: 'api.aws',
              supportsFIPS: true,
              supportsDualStack: true,
              implicitGlobalRegion: 'us-east-1',
            },
          },
          {
            id: 'aws-us-gov',
            regionRegex: '^us-gov-\\\\w+-\\\\d+$',
            regions: {
              'us-gov-west-1': {},
              'us-gov-east-1': {},
            },
            outputs: {
              dnsSuffix: 'amazonaws.com',
              dualStackDnsSuffix: 'api.aws',
              supportsFIPS: true,
              supportsDualStack: true,
              implicitGlobalRegion: 'us-gov-west-1',
            },
          },
        ],
      };

      const expectedPartitionCount = source.partitions.length;
      const expectedRegionCount = source.partitions.reduce((sum, p) => sum + Object.keys(p.regions).length, 0);

      importAwsPartitions(db, source);

      // Verify partition count matches
      expect(db.all('partition').length).toBe(expectedPartitionCount);

      // Verify region count matches
      expect(db.all('region').length).toBe(expectedRegionCount);

      // Verify each partition is linked to its regions
      for (const partitionData of source.partitions) {
        const partition = db.lookup('partition', 'partition', 'equals', partitionData.id)[0];
        expect(partition).toBeDefined();

        const linkedRegions = db.follow('hasRegion', partition);
        const expectedRegions = Object.keys(partitionData.regions);

        expect(linkedRegions.length).toBe(expectedRegions.length);
        expect(linkedRegions.map((r) => r.entity.name).sort()).toEqual(expectedRegions.sort());
      }
    });
  });
});
