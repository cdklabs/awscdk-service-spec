import { loadAwsServiceSpec } from '@aws-cdk/aws-service-spec';
import * as fs from 'fs';

const db = await loadAwsServiceSpec();

// Find resources with encryption-related properties
const encryptionResources: any[] = [];

for (const resource of db.all('resource')) {
  const encryptionProps: any[] = [];
  
  for (const [propName, prop] of Object.entries(resource.properties)) {
    const lowerName = propName.toLowerCase();
    const propData = prop as any;
    
    // Check if property name or documentation mentions encryption at rest
    if (lowerName.includes('encrypt') || 
        lowerName.includes('kms') ||
        propData.documentation?.toLowerCase().includes('encrypt')) {
      
      // Filter for "at rest" encryption specifically
      const doc = propData.documentation?.toLowerCase() || '';
      const isAtRest = doc.includes('at rest') || 
                       doc.includes('at-rest') ||
                       lowerName.includes('atrest') ||
                       lowerName === 'encrypted' ||
                       lowerName === 'encryption' ||
                       lowerName.includes('encryptionconfig');
      
      if (isAtRest || lowerName.includes('kms')) {
        encryptionProps.push({
          name: propName,
          type: propData.type,
          required: propData.required || false,
          documentation: propData.documentation?.substring(0, 200),
        });
      }
    }
  }
  
  if (encryptionProps.length > 0) {
    encryptionResources.push({
      resourceType: resource.cloudFormationType,
      name: resource.name,
      properties: encryptionProps,
    });
  }
}

// Sort and take first 10
encryptionResources.sort((a, b) => a.resourceType.localeCompare(b.resourceType));

console.log(`Found ${encryptionResources.length} resources with encryption at rest properties\n`);
console.log('First 10 resources:\n');

for (const res of encryptionResources.slice(0, 10)) {
  console.log(`\n## ${res.resourceType}`);
  console.log(`Properties:`);
  for (const prop of res.properties) {
    console.log(`  - ${prop.name} (${prop.type.type}${prop.required ? ', required' : ''})`);
    if (prop.documentation) {
      console.log(`    ${prop.documentation.replace(/\n/g, ' ')}`);
    }
  }
}

fs.writeFileSync('encryption-resources.json', JSON.stringify(encryptionResources, null, 2));
console.log(`\n\nFull results written to encryption-resources.json`);
