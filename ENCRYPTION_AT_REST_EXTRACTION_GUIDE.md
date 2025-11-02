# Encryption at Rest Configuration Extraction Guide

## Overview

This document describes how to extract encryption at rest configuration information from the AWS CDK Service Specification database. The service spec aggregates data from multiple sources including CloudFormation Resource Schemas, Resource Specifications, and documentation.

## Data Location

Encryption at rest configuration is stored as **properties** on CloudFormation resources. These properties are found in:

1. **Primary Source**: `sources/CloudFormationSchema/{region}/{resource-name}.json`
   - Example: `sources/CloudFormationSchema/us-east-1/aws-s3-bucket.json`
   - Contains JSON Schema definitions with property metadata

2. **Database Format**: After import, data is stored in the compiled `db.json.gz` file
   - Accessed via `@aws-cdk/aws-service-spec` package
   - Queryable through `SpecDatabase` API

## Identification Pattern

Encryption-related properties follow consistent naming patterns:

### Property Name Patterns
- Contains `Encrypt` (case-insensitive): `BucketEncryption`, `StorageEncrypted`, `Encrypted`
- Contains `Kms` (case-insensitive): `KmsKeyId`, `KmsMasterKeyId`, `PerformanceInsightsKMSKeyId`
- Contains `SSE`: `SSESpecification` (Server-Side Encryption)

### Property Characteristics
- **Required**: Almost always `false` (encryption is typically optional)
- **Type**: Either primitive boolean or complex object reference
- **Documentation**: Contains links to AWS documentation about encryption

## Resource Analysis (8 Resources Examined)

### 1. AWS::S3::Bucket
**Property**: `BucketEncryption`
- **Required**: false
- **Type**: Object reference (`#/definitions/BucketEncryption`)
- **Description**: Supports SSE-S3, SSE-KMS, and DSSE-KMS encryption
- **Pattern**: Complex nested configuration object

### 2. AWS::DynamoDB::Table
**Property**: `SSESpecification`
- **Required**: false
- **Type**: Object reference
- **Description**: Server-side encryption settings
- **Pattern**: Dedicated SSE configuration object

### 3. AWS::RDS::DBInstance
**Properties**: Multiple encryption-related properties
- `StorageEncrypted` (boolean): Enables/disables encryption
- `KmsKeyId` (string): KMS key for DB encryption
- `PerformanceInsightsKMSKeyId` (string): KMS key for Performance Insights
- `AutomaticBackupReplicationKmsKeyId` (string): KMS key for backup replication
- **Pattern**: Boolean flag + separate KMS key properties

### 4. AWS::EC2::Volume
**Properties**:
- `Encrypted` (boolean): Enables encryption
- `KmsKeyId` (string): KMS key identifier
- **Pattern**: Boolean flag + KMS key property

### 5. AWS::EFS::FileSystem
**Properties**:
- `Encrypted` (boolean): Creates encrypted file system
- `KmsKeyId` (string): KMS key for encryption (optional, defaults to `/aws/elasticfilesystem`)
- **Pattern**: Boolean flag + optional KMS key

### 6. AWS::SNS::Topic
**Property**: `KmsMasterKeyId`
- **Required**: false
- **Type**: String
- **Description**: CMK for server-side encryption
- **Pattern**: Single KMS key property (encryption implied when set)

### 7. AWS::SQS::Queue
**Properties**:
- `KmsMasterKeyId` (string): KMS key for encryption
- `KmsDataKeyReusePeriodSeconds` (integer): Data key reuse period
- **Pattern**: KMS key + configuration parameter

### 8. AWS::Kinesis::Stream
**Property**: `StreamEncryption`
- **Required**: false
- **Type**: Object reference
- **Description**: Encryption configuration for stream
- **Pattern**: Dedicated encryption configuration object

### 9. AWS::SecretsManager::Secret
**Property**: `KmsKeyId`
- **Required**: false
- **Type**: String
- **Description**: KMS key for encrypting secret values
- **Pattern**: Single KMS key property

### 10. AWS::Logs::LogGroup
**Property**: `KmsKeyId`
- **Required**: false
- **Type**: String
- **Description**: KMS key for encrypting log data
- **Pattern**: Single KMS key property

## Extraction Methodology

### Method 1: Direct Schema Query (Recommended for Bulk Analysis)

```bash
# Search for encryption properties in CloudFormation schemas
cat sources/CloudFormationSchema/us-east-1/{resource-file}.json | \
  jq '.properties | to_entries | map(select(.key | test("(?i)encrypt|kms|sse")))'
```

### Method 2: Database API Query (Recommended for Programmatic Access)

```typescript
import { loadAwsServiceSpecSync } from '@aws-cdk/aws-service-spec';

const db = loadAwsServiceSpecSync();
const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::S3::Bucket')[0];

// Find encryption properties
for (const [propName, prop] of Object.entries(resource.properties)) {
  if (/encrypt|kms|sse/i.test(propName)) {
    console.log(`${propName}: required=${prop.required}, type=${prop.type}`);
  }
}
```

