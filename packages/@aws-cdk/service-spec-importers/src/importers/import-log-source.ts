import { DeliveryDestination, SpecDatabase, VendedLogs } from '@aws-cdk/service-spec-types';
import { failure } from '@cdklabs/tskb';
import { ProblemReport, ReportAudience } from '../report';

export function importLogSources(
  db: SpecDatabase,
  logSourceData: Array<{
    LogType: string;
    ResourceTypes: string[];
    Destinations: Array<{ DestinationType: string; PermissionsVersion: string; OutputFormat: string[] }>;
    RecordFields: Array<{ Field: string; Mandatory: boolean }>;
  }>,
  report: ProblemReport,
) {
  for (const value of logSourceData) {
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
          outputFormats: dest.OutputFormat,
        }));

        const newLog: VendedLogs = {
          permissionsVersion: permissionValue,
          logType: value.LogType,
          destinations: destinations,
        };

        for (const fields of value.RecordFields) {
          if (fields.Mandatory) {
            newLog.mandatoryFields ??= [];
            newLog.mandatoryFields?.push(fields.Field);
          } else {
            newLog.optionalFields ??= [];
            newLog.optionalFields?.push(fields.Field);
          }
        }

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
