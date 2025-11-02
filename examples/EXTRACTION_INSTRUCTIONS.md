# Encryption at Rest Extraction Instructions

## Objective
Extract encryption at rest configuration for ALL AWS CloudFormation resources and populate a comprehensive data file.

## Data Source Location
```
sources/CloudFormationSchema/us-east-1/*.json
```

## Identification Criteria

### Property Name Pattern
Match properties where name contains (case-insensitive):
- `encrypt`
- `kms`
- `sse`

### Regex Pattern
```regex
(?i)encrypt|kms|sse
```

## Required Data Points

For each resource with encryption properties, extract:

### 1. Resource Identification
- `cloudFormationType` - from `.typeName` in schema file
- `schemaFile` - filename (e.g., "aws-s3-bucket.json")

### 2. Property Details
For each encryption property:
- `name` - property name
- `required` - boolean from `.required` field (default: false)
- `type` - "primitive", "complex", or "array"
- `primitiveType` - if type is primitive: "string", "boolean", "integer"
- `referenceType` - if type is complex: the definition name from `$ref`
- `description` - from `.description` field (first 200 chars)

### 3. Type Resolution
If property has `$ref`:
- Follow to `.definitions[definitionName]`
- Extract nested structure (max 2 levels deep)
- Record nested property names and types

### 4. Pattern Classification
Classify into one of:
- `boolean_kms` - Has boolean encrypt flag + KMS key property
- `complex` - Single property with nested object structure
- `kms_only` - Only KMS key property, no boolean flag
- `other` - Doesn't fit above patterns

### 5. Default Behavior
Extract from documentation:
- Is encryption enabled by default?
- What key is used if none specified?
- Any special conditions?

## Pattern Classification Rules

### Pattern A: boolean_kms
```
IF (has property matching /^encrypted$/i with type=boolean) AND
   (has property matching /kms.*key/i with type=string)
THEN classify as "boolean_kms"
```

### Pattern B: complex
```
IF (property has $ref) AND
   (referenced definition has nested properties OR array items)
THEN classify as "complex"
```

### Pattern C: kms_only
```
IF (has property matching /kms/i with type=string) AND
   (no boolean encrypt property exists)
THEN classify as "kms_only"
```

## Extraction Commands

### List All Schema Files
```bash
ls sources/CloudFormationSchema/us-east-1/*.json
```

### Extract CloudFormation Type
```bash
jq -r '.typeName' <schema-file>
```

### Find Encryption Properties
```bash
jq '.properties | to_entries | map(select(.key | test("(?i)encrypt|kms|sse")))' <schema-file>
```

### Get Property Details
```bash
jq -r --arg prop "PropertyName" '
  .properties[$prop] | {
    required: (.required // false),
    type: .type,
    ref: ."$ref",
    description: .description
  }
' <schema-file>
```

### Resolve Reference
```bash
REF=$(jq -r --arg prop "PropertyName" '.properties[$prop]."$ref"' <schema-file>)
DEF=$(echo "$REF" | sed 's|#/definitions/||')
jq --arg def "$DEF" '.definitions[$def]' <schema-file>
```

## Output Format

### JSON Structure
```json
{
  "metadata": {
    "extractionDate": "ISO-8601 timestamp",
    "totalResources": 0,
    "resourcesWithEncryption": 0,
    "schemaSource": "sources/CloudFormationSchema/us-east-1"
  },
  "resources": [
    {
      "cloudFormationType": "AWS::Service::Resource",
      "schemaFile": "aws-service-resource.json",
      "encryptionProperties": [
        {
          "name": "PropertyName",
          "required": false,
          "type": "primitive|complex|array",
          "primitiveType": "string|boolean|integer",
          "referenceType": "DefinitionName",
          "description": "First 200 chars...",
          "nestedStructure": {
            "property1": "type",
            "property2": "type"
          }
        }
      ],
      "pattern": "boolean_kms|complex|kms_only|other",
      "defaultBehavior": "Description of default encryption behavior"
    }
  ],
  "statistics": {
    "byPattern": {
      "boolean_kms": 0,
      "complex": 0,
      "kms_only": 0,
      "other": 0
    },
    "byService": {
      "AWS::S3": 0,
      "AWS::EC2": 0
    }
  }
}
```

## Extraction Script Template

```bash
#!/bin/bash
OUTPUT="encryption-data-complete.json"
SCHEMA_DIR="sources/CloudFormationSchema/us-east-1"

echo '{"metadata":{},"resources":[]}' > "$OUTPUT"

for schema in "$SCHEMA_DIR"/*.json; do
  CFN_TYPE=$(jq -r '.typeName // empty' "$schema")
  [ -z "$CFN_TYPE" ] && continue
  
  # Find encryption properties
  ENC_PROPS=$(jq '.properties | to_entries | map(select(.key | test("(?i)encrypt|kms|sse")))' "$schema")
  [ "$ENC_PROPS" = "[]" ] && continue
  
  # Extract details for each property
  # Classify pattern
  # Add to output JSON
done
```

## Validation Checklist

- [ ] All 1,472 resources scanned
- [ ] ~200 resources with encryption identified
- [ ] Each resource has cloudFormationType
- [ ] Each property has name, required, type
- [ ] Complex types have nestedStructure
- [ ] Pattern classification applied
- [ ] Statistics calculated
- [ ] Output is valid JSON

## Quality Checks

### Completeness
- Every schema file processed
- No encryption properties missed
- All $ref pointers resolved

### Accuracy
- CloudFormation types match schema
- Required flags correct
- Type classifications accurate
- Pattern assignments valid

### Consistency
- Uniform JSON structure
- Consistent naming conventions
- Complete nested structures

## Expected Results

- **Total Resources**: ~1,472
- **With Encryption**: ~200 (13-14%)
- **Pattern Distribution**:
  - boolean_kms: ~40%
  - complex: ~30%
  - kms_only: ~30%

## Output File Location
```
examples/encryption-data-complete.json
```

## Automated Extraction

A complete extraction script is provided:
```bash
./examples/extract-complete-data.sh
```

This script:
- Processes all 1,472 CloudFormation resources
- Extracts ~200 resources with encryption properties
- Classifies patterns automatically
- Generates statistics by pattern and service
- Outputs to `examples/encryption-data-complete.json`

## Processing Notes

### Skip These Properties
- Properties named "EncryptionContext" (metadata, not configuration)
- Properties in non-resource schemas
- Deprecated properties (check for deprecation notices)

### Special Cases
- **Arrays of encryption rules**: Extract first item structure
- **Union types**: Record all possible types
- **Conditional properties**: Note conditions in description

### Performance
- Process files in parallel if possible
- Cache resolved definitions
- Limit description to 200 chars

## Verification Commands

```bash
# Count total resources
jq '.metadata.totalResources' encryption-data-complete.json

# Count by pattern
jq '.statistics.byPattern' encryption-data-complete.json

# List all S3 resources
jq '.resources[] | select(.cloudFormationType | startswith("AWS::S3"))' encryption-data-complete.json

# Validate JSON
jq empty encryption-data-complete.json && echo "Valid JSON"
```

## Error Handling

- **Missing typeName**: Skip file, log warning
- **Invalid JSON**: Skip file, log error
- **Unresolvable $ref**: Record as "unresolved", continue
- **Missing definitions**: Record type as "unknown", continue

## Completion Criteria

1. All schema files processed
2. Output JSON validates
3. Statistics match expected ranges
4. Sample verification of 10 resources confirms accuracy
5. No duplicate resources in output
