import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { failure } from '@cdklabs/tskb';
import { ProblemReport, ReportAudience } from '../report';

export function importArnTemplates(arnIndex: Record<string, string>, db: SpecDatabase, report: ProblemReport) {
  for (let resource of db.all('resource')) {
    const arnTemplate = arnIndex[resource.cloudFormationType];
    if (arnTemplate != null) {
      resource.identifier =
        resource.identifier != null ? { ...resource.identifier, arnTemplate } : { $id: db.id(), arnTemplate };
    }
  }

  for (let resource of db.all('resource')) {
    if (resource.identifier == null) {
      report.reportFailure(
        new ReportAudience('ARN Template Import'),
        `interpreting`,
        failure.in(resource.cloudFormationType)(
          `No ARN template found for resource type ${resource.cloudFormationType}`,
        ),
      );
    }
  }
}
