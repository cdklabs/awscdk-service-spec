# Encryption Property Extraction Workflow

## Data Flow

```
CloudFormation Resource Provider Schemas
              |
              v
sources/CloudFormationSchema/us-east-1/*.json
              |
              v
    [Pattern Matching]
    - Property name contains: encrypt|kms|sse
              |
              v
    [Property Extraction]
    - Name
    - Type (primitive or $ref)
    - Required status
    - Documentation
              |
              v
    [Type Resolution]
    - Follow $ref pointers
    - Extract nested definitions
    - Build complete structure
              |
              v
    [Classification]
    - Pattern A: Boolean + KMS
    - Pattern B: Complex Object
    - Pattern C: KMS Only
              |
              v
    [Output Generation]
    - JSON summary
    - Text reports
    - Structured data
```

## Example: S3 Bucket Encryption

### Step 1: Identify Property
```json
{
  "properties": {
    "BucketEncryption": {
      "$ref": "#/definitions/BucketEncryption",
      "description": "Specifies default encryption..."
    }
  }
}
```

### Step 2: Resolve Reference
```json
{
  "definitions": {
    "BucketEncryption": {
      "type": "object",
      "properties": {
        "ServerSideEncryptionConfiguration": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/ServerSideEncryptionRule"
          }
        }
      }
    }
  }
}
```

### Step 3: Resolve Nested Reference
```json
{
  "definitions": {
    "ServerSideEncryptionRule": {
      "type": "object",
      "properties": {
        "BucketKeyEnabled": { "type": "boolean" },
        "ServerSideEncryptionByDefault": {
          "$ref": "#/definitions/ServerSideEncryptionByDefault"
        }
      }
    }
  }
}
```

### Step 4: Final Structure
```json
{
  "definitions": {
    "ServerSideEncryptionByDefault": {
      "type": "object",
      "properties": {
        "SSEAlgorithm": {
          "type": "string",
          "enum": ["aws:kms", "AES256", "aws:kms:dsse"]
        },
        "KMSMasterKeyID": { "type": "string" }
      },
      "required": ["SSEAlgorithm"]
    }
  }
}
```

### Step 5: Classify Pattern
**Result**: Pattern B (Complex Configuration Object)

## Extraction Commands

### Quick Property List
```bash
jq '.properties | keys[] | select(test("(?i)encrypt|kms|sse"))' \
  sources/CloudFormationSchema/us-east-1/aws-s3-bucket.json
```

### Property Details
```bash
jq '.properties | to_entries | 
    map(select(.key | test("(?i)encrypt|kms|sse"))) | 
    .[] | {name: .key, required: .value.required, type: .value.type}' \
  sources/CloudFormationSchema/us-east-1/aws-s3-bucket.json
```

### Follow References
```bash
# Get reference
REF=$(jq -r '.properties.BucketEncryption."$ref"' \
  sources/CloudFormationSchema/us-east-1/aws-s3-bucket.json)

# Extract definition
DEF=$(echo "$REF" | sed 's|#/definitions/||')

# Get definition content
jq --arg def "$DEF" '.definitions[$def]' \
  sources/CloudFormationSchema/us-east-1/aws-s3-bucket.json
```

## Pattern Recognition Logic

```
IF property_name matches /encrypt|kms|sse/i THEN
  
  IF property.type == "boolean" AND 
     exists(sibling_property matching /kms/i) THEN
    CLASSIFY AS "Pattern A: Boolean + KMS"
  
  ELSE IF property."$ref" exists THEN
    RESOLVE reference
    IF nested_structure has multiple_levels THEN
      CLASSIFY AS "Pattern B: Complex Object"
    END IF
  
  ELSE IF property_name matches /kms/i AND 
          property.type == "string" THEN
    CLASSIFY AS "Pattern C: KMS Only"
  
  END IF
  
END IF
```

## Integration Points

### 1. CDK Code Generation
```typescript
// Use extracted data to generate constructs
interface EncryptionConfig {
  pattern: 'boolean_kms' | 'complex' | 'kms_only';
  properties: PropertyDefinition[];
  defaultBehavior: string;
}
```

### 2. Compliance Validation
```typescript
// Check if resource has encryption configured
function hasEncryption(resource: CfnResource): boolean {
  const encryptionProps = getEncryptionProperties(resource.type);
  return encryptionProps.some(prop => 
    resource.properties[prop.name] !== undefined
  );
}
```

### 3. Security Scanning
```bash
# Find all resources without encryption
for resource in $(list_all_resources); do
  if ! has_encryption_property "$resource"; then
    echo "WARNING: $resource has no encryption configured"
  fi
done
```
