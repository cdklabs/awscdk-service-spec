#!/bin/bash
# Extract detailed encryption configuration including nested structures

RESOURCE_FILE="$1"
SCHEMA_DIR="sources/CloudFormationSchema/us-east-1"

if [ -z "$RESOURCE_FILE" ]; then
  echo "Usage: $0 <resource-file-name>"
  echo "Example: $0 aws-s3-bucket"
  exit 1
fi

FILEPATH="${SCHEMA_DIR}/${RESOURCE_FILE}.json"

if [ ! -f "$FILEPATH" ]; then
  echo "Error: File not found: $FILEPATH"
  exit 1
fi

echo "=== Encryption Properties for ${RESOURCE_FILE} ==="
echo ""

# Extract encryption-related properties
PROPS=$(jq -r '.properties | to_entries | map(select(.key | test("(?i)encrypt|kms|sse"))) | .[]' "$FILEPATH")

if [ -z "$PROPS" ]; then
  echo "No encryption properties found."
  exit 0
fi

# For each encryption property
jq -r '.properties | to_entries | map(select(.key | test("(?i)encrypt|kms|sse"))) | .[] | .key' "$FILEPATH" | while read -r prop_name; do
  echo "Property: $prop_name"
  
  # Get property details
  jq -r --arg prop "$prop_name" '.properties[$prop] | 
    "  Required: \(.required // false)",
    "  Description: \(.description // "N/A")"' "$FILEPATH"
  
  # Check if it's a reference to a definition
  REF=$(jq -r --arg prop "$prop_name" '.properties[$prop]."$ref" // empty' "$FILEPATH")
  
  if [ -n "$REF" ]; then
    # Extract definition name from reference
    DEF_NAME=$(echo "$REF" | sed 's|#/definitions/||')
    echo "  Type: Complex Object -> $DEF_NAME"
    echo ""
    echo "  Structure:"
    
    # Show the nested structure
    jq --arg def "$DEF_NAME" '.definitions[$def]' "$FILEPATH" | head -50
  else
    # Show simple type
    TYPE=$(jq -r --arg prop "$prop_name" '.properties[$prop].type // "unknown"' "$FILEPATH")
    echo "  Type: $TYPE"
  fi
  
  echo ""
  echo "---"
  echo ""
done
