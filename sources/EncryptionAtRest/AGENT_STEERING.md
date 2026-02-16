# Encryption at Rest Data Population

## Objective

Systematically discover and document encryption at rest configuration for all AWS CloudFormation resources in `sources/EncryptionAtRest/data.json`.

## Data Sources

1. **Service Spec Database**: `packages/@aws-cdk/aws-service-spec/db.json.gz`
   - Load via: `loadAwsServiceSpecSync()` from `@aws-cdk/aws-service-spec`
   - Contains all CloudFormation resources with properties and documentation

2. **AWS CloudFormation Documentation**
   - Access via: `aws___read_documentation` MCP tool
   - Base URL pattern: `https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/`
   - Use for: Property details, default behaviors, constraints

3. **AWS Service Documentation**
   - Access via: `aws___search_documentation` MCP tool
   - Use for: Understanding encryption features and behaviors

## Discovery Process

### Step 1: Identify Resources with Encryption Properties

Run keyword-based search on all resources in the service spec database:

```typescript
const encryptionKeywords = [
  'encrypt',      // Matches: Encrypted, Encryption, EncryptionConfiguration
  'kms',          // Matches: KmsKeyId, KMSMasterKeyId
  'sse',          // Matches: SSESpecification, SSEEnabled
  'serverside',   // Matches: ServerSideEncryption
];

// EXCLUDE these patterns (encryption in transit, not at rest)
const excludeKeywords = [
  'nodetonode',   // Node-to-node encryption (in transit)
  'intransit',    // Explicit in-transit encryption
  'transit',      // Transit encryption
];
```

**CRITICAL: Distinguish Settable Properties from Read-Only Attributes**

Before including any encryption-related field, verify whether it is:

1. **Settable Property** (INCLUDE in data.json):
   - Appears under `Properties` in CloudFormation syntax
   - Can be configured by users when creating/updating the resource
   - Example: `AWS::EFS::FileSystem` has `KmsKeyId` as a settable property

2. **Read-Only Attribute** (DO NOT INCLUDE in data.json):
   - Appears under `Return values` / `Fn::GetAtt` in CloudFormation docs
   - Cannot be set by users - only returned after resource creation
   - In CDK, these appear as `attr*` getters (e.g., `attrEncryptionKmsKeyId`)
   - Example: `AWS::EC2::EnclaveCertificateIamRoleAssociation` returns `EncryptionKmsKeyId` via `Fn::GetAtt` - this is the AWS-managed key ID, not a user-configurable property

**Verification Steps:**

1. Check CloudFormation documentation - is the field under "Properties" or "Return values"?
2. Check the service spec database - is it in `properties` or `attributes`?
3. If in doubt, check the CDK L1 class - settable properties have setters, read-only attributes have `attr*` getters only

For each resource:

1. Check all top-level properties for encryption keywords
2. Exclude properties matching transit/in-transit patterns
3. Record resource type and matching properties

### Step 2: Classify Pattern Type

For each resource with encryption properties, determine which pattern it follows:

#### Pattern 1: boolean-and-key

**Indicators**:

- Has a boolean property (e.g., `Encrypted`, `StorageEncrypted`)
- Has a string property for KMS key (e.g., `KmsKeyId`)
- No complex nested configuration object
- Both properties are at the same level

**Example**: AWS::EFS::FileSystem

```yaml
Properties:
  Encrypted: Boolean          # Optional, enables encryption
  KmsKeyId: String           # Optional, specifies custom KMS key
```

#### Pattern 2: configuration-object

**Indicators**:

- Has a complex object property with "Configuration" or similar in name
- Object contains nested structure with multiple options
- Supports multiple encryption types/algorithms
- May have array of rules or configurations

**Example**: AWS::S3::Bucket (BucketEncryption)

```yaml
Properties:
  BucketEncryption:           # Optional configuration object
    ServerSideEncryptionConfiguration:
      - ServerSideEncryptionByDefault:
          SSEAlgorithm: String
          KMSMasterKeyID: String
```

#### Pattern 3: specification-object

**Indicators**:

- Has a complex object property with "Specification" or "Options" in name
- Object contains an enable flag (e.g., `Enabled`, `SSEEnabled`)
- Enable flag is required if the specification object is present
- Additional properties for type and key are optional

**Example**: AWS::DynamoDB::Table (SSESpecification)

```yaml
Properties:
  SSESpecification:           # Optional specification object
    SSEEnabled: Boolean       # Required within spec
    SSEType: String          # Optional, defaults to KMS
    KMSMasterKeyId: String   # Optional, custom key
```

#### Pattern 4: multiple-contexts

**Indicators**:

- Has multiple separate encryption properties
- Each property applies to a different data context
- Examples: storage, backups, performance data, replication
- Each context has its own enable flag and/or key

**Example**: AWS::RDS::DBInstance

```yaml
Properties:
  StorageEncrypted: Boolean                      # Storage encryption
  KmsKeyId: String                              # Storage encryption key
  PerformanceInsightsKMSKeyId: String          # Performance Insights encryption
  AutomaticBackupReplicationKmsKeyId: String   # Backup replication encryption
```

