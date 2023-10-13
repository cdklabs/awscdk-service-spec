import { Resource, Service, SpecDatabase, SpecDatabaseDiff } from '@aws-cdk/service-spec-types';

export class DbDiff {
  private result: SpecDatabaseDiff = {
    resources: { added: [], removed: [], updated: [] },
    services: { added: [], removed: [], updated: [] },
    typeDefinitions: { added: [], removed: [], updated: [] },
  };

  constructor(private readonly db1: SpecDatabase, private readonly db2: SpecDatabase) {
    const db1Stats = this.distillDatabase(this.db1);
    const db2Stats = this.distillDatabase(this.db2);
    for (const id of Object.keys(db1Stats.resources)) {
      // Case doesn't exist in db2
      if (!db2Stats.resources[id]) {
        this.result.resources.removed.push(db1Stats.resources[id]);
      }
      // Case found the same ids
      // TODO: removed case
    }
  }

  private distillDatabase(db: SpecDatabase) {
    // const richDb = new RichSpecDatabase(db);
    const services: Record<string, Service> = db.all('service').reduce((obj, item) => {
      return {
        ...obj,
        [item.$id]: item,
      };
    }, {});
    const resources: Record<string, Resource> = db.all('resource').reduce((obj, item) => {
      return {
        ...obj,
        [item.$id]: item,
      };
    }, {});

    return {
      services,
      resources,
      // typeDefinitions: resources.flatMap((r) => richDb.resourceTypeDefs(r.cloudFormationType)),
    };
  }

  public diff() {
    console.log(JSON.stringify(this.result));
  }
}
