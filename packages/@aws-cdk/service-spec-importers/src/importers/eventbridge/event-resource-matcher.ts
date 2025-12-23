import {
  Service,
  SpecDatabase,
  Event,
  Resource,
  EventTypeDefinition,
  ResourceField,
} from '@aws-cdk/service-spec-types';
import { ref } from '@cdklabs/tskb';

/**
 * Find the CloudFormation resource that matches an event
 */
export function lookupResource({
  db,
  service,
  eventSchemaName,
}: {
  db: SpecDatabase;
  service: Service;
  eventSchemaName: string;
}): ResourceMatch | undefined {
  const event = db.lookup('event', 'name', 'equals', eventSchemaName).only();
  return eventDecider({ service, db, event });
}

/**
 * Find the CloudFormation service that matches an event
 */
export function lookupService({
  eventSchemaName,
  eventNameSeparator = '@',
  db,
}: {
  eventSchemaName: string;
  eventNameSeparator?: string;
  db: SpecDatabase;
}): Service | undefined {
  const serviceName = parseServiceName({ eventSchemaName, eventNameSeparator });

  const services = db.lookup('service', 'name', 'equals', serviceName);

  if (services.length == 0) {
    // TODO: we need to report here
    return;
  }

  return services.only();
}

/**
 * Decide which CloudFormation resource matches an event
 */
function eventDecider({
  db,
  service,
  event,
}: {
  db: SpecDatabase;
  service: Service;
  event: Event;
}): ResourceMatch | undefined {
  const typeInfos = extractRequiredEventFields(db, event);

  const resources = db.follow('hasResource', service).map((resource) => resource.entity);

  const resourceMatches = matchTypeFieldsToResources(resources, typeInfos);

  if (resourceMatches.length > 0) {
    return { resource: resourceMatches[0].resource, matches: resourceMatches[0].matches };
  } else if (resourceMatches.length == 0) {
    // TODO: change this to report
    console.log(`Event schema name: ${event.name}, doesn't match any resource in cloudformation`);
  }

  return undefined;
}

/**
 * Match event fields name and CloudFormation resources name
 */
function matchTypeFieldsToResources(resources: Resource[], typeInfos: EventTypeDefinition[]): ResourceMatch[] {
  const resourceMatches: ResourceMatch[] = [];

  for (const resource of resources) {
    const matches: Array<ResourceField> = [];
    const resourceName = resource.name.toLowerCase();

    for (const typeFieldName of typeInfos) {
      const typeSegment = normalizeName(typeFieldName.name);

      if (typeSegment == resourceName) {
        matches.push({
          type: ref(typeFieldName),
        });
      }

      for (const propertiesFieldName of Object.keys(typeFieldName.properties)) {
        const fieldSegment = normalizeName(propertiesFieldName);

        if (fieldSegment == resourceName) {
          matches.push({
            type: ref(typeFieldName),
            fieldName: propertiesFieldName,
          });
        }
      }
    }

    if (matches.length > 0) {
      if (matches.length > 1) {
        //TODO: 17 events affected by this, some of them has resourceId & resourceName, some has in multiple levels the resource
        // console.log('here we are', { resource, matches: JSON.stringify(matches, null, 2) });
      }
      resourceMatches.push({
        resource,
        matches,
      });
    }
  }

  return resourceMatches;
}

function extractRequiredEventFields(db: SpecDatabase, event: Event): EventTypeDefinition[] {
  const typeDefinitions = db.follow('eventUsesType', event);

  return typeDefinitions
    .map((x) => {
      return {
        ...x.entity,
        properties: Object.fromEntries(
          Object.entries(x.entity.properties).filter(([_key, value]) => value.required === true),
        ),
      };
    })
    .filter((a) => Object.keys(a.properties).length != 0);
}

/**
 * Service schema name e.g. "aws.s3@ObjectCreated" returns "aws-s3"
 */
function parseServiceName({
  eventSchemaName,
  eventNameSeparator = '@',
}: {
  eventSchemaName: string;
  eventNameSeparator: string;
}) {
  const schemaNameParts = eventSchemaName.split(eventNameSeparator);
  const serviceName = schemaNameParts[0].replace('.', '-').toLowerCase();
  return serviceName;
}

/**
 * Filters out generic identifiers (name, id, arn) from name
 */
function normalizeName(name: string): string {
  const segments = convertToSnakeCase(name).split(/[-_]/);

  const genericIds = new Set(['name', 'id', 'arn']);
  return segments.filter((s) => s.length > 0 && !genericIds.has(s)).join('');
}

function convertToSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

export interface ResourceMatch {
  readonly resource: Resource;
  readonly matches: Array<ResourceField>;
}
