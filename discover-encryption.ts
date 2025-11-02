import { loadAwsServiceSpecSync } from '@aws-cdk/aws-service-spec';

const encryptionKeywords = ['encrypt', 'kms', 'sse', 'serverside'];
const excludeKeywords = ['nodetonode', 'intransit', 'transit'];

function classifyPattern(props: any[]): string {
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

function discoverEncryption() {
  const db = loadAwsServiceSpecSync();
  const results: Record<string, any> = {};

  for (const resource of db.all('resource')) {
    const encryptionProps: any[] = [];

    for (const [propName, prop] of Object.entries(resource.properties)) {
      const lowerName = propName.toLowerCase();
      
      if (excludeKeywords.some(ex => lowerName.includes(ex))) continue;
      if (!encryptionKeywords.some(kw => lowerName.includes(kw))) continue;

      encryptionProps.push({
        name: propName,
        type: prop.type.type === 'ref' ? 'object' : 
              prop.type.type === 'boolean' ? 'boolean' : 'string',
        required: !!prop.required,
        documentation: prop.documentation?.substring(0, 150)
      });
    }

    if (encryptionProps.length > 0) {
      results[resource.cloudFormationType] = {
        pattern: classifyPattern(encryptionProps),
        properties: encryptionProps,
        propertyCount: encryptionProps.length
      };
    }
  }

  const sorted = Object.entries(results).sort(([a], [b]) => a.localeCompare(b));
  
  console.log(`Found ${sorted.length} resources with encryption properties\n`);
  
  for (const [resourceType, data] of sorted) {
    console.log(`${resourceType} [${data.pattern}] (${data.propertyCount} properties)`);
    for (const prop of data.properties) {
      console.log(`  - ${prop.name} (${prop.type}${prop.required ? ', required' : ''})`);
    }
    console.log();
  }
}

discoverEncryption();
