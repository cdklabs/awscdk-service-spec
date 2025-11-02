# Instructions for Populating Encryption At Rest Data

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

#### Pattern 2: configuration-object
**Indicators**:
- Has a complex object property with "Configuration" or similar in name
- Object contains nested structure with multiple options
- Supports multiple encryption types/algorithms
- May have array of rules or configurations

**Example**: AWS::S3::Bucket (BucketEncryption)

#### Pattern 3: specification-object
**Indicators**:
- Has a complex object property with "Specification" or "Options" in name
- Object contains an enable flag (e.g., `Enabled`, `SSEEnabled`)
- Enable flag is required if the specification object is present
- Additional properties for type and key are optional

**Example**: AWS::DynamoDB::Table (SSESpecification)

#### Pattern 4: multiple-contexts
**Indicators**:
- Has multiple separate encryption properties
- Each property applies to a different data context
- Examples: storage, backups, performance data, replication
- Each context has its own enable flag and/or key

**Example**: AWS::RDS::DBInstance (StorageEncrypted, PerformanceInsightsKMSKeyId, etc.)

#### Pattern 5: type-based-selection
**Indicators**:
- Has an encryption type/algorithm selection property
- Type selection determines which other properties are required
- Usually has enum values for different encryption types
- Key property required only for certain types

**Example**: AWS::ECR::Repository (EncryptionType: AES256, KMS, KMS_DSSE)

### Step 3: Extract Property Details

For each encryption property, extract:

1. **name**: CloudFormation property name (e.g., "Encrypted", "KmsKeyId")
2. **path**: Full path for nested properties (e.g., "SSESpecification.SSEEnabled")
3. **type**: One of: "boolean", "string", "object"
4. **required**: true/false (from service spec)
5. **purpose**: One of:
   - `enable-flag`: Boolean to turn encryption on/off
   - `kms-key-id`: String specifying KMS key
   - `encryption-type`: String selecting encryption algorithm/type
   - `configuration`: Complex object with multiple settings
   - `algorithm`: Specific algorithm selection
6. **acceptedValues**: Array of valid values (for string/enum properties)
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

## Validation Checklist

For each resource entry, verify:

- [ ] Pattern type is one of the 5 defined patterns
- [ ] All encryption properties are listed
- [ ] Each property has name, type, required, and purpose
- [ ] Nested properties include full path
- [ ] String properties with limited values have acceptedValues
- [ ] Multiple-contexts properties have context specified
- [ ] Default behavior is documented
- [ ] Special constraints are noted
- [ ] Information is accurate per AWS documentation

## Output Format

Add entries to `sources/EncryptionAtRest/data.json` following this structure:

```json
{
  "AWS::Service::Resource": {
    "pattern": "pattern-type",
    "properties": [
      {
        "name": "PropertyName",
        "path": "Optional.Nested.Path",
        "type": "boolean|string|object",
        "required": false,
        "purpose": "enable-flag|kms-key-id|encryption-type|configuration|algorithm",
        "acceptedValues": ["value1", "value2"],
        "context": "storage|backups|etc"
      }
    ],
    "defaultBehavior": "Description of default encryption behavior",
    "notes": "Important constraints, dependencies, or special behaviors"
  }
}
```

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

## Quality Standards

Each entry must:
- Be accurate according to current AWS documentation
- Include all encryption-related properties (not just some)
- Correctly classify the pattern type
- Document default behavior clearly
- Note any important constraints or dependencies
- Use consistent terminology and formatting

## Maintenance

When updating:
- Check for new resources added to service spec
- Verify existing entries against latest AWS documentation
- Update default behaviors if AWS changes defaults
- Add notes about deprecations or replacements
- Keep pattern classifications current

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
