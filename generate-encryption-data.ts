import { loadAwsServiceSpecSync } from '@aws-cdk/aws-service-spec';
import * as fs from 'fs';

const db = loadAwsServiceSpecSync();
const encryptionKeywords = ['encrypt', 'kms', 'sse', 'serverside'];
const excludeKeywords = ['nodetonode', 'intransit', 'transit'];

interface PropertyInfo {
  name: string;
  path?: string;
  type: string;
  required: boolean;
  purpose: string;
  acceptedValues?: string[];
  context?: string;
}

interface ResourceEntry {
  pattern: string;
  properties: PropertyInfo[];
  defaultBehavior: string;
  notes: string;
}

function classifyPattern(props: PropertyInfo[]): string {
  const hasBoolean = props.some(p => p.type === 'boolean');
  const hasString = props.some(p => p.type === 'string');
  const hasObject = props.some(p => p.type === 'object');
  const hasConfiguration = props.some(p => p.name.toLowerCase().includes('configuration'));
  const hasSpecification = props.some(p => p.name.toLowerCase().includes('specification') || p.name.toLowerCase().includes('options'));
  const hasType = props.some(p => p.name.toLowerCase().includes('type') || p.name.toLowerCase().includes('algorithm'));
  
  if (props.length > 2) return 'multiple-contexts';
  if (hasType && hasString) return 'type-based-selection';
  if (hasConfiguration && hasObject) return 'configuration-object';
  if (hasSpecification && hasObject) return 'specification-object';
  if (hasBoolean && hasString) return 'boolean-and-key';
  if (hasBoolean) return 'boolean-and-key';
  if (hasObject) return 'configuration-object';
  
  return 'unknown';
}

function determinePurpose(propName: string, propType: string): string {
  const lower = propName.toLowerCase();
  if (propType === 'boolean' && (lower.includes('encrypt') || lower.includes('sse'))) return 'enable-flag';
  if (lower.includes('kms') || lower.includes('key')) return 'kms-key-id';
  if (lower.includes('type') || lower.includes('mode')) return 'encryption-type';
  if (lower.includes('algorithm')) return 'algorithm';
  if (propType === 'object') return 'configuration';
  return 'unknown';
}

function generateEntry(resource: any): ResourceEntry {
  const props: PropertyInfo[] = [];
  
  for (const [propName, prop] of Object.entries(resource.properties)) {
    const lowerName = propName.toLowerCase();
    if (excludeKeywords.some(ex => lowerName.includes(ex))) continue;
    if (!encryptionKeywords.some(kw => lowerName.includes(kw))) continue;

    const propType = (prop as any).type.type === 'ref' ? 'object' : 
                     (prop as any).type.type === 'boolean' ? 'boolean' : 'string';
    
    props.push({
      name: propName,
      type: propType,
      required: !!(prop as any).required,
      purpose: determinePurpose(propName, propType),
    });
  }

  return {
    pattern: classifyPattern(props),
    properties: props,
    defaultBehavior: 'TODO: Research default encryption behavior',
    notes: 'TODO: Document constraints and special behaviors'
  };
}

const existingData = JSON.parse(
  fs.readFileSync('sources/EncryptionAtRest/data.json', 'utf-8')
);

const results: Record<string, ResourceEntry> = { ...existingData };

for (const resource of db.all('resource')) {
  if (results[resource.cloudFormationType]) continue;
  
  const hasEncryption = Object.keys(resource.properties).some(propName => {
    const lowerName = propName.toLowerCase();
    if (excludeKeywords.some(ex => lowerName.includes(ex))) return false;
    return encryptionKeywords.some(kw => lowerName.includes(kw));
  });
  
  if (hasEncryption) {
    results[resource.cloudFormationType] = generateEntry(resource);
  }
}

const sorted = Object.keys(results).sort().reduce((acc, key) => {
  acc[key] = results[key];
  return acc;
}, {} as Record<string, ResourceEntry>);

fs.writeFileSync(
  'sources/EncryptionAtRest/data.json',
  JSON.stringify(sorted, null, 2) + '\n'
);

console.log(`Generated entries for ${Object.keys(sorted).length} resources`);
console.log(`New entries: ${Object.keys(sorted).length - Object.keys(existingData).length}`);
