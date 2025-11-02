#!/bin/bash

RESOURCES=(
  "aws-s3-bucket:AWS::S3::Bucket"
  "aws-dynamodb-table:AWS::DynamoDB::Table"
  "aws-rds-dbinstance:AWS::RDS::DBInstance"
  "aws-ec2-volume:AWS::EC2::Volume"
  "aws-efs-filesystem:AWS::EFS::FileSystem"
  "aws-sns-topic:AWS::SNS::Topic"
  "aws-sqs-queue:AWS::SQS::Queue"
)

for entry in "${RESOURCES[@]}"; do
  IFS=':' read -r filename cfntype <<< "$entry"
  filepath="sources/CloudFormationSchema/us-east-1/${filename}.json"
  
  if [ ! -f "$filepath" ]; then
    continue
  fi
  
  echo "=== $cfntype ==="
  echo ""
  
  # Get encryption-related properties
  jq -r '.properties | to_entries | map(select(.key | test("(?i)encrypt|kms"))) | .[] | 
    "Property: \(.key)\n  Required: \(.value.required // false)\n  Description: \(.value.description // "N/A")\n"' "$filepath"
  
  echo ""
done
