import * as fs from 'node:fs';
import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
import { ResourceSpecImporter } from '../src/importers/import-resource-spec';
import { JsonLens, JsonObjectLens, Patcher, applyPatcher } from '../src/patching';
import { ProblemReport } from '../src/report';
import { CloudFormationRegistryResource, jsonschema, resourcespec } from '../src/types';

export function patchObject(obj: any, fn: Patcher<JsonObjectLens>): any {
  const { root: patchedObj } = applyPatcher(obj, fn as Patcher<JsonLens>);
  return patchedObj;
}

export const RESOURCE = 'AWS::Some::Type';

/** Import a CloudFormation registry schema, by default for `RESOURCE` */
export function importRegistry(
  target: SpecDatabase,
  schema: Partial<CloudFormationRegistryResource>,
  typeName = RESOURCE,
  region?: string,
) {
  importCloudFormationRegistryResource({
    db: target,
    report: new ProblemReport(),
    region,
    resource: {
      typeName,
      description: 'Test resource',
      properties: {},
      ...schema,
    } as CloudFormationRegistryResource,
  });
}

/** Import `RESOURCE` and its property types from the legacy resource specification */
export function importLegacySpec(
  target: SpecDatabase,
  options: {
    properties: Record<string, resourcespec.Property>;
    attributes?: Record<string, resourcespec.Attribute>;
    types: Record<string, resourcespec.PropertyType>;
  },
) {
  ResourceSpecImporter.importTypes({
    db: target,
    specification: {
      ResourceSpecificationVersion: '0',
      ResourceTypes: { [RESOURCE]: { Properties: options.properties, Attributes: options.attributes } },
      PropertyTypes: Object.fromEntries(
        Object.entries(options.types).map(([name, decl]) => [`${RESOURCE}.${name}`, decl]),
      ),
    },
  });
}

export function object(properties: jsonschema.ObjectProperties, required?: string[]): jsonschema.RecordLikeObject {
  return { type: 'object', properties, required, additionalProperties: false };
}

/** A reference to a type definition of the same schema */
export function ref(name: string): jsonschema.Reference {
  return { $ref: `#/definitions/${name}` };
}

// A new object per call: the registry import marks each schema it resolves (`setResolvedReference`), so fixtures
// must not share one
export function str(): jsonschema.Schema {
  return { type: 'string' };
}

export function int(): jsonschema.Schema {
  return { type: 'integer' };
}

export function bool(): jsonschema.Schema {
  return { type: 'boolean' };
}

/** String fields of the given names */
export function strings(names: string[]): jsonschema.ObjectProperties {
  return Object.fromEntries(names.map((n) => [n, str()]));
}

/**
 * The IoT AuditCheckConfiguration shape: Checks.A and Checks.B are Check, Checks.C is `cType`, and CustomCheck has
 * a Configuration that Check lacks
 */
export function divergingChecks(cType: string): Partial<CloudFormationRegistryResource> {
  return {
    properties: { Checks: ref('Checks') },
    definitions: {
      Checks: object({ A: ref('Check'), B: ref('Check'), C: ref(cType) }),
      Check: object({ Enabled: bool() }),
      CustomCheck: object({ Enabled: bool(), Configuration: str() }),
    },
  };
}

/** The one type definition of the given name that a resource uses */
export function resourceTypeDefinition(target: SpecDatabase, name: string, typeName = RESOURCE) {
  const resource = target.lookup('resource', 'cloudFormationType', 'equals', typeName).only();
  const found = target
    .follow('usesType', resource)
    .map((x) => x.entity)
    .filter((t) => t.name === name);
  expect(found).toHaveLength(1);
  return found[0];
}

/** Write a pin file for a released database fixture, version 1.2.3 */
export function writePins(file: string, sha256: string) {
  fs.writeFileSync(file, JSON.stringify({ version: '1.2.3', integrity: 'sha512-c29tZSBieXRlcw==', sha256 }));
}
