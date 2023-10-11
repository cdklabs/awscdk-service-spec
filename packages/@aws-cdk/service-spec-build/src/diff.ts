import { SpecDatabase, SpecDatabaseDiff } from '@aws-cdk/service-spec-types';

export class DbDiff {
  private result: SpecDatabaseDiff = {
    resources: { added: [], removed: [], updated: [] },
    services: { added: [], removed: [], updated: [] },
    typeDefinitions: { added: [], removed: [], updated: [] },
  };

  constructor(private readonly db1: SpecDatabase, private readonly db2: SpecDatabase) {
    console.log(this.db1.id, this.db2.id);
  }

  public diff() {
    console.log(JSON.stringify(this.result));
  }
}