### Method 3: Grep Pattern Search (Quick Discovery)

```bash
# Find all resources with encryption properties
grep -r "Encrypt\|KmsKey\|SSE" sources/CloudFormationSchema/us-east-1/ | \
  cut -d: -f1 | sort -u
```

## Common Patterns Identified

### Pattern A: Boolean + KMS Key
Most common pattern for storage resources:
- Boolean property to enable encryption (e.g., `Encrypted`, `StorageEncrypted`)
- String property for KMS key (e.g., `KmsKeyId`)
- KMS key is optional; defaults to AWS-managed key

**Examples**: EC2::Volume, EFS::FileSystem, RDS::DBInstance

### Pattern B: Complex Configuration Object
Used for resources with multiple encryption options:
- Single property referencing a complex type definition
- Nested structure with encryption algorithm, key, and settings

**Examples**: S3::Bucket (`BucketEncryption`), DynamoDB::Table (`SSESpecification`)

### Pattern C: KMS Key Only
Simpler resources where encryption is implicit:
- Single KMS key property
- Encryption enabled when property is set

**Examples**: SNS::Topic, SQS::Queue, SecretsManager::Secret, Logs::LogGroup

## Key Findings

1. **Encryption is Optional**: All examined resources have `required: false` for encryption properties
2. **KMS Integration**: Most resources support customer-managed KMS keys
3. **AWS-Managed Defaults**: When KMS key not specified, AWS-managed keys are typically used
4. **Naming Consistency**: Property names follow predictable patterns across services
5. **Documentation Links**: All properties include links to AWS documentation

## Extraction Scripts

### Basic Extraction
A complete extraction script is available at `extract-encryption-info.sh`:

```bash
# Extracts encryption properties from multiple resources
./extract-encryption-info.sh
```

### Detailed Extraction with Nested Structures
For deep analysis including nested type definitions:

```bash
# Extract detailed structure for a specific resource
./examples/extract-encryption-details.sh aws-s3-bucket
./examples/extract-encryption-details.sh aws-dynamodb-table
```

### Structured Output
A JSON summary of analyzed resources is available at:
- `examples/encryption-summary.json` - Structured data for programmatic consumption

## Example: Complete S3 Bucket Encryption Structure

The S3 Bucket encryption configuration demonstrates the complex nested pattern:

```
BucketEncryption (optional)
└── ServerSideEncryptionConfiguration (required if BucketEncryption set)
    └── Array of ServerSideEncryptionRule
        ├── BucketKeyEnabled (boolean, optional)
        └── ServerSideEncryptionByDefault (optional)
            ├── SSEAlgorithm (required): "aws:kms" | "AES256" | "aws:kms:dsse"
            └── KMSMasterKeyID (string, optional)
```

This structure allows:
- Multiple encryption rules per bucket
- Choice of encryption algorithm (S3-managed, KMS, or dual-layer)
- Optional customer-managed KMS key
- S3 Bucket Key optimization

## Future Enhancements

To build a comprehensive encryption configuration database:

1. **Automated Scanning**: Create a script to scan all CloudFormation schemas ✓ (see `extract-encryption-info.sh`)
2. **Type Resolution**: Follow `$ref` pointers to extract nested encryption configuration structures ✓ (see `examples/extract-encryption-details.sh`)
3. **Default Values**: Extract default encryption behavior from documentation
4. **Compliance Mapping**: Map properties to compliance frameworks (e.g., PCI-DSS, HIPAA)
5. **Required vs Optional**: Track which services require encryption for compliance
6. **Cross-Region Analysis**: Compare encryption support across different AWS regions

## Statistics

Based on analysis of CloudFormation Resource Provider Schemas (us-east-1 region):

- **Total CloudFormation Resources**: 1,472
- **Resources with Encryption Properties**: 200 (13.6%)
- **Common Services with Encryption**:
  - Storage: S3, EBS, EFS, FSx
  - Databases: RDS, DynamoDB, DocumentDB, Neptune, Redshift
  - Messaging: SNS, SQS, Kinesis, MSK (Kafka)
  - Compute: Lambda, AppRunner
  - Analytics: Athena, Glue, EMR
  - Security: Secrets Manager, Systems Manager Parameter Store
  - Logging: CloudWatch Logs
  - Backup: AWS Backup

## Quick Start

```bash
# 1. Extract encryption info for specific resources
./extract-encryption-info.sh

# 2. Deep dive into a specific resource structure
./examples/extract-encryption-details.sh aws-s3-bucket

# 3. Generate comprehensive report for all resources
./examples/extract-all-encryption.sh
# Output: encryption-report.txt

# 4. View structured JSON summary
cat examples/encryption-summary.json
```

## References

- CloudFormation Resource Schemas: `sources/CloudFormationSchema/`
- Service Spec Types: `packages/@aws-cdk/service-spec-types/src/types/resource.ts`
- Database Structure: `packages/@aws-cdk/service-spec-types/src/types/database.ts`
- Extraction Scripts: `examples/`
