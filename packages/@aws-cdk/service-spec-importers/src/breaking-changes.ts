import {
  MapDiff,
  Metric,
  Property,
  PropertyType,
  SpecDatabase,
  TypeDefinition,
  UpdatedProperty,
} from '@aws-cdk/service-spec-types';
import { DbDiff } from './db-diff';
import { compareL1, L1Changes, L1StructRename } from './l1-changes';
import { compareByCodeUnit } from './report/sorting';

/** The kinds of breaking change, in the order they are listed within a resource */
export type BreakingChangeKind =
  | 'removed'
  | 'now-required'
  | 'now-immutable'
  | 'default-changed'
  | 'allowed-values-narrowed'
  | 'cdk-type-renamed'
  | 'cdk-type-changed';

const KIND_ORDER: readonly BreakingChangeKind[] = [
  'removed',
  'now-required',
  'now-immutable',
  'default-changed',
  'allowed-values-narrowed',
  'cdk-type-renamed',
  'cdk-type-changed',
];

/**
 * A change that can make an existing CloudFormation template or existing CDK code fail
 */
export interface BreakingChange {
  /** The service, for example `aws-s3` */
  readonly service: string;
  /** The resource type, or the service's CloudFormation namespace for a metric of the service */
  readonly resource: string;
  readonly kind: BreakingChangeKind;
  /**
   * The property, field (`Struct.Field`, or a position path, see `renamedFieldPrefixes()`), attribute, type, metric or
   * struct that changed; empty for a resource
   */
  readonly element: string;
  /** The changelog description, without the final full stop, for example `Name property is now required` */
  readonly description: string;
}

/**
 * The changes from `base` to `head` that can make an existing CloudFormation template or existing CDK code fail, each
 * once, ordered by service, resource, kind, element and description
 *
 * Template breaks come from the model diff (`DbDiff`), CDK code breaks (the `cdk-` kinds) from the L1 change report;
 * pass `l1Changes` when it is already computed.
 */
export function findBreakingChanges(
  base: SpecDatabase,
  head: SpecDatabase,
  l1Changes: L1Changes = compareL1(base, head),
): BreakingChange[] {
  const changes = new Array<BreakingChange>();
  const differ = new DbDiff(base, head);
  const diff = differ.diff();
  const renamed = new Set(l1Changes.renames.map((r) => `${r.resource} ${r.from}`));

  for (const service of Object.values(diff.services.removed ?? {})) {
    for (const { entity } of base.follow('hasResource', service)) {
      changes.push(removal(service.name, entity.cloudFormationType, '', 'resource'));
    }
    for (const { entity } of base.follow('serviceHasMetric', service)) {
      changes.push(metricRemoval(service.name, service.cloudFormationNamespace, entity));
    }
  }

  for (const [serviceName, service] of Object.entries(diff.services.updated ?? {})) {
    const namespace = head.lookup('service', 'name', 'equals', serviceName).only().cloudFormationNamespace;
    for (const metric of Object.values(service.metrics?.removed ?? {})) {
      changes.push(metricRemoval(serviceName, namespace, metric));
    }
    for (const resourceType of Object.keys(service.resourceDiff?.removed ?? {})) {
      changes.push(removal(serviceName, resourceType, '', 'resource'));
    }

    for (const [resourceType, resource] of Object.entries(service.resourceDiff?.updated ?? {})) {
      const at = { service: serviceName, resource: resourceType };
      changes.push(...propertyChanges(at, resource.properties, ''));
      for (const name of Object.keys(resource.attributes?.removed ?? {})) {
        changes.push(removal(serviceName, resourceType, name, 'attribute'));
      }
      for (const name of Object.keys(resource.typeDefinitionDiff?.removed ?? {})) {
        // A struct the L1 renders under another name is listed as the rename
        if (!renamed.has(`${resourceType} ${name}`)) {
          changes.push(removal(serviceName, resourceType, `type ${name}`, 'type', name));
        }
      }
      for (const [name, type] of Object.entries(resource.typeDefinitionDiff?.updated ?? {})) {
        changes.push(...propertyChanges(at, type.properties, `${name}.`));
      }
      for (const metric of Object.values(resource.metrics?.removed ?? {})) {
        changes.push(metricRemoval(serviceName, resourceType, metric));
      }
    }
  }

  // The model diff pairs type definitions by name, so each renamed struct is compared with its new struct here
  for (const rename of l1Changes.renames) {
    const at = { service: serviceOf(head, rename.resource), resource: rename.resource };
    const fields = differ.diffTypeDefinition(
      typeDefinition(base, rename.resource, rename.from),
      typeDefinition(head, rename.resource, rename.to),
    )?.properties;
    for (const prefix of renamedFieldPrefixes(head, rename)) {
      changes.push(...propertyChanges(at, fields, prefix));
    }
  }

  changes.push(...cdkCodeChanges(head, l1Changes));
  const sortKey = (c: BreakingChange) => JSON.stringify([c.service, c.resource, c.kind, c.element, c.description]);
  changes.sort(
    (a, b) =>
      compareByCodeUnit(a.service, b.service) ||
      compareByCodeUnit(a.resource, b.resource) ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      compareByCodeUnit(a.element, b.element) ||
      compareByCodeUnit(a.description, b.description),
  );
  // A struct's change is also found at a property of the same name that switched from it; equal ones sort together
  return changes.filter((c, i) => i === 0 || sortKey(c) !== sortKey(changes[i - 1]));
}

