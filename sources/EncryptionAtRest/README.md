# Encryption At Rest Configuration Data

This directory contains structured data about encryption at rest configuration for AWS CloudFormation resources.

## Files

- **schema.json**: JSON Schema defining the structure for encryption configuration data
- **data.json**: Actual encryption configuration data for AWS resources

## Property Purposes

Each encryption property is classified by its purpose:

### enable-flag
Boolean property to turn encryption on/off.
- Example: `StorageEncrypted`, `Encrypted`, `SSEEnabled`
- When present, must be set to `true` to enable encryption

### kms-key-id
String property specifying a KMS key identifier (ID, ARN, or alias).
- Example: `KmsKeyId`, `KmsKeyArn`, `EncryptionKey`
- Optional in most cases; uses AWS-managed key if not specified

### encryption-type
String property selecting encryption algorithm or key management type.
- Example: `SSEAlgorithm`, `EncryptionType`, `CmkType`
- Common values: `AES256`, `aws:kms`, `KMS`, `CUSTOMER_MANAGED_KMS_KEY`

### configuration
Complex object containing multiple encryption settings.
- Example: `EncryptionConfiguration`, `SSESpecification`, `EncryptionOptions`
- Acts as a container for nested encryption properties

## Configuration Approaches

### Top-Level Properties
Simple resources with encryption properties directly on the resource.
```yaml
AWS::EC2::Volume:
  Encrypted: true          # enable-flag
  KmsKeyId: <key-arn>      # kms-key-id
```

### Nested Configuration Objects
Resources with encryption settings in a nested object.
```yaml
AWS::DynamoDB::Table:
  SSESpecification:        # configuration
    SSEEnabled: true       # enable-flag (nested)
    KMSMasterKeyId: <key>  # kms-key-id (nested)
```

### Multiple Contexts
Resources with different encryption settings for different data types.
```yaml
AWS::RDS::DBInstance:
  StorageEncrypted: true              # enable-flag (context: storage)
  KmsKeyId: <key>                     # kms-key-id (context: storage)
  PerformanceInsightsKMSKeyId: <key>  # kms-key-id (context: performance-insights)
```

Properties with the same `context` value are grouped and applied together.

## Usage

This data can be used to:
1. Automatically apply encryption to CloudFormation resources
2. Validate encryption configurations in templates
3. Generate documentation about encryption options
4. Build tools that help users configure encryption correctly
5. Analyze encryption coverage across AWS resources

## Contributing

To add a new resource:
1. Identify all encryption-related properties
2. Classify each property by its `purpose`
3. For nested properties, specify the full `path`
4. For multiple encryption contexts, specify the `context`
5. Document the default behavior
6. Add any relevant notes about constraints or special behaviors
