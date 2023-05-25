import { SpecDatabase } from '@aws-cdk/service-spec';
import { CloudFormationResourceSpecification, ProblemReport } from '@aws-cdk/service-spec-sources';

export function importLegacyInformation(
  db: SpecDatabase,
  specification: CloudFormationResourceSpecification,
  report: ProblemReport,
) {
  void report;

  for (const [resourceName, resourceSpec] of Object.entries(specification.ResourceTypes)) {
    for (const [propName, propSpec] of Object.entries(resourceSpec.Properties ?? {})) {
      if (propSpec.Type === 'List' && propSpec.ItemType === 'Tag') {
        const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceName).only();
        const legacyTag = db.allocate('legacyTag', {
          propertyName: propName,
        });

        db.link('hasLegacyTag', resource, legacyTag);
      }
    }
  }
}