/** The paragraph that starts the changelog text; aws-cdk's release tooling finds the L1 changes by its first words */
const CHANGELOG_PARAGRAPH =
  '**CHANGES TO L1 RESOURCES:** L1 resources are automatically generated from public CloudFormation Resource Schemas. They are built to closely reflect the real state of CloudFormation. Sometimes these updates can contain changes that are incompatible with previous types, but more accurately reflect reality. In this release we have changed:';

/** The changelog text for the L1 pull request: the paragraph, an empty line, one line per change or one saying none */
export function formatBreakingChanges(changes: BreakingChange[]): string {
  // Each line but the last ends in two spaces, a markdown line break
  const entries =
    changes.length > 0
      ? changes.map(
          (c, i, all) =>
            `${oneLine(`${c.service}: ${c.resource}: ${c.description}`)}.${i < all.length - 1 ? '  ' : ''}`,
        )
      : ['No breaking changes detected in this release.'];
  return [CHANGELOG_PARAGRAPH, '', ...entries].join('\n');
}

interface Place {
  readonly service: string;
  readonly resource: string;
}

/**
 * The breaking changes of the properties of a resource, or of the fields of a type (`prefix` is `Type.`, or a position
 * path from `renamedFieldPrefixes()`)
 */
function propertyChanges(
  at: Place,
  diff: MapDiff<Property, UpdatedProperty> | undefined,
  prefix: string,
): BreakingChange[] {
  const ret = new Array<BreakingChange>();
  const change = (kind: BreakingChangeKind, element: string, description: string) =>
    ret.push({ service: at.service, resource: at.resource, kind, element, description });

  for (const field of Object.keys(diff?.removed ?? {})) {
    ret.push(removal(at.service, at.resource, `${prefix}${field}`, 'property'));
  }

  for (const [field, { old, new: now }] of Object.entries(diff?.updated ?? {})) {
    const name = `${prefix}${field}`;
    if (!old.required && now.required) {
      change('now-required', name, `${name} property is now required`);
    }
    const replaces = [old.causesReplacement ?? 'no', now.causesReplacement ?? 'no'];
    if (replaces[0] !== 'yes' && replaces[1] === 'yes') {
      change('now-immutable', name, `${name} property is now immutable`);
    } else if (replaces[0] === 'no' && replaces[1] === 'maybe') {
      change('now-immutable', name, `${name} property may now require replacement`);
    }
    if (old.defaultValue !== undefined && now.defaultValue !== undefined && old.defaultValue !== now.defaultValue) {
      change(
        'default-changed',
        name,
        `${name} property default value changed from ${old.defaultValue} to ${now.defaultValue}`,
      );
    }
    for (const narrowing of allowedValueNarrowings(old.type, now.type)) {
      if ('removed' in narrowing) {
        const value = JSON.stringify(narrowing.removed);
        change('allowed-values-narrowed', name, `${name} property no longer allows ${value}`);
      } else {
        const values = narrowing.restrictedTo.map((v) => JSON.stringify(v)).join(', ');
        change('allowed-values-narrowed', name, `${name} property now only allows ${values}`);
      }
    }
  }
  return ret;
}

type AllowedValue = string | number;
type Narrowing = { readonly removed: AllowedValue } | { readonly restrictedTo: AllowedValue[] };

/** Each allowed value that `now` drops, or the values `now` allows where `old` allowed any */
function allowedValueNarrowings(old: PropertyType, now: PropertyType): Narrowing[] {
  if ((old.type === 'string' && now.type === 'string') || (old.type === 'integer' && now.type === 'integer')) {
    const before: AllowedValue[] | undefined = old.allowedValues;
    const after: AllowedValue[] | undefined = now.allowedValues;
    if (!after) {
      return [];
    }
    if (!before) {
      return [{ restrictedTo: after }];
    }
    return before.filter((v) => !after.includes(v)).map((v) => ({ removed: v }));
  }
  if ((old.type === 'array' && now.type === 'array') || (old.type === 'map' && now.type === 'map')) {
    return allowedValueNarrowings(old.element, now.element);
  }
  if (old.type === 'union' && now.type === 'union') {
    return [...new Set(old.types.map((t) => t.type))].flatMap((kind) => {
      const [before, after] = [old.types, now.types].map((ts) => ts.filter((t) => t.type === kind));
      return before.length === 1 && after.length === 1 ? allowedValueNarrowings(before[0], after[0]) : [];
    });
  }
  return [];
}

