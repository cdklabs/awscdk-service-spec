import { DestinationService, SpecDatabase } from '@aws-cdk/service-spec-types';
import { failure } from '@cdklabs/tskb';
import { ProblemReport, ReportAudience } from '../report';

export function importLogSources(
  db: SpecDatabase,
  logSourceData: Record<
    string,
    {
      LogType: string;
      ResourceTypes: string[];
      Destinations: Array<{ DestinationType: string; PermissionsVersion: string; OutputFormat: string | null }>;
    }
  >,
  report: ProblemReport,
) {
  for (const value of Object.values(logSourceData)) {
    for (const resourceType of value.ResourceTypes) {
      try {
        const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only();
        const permissionValue = value.Destinations[0].PermissionsVersion;
        if (!value.Destinations.every((val) => val.PermissionsVersion === permissionValue)) {
          report.reportFailure(
            new ReportAudience('Log Source Import'),
            'interpreting',
            failure.in(resourceType)(
              `Resouce of type ${resourceType} has inconsistent permissions version for log of type ${value.LogType}`,
            ),
          );
        }

        const destinations: DestinationService[] = value.Destinations.map((dest) => ({
          destinationType: dest.DestinationType,
          outputFormat: dest.OutputFormat ? dest.OutputFormat : undefined,
        }));

        const newLog = {
          // we take whatever the newest permissions value is and assume that all destinations for a certain logType use the same permissions
          permissionsVersion: permissionValue,
          logType: value.LogType,
          destinations: destinations,
        };

        resource.vendedLogs ??= [];
        resource.vendedLogs.push(newLog);
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