#### Pattern 5: type-based-selection

**Indicators**:

- Has an encryption type/algorithm selection property
- Type selection determines which other properties are required
- Usually has enum values for different encryption types
- Key property required only for certain types

**Example**: AWS::ECR::Repository

```yaml
Properties:
  EncryptionConfiguration:
    EncryptionType: String    # AES256, KMS, or KMS_DSSE
    KmsKey: String           # Required if using KMS
```

### Step 3: Extract Property Details

For each encryption property, extract:

1. **name**: CloudFormation property name (e.g., "Encrypted", "KmsKeyId")
2. **path**: Full path for nested properties (e.g., "SSESpecification.SSEEnabled")
3. **type**: One of: "boolean", "string", "object"
4. **required**: true/false (from service spec)
5. **purpose**: One of:
   - `enable-flag`: Boolean to turn encryption on/off
   - `kms-key-id`: String specifying KMS key
   - `encryption-type`: Property (string or boolean) selecting between customer-managed and AWS-managed encryption
   - `configuration`: Complex object with multiple settings
6. **keyTypeValues**: For `encryption-type` properties, a record with:
   - `customerManaged`: Value to use for customer-managed KMS key encryption
   - `awsManaged`: Value to use for AWS-managed key encryption

   Example for string enum:

   ```json
   "keyTypeValues": { "customerManaged": "aws:kms", "awsManaged": "AES256" }
   ```

   Example for boolean:

   ```json
   "keyTypeValues": { "customerManaged": false, "awsManaged": true }
   ```

7. **context**: For multiple-contexts pattern, what this encrypts (e.g., "storage", "backups")

### Step 4: Determine Default Behavior

Research and document default encryption behavior using AWS documentation:

1. Check if encryption is enabled by default
2. Identify which key is used by default (AWS-managed, service-managed, or none)
3. Note any recent changes to defaults (e.g., S3 now encrypts by default)
4. Document any conditions that affect defaults

**Common patterns**:

- "Not encrypted by default"
- "Uses AWS-managed key by default"
- "Uses service default key if not specified"
- "Encryption enabled by default as of [date]"

### Step 5: Document Special Notes

Capture important constraints and behaviors:

1. **Immutability**: Can encryption be changed after creation?
   - "Cannot be changed after creation"
   - "Causes resource replacement"
   - "No interruption"

2. **Dependencies**: Are there property dependencies?
   - "If KmsKeyId is specified, Encrypted must be true"
   - "Required if fine-grained access control is enabled"

3. **Key requirements**: What key formats are accepted?
   - "Key ID, ARN, alias name, or alias ARN"
   - "Must exist in same region"

4. **Deprecations**: Is the resource being replaced?
   - "Being replaced by AWS::NewService::Resource"

5. **Special behaviors**: Any unique characteristics?
   - "Supports multiple encryption types"
   - "Different keys for different data types"

## Detailed Resource Examples

### AWS::S3::Bucket

**Encryption Property**: `BucketEncryption`

- **Type**: Complex object (ServerSideEncryptionConfiguration)
- **Required**: No
- **Default Behavior**: No default encryption (but AWS now enables by default for new buckets)
- **Options**:
  - SSE-S3: Amazon S3-managed keys (AES256)
  - SSE-KMS: AWS KMS-managed keys
  - DSSE-KMS: Dual-layer server-side encryption with KMS

**Key Insight**: S3 uses a configuration array allowing multiple encryption rules, though typically only one is used.

### AWS::RDS::DBInstance

**Encryption Properties**:

1. `StorageEncrypted` (Boolean) - Enables storage encryption
2. `KmsKeyId` (String) - KMS key for storage encryption
3. `PerformanceInsightsKMSKeyId` (String) - Separate key for Performance Insights
4. `AutomaticBackupReplicationKmsKeyId` (String) - Key for backup replication

**Key Insight**: RDS has multiple encryption contexts, each with its own key. Storage encryption must be enabled via boolean flag, then optionally specify custom key.

### AWS::DynamoDB::Table

**Encryption Property**: `SSESpecification`

- **Type**: Complex object
- **Required**: No
- **Sub-properties**:
  - `SSEEnabled` (Boolean) - Required if SSESpecification is present
  - `SSEType` (String) - Optional, only "KMS" is supported
  - `KMSMasterKeyId` (String) - Optional, uses default DynamoDB key if not specified

**Key Insight**: DynamoDB requires explicit enable flag within the specification object. Default encryption uses AWS-managed key.

### AWS::EFS::FileSystem

**Encryption Properties**:

1. `Encrypted` (Boolean) - Enables encryption
2. `KmsKeyId` (String) - Optional custom KMS key

**Key Insight**: Simple pattern - boolean to enable, optional key for customization. Cannot be changed after creation.

### AWS::OpenSearchService::Domain

**Encryption Property**: `EncryptionAtRestOptions`

