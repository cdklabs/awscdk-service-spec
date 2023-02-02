import { Database, emptyCollection, emptyRelationship } from '@cdklabs/tskb';
import { DatabaseSchema } from '@aws-cdk/service-spec';

export function buildDatabase() {
  const db = new Database<DatabaseSchema>({
    resource: emptyCollection(),
    service: emptyCollection(),
    hasResource: emptyRelationship('service', 'resource'),
  });


  const svc = db.allocate('service', {
    name: '',
    shortName: '',
  });
  const res = db.allocate('resource', {
    attributes: {},
    cloudFormationType: '',
    documentation: '',
    name: '',
    properties: {},
  });

  db.all('resource')[0].documentation;

  const xs = db.follow('hasResource', svc);
  console.log(xs[0]);
  const ys = db.incoming('hasResource', res);
  console.log(ys[0]);

  return db;
}

buildDatabase();