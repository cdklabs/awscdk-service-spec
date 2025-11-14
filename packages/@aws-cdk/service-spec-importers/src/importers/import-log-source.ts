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
  for (const value of Object.values(logSourceData)) {
    for (const resourceType of value.ResourceTypes) {
      try {
        const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only();
        const destinations = value.Destinations.map((dest) => ({
          destinationType: dest.DestinationType,
          permissionVersion: dest.PermissionsVersion,
        }));

        if (resource.vendedLogs) {
          resource.vendedLogs.logType.push(value.LogType);
          // dedupes incoming destinations
          const newDestinations = destinations.filter(
            (dest) =>
              !resource.vendedLogs!.logDestinations.some(
                (existing) =>
                  existing.destinationType === dest.destinationType &&
                  existing.permissionVersion === dest.permissionVersion,
              ),
          );
          resource.vendedLogs.logDestinations.push(...newDestinations);
        } else {
          resource.vendedLogs = {
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
