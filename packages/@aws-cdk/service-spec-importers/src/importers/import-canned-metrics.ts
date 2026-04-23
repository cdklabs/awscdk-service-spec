import { createHash } from 'crypto';
import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { Entity, failure, Plain } from '@cdklabs/tskb';
import { ProblemReport, ReportAudience } from '../report';
import { CloudWatchConsoleServiceDirectory, DimensionSetNames } from '../types';

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
  dimensionSetNames: DimensionSetNames,
) {
  const skippedResources = new Set<string>();

  for (const { metricTemplates: groups = [] } of serviceDirectoryEntries) {
    for (const group of groups) {
      // Resolve dimension set name
      const dimensions = group.dimensions.map((d) => ({
        name: d.dimensionName,
        value: d.dimensionValue,
      }));
      const dimKey = dimensions
        .map((d) => d.name)
        .sort()
        .join(',');
      const dimsetName = dimKey === '' ? 'Account' : dimensionSetNames[group.namespace]?.[dimKey];
      if (!dimsetName) {
        throw new Error(`No dimension set name found for namespace '${group.namespace}', dimensions '${dimKey}'`);
      }

      try {
        const resourceType = group.resourceType.split('/', 1).at(0)!; // some resource types in this dataset have a custom suffix
        const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only();
        const service = db.incoming('hasResource', resource).only().entity;

        // Allocate new dimension set, connect to resource & service
        const dimensionSet = db.findOrAllocate(
          'dimensionSet',
          'dedupKey',
          'equals',
          dedup({ dimensions, name: dimsetName }, ['dimensions', 'name'], service.name),
        );
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
              previousStatistics: [],
            }),
          );
          db.link('usesDimensionSet', metric, dimensionSet);
          db.link('resourceHasMetric', resource, metric);
          db.link('serviceHasMetric', service, metric);
        }
      } catch {
        skippedResources.add(group.resourceType);
      }
    }
  }

  for (const r of Array.from(skippedResources).sort()) {
    report.reportFailure(
      new ReportAudience('CloudWatchConsoleServiceDirectory'),
      'interpreting',
      failure.in(r)('skipping resource type not in db'),
    );
  }
}
