import { createHash } from 'crypto';
import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { CloudWatchConsoleServiceDirectory, ProblemReport, ReportAudience } from '@aws-cdk/service-spec-sources';
import { Entity, failure, Plain } from '@cdklabs/tskb';

/**
 * Returns a deduplicatable entity
 * @param entity the entity
 * @param fields the fields to be included, defaults to all
 * @param extra extra data included in the hash
 * @returns
 */
function dedup<T extends Plain<Entity>, K extends keyof T>(
  entity: T,
  fields?: K[],
  extra: string = '',
): T & { dedupKey: string } {
  const hash = createHash('sha256');
  hash.update(extra);
  const selectedFields = fields || (Object.keys(entity) as K[]);
  for (const k of selectedFields.sort()) {
    hash.update(k.toString());
    hash.update(JSON.stringify(entity[k]));
  }

  return {
    ...entity,
    dedupKey: hash.digest('hex'),
  };
}

export function importCannedMetrics(
  db: SpecDatabase,
  serviceDirectoryEntries: CloudWatchConsoleServiceDirectory,
  report: ProblemReport,
) {
  const skippedResources = new Set<string>();

  for (const { metricTemplates: groups = [] } of serviceDirectoryEntries) {
    for (const group of groups) {
      try {
        const resourceType = group.resourceType.split('/', 1).at(0)!; // some resource types in this dataset have a custom suffix
        const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only();
        const service = db.incoming('hasResource', resource).only().entity;

        // Allocate new dimension set, connect to resource & service and fill with dimensions
        const dimensions = group.dimensions.map((d) => ({
          name: d.dimensionName,
          value: d.dimensionValue,
        }));
        const dimensionSet = db.allocate('dimensionSet', dedup({ dimensions }, ['dimensions'], service.name));
        db.link('resourceHasDimensionSet', resource, dimensionSet);
        db.link('serviceHasDimensionSet', service, dimensionSet);

        // Add Metrics and link to the dimension set
        for (const metricDef of group.metrics) {
          const metric = db.findOrAllocate(
            'metric',
            'dedupKey',
            'equals',
            dedup({
              name: metricDef.name,
              namespace: group.namespace,
              statistic: metricDef.defaultStat,
            }),
          );
          db.link('usesDimensionSet', metric, dimensionSet);
          db.link('resourceHasMetric', resource, metric);
          db.link('serviceHasMetric', service, metric);
        }
      } catch (unused: any) {
        skippedResources.add(group.resourceType);
      }
    }
  }

  for (const r of Array.from(skippedResources).sort()) {
    report.reportFailure(
      ReportAudience.cdkTeam(),
      'interpreting',
      failure.in('CloudWatchConsoleServiceDirectory').in(r)('skipping resource type not in db'),
    );
  }
}
