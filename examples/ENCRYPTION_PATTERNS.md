# Encryption at Rest Configuration Patterns

## Overview

Analysis of 200 AWS CloudFormation resources with encryption properties reveals 4 distinct patterns for configuring encryption at rest.

## Pattern Distribution

| Pattern | Count | Percentage | Description |
|---------|-------|------------|-------------|
| **kms_only** | 71 | 35.5% | Single KMS key property |
| **complex** | 62 | 31.0% | Nested configuration object |
| **other** | 62 | 31.0% | Non-standard patterns |
| **boolean_kms** | 5 | 2.5% | Boolean flag + KMS key |

## Pattern 1: boolean_kms (5 resources, 2.5%)

### Description
Explicit boolean flag to enable encryption plus separate KMS key property for customer-managed keys.

### Structure
```
Encrypted: boolean
KmsKeyId: string (optional)
```

### Characteristics
- **Explicit opt-in**: Boolean property clearly enables/disables encryption
- **Optional CMK**: KMS key defaults to AWS-managed if not specified
- **Clear separation**: Encryption enablement separate from key selection
- **Most predictable**: Easiest pattern to understand and validate

### Examples

#### AWS::EC2::Volume
```json
{
  "Encrypted": false,
  "KmsKeyId": "arn:aws:kms:us-east-1:123456789012:key/..."
}
```

#### AWS::EFS::FileSystem
```json
{
  "Encrypted": true,
  "KmsKeyId": "alias/my-efs-key"
}
```

#### AWS::Redshift::Cluster
```json
{
  "Encrypted": true,
  "KmsKeyId": "...",
  "RotateEncryptionKey": false,
  "MasterPasswordSecretKmsKeyId": "..."
}
```

### All Resources
1. AWS::EC2::Volume
2. AWS::EFS::FileSystem
3. AWS::ImageBuilder::Component
4. AWS::Redshift::Cluster
5. AWS::WorkspacesInstances::Volume

### Usage Pattern
```typescript
// Enable encryption with AWS-managed key
resource.encrypted = true;

// Enable encryption with customer-managed key
resource.encrypted = true;
resource.kmsKeyId = 'arn:aws:kms:...';
```

---

## Pattern 2: complex (62 resources, 31.0%)

### Description
Single property referencing a complex nested configuration object with multiple encryption options.

### Structure
```
EncryptionConfiguration:
  - EncryptionType: enum
  - KmsKeyId: string
  - AdditionalSettings: object
```

### Characteristics
- **Flexible configuration**: Supports multiple encryption algorithms/modes
- **Nested structure**: Multiple levels of configuration
- **Rich options**: Can specify algorithm, key, and additional parameters
- **Service-specific**: Structure varies by service requirements

### Examples

#### AWS::S3::Bucket
```json
{
  "BucketEncryption": {
    "ServerSideEncryptionConfiguration": [{
      "ServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "..."
      },
      "BucketKeyEnabled": true
    }]
  }
}
```

#### AWS::DynamoDB::Table
```json
{
  "SSESpecification": {
    "SSEEnabled": true,
    "SSEType": "KMS",
    "KMSMasterKeyId": "..."
  }
}
```

#### AWS::Kinesis::Stream
```json
{
  "StreamEncryption": {
    "EncryptionType": "KMS",
    "KeyId": "..."
  }
}
```

### Common Resources
- AWS::S3::Bucket
- AWS::DynamoDB::Table
- AWS::Kinesis::Stream
- AWS::KinesisFirehose::DeliveryStream
- AWS::Kendra::Index
- AWS::RDS::DBCluster
- AWS::DocDB::DBCluster
- AWS::Neptune::DBCluster
- AWS::ElastiCache::ReplicationGroup
- AWS::MSK::Cluster

### Usage Pattern
```typescript
// Complex nested configuration
resource.encryptionConfiguration = {
  encryptionType: 'KMS',
  kmsKeyId: 'arn:aws:kms:...',
  additionalOptions: {
    bucketKeyEnabled: true
  }
};
```

---

## Pattern 3: kms_only (71 resources, 35.5%)

### Description
Single KMS key property where encryption is implicit when the property is set.

### Structure
```
KmsKeyId: string
```

### Characteristics
- **Implicit encryption**: Setting KMS key automatically enables encryption
- **Simplest configuration**: Single property to configure
- **No explicit flag**: No separate boolean to enable/disable
- **Common for managed services**: Services that always encrypt but allow CMK

### Examples

#### AWS::SNS::Topic
```json
{
  "KmsMasterKeyId": "alias/aws/sns"
}
```

#### AWS::SQS::Queue
```json
{
  "KmsMasterKeyId": "arn:aws:kms:...",
  "KmsDataKeyReusePeriodSeconds": 300
}
```

#### AWS::SecretsManager::Secret
```json
{
  "KmsKeyId": "arn:aws:kms:..."
}
```

#### AWS::Logs::LogGroup
```json
{
  "KmsKeyId": "arn:aws:kms:..."
}
```

