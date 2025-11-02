import { loadAwsServiceSpecSync } from '@aws-cdk/aws-service-spec';

const db = loadAwsServiceSpecSync();
const encryptionKeywords = ['encrypt', 'kms', 'sse', 'serverside'];
const excludeKeywords = ['nodetonode', 'intransit', 'transit'];

const results: string[] = [];

for (const resource of db.all('resource')) {
  for (const [propName] of Object.entries(resource.properties)) {
    const lowerName = propName.toLowerCase();
    if (excludeKeywords.some(ex => lowerName.includes(ex))) continue;
    if (!encryptionKeywords.some(kw => lowerName.includes(kw))) continue;
    results.push(resource.cloudFormationType);
    break;
  }
}

const sorted = results.sort();
console.log(JSON.stringify(sorted, null, 2));
