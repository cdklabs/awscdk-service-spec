#!/bin/bash
# Comprehensive script to extract encryption properties from all CloudFormation resources

SCHEMA_DIR="sources/CloudFormationSchema/us-east-1"
OUTPUT_FILE="encryption-report.txt"

echo "AWS CloudFormation Resources - Encryption at Rest Configuration" > "$OUTPUT_FILE"
echo "=================================================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

TOTAL=0
WITH_ENCRYPTION=0

# Iterate through all schema files
for schema_file in "$SCHEMA_DIR"/*.json; do
  filename=$(basename "$schema_file" .json)
  
  # Get CloudFormation type name
  cfn_type=$(jq -r '.typeName // empty' "$schema_file")
  
  if [ -z "$cfn_type" ]; then
    continue
  fi
  
  TOTAL=$((TOTAL + 1))
  
  # Check for encryption properties
  enc_props=$(jq -r '.properties | to_entries | map(select(.key | test("(?i)encrypt|kms|sse"))) | .[] | .key' "$schema_file" 2>/dev/null)
  
  if [ -n "$enc_props" ]; then
    WITH_ENCRYPTION=$((WITH_ENCRYPTION + 1))
    
    echo "=== $cfn_type ===" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    
    # Extract each encryption property
    while IFS= read -r prop_name; do
      echo "Property: $prop_name" >> "$OUTPUT_FILE"
      
      required=$(jq -r --arg prop "$prop_name" '.properties[$prop].required // false' "$schema_file")
      echo "  Required: $required" >> "$OUTPUT_FILE"
      
      # Check if it's a reference
      ref=$(jq -r --arg prop "$prop_name" '.properties[$prop]."$ref" // empty' "$schema_file")
      if [ -n "$ref" ]; then
        def_name=$(echo "$ref" | sed 's|#/definitions/||')
        echo "  Type: Complex ($def_name)" >> "$OUTPUT_FILE"
      else
        prop_type=$(jq -r --arg prop "$prop_name" '.properties[$prop].type // "unknown"' "$schema_file")
        echo "  Type: $prop_type" >> "$OUTPUT_FILE"
      fi
      
      echo "" >> "$OUTPUT_FILE"
    done <<< "$enc_props"
    
    echo "" >> "$OUTPUT_FILE"
  fi
done

echo "=================================================================" >> "$OUTPUT_FILE"
echo "Summary:" >> "$OUTPUT_FILE"
echo "  Total resources analyzed: $TOTAL" >> "$OUTPUT_FILE"
echo "  Resources with encryption properties: $WITH_ENCRYPTION" >> "$OUTPUT_FILE"
echo "  Percentage: $(awk "BEGIN {printf \"%.1f\", ($WITH_ENCRYPTION/$TOTAL)*100}")%" >> "$OUTPUT_FILE"

echo "Report generated: $OUTPUT_FILE"
echo "Total resources: $TOTAL"
echo "With encryption: $WITH_ENCRYPTION"