/** The struct renames and merges in the L1 change report, and the rendered types that changed other than by widening */
function cdkCodeChanges(head: SpecDatabase, l1Changes: L1Changes): BreakingChange[] {
  const ret = new Array<BreakingChange>();
  // A rendered type (`renderType()`) never contains ` to `
  const typeChange = (resource: string, noun: string, name: string, description: string) => {
    const types = /^type changed from (.+) to (.+)$/.exec(description);
    if (!types) {
      throw new Error(`Unexpected L1 change: ${name}: ${description}`);
    }
    const [, from, to] = types;
    if (!widens(from, to)) {
      ret.push({
        service: serviceOf(head, resource),
        resource,
        kind: 'cdk-type-changed',
        element: name,
        description: `${name} ${noun} type changed from ${from} to ${to}`,
      });
    }
  };

  for (const rename of l1Changes.renames) {
    const merged = l1Changes.renames.filter((r) => r.resource === rename.resource && r.to === rename.to).length > 1;
    ret.push({
      service: serviceOf(head, rename.resource),
      resource: rename.resource,
      kind: 'cdk-type-renamed',
      element: rename.from,
      description: `${rename.from} type ${merged ? 'merged into' : 'renamed to'} ${rename.to}`,
    });
    // Only the type changes: the struct comparison in `findBreakingChanges()` finds the other breaking field changes
    for (const fieldChange of rename.fieldChanges) {
      const field = /^(\S+) (type changed from .+)$/.exec(fieldChange);
      if (field) {
        for (const prefix of renamedFieldPrefixes(head, rename)) {
          typeChange(rename.resource, 'property', `${prefix}${field[1]}`, field[2]);
        }
      }
    }
  }
  for (const change of l1Changes.other) {
    const element = /^(property|attribute|field) (.+)$/.exec(change.element);
    if (!element) {
      throw new Error(`Unexpected L1 change: ${change.element}: ${change.description}`);
    }
    typeChange(change.resource, element[1] === 'attribute' ? 'attribute' : 'property', element[2], change.description);
  }
  return ret;
}

/**
 * The prefixes of a renamed struct's field changes: `<from>.`, or, while `head` still uses `from`, each position of the
 * rename (`Source.`), because only those positions break
 */
function renamedFieldPrefixes(head: SpecDatabase, rename: L1StructRename): string[] {
  const resource = head.lookup('resource', 'cloudFormationType', 'equals', rename.resource).only();
  const kept = head.follow('usesType', resource).some(({ entity }) => entity.name === rename.from);
  if (!kept || rename.positions.length === 0) {
    return [`${rename.from}.`];
  }
  return rename.positions.map((position) => `${position.replace(/^(property|attribute|field) /, '')}.`);
}

function serviceOf(db: SpecDatabase, resourceType: string): string {
  return db.incoming('hasResource', db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only()).only()
    .entity.name;
}

function typeDefinition(db: SpecDatabase, resourceType: string, name: string): TypeDefinition {
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only();
  const found = db.follow('usesType', resource).filter(({ entity }) => entity.name === name);
  if (found.length !== 1) {
    throw new Error(`Expected one type definition ${name} of ${resourceType}, found ${found.length}`);
  }
  return found[0].entity;
}

/**
 * Whether rendered type `to` widens `from`: each member of `from` has a member of `to` that is `json`, the same type,
 * or a list or map of the same kind whose element type widens
 */
function widens(from: string, to: string): boolean {
  const toMembers = unionMembers(to);
  return unionMembers(from).every((m) => toMembers.some((t) => memberWidens(m, t)));
}

function memberWidens(from: string, to: string): boolean {
  if (to === 'json' || from === to) {
    return true;
  }
  const wrapper = ['Array<', 'Map<string, '].find((w) => from.startsWith(w) && to.startsWith(w));
  return wrapper !== undefined && widens(from.slice(wrapper.length, -1), to.slice(wrapper.length, -1));
}

function unionMembers(type: string): string[] {
  const members = new Array<string>();
  let depth = 0;
  let start = 0;
  for (let i = 0; i < type.length; i++) {
    if (type[i] === '<') {
      depth++;
    } else if (type[i] === '>') {
      depth--;
    } else if (depth === 0 && type.startsWith(' | ', i)) {
      members.push(type.slice(start, i));
      start = i + 3;
    }
  }
  return [...members, type.slice(start)];
}

function removal(service: string, resource: string, element: string, noun: string, name = element): BreakingChange {
  return { service, resource, kind: 'removed', element, description: `${name ? `${name} ` : ''}${noun} removed` };
}

function metricRemoval(service: string, resource: string, metric: Metric): BreakingChange {
  const name = `${metric.namespace} ${metric.name}`;
  return removal(service, resource, `metric ${name}`, 'metric', name);
}

function oneLine(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ');
}
