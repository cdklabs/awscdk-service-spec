import { DeliveryDestination, SpecDatabase } from '@aws-cdk/service-spec-types';
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

        const destinations: DeliveryDestination[] = value.Destinations.map((dest) => ({
          destinationType: dest.DestinationType,
        }));

        const newLog = {
          permissionsVersion: permissionValue,
          logType: value.LogType,
          destinations: destinations,
        };

        resource.vendedLogs ??= [];
        resource.vendedLogs.push(newLog);
        resource.vendedLogsConfig ??= [];
        resource.vendedLogsConfig.push(newLog);
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
