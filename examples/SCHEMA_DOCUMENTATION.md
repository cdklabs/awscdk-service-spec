# Encryption Data JSON Schema Documentation

## Overview

The `encryption-data-schema.json` file defines the structure and validation rules for encryption at rest configuration data extracted from AWS CloudFormation resource schemas.

## Schema Location

```
examples/encryption-data-schema.json
```

## Validation

```bash
# Install ajv-cli
npm install -g ajv-cli

# Validate data file
ajv validate -s examples/encryption-data-schema.json -d examples/encryption-data-complete.json
```

## Root Structure

```json
{
  "metadata": { ... },
  "resources": [ ... ],
  "statistics": { ... }
}
```

### metadata (required)

Extraction metadata and summary information.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `extractionDate` | string | Yes | ISO-8601 timestamp (YYYY-MM-DDTHH:MM:SSZ) |
| `totalResources` | integer | Yes | Total CloudFormation resources scanned |
| `resourcesWithEncryption` | integer | Yes | Resources with encryption properties |
| `schemaSource` | string | Yes | Path to schema source directory |

**Example:**
```json
{
  "extractionDate": "2025-11-02T13:17:26Z",
  "totalResources": 1472,
  "resourcesWithEncryption": 200,
  "schemaSource": "sources/CloudFormationSchema/us-east-1"
}
```

### resources (required)

Array of resources with encryption configuration.

Each resource object contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cloudFormationType` | string | Yes | CloudFormation type (AWS::Service::Resource) |
| `schemaFile` | string | Yes | Source schema filename |
| `encryptionProperties` | array | Yes | Array of encryption properties (min 1) |
| `pattern` | string | Yes | Pattern classification (enum) |
| `defaultBehavior` | string | No | Default encryption behavior description |

**Pattern Values:**
- `boolean_kms` - Boolean flag + KMS key
- `complex` - Nested configuration object
- `kms_only` - Single KMS key property
- `other` - Non-standard pattern

**Example:**
```json
{
  "cloudFormationType": "AWS::S3::Bucket",
  "schemaFile": "aws-s3-bucket.json",
  "encryptionProperties": [ ... ],
  "pattern": "complex",
  "defaultBehavior": "AWS enables default encryption for new buckets"
}
```

### encryptionProperties

Array of encryption-related properties for a resource.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Property name in CloudFormation |
| `required` | boolean/array | Yes | Required status or array of required nested props |
| `type` | string | Yes | Type classification (enum) |
| `primitiveType` | string/null | No | Primitive type if applicable |
| `referenceType` | string | No | Referenced type definition name |
| `description` | string | No | Property description (max 200 chars) |
| `nestedStructure` | object | No | Nested property structure |

**Type Values:**
- `primitive` - Simple type (string, boolean, integer, number)
- `complex` - References a type definition
- `array` - Array type

**Primitive Type Values:**
- `string`
- `boolean`
- `integer`
- `number`
- `array`
- `object`
- `null`

**Example:**
```json
{
  "name": "BucketEncryption",
  "required": false,
  "type": "complex",
  "primitiveType": null,
  "referenceType": "BucketEncryption",
  "description": "Specifies default encryption for a bucket using server-side encryption..."
}
```

### statistics (required)

Statistical summary of extracted data.

#### byPattern (required)

Count of resources by encryption pattern.

```json
{
  "boolean_kms": 5,
  "complex": 62,
  "kms_only": 71,
  "other": 62
}
```

#### byService (required)

Count of resources by AWS service namespace (e.g., "AWS::S3", "AWS::EC2").

```json
{
  "AWS::S3": 1,
  "AWS::EC2": 11,
  "AWS::RDS": 5
}
```

## Validation Rules

### CloudFormation Type Pattern
```regex
^AWS::[A-Za-z0-9]+::[A-Za-z0-9]+$
```

Examples:
- ✅ `AWS::S3::Bucket`
- ✅ `AWS::DynamoDB::Table`
- ❌ `S3::Bucket` (missing AWS prefix)
- ❌ `AWS::S3` (missing resource name)

### Schema File Pattern
```regex
^aws-[a-z0-9]+-[a-z0-9]+\.json$
```

Examples:
- ✅ `aws-s3-bucket.json`
- ✅ `aws-dynamodb-table.json`
- ❌ `AWS-S3-Bucket.json` (uppercase)
- ❌ `s3-bucket.json` (missing aws prefix)

### Date Pattern
```regex
^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$
```

Example: `2025-11-02T13:17:26Z`

## Usage Examples

### TypeScript Type Generation

```typescript
import schema from './encryption-data-schema.json';
import { compile } from 'json-schema-to-typescript';

const types = await compile(schema, 'EncryptionData');
```

### Python Validation

```python
import json
import jsonschema

with open('encryption-data-schema.json') as f:
    schema = json.load(f)

with open('encryption-data-complete.json') as f:
    data = json.load(f)

jsonschema.validate(data, schema)
```

### Query Examples

```bash
# Get all resources with boolean_kms pattern
jq '.resources[] | select(.pattern == "boolean_kms")' encryption-data-complete.json

# Count resources by pattern
jq '.statistics.byPattern' encryption-data-complete.json

# Find resources for specific service
jq '.resources[] | select(.cloudFormationType | startswith("AWS::S3"))' encryption-data-complete.json

# Get all KMS-related properties
jq '.resources[].encryptionProperties[] | select(.name | test("(?i)kms"))' encryption-data-complete.json
```

## Schema Evolution

### Version 1.0 (Current)

- Initial schema definition
- Support for 4 pattern types
- Flexible `required` field (boolean or array)
- Primitive types include array and object

### Future Enhancements

Potential additions:
- Version field in metadata
- Compliance framework mappings
- Cross-region comparison data
- Historical change tracking
- Deprecation notices
- Security recommendations

## Extending the Schema

To add new fields:

1. Update `encryption-data-schema.json`
2. Update extraction script (`extract-complete-data.sh`)
3. Regenerate data file
4. Validate against new schema
5. Update this documentation

## Related Files

- **Data File**: `examples/encryption-data-complete.json`
- **Extraction Script**: `examples/extract-complete-data.sh`
- **Pattern Documentation**: `examples/ENCRYPTION_PATTERNS.md`
- **Extraction Instructions**: `examples/EXTRACTION_INSTRUCTIONS.md`
