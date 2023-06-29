# @aws-cdk/service-spec-types

Types and utils for CloudFormation Service Specifications

```ts
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

export function loadAwsServiceSpec(): SpecDatabase {
 const specDatabase = fs.readFileSync('db.json.gz'));
 const db = emptyDatabase();
 db.load(JSON.parse(zlib.gunzipSync(specDatabase).toString('utf-8')));
 return db;
}
```
