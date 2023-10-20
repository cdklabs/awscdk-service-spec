import { Property, RichPropertyType, RichSpecDatabase, SpecDatabase, loadDatabase } from '@aws-cdk/service-spec-types';

async function main() {
  const db = await loadDatabase('db.json');

  const analyzers = Object.keys(ANALYZERS);

  const analyzer = process.argv[2];
  if (!analyzer || !analyzers.includes(analyzer)) {
    console.error(`Usage: analyze-db <${analyzers.join('|')}>`);
    process.exitCode = 1;
    return;
  }

  await ANALYZERS[analyzer](db, process.argv.slice(3));
}

type Analyzer = (x: SpecDatabase, flags?: string[]) => Promise<void>;

const ANALYZERS: Record<string, Analyzer> = {
  //////////////////////////////////////////////////////////////////////

  async stats(db) {
    const richDb = new RichSpecDatabase(db);

    const services = db.all('service');
    console.log('Service:', services.length);

    const resources = db.all('resource');
    console.log('Resources:', resources.length);

    const typeDefs = resources.flatMap((r) => richDb.resourceTypeDefs(r.cloudFormationType));
    console.log('TypeDefinitions:', typeDefs.length);
  },

  //////////////////////////////////////////////////////////////////////

  async oldTypes(db, flags) {
    const richDb = new RichSpecDatabase(db);

    for (const resource of db.all('resource')) {
      maybeProps(resource.properties, `${resource.cloudFormationType} property`);
      maybeProps(resource.attributes, `${resource.cloudFormationType} attribute`);

      for (const typeDef of richDb.resourceTypeDefs(resource.cloudFormationType)) {
        maybeProps(typeDef.properties, `${resource.cloudFormationType}.${typeDef.name} property`);
      }
    }

    function maybeProps(props: Record<string, Property>, where: string) {
      for (const [propName, prop] of Object.entries(props)) {
        maybeProp(propName, prop);
      }

      function maybeProp(propName: string, prop: Property) {
        const allTypes = [...(prop.previousTypes ?? []), prop.type];
        if (allTypes.length > 1) {
          const typeEvolution = allTypes.map((t) => new RichPropertyType(t).stringify(db)).join(' -> ');

          if (typeEvolution.includes('Array<tag>') && flags?.includes('--no-tags')) {
            return;
          }

          console.log(`${where} ${propName}: ${typeEvolution}`);
        }
      }
    }
  },
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