- **Type**: Complex object
- **Sub-properties**:
  - `Enabled` (Boolean) - Enables encryption at rest
  - `KmsKeyId` (String) - Optional custom KMS key

**Key Insight**: Uses configuration object pattern with enable flag. Note that OpenSearch also has `NodeToNodeEncryptionOptions` but that's for encryption in transit, not at rest.

### AWS::ECR::Repository

**Encryption Property**: `EncryptionConfiguration`

- **Type**: Complex object
- **Sub-properties**:
  - `EncryptionType` (String) - AES256, KMS, or KMS_DSSE
  - `KmsKey` (String) - Required if using KMS encryption

**Key Insight**: Default is AES256 (S3-managed). Must specify type before specifying key.

## Output Format

Add entries to `sources/EncryptionAtRest/data.json` following this structure:

```json
{
  "AWS::Service::Resource": {
    "properties": [
      {
        "name": "PropertyName",
        "path": "Optional.Nested.Path",
        "type": "boolean|string|object",
        "required": false,
        "purpose": "enable-flag|kms-key-id|encryption-type|configuration",
        "keyTypeValues": {
          "customerManaged": "value-for-cmk",
          "awsManaged": "value-for-aws-key"
        },
        "context": "storage|backups|etc"
      }
    ],
    "defaultBehavior": "Description of default encryption behavior",
    "notes": "Important constraints, dependencies, or special behaviors"
  }
}
```

Note: `keyTypeValues` is only used for `encryption-type` properties. It specifies what value to set for customer-managed vs AWS-managed encryption.

## Prioritization

Process resources in this order:

1. **High Priority** (commonly used services):
   - Storage: S3, EBS, EFS
   - Databases: RDS, DynamoDB, Aurora, Redshift
   - Analytics: Athena, Glue, EMR
   - Compute: EC2, Lambda
   - Containers: ECR, ECS, EKS

2. **Medium Priority** (frequently used):
   - Messaging: SQS, SNS, Kinesis
   - Search: OpenSearch, Elasticsearch
   - Caching: ElastiCache, DAX
   - Backup: Backup vaults
   - Logs: CloudWatch Logs

3. **Lower Priority** (specialized services):
   - All other services with encryption properties

## Automation Approach

Create a script that:

1. Loads service spec database
2. Scans all resources for encryption keywords
3. Filters out in-transit encryption
4. Groups by pattern type (best effort)
5. Generates initial entries with property metadata
6. Flags entries needing manual review for:
   - Pattern classification
   - Default behavior
   - Special notes

Then manually:

1. Review and correct pattern classifications
2. Research and add default behaviors
3. Add notes about constraints and special cases
4. Validate against AWS documentation

## Validation Checklist

For each resource entry, verify:

- [ ] **Property is settable, NOT a read-only attribute** (check CloudFormation docs: Properties vs Return values)
- [ ] Pattern type is one of the 5 defined patterns
- [ ] All encryption properties are listed
- [ ] Each property has name, type, required, and purpose
- [ ] Nested properties include full path
- [ ] String properties with limited values have acceptedValues
- [ ] Multiple-contexts properties have context specified
- [ ] Default behavior is documented
- [ ] Special constraints are noted
- [ ] Information is accurate per AWS documentation

## Key Findings

### Encryption is Mostly Optional

- 94.8% of encryption properties are optional
- Services often provide default encryption with AWS-managed keys
- Custom KMS keys are almost always optional

### KMS Key Flexibility

- Most services accept: Key ID, ARN, Alias Name, or Alias ARN
- Default behavior: Use AWS-managed service key
- Custom keys must exist in same region as resource

### Immutability Considerations

- Some encryption settings cannot be changed after creation (EFS)
- Others can be updated without interruption (DynamoDB, S3)
- Check CloudFormation update behavior for each property

## Limitations

### Property Name Matching

- Keyword-based matching may miss non-standard names
- May include false positives
- Manual review recommended for critical resources

### Nested Type Analysis

- Deep nested analysis requires recursive type resolution
- Some encryption settings may be in deeply nested structures

### Documentation Completeness

- Not all properties have complete documentation in spec
- AWS documentation provides more context
- Some default behaviors are implicit

## Example Workflow

For a new resource `AWS::Example::Service`:

1. **Discover**: Find it has properties `EncryptionEnabled` (boolean) and `KmsKeyArn` (string)
2. **Classify**: Pattern is "boolean-and-key"
3. **Extract**: Both properties are optional, top-level
4. **Research**: Check AWS docs - not encrypted by default, uses default key if enabled without KmsKeyArn
5. **Document**: Create entry with pattern, properties, default behavior
6. **Validate**: Verify against CloudFormation template reference
7. **Add**: Insert into data.json in alphabetical order

## Success Criteria

Complete when:

- All resources with encryption properties are documented
- Each entry follows the schema
- Pattern classifications are accurate
- Default behaviors are researched and documented
- Special constraints are noted
- Data validates against schema.json
