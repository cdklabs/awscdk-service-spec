import { SpecDatabase, RichSpecDatabase, RelationshipRef, Property, PropertyType } from '@aws-cdk/service-spec-types';
import { failure } from '@cdklabs/tskb';
import { ProblemReport, ReportAudience } from '../report';
import { OobRelationshipData } from '../types';

const PROPERTIES_PREFIX = '/properties/';

// Relationships containing these suffixes in their property path will be ignored
const IGNORED_PATH_SUFFIXES = [
  'Tags/Value',
  'Description',
];

/**
 * Context passed between functions when processing relationships
 */
interface RelationshipContext {
  /** The CloudFormation resource type (e.g., AWS::ApiGatewayV2::Integration) */
  readonly cloudformationType: string;
  /** The property path within the resource (e.g., Code/S3Bucket) */
  readonly propertyPath: string;
  /** The target relationship reference */
  readonly relationshipRef: RelationshipRef;
}

/**
 * Import relationships into the database.
 */
export function importOobRelationships(db: SpecDatabase, relationshipData: OobRelationshipData, report: ProblemReport) {
  const richDb = new RichSpecDatabase(db);
  const reportAudience = new ReportAudience('RelationshipImporter');

  for (const [cloudformationType, resourceData] of Object.entries(relationshipData)) {
    if (!resourceData.relationships) continue;

    try {
      const resource = richDb.resourceByType(cloudformationType);

      for (const [propertyPath, relationships] of Object.entries(resourceData.relationships)) {
        for (const rel of relationships) {
          if (IGNORED_PATH_SUFFIXES.some((s) => propertyPath.endsWith(s))) continue;

          const ctx: RelationshipContext = {
            cloudformationType,
            propertyPath,
            relationshipRef: {
              cloudFormationType: rel.cloudformationType,
              propertyName: rel.propertyPath.startsWith(PROPERTIES_PREFIX)
                ? rel.propertyPath.slice(PROPERTIES_PREFIX.length)
                : rel.propertyPath,
            },
          };

          traversePropertyPath(resource.properties, propertyPath.split('/'), ctx);
        }
      }
    } catch (e) {
      report.reportFailure(
        reportAudience,
        'interpreting',
        failure(`Failed to process relationships for ${cloudformationType}: ${e}`),
      );
    }
  }

  /**
   * Unwrap a property type (arrays, refs) for nested properties
   */
  function followTypeReference(type: PropertyType, rest: string[], propName: string, ctx: RelationshipContext) {
    let targetType = type;
    if (targetType.type === 'array') targetType = targetType.element;

    if (targetType.type === 'ref') {
      const typeDef = richDb.tryFindDef(targetType);
      if (typeDef) {
        traversePropertyPath(typeDef.properties, rest, ctx);
      } else {
        report.reportFailure(
          reportAudience,
          'interpreting',
          failure(
            `${ctx.cloudformationType}.${ctx.propertyPath} => ${ctx.relationshipRef.cloudFormationType}.${ctx.relationshipRef.propertyName}: Type definition not found for property ${propName}`,
          ),
        );
      }
    } else {
      report.reportFailure(
        reportAudience,
        'interpreting',
        failure(
          `${ctx.cloudformationType}.${ctx.propertyPath} => ${ctx.relationshipRef.cloudFormationType}.${ctx.relationshipRef.propertyName}: Property ${propName} is not a type reference`,
        ),
      );
    }
  }

  /**
   * Navigate through a property path to find the target property and add the relationship.
   */
  function traversePropertyPath(
    currentProperties: Record<string, Property>,
    remainingPath: string[],
    ctx: RelationshipContext,
  ) {
    const [propName, ...rest] = remainingPath;
    const prop = currentProperties[propName];

    if (!prop) {
      report.reportFailure(
        reportAudience,
        'interpreting',
        failure(
          `${ctx.cloudformationType}.${ctx.propertyPath} => ${ctx.relationshipRef.cloudFormationType}.${ctx.relationshipRef.propertyName}: Property ${propName} not found`,
        ),
      );
      return;
    }

    if (rest.length === 0) {
      const exists = prop.relationshipRefs?.some(
        (ref) =>
          ref.cloudFormationType === ctx.relationshipRef.cloudFormationType &&
          ref.propertyName === ctx.relationshipRef.propertyName,
      );

      if (!exists) {
        if (!prop.relationshipRefs) {
          prop.relationshipRefs = [];
        }
        prop.relationshipRefs.push(ctx.relationshipRef);
      }
      return;
    }

    followTypeReference(prop.type, rest, propName, ctx);

    for (const prevType of prop.previousTypes ?? []) {
      followTypeReference(prevType, rest, propName, ctx);
    }
  }
}
