import { SpecDatabase } from '@aws-cdk/service-spec-types';

export function importLogSources(
  db: SpecDatabase,
  logSourceData: Record<string, { LogType: string; ResourceType: string[] }>,
) {
  for (const value of Object.values(logSourceData)) {
    for (const resourceType of value.ResourceType) {
      const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only();
      if (!resource.logTypes) resource.logTypes = [];
      resource.logTypes.push(value.LogType);
    }
  }
}
