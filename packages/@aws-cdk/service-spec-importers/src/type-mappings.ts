import { promises as fs } from 'node:fs';

export const TYPE_MAPPING_KINDS = ['rename', 'merge', 'split', 'replace', 'keep-old', 'follow-cloudformation'] as const;

/**
 * How a released type definition continues when the matcher cannot decide it
 *
 * - `rename`: the released type continues as the named current type wherever that type stands at its positions.
 * - `merge`: as `rename`, for one of several released types that continue as one current type; one entry each.
 * - `split`: the released type stays where CloudFormation's type has its fields; where CloudFormation uses one of
 *   the named types with other fields, the L1 renders that type.
 * - `replace`: at the released type's positions where the named current type stands, the L1 renders it.
 * - `keep-old`: the released type stays at all its positions with its released fields plus those carried from each.
 * - `follow-cloudformation`: at the released type's positions the L1 renders CloudFormation's type there.
 */
export type TypeMappingKind = (typeof TYPE_MAPPING_KINDS)[number];

/**
 * A person's decision for a released type definition that the matcher cannot decide
 */
export interface TypeMapping {
  /** The CloudFormation resource type */
  readonly resource: string;
  /** The released type definition */
  readonly oldType: string;
  /** The current type definitions it continues as, or carries fields from */
  readonly newTypes: string[];
  readonly kind: TypeMappingKind;
  /** Why the mapping is right */
  readonly reason: string;
  /** The pull request that adds the entry */
  readonly pr: string;
}

export const TYPE_MAPPING_FIELDS: Array<keyof TypeMapping> = [
  'resource',
  'oldType',
  'newTypes',
  'kind',
  'reason',
  'pr',
];

/** The reason and pull request link of a printed entry, for a person to fill in */
export const REASON_PLACEHOLDER = '<why this mapping is right>';
export const PR_PLACEHOLDER = '<link to the pull request that adds this entry>';

const ONE_NEW_TYPE: TypeMappingKind[] = ['rename', 'merge', 'replace'];

/**
 * Load the type mapping file, failing on the first malformed entry
 */
export async function loadTypeMappings(file: string): Promise<TypeMapping[]> {
  let entries: unknown;
  try {
    entries = JSON.parse(await fs.readFile(file, 'utf-8'));
  } catch (e: any) {
    throw new Error(`Could not read the type mappings ${file}: ${e.message}`);
  }
  if (!Array.isArray(entries)) {
    throw new Error(`${file} must hold a JSON list of entries`);
  }

  const seen = new Map<string, number>();
  return entries.map((entry, i) => {
    const mapping = checkEntry(entry, (why) => {
      const name = typeof entry === 'object' && entry !== null ? ` (${entry.resource} ${entry.oldType})` : '';
      return new Error(`Invalid entry ${i + 1} in ${file}${name}: ${why}`);
    });
    const key = `${mapping.resource} ${mapping.oldType}`;
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      throw new Error(`Invalid entry ${i + 1} in ${file} (${key}): entry ${earlier} already maps this type`);
    }
    seen.set(key, i + 1);
    return mapping;
  });
}

function checkEntry(entry: any, invalid: (why: string) => Error): TypeMapping {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw invalid('expected an object');
  }
  for (const key of Object.keys(entry)) {
    if (!(TYPE_MAPPING_FIELDS as string[]).includes(key)) {
      throw invalid(`unknown field ${key} (the fields are ${TYPE_MAPPING_FIELDS.join(', ')})`);
    }
  }
  if (typeof entry.resource !== 'string' || !/^[A-Za-z0-9]+::[A-Za-z0-9]+::[A-Za-z0-9]+$/.test(entry.resource)) {
    throw invalid(
      `resource must be a CloudFormation type like AWS::Service::Resource, got ${JSON.stringify(entry.resource)}`,
    );
  }
  if (!isName(entry.oldType)) {
    throw invalid(`oldType must be a type definition name, got ${JSON.stringify(entry.oldType)}`);
  }
  if (!Array.isArray(entry.newTypes) || !entry.newTypes.every(isName)) {
    throw invalid(`newTypes must be a list of type definition names, got ${JSON.stringify(entry.newTypes)}`);
  }
  if (!TYPE_MAPPING_KINDS.includes(entry.kind)) {
    throw invalid(`kind must be one of ${TYPE_MAPPING_KINDS.join(', ')}, got ${JSON.stringify(entry.kind)}`);
  }
  if (ONE_NEW_TYPE.includes(entry.kind) && entry.newTypes.length !== 1) {
    throw invalid(`a ${entry.kind} names exactly one new type, got ${entry.newTypes.length}`);
  }
  if (entry.kind === 'split' && entry.newTypes.length === 0) {
    throw invalid('a split names at least one new type');
  }
  if (typeof entry.reason !== 'string' || entry.reason.trim() === '' || entry.reason === REASON_PLACEHOLDER) {
    throw invalid('reason must say why the mapping is right');
  }
  if (typeof entry.pr !== 'string' || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(pull|issues)\/\d+$/.test(entry.pr)) {
    throw invalid(`pr must link the pull request that adds the entry, got ${JSON.stringify(entry.pr)}`);
  }
  return {
    resource: entry.resource,
    oldType: entry.oldType,
    newTypes: entry.newTypes,
    kind: entry.kind,
    reason: entry.reason,
    pr: entry.pr,
  };
}

function isName(x: unknown): x is string {
  return typeof x === 'string' && /^[A-Za-z0-9_]+$/.test(x);
}
