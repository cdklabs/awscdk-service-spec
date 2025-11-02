# Encryption At Rest Configuration Data

This directory contains structured data about encryption at rest configuration for AWS CloudFormation resources.

## Files

- **schema.json**: JSON Schema defining the structure for encryption configuration data
- **data.json**: Actual encryption configuration data for AWS resources

## Patterns

The data categorizes resources into 5 encryption configuration patterns:

### 1. boolean-and-key
Simple pattern with a boolean flag to enable encryption and an optional KMS key ID.
- Example: AWS::EFS::FileSystem

### 2. configuration-object
Complex nested configuration structure with multiple encryption options.
- Example: AWS::S3::Bucket

### 3. specification-object
Wrapper object containing enable flag and encryption options.
- Example: AWS::DynamoDB::Table, AWS::OpenSearchService::Domain

### 4. multiple-contexts
Different encryption settings for different data contexts (storage, backups, etc.).
- Example: AWS::RDS::DBInstance

### 5. type-based-selection
Encryption type selection determines which additional properties are required.
- Example: AWS::ECR::Repository

## Property Purposes

Each encryption property is classified by its purpose:

- **enable-flag**: Boolean property to turn encryption on/off
- **kms-key-id**: String property specifying a KMS key identifier
- **encryption-type**: String property selecting encryption algorithm or type
- **configuration**: Complex object containing multiple encryption settings
- **algorithm**: Specific encryption algorithm selection

## Usage

This data can be used to:
1. Validate encryption configurations in CloudFormation templates
2. Generate documentation about encryption options
3. Build tools that help users configure encryption correctly
4. Analyze encryption coverage across AWS resources

## Contributing

To add a new resource:
1. Identify the encryption pattern it follows
2. List all encryption-related properties with their metadata
3. Document the default behavior
4. Add any relevant notes about constraints or special behaviors
