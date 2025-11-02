# Encryption at Rest Extraction Examples

This directory contains scripts and examples for extracting encryption at rest configuration from AWS CloudFormation resource schemas.

## Files

### Scripts

- **`extract-encryption-details.sh`** - Detailed extraction for a single resource including nested type definitions
- **`extract-all-encryption.sh`** - Comprehensive scan of all CloudFormation resources

### Data Files

- **`encryption-summary.json`** - Structured JSON summary of 10 analyzed resources with encryption patterns
- **`encryption-data-complete.json`** - Complete dataset of all 200 resources with encryption properties

### Documentation

- **`ENCRYPTION_PATTERNS.md`** - Detailed description of all 4 encryption configuration patterns
- **`EXTRACTION_INSTRUCTIONS.md`** - Complete instructions for automated data extraction
- **`EXTRACTION_WORKFLOW.md`** - Visual workflow and technical process documentation
- **`SCHEMA_DOCUMENTATION.md`** - JSON schema documentation and validation guide

### Schema

- **`encryption-data-schema.json`** - JSON Schema for validating encryption data files

## Usage

### Extract Detailed Information for One Resource

```bash
./extract-encryption-details.sh <resource-name>
```

Examples:
```bash
./extract-encryption-details.sh aws-s3-bucket
./extract-encryption-details.sh aws-dynamodb-table
./extract-encryption-details.sh aws-rds-dbinstance
```

### Generate Comprehensive Report

```bash
./extract-all-encryption.sh
```

This creates `encryption-report.txt` with:
- All resources with encryption properties
- Property names, types, and requirements
- Summary statistics

### View Structured Summary

```bash
cat encryption-summary.json | jq .
```

Filter by pattern:
```bash
cat encryption-summary.json | jq '.patterns.boolean_plus_kms'
```

Get specific resource:
```bash
cat encryption-summary.json | jq '.resources[] | select(.cloudFormationType == "AWS::S3::Bucket")'
```

## Key Findings

From analysis of 1,472 CloudFormation resources:
- 200 resources (13.6%) have encryption-related properties
- 3 main patterns identified:
  1. Boolean flag + KMS key (most common for storage)
  2. Complex configuration object (flexible services like S3)
  3. KMS key only (simpler services)

## Integration

These scripts can be integrated into:
- Compliance scanning tools
- Infrastructure-as-Code validators
- Security posture assessment
- CDK construct generators
