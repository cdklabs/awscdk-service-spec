import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { failure } from '@cdklabs/tskb';
import { SpecBuilder } from '../event-builder';
import { ProblemReport, ReportAudience } from '../report';
import { EventBridgeSchema, jsonschema } from '../types';
import { lookupService, allocateResource } from './eventbridge/event-resource-matcher';
import { createTypeDefinitionsFromSchema } from './eventbridge/schema-converter';
import { extractDetailTypeFromSchema } from './eventbridge/schema-helpers';

export interface LoadEventBridgeSchmemaOptions {
  readonly db: SpecDatabase;
  readonly event: EventBridgeSchema;
  readonly report: ProblemReport;
  readonly region?: string;
}

export function importEventBridgeSchema(options: LoadEventBridgeSchmemaOptions) {
  const { db, event, report: originalReport } = options;
  const report = originalReport.forAudience(ReportAudience.fromCloudFormationResource(event.SchemaName));

  const specBuilder = new SpecBuilder(db);
  const eventFailure = failure.in(event.SchemaName);
  const resolve = jsonschema.makeResolver(event.Content);

  const { schema: current, typeName: detailTypeName } = extractDetailTypeFromSchema(event.Content);

  const { rootTypeDef, createdTypes } = createTypeDefinitionsFromSchema(current, detailTypeName, {
    specBuilder,
    report,
    resolve,
    eventFailure,
  });

  const eventBuilder = specBuilder.eventBuilder(event.SchemaName, {
    source: event.Content.components.schemas.AWSEvent['x-amazon-events-source'],
    detailType: event.Content.components.schemas.AWSEvent['x-amazon-events-detail-type'],
    description: event.Description,
    rootProperty: rootTypeDef,
  });

  for (const typeDef of createdTypes) {
    eventBuilder.linkTypesToEvent(typeDef);
  }

  // Commit types and links since it's needed for the allocatedResource to decide the resource
  const eventRet = eventBuilder.commit();

  const service = lookupService({ eventSchemaName: event.SchemaName, db });
  if (service == undefined) {
    // TODO: change this to report
    console.log(`The service related to this event schema name ${event.SchemaName} doesn't exist in CF`);
    return eventRet;
  }

  const resource = allocateResource({ service, db, eventSchemaName: event.SchemaName });

  if (resource) {
    eventBuilder.linkResourceToEvent(resource.resource, resource.matches[0]);
  }

  return eventBuilder.commit();
}
