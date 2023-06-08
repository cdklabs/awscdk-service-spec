import { SpecDatabase } from '@aws-cdk/service-spec';

export function getAllServices(db: SpecDatabase) {
  return db.all('service');
}

export function getServicesByCloudFormationNamespace(db: SpecDatabase, namespaces: string[]) {
  return namespaces.flatMap((ns) => db.lookup('service', 'cloudFormationNamespace', 'equals', ns));
}
