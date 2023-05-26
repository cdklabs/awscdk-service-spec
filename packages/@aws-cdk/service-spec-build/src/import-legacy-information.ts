import { RichProperty, SpecDatabase } from '@aws-cdk/service-spec';
import { CloudFormationResourceSpecification, ProblemReport, resourcespec } from '@aws-cdk/service-spec-sources';

/**
 * Import type information from the legacy spec
 */
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

        new RichProperty(resource.properties[propName]).addPreviousType({
          type: 'array',
          element: { type: 'tag' },
        });
      }
    }
  }

  for (const [propTypeName, propTypeSpec] of Object.entries(specification.PropertyTypes)) {
    const [resourceName, typeDefName] = propTypeName.split('.');
    if (!resourcespec.isPropType(propTypeSpec)) {
      continue;
    }

    for (const [propName, propSpec] of Object.entries(propTypeSpec.Properties ?? {})) {
      if (propSpec.Type === 'List' && propSpec.ItemType === 'Tag') {
        const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceName).only();
        const typeDefs = db
          .follow('usesType', resource)
          .map((r) => r.entity)
          .filter((t) => t.name === typeDefName);

        if (typeDefs.length !== 1) {
          continue;
        }

        new RichProperty(typeDefs[0].properties[propName]).addPreviousType({
          type: 'array',
          element: { type: 'tag' },
        });
      }
    }
  }
}
