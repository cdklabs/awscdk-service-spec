#!/bin/bash
# Complete extraction script following EXTRACTION_INSTRUCTIONS.md

OUTPUT="examples/encryption-data-complete.json"
SCHEMA_DIR="sources/CloudFormationSchema/us-east-1"
TEMP_DIR=$(mktemp -d)

echo "Starting complete encryption data extraction..."

# Initialize output
cat > "$OUTPUT" << 'EOF'
{
  "metadata": {
    "extractionDate": "",
    "totalResources": 0,
    "resourcesWithEncryption": 0,
    "schemaSource": "sources/CloudFormationSchema/us-east-1"
  },
  "resources": [],
  "statistics": {
    "byPattern": {
      "boolean_kms": 0,
      "complex": 0,
      "kms_only": 0,
      "other": 0
    },
    "byService": {}
  }
}
EOF

TOTAL=0
WITH_ENC=0

for schema in "$SCHEMA_DIR"/*.json; do
  TOTAL=$((TOTAL + 1))
  
  CFN_TYPE=$(jq -r '.typeName // empty' "$schema" 2>/dev/null)
  [ -z "$CFN_TYPE" ] && continue
  
  FILENAME=$(basename "$schema")
  
  # Find encryption properties
  ENC_PROPS=$(jq -c '.properties | to_entries | map(select(.key | test("(?i)encrypt|kms|sse"))) | 
    map({
      name: .key,
      required: (.value.required // false),
      type: (if .value."$ref" then "complex" elif .value.type == "array" then "array" else "primitive" end),
      primitiveType: .value.type,
      referenceType: (.value."$ref" // "" | sub("#/definitions/"; "")),
      description: (.value.description // "N/A" | .[0:200])
    })' "$schema" 2>/dev/null)
  
  [ "$ENC_PROPS" = "[]" ] && continue
  
  WITH_ENC=$((WITH_ENC + 1))
  
  # Classify pattern
  HAS_BOOL=$(echo "$ENC_PROPS" | jq 'map(select(.name | test("^encrypted$"; "i")) and .primitiveType == "boolean") | length > 0')
  HAS_KMS=$(echo "$ENC_PROPS" | jq 'map(select(.name | test("kms"; "i")) and .primitiveType == "string") | length > 0')
  HAS_COMPLEX=$(echo "$ENC_PROPS" | jq 'map(select(.type == "complex")) | length > 0')
  
  if [ "$HAS_BOOL" = "true" ] && [ "$HAS_KMS" = "true" ]; then
    PATTERN="boolean_kms"
  elif [ "$HAS_COMPLEX" = "true" ]; then
    PATTERN="complex"
  elif [ "$HAS_KMS" = "true" ]; then
    PATTERN="kms_only"
  else
    PATTERN="other"
  fi
  
  # Create resource entry
  jq -n --arg cfn "$CFN_TYPE" --arg file "$FILENAME" --arg pattern "$PATTERN" --argjson props "$ENC_PROPS" '{
    cloudFormationType: $cfn,
    schemaFile: $file,
    encryptionProperties: $props,
    pattern: $pattern
  }' > "$TEMP_DIR/resource_$WITH_ENC.json"
done

# Combine all resources
jq -s '.' "$TEMP_DIR"/resource_*.json > "$TEMP_DIR/all_resources.json"

# Update output with metadata and resources
jq --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   --argjson total "$TOTAL" \
   --argjson withEnc "$WITH_ENC" \
   --slurpfile resources "$TEMP_DIR/all_resources.json" '
  .metadata.extractionDate = $date |
  .metadata.totalResources = $total |
  .metadata.resourcesWithEncryption = $withEnc |
  .resources = $resources[0]
' "$OUTPUT" > "$TEMP_DIR/final.json"

# Calculate statistics
jq '.resources | group_by(.pattern) | map({key: .[0].pattern, value: length}) | from_entries' "$TEMP_DIR/final.json" > "$TEMP_DIR/by_pattern.json"
jq '.resources | group_by(.cloudFormationType | split("::")[0:2] | join("::")) | map({key: .[0].cloudFormationType | split("::")[0:2] | join("::"), value: length}) | from_entries' "$TEMP_DIR/final.json" > "$TEMP_DIR/by_service.json"

jq --slurpfile byPattern "$TEMP_DIR/by_pattern.json" \
   --slurpfile byService "$TEMP_DIR/by_service.json" '
  .statistics.byPattern = $byPattern[0] |
  .statistics.byService = $byService[0]
' "$TEMP_DIR/final.json" > "$OUTPUT"

rm -rf "$TEMP_DIR"

echo "Extraction complete!"
echo "Output: $OUTPUT"
echo "Total resources: $TOTAL"
echo "With encryption: $WITH_ENC"
