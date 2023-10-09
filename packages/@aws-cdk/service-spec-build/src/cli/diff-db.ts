import { Property, RichPropertyType, RichSpecDatabase, SpecDatabase, loadDatabase } from '@aws-cdk/service-spec-types';

async function main(args: string[]) {
  if (args.length < 2) {
    throw new Error('Usage: diff-db <DB1> <DB2>');
  }
  const db1 = await loadDatabase(args[0]);
  const db2 = await loadDatabase(args[1]);


}

main(process.argv.slice(2)).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
