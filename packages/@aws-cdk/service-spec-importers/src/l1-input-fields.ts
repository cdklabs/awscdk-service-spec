import { emptyDatabase, PropertyType, RichTypedField, SpecDatabase } from '@aws-cdk/service-spec-types';
import { importCloudFormationRegistryResource } from './importers/import-cloudformation-registry';
import { L1View, referencedStructs } from './l1-view';
import { loadDefaultCloudFormationRegistryResources } from './loaders';
import { JsonLensPatcher } from './patching';
import { ProblemReport, ReportAudience } from './report';
import { CloudFormationRegistryResource, simplePropNameFromJsonPtr } from './types';

/**
 * A field that a CloudFormation schema accepts as input and the L1 does not have
 */
export interface MissingInputField {
  readonly resource: string;
  /** The path of the field, like `Destinations/*\/Network`, where `*` stands for the elements of a list or map */
  readonly path: string;
  /** The regions whose schema has the field */
  readonly regions: string[];
}

/**
 * The input fields of the CloudFormation registry schemas in a directory (one subdirectory per region) that the L1
 * CDK renders from a database does not have
 *
 * The schemas are loaded with the same patches as for the database, so `patcher` must be the one the database was
 * built with. Throws if the directory has no schema.
 */
export async function findMissingInputFields(
  db: SpecDatabase,
  schemaDirectory: string,
  patcher?: JsonLensPatcher,
): Promise<MissingInputField[]> {
  const regions = await loadDefaultCloudFormationRegistryResources(schemaDirectory, {
    validate: false,
    report: new ProblemReport(),
    failureAudience: new ReportAudience('__ImportProblems'),
    patcher,
  });
  // Comparing with no schema would report every field as present
  if (!regions.some((region) => region.resources.length > 0)) {
    throw new Error(`No CloudFormation schema found in ${schemaDirectory}`);
  }

  const missing = new Map<string, { resource: string; path: string; regions: string[] }>();
  for (const region of regions) {
    for (const resource of region.resources) {
      for (const path of missingInputFields(db, resource)) {
        const key = `${resource.typeName} ${path}`;
        const field = missing.get(key) ?? { resource: resource.typeName, path, regions: [] };
        field.regions.push(region.regionName);
        missing.set(key, field);
      }
    }
  }
  return [...missing.values()];
}

/**
 * The fields that a CloudFormation registry schema accepts as input, and that the L1 CDK renders from a database
 * does not have
 *
 * The schema is read the way the registry importer reads it. A field is input unless the schema lists it, or a
 * field around it, in `readOnlyProperties` (and not also in `createOnlyProperties`, as for attributes). Where the L1
 * renders `json`, it accepts every field below. Returns the paths of the missing fields, like
 * `Destinations/*\/Network`, sorted.
 */
export function missingInputFields(db: SpecDatabase, schema: CloudFormationRegistryResource): string[] {
  const current = emptyDatabase();
  const currentResource = importCloudFormationRegistryResource({
    db: current,
    resource: schema,
    report: new ProblemReport(),
  });
  const tagProperty = currentResource.tagInformation?.tagPropertyName;
  const inputProperties = Object.entries(currentResource.properties).filter(([name]) => name !== tagProperty);

  const found = db.lookup('resource', 'cloudFormationType', 'equals', schema.typeName);
  if (found.length === 0) {
    return inputProperties.map(([name]) => name).sort();
  }
  const view = new L1View(db, found.only());

  const readOnly = (schema.readOnlyProperties ?? [])
    .filter((p) => !(schema.createOnlyProperties ?? []).includes(p))
    .map((p) => normalizePath(simplePropNameFromJsonPtr(p).split(/[./]/)));
  const isReadOnly = (path: string[]) => {
    const p = normalizePath(path);
    return readOnly.some((r) => p === r || p.startsWith(`${r}/`));
  };
  const hasReadOnlyBelow = (path: string[]) => {
    const p = normalizePath(path);
    return readOnly.some((r) => r.startsWith(`${p}/`));
  };

  const missing = new Set<string>();
  // The current structs already compared with a set of rendered structs, at any path when no read-only field is
  // below it. This also ends the comparison of recursive structs.
  const compared = new Set<string>();

  const compare = (path: string[], currentType: PropertyType, renderedType: PropertyType) => {
    while (currentType.type === 'array' || currentType.type === 'map') {
      path = [...path, '*'];
      currentType = currentType.element;
    }
    while (renderedType.type === 'array' || renderedType.type === 'map') {
      renderedType = renderedType.element;
    }

    const currentStructs = referencedStructs(current, currentType);
    if (currentStructs.length === 0 || acceptsAnything(renderedType)) {
      return;
    }
    const renderedStructs = referencedStructs(db, renderedType);
    const renderedIds = renderedStructs.map((s) => s.$id).join(',');

    for (const struct of currentStructs) {
      const key = `${struct.$id} ${renderedIds}${hasReadOnlyBelow(path) ? ` ${normalizePath(path)}` : ''}`;
      if (compared.has(key)) {
        continue;
      }
      compared.add(key);

      for (const [field, prop] of Object.entries(struct.properties)) {
        const fieldPath = [...path, field];
        if (isReadOnly(fieldPath)) {
          continue;
        }
        const target =
          renderedStructs.find((s) => s.name === struct.name && s.properties[field]) ??
          renderedStructs.find((s) => s.properties[field]);
        if (!target) {
          missing.add(fieldPath.join('/'));
          continue;
        }
        compare(fieldPath, prop.type, view.fields(target)[field].type);
      }
    }
  };

  for (const [name, prop] of inputProperties) {
    if (isReadOnly([name])) {
      continue;
    }
    const rendered = view.properties[name];
    if (!rendered) {
      missing.add(name);
      continue;
    }
    compare([name], new RichTypedField(prop).types()[0], rendered.type);
  }

  return [...missing].sort();
}

/**
 * A human-readable report of the missing input fields, grouped by resource
 */
export function formatMissingInputFields(missing: MissingInputField[]): string {
  if (missing.length === 0) {
    return 'L1 input fields: OK (the L1 has every field that CloudFormation accepts as input)';
  }
  const sorted = [...missing].sort((a, b) => a.resource.localeCompare(b.resource) || a.path.localeCompare(b.path));
  const lines = [
    `L1 input fields: FAIL (${missing.length} fields that CloudFormation accepts as input are missing from the L1)`,
  ];
  for (const resource of [...new Set(sorted.map((m) => m.resource))]) {
    lines.push('', `  ${resource}`);
    for (const field of sorted.filter((m) => m.resource === resource)) {
      lines.push(`    ${field.path} (${field.regions.join(', ')})`);
    }
  }
  return lines.join('\n');
}

/**
 * Whether the L1 accepts any value for a type: `json`, or a union with `json`
 */
function acceptsAnything(type: PropertyType): boolean {
  return type.type === 'json' || (type.type === 'union' && type.types.some(acceptsAnything));
}

/**
 * A field path without the list and map elements, so `Destinations/*\/Ip` and `Destinations/Ip` are the same
 */
function normalizePath(path: string[]): string {
  return path.filter((p) => p !== '*').join('/');
}
