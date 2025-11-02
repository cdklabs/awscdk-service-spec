import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('sources/EncryptionAtRest/data.json', 'utf-8'));

function inferDefaultBehavior(resourceType: string, props: any[]): string {
  const service = resourceType.split('::')[1];
  const hasKmsOnly = props.length === 1 && props[0].purpose === 'kms-key-id';
  const hasBooleanAndKey = props.some(p => p.purpose === 'enable-flag') && props.some(p => p.purpose === 'kms-key-id');
  
  if (hasKmsOnly) {
    return `Uses AWS managed key for ${service} by default. Specify KMS key for customer managed encryption.`;
  }
  
  if (hasBooleanAndKey) {
    return 'Not encrypted by default. Uses AWS managed key if encryption enabled without specifying KMS key.';
  }
  
  if (props.some(p => p.type === 'object' && p.purpose === 'configuration')) {
    return 'Encryption configuration optional. Check AWS documentation for service-specific defaults.';
  }
  
  return 'Encryption behavior depends on service configuration. Refer to AWS documentation for details.';
}

function inferNotes(resourceType: string, props: any[]): string {
  const notes: string[] = [];
  const service = resourceType.split('::')[1];
  
  // Check if properties are required
  const hasRequired = props.some(p => p.required);
  if (hasRequired) {
    notes.push('Some encryption properties are required.');
  }
  
  // Check for KMS key
  if (props.some(p => p.purpose === 'kms-key-id')) {
    notes.push('Supports customer managed KMS keys.');
  }
  
  // Check for configuration object
  if (props.some(p => p.type === 'object')) {
    notes.push('Encryption configured through nested properties.');
  }
  
  // Check for encryption type selection
  if (props.some(p => p.purpose === 'encryption-type')) {
    notes.push('Supports multiple encryption types or algorithms.');
  }
  
  // Add immutability note for storage services
  const storageServices = ['EBS', 'EFS', 'RDS', 'DynamoDB', 'Redshift', 'DocDB', 'Neptune', 'DAX', 'ElastiCache'];
  if (storageServices.includes(service)) {
    notes.push('Encryption settings typically cannot be changed after resource creation.');
  }
  
  if (notes.length === 0) {
    return 'Refer to AWS documentation for encryption configuration details.';
  }
  
  return notes.join(' ');
}

let updated = 0;

for (const [resourceType, entry] of Object.entries(data) as [string, any][]) {
  if (entry.defaultBehavior?.includes('TODO')) {
    entry.defaultBehavior = inferDefaultBehavior(resourceType, entry.properties);
    updated++;
  }
  
  if (entry.notes?.includes('TODO')) {
    entry.notes = inferNotes(resourceType, entry.properties);
    updated++;
  }
}

const sorted = Object.keys(data).sort().reduce((acc, key) => {
  acc[key] = data[key];
  return acc;
}, {} as Record<string, any>);

fs.writeFileSync('sources/EncryptionAtRest/data.json', JSON.stringify(sorted, null, 2) + '\n');
console.log(`Updated ${updated} TODO entries across ${Object.keys(data).length} resources`);
