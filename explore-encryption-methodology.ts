#!/usr/bin/env ts-node
/**
 * Script to explore encryption at rest configuration for AWS resources
 * 
 * This script analyzes the service spec database to identify resources with
 * encryption-related properties and documents patterns for encryption at rest.
 */

import { loadAwsServiceSpecSync } from './packages/@aws-cdk/aws-service-spec/src';
import { Property } from './packages/@aws-cdk/service-spec-types/src/types/resource';

interface EncryptionProperty {
  resourceType: string;
  propertyPath: string;
  propertyName: string;
  propertyType: string;
  required: boolean;
  documentation?: string;
}

function main() {
  console.log('Loading AWS Service Spec database...\n');
  const db = loadAwsServiceSpecSync();
  
  const encryptionProperties: EncryptionProperty[] = [];
  
  // Keywords to identify encryption-related properties
  const encryptionKeywords = [
    'encrypt',
    'kms',
    'sse',
    'serverside',
  ];
  
  console.log('Analyzing resources for encryption properties...\n');
  
  // Iterate through all resources
  for (const resource of db.all('resource')) {
    const resourceType = resource.cloudFormationType;
    
    // Check properties for encryption-related names
    for (const [propName, propDef] of Object.entries(resource.properties)) {
      const prop = propDef as Property;
      const propNameLower = propName.toLowerCase();
      
      // Check if property name contains encryption keywords
      const isEncryptionRelated = encryptionKeywords.some(keyword => 
        propNameLower.includes(keyword)
      );
      
      if (isEncryptionRelated) {
        let typeStr = 'unknown';
        if (prop.type) {
          if (typeof prop.type === 'string') {
            typeStr = prop.type;
          } else if (typeof prop.type === 'object') {
            typeStr = JSON.stringify(prop.type);
          }
        }
        
        encryptionProperties.push({
          resourceType,
          propertyPath: propName,
          propertyName: propName,
          propertyType: typeStr,
          required: prop.required || false,
          documentation: prop.documentation,
        });
      }
    }
  }
  
  // Group by resource type
  const byResource = new Map<string, EncryptionProperty[]>();
  for (const prop of encryptionProperties) {
    if (!byResource.has(prop.resourceType)) {
      byResource.set(prop.resourceType, []);
    }
    byResource.get(prop.resourceType)!.push(prop);
  }
  
  console.log(`Found ${encryptionProperties.length} encryption-related properties across ${byResource.size} resources\n`);
  console.log('='.repeat(80));
  console.log('\n');
  
  // Sample 5+ resources for detailed analysis
  const sampleResources = [
    'AWS::S3::Bucket',
    'AWS::RDS::DBInstance',
    'AWS::DynamoDB::Table',
    'AWS::EBS::Volume',
    'AWS::OpenSearchService::Domain',
    'AWS::ECR::Repository',
    'AWS::EFS::FileSystem',
  ];
  
  for (const resourceType of sampleResources) {
    const props = byResource.get(resourceType);
    if (!props) {
      console.log(`\n${resourceType}: No encryption properties found`);
      continue;
    }
    
    console.log(`\n${resourceType}`);
    console.log('-'.repeat(80));
    
    for (const prop of props) {
      console.log(`\nProperty: ${prop.propertyPath}`);
      console.log(`  Type: ${prop.propertyType}`);
      console.log(`  Required: ${prop.required}`);
      if (prop.documentation) {
        const docPreview = prop.documentation.substring(0, 200).replace(/\n/g, ' ');
        console.log(`  Documentation: ${docPreview}${prop.documentation.length > 200 ? '...' : ''}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
  }
  
  // Summary statistics
  console.log('\n\nSUMMARY STATISTICS');
  console.log('='.repeat(80));
  console.log(`Total resources with encryption properties: ${byResource.size}`);
  console.log(`Total encryption-related properties: ${encryptionProperties.length}`);
  console.log(`Required encryption properties: ${encryptionProperties.filter(p => p.required).length}`);
  console.log(`Optional encryption properties: ${encryptionProperties.filter(p => !p.required).length}`);
}

main();
