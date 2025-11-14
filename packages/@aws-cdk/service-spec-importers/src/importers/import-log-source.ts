import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { failure } from '@cdklabs/tskb';
import { ProblemReport, ReportAudience } from '../report';

export function importLogSources(
  db: SpecDatabase,
  logSourceData: Record<
    string,
    {
      LogType: string;
      ResourceTypes: string[];
      Destinations: Array<{ DestinationType: string; PermissionsVersion: string }>;
    }
  >,
  report: ProblemReport,
) {
  // clears vendedLogs property from all resources before processing - goal: ensure that logTypes and destinations are up to date and cut down on complicated deduplication code
  for (const resource of db.all('resource')) {
    if (resource.vendedLogs) {
      delete resource.vendedLogs;
    }
  }

  for (const value of Object.values(logSourceData)) {
    for (const resourceType of value.ResourceTypes) {
      try {
        const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only();
        let permissionValue = '';
        for (const dest of value.Destinations) {
          if (permissionValue === '') {
            permissionValue = dest.PermissionsVersion;
          } else {
            if (permissionValue !== dest.PermissionsVersion) {
              report.reportFailure(
                new ReportAudience('Log Source Import'),
                'interpreting',
                failure.in(resourceType)(
                  `Resouce of type ${resourceType} has inconsistent permissions version for log of type ${value.LogType}`,
                ),
              );
            }
          }
        }

        const destinations = value.Destinations.map((dest) => ({
          destinationType: dest.DestinationType,
        }));

        if (resource.vendedLogs) {
          // we take whatever the newest permissions value is and assume that all logs in a resource use the same permissions
          resource.vendedLogs.permissionsVersion = permissionValue;
          resource.vendedLogs.logType.push(value.LogType);
          // dedupes incoming destinations
          const newDestinations = destinations.filter(
            (dest) =>
              !resource.vendedLogs!.logDestinations.some(
                (existing) => existing.destinationType === dest.destinationType,
              ),
          );
          resource.vendedLogs.logDestinations.push(...newDestinations);
        } else {
          resource.vendedLogs = {
            permissionsVersion: permissionValue,
            logType: [value.LogType],
            logDestinations: destinations,
          };
        }
      } catch (err) {
        // assumes the only error we are likely to see is something relating to resource type not existing in the CFN DB
        report.reportFailure(
          new ReportAudience('Log Source Import'),
          'interpreting',
          failure.in(resourceType)(`Resouce of type ${resourceType} does not exist in Cloudformation`),
        );
      }
    }
  }
}
