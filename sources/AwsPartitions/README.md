# AWS Partitions

This directory contains the AWS partitions and regions data from the AWS SDK JS v3.

## Source

<https://raw.githubusercontent.com/aws/aws-sdk-js-v3/main/packages/util-endpoints/src/lib/aws/partitions.json>

## Data Structure

The `partitions.json` file contains:

- `version`: Schema version string
- `partitions`: Array of partition objects, each containing:
  - `id`: Partition identifier (e.g., "aws", "aws-cn", "aws-us-gov", "aws-iso", "aws-iso-b")
  - `regionRegex`: Regex pattern for matching region names in this partition
  - `regions`: Map of region names to region metadata (description)
  - `outputs`: Partition-level configuration including:
    - `dnsSuffix`: DNS suffix for the partition (e.g., "amazonaws.com")
    - `dualStackDnsSuffix`: DNS suffix for dual-stack endpoints
    - `supportsFIPS`: Whether the partition supports FIPS endpoints
    - `supportsDualStack`: Whether the partition supports dual-stack endpoints
    - `implicitGlobalRegion`: The default global region for the partition

## Instructions

This data source provides information about AWS partitions and their associated regions.
It is used to populate the Partition and Region entities in the service specification database.
The data is sourced from the AWS SDK JS v3 repository and is updated automatically via a scheduled workflow.

No AWS authentication is required to download this file as it is publicly available on GitHub.
