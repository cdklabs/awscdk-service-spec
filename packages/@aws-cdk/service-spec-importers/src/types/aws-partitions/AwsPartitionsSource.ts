/**
 * AWS Partitions source data from AWS SDK JS v3 partitions.json
 *
 * @see https://github.com/aws/aws-sdk-js-v3/blob/main/packages/util-endpoints/src/lib/aws/partitions.json
 */
export interface AwsPartitionsSource {
  /**
   * Schema version of the partitions data
   */
  readonly version: string;

  /**
   * Array of AWS partition definitions
   */
  readonly partitions: AwsPartitionData[];
}

/**
 * Data for a single AWS partition
 */
export interface AwsPartitionData {
  /**
   * Partition identifier (e.g., "aws", "aws-cn", "aws-us-gov")
   */
  readonly id: string;

  /**
   * Regex pattern for matching region names in this partition
   */
  readonly regionRegex: string;

  /**
   * Map of region names to region metadata
   */
  readonly regions: Record<string, AwsRegionData>;

  /**
   * Partition-level configuration outputs
   */
  readonly outputs: AwsPartitionOutputs;
}

/**
 * Metadata for a single AWS region
 */
export interface AwsRegionData {
  /**
   * Human-readable description of the region
   */
  readonly description?: string;
}

/**
 * Partition-level configuration outputs
 */
export interface AwsPartitionOutputs {
  /**
   * DNS suffix for the partition (e.g., "amazonaws.com")
   */
  readonly dnsSuffix: string;

  /**
   * Dual-stack DNS suffix for the partition
   */
  readonly dualStackDnsSuffix: string;

  /**
   * Whether the partition supports FIPS endpoints
   */
  readonly supportsFIPS: boolean;

  /**
   * Whether the partition supports dual-stack endpoints
   */
  readonly supportsDualStack: boolean;

  /**
   * The implicit global region for this partition
   */
  readonly implicitGlobalRegion: string;

  /**
   * Name of the partition
   */
  readonly name?: string;
}