### Common Resources
- AWS::SNS::Topic
- AWS::SQS::Queue
- AWS::SecretsManager::Secret
- AWS::Logs::LogGroup
- AWS::Lambda::Function
- AWS::Lambda::EventSourceMapping
- AWS::CloudTrail::Trail
- AWS::CodeBuild::Project
- AWS::Glue::SecurityConfiguration
- AWS::Backup::BackupVault

### Usage Pattern
```typescript
// Encryption enabled by setting KMS key
resource.kmsKeyId = 'arn:aws:kms:...';

// Omit property for default encryption
// (service-specific default behavior)
```

---

## Pattern 4: other (62 resources, 31.0%)

### Description
Non-standard encryption patterns that don't fit the above categories. Includes edge cases, metadata properties, and service-specific configurations.

### Characteristics
- **Heterogeneous**: No consistent structure
- **Edge cases**: Properties that match search pattern but aren't encryption config
- **Metadata**: Encryption context, modes, or related settings
- **Service-specific**: Unique to particular service requirements

### Examples

#### AWS::IAM::SAMLProvider
```json
{
  "AssertionEncryptionMode": "encrypted"
}
```
*Encryption mode setting, not key configuration*

#### AWS::Events::EventBus
```json
{
  "KmsKeyIdentifier": "..."
}
```
*Non-standard property name*

#### AWS::WorkSpacesWeb::UserSettings
```json
{
  "AdditionalEncryptionContext": {
    "key": "value"
  }
}
```
*Encryption context metadata, not configuration*

### Common Scenarios
1. **Encryption context**: Metadata for encryption operations
2. **Encryption modes**: Settings rather than enablement
3. **Non-standard names**: Variations like `KmsKeyIdentifier` vs `KmsKeyId`
4. **Partial matches**: Properties containing "encrypt" but unrelated to at-rest encryption
5. **Transit encryption**: Properties for in-transit rather than at-rest

### Requires Manual Review
Resources in this category should be individually reviewed to determine:
- Is this actually encryption at rest configuration?
- Should it be reclassified into another pattern?
- Is it a new pattern that should be defined?

---

## Pattern Selection Guide

### When to Use boolean_kms
- Storage resources (volumes, file systems)
- Resources where encryption is optional
- Need explicit opt-in/opt-out
- Clear separation between enablement and key selection

### When to Use complex
- Multiple encryption algorithms supported
- Rich configuration options needed
- Service-specific encryption features
- Nested configuration structure required

### When to Use kms_only
- Managed services with default encryption
- Encryption always enabled
- Only need to specify custom key
- Simplest user experience desired

### When Pattern is "other"
- Property matches search but isn't encryption config
- Encryption context or metadata
- Non-standard property names
- Requires manual classification

---

## Pattern Recognition Algorithm

```python
def classify_pattern(resource):
    props = resource.encryptionProperties
    
    # Check for boolean + KMS pattern
    has_boolean = any(p.name.lower() == 'encrypted' and p.type == 'boolean' for p in props)
    has_kms = any('kms' in p.name.lower() and p.type == 'string' for p in props)
    
    if has_boolean and has_kms:
        return 'boolean_kms'
    
    # Check for complex pattern
    has_complex = any(p.type == 'complex' for p in props)
    if has_complex:
        return 'complex'
    
    # Check for KMS only pattern
    if has_kms and not has_boolean:
        return 'kms_only'
    
    # Everything else
    return 'other'
```

---

## Implementation Recommendations

### For CDK L2 Constructs

#### boolean_kms Pattern
```typescript
interface EncryptionProps {
  encrypted?: boolean;
  encryptionKey?: kms.IKey;
}

// Default: encrypted with AWS-managed key
const defaultProps = { encrypted: true };
```

#### complex Pattern
```typescript
interface EncryptionConfig {
  algorithm: EncryptionAlgorithm;
  key?: kms.IKey;
  additionalOptions?: Record<string, any>;
}
```

#### kms_only Pattern
```typescript
interface EncryptionProps {
  encryptionKey?: kms.IKey;
  // Encryption always enabled, key optional
}
```

### For Compliance Scanning

```typescript
function hasEncryptionEnabled(resource: CfnResource): boolean {
  const pattern = getPattern(resource.type);
  
  switch (pattern) {
    case 'boolean_kms':
      return resource.properties.Encrypted === true;
    case 'complex':
      return resource.properties.EncryptionConfiguration !== undefined;
    case 'kms_only':
      return resource.properties.KmsKeyId !== undefined;
    default:
      return false; // Requires manual review
  }
}
```

---

## Statistics Summary

- **Total resources analyzed**: 1,472
- **Resources with encryption**: 200 (13.6%)
- **Most common pattern**: kms_only (35.5%)
- **Clearest pattern**: boolean_kms (2.5%, but most explicit)
- **Most flexible pattern**: complex (31.0%)
- **Needs review**: other (31.0%)

## Pattern Evolution

Historical trends show:
1. **Older services**: Often use boolean_kms pattern
2. **Newer services**: Prefer kms_only (encryption by default)
3. **Complex services**: Use complex pattern for flexibility
4. **Managed services**: Trending toward kms_only with default encryption
