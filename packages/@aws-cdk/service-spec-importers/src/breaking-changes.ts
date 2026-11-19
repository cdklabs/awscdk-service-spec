import {
  Attribute,
  MapDiff,
  Metric,
  Property,
  PropertyType,
  Service,
  SpecDatabase,
  TypeDefinition,
  UpdatedProperty,
} from '@aws-cdk/service-spec-types';
import { DbDiff } from './db-diff';
import { compareL1, L1Changes } from './l1-changes';
import { renderType } from './l1-view';

/**
 * The kinds of breaking change, in the order they are listed within a resource
 *
 * - `removed`: a resource, property, attribute, type definition, field of a type definition or metric that the base
 *   database has and the new one lacks
 * - `now-required`: a property or field that was optional
 * - `now-immutable`: a property or field whose update now always replaces the resource, which it did not always do
 * - `default-changed`: a property or field with a default value in both databases, which differ
 * - `allowed-values-narrowed`: a property or field that no longer allows a value, or allows only some values where it
 *   allowed any
 * - `cdk-type-renamed`: a struct that the L1 renders under another name, alone (a rename) or with others (a merge)
 * - `cdk-type-changed`: a type that the L1 renders differently, other than by widening it
 */
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
  /** What changed: a property `Name`, a field `Struct.Field`, an attribute, type, metric or struct; empty for a resource */
  readonly element: string;
  /** The change, as the table shows it, for example `Name: optional → required` */
  readonly change: string;
  /** The change in three or four words, for example `Property changed to required` */
  readonly explanation: string;
  /** The changelog description, without the final full stop, for example `Name property is now required` */
  readonly description: string;
}

/**
 * A service whose name does not start with `aws-`
 */
export interface NonStandardService {
  readonly service: string;
  /** `aws-` and the rest of the name */
  readonly expected: string;
  readonly namespace: string;
}

export interface BreakingChanges {
  /** Ordered by service, resource, kind and element */
  readonly changes: BreakingChange[];
  /** The services with a breaking change or new in the new database whose names do not start with `aws-` */
  readonly nonStandardServices: NonStandardService[];
}

/**
 * The changes between a base database and a new one that can make an existing CloudFormation template or existing CDK
 * code fail
 *
 * Template breaks come from the model diff (`DbDiff`): removals, and the properties and fields that became required,
 * immutable, got another default value or fewer allowed values. CDK code breaks come from the L1 change report
 * (`compareL1`, pass it when it is already computed): struct renames and merges, and rendered types that changed other
 * than by widening. Additions, relaxations, deprecations, documentation and anything in a new resource are never
 * listed.
 */
export function findBreakingChanges(
  base: SpecDatabase,
  head: SpecDatabase,
  l1Changes: L1Changes = compareL1(base, head),
): BreakingChanges {
  const changes = new Array<BreakingChange>();
  const differ = new DbDiff(base, head);
  const diff = differ.diff();
  const renamed = new Set(l1Changes.renames.map((r) => `${r.resource} ${r.from}`));

  for (const service of Object.values(diff.services.removed ?? {})) {
    for (const { entity } of base.follow('hasResource', service)) {
      changes.push(
        removal(service.name, entity.cloudFormationType, '', entity.cloudFormationType, 'Resource', 'resource'),
      );
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
      changes.push(removal(serviceName, resourceType, '', resourceType, 'Resource', 'resource'));
    }

    for (const [resourceType, resource] of Object.entries(service.resourceDiff?.updated ?? {})) {
      const at = { service: serviceName, resource: resourceType, base };
      changes.push(...propertyChanges(at, resource.properties, ''));
      for (const [name, attribute] of Object.entries(resource.attributes?.removed ?? {})) {
        changes.push(removal(serviceName, resourceType, name, typed(base, name, attribute), 'Attribute', 'attribute'));
      }
      for (const name of Object.keys(resource.typeDefinitionDiff?.removed ?? {})) {
        // A struct the L1 renders under another name is listed as the rename
        if (!renamed.has(`${resourceType} ${name}`)) {
          changes.push(removal(serviceName, resourceType, `type ${name}`, `type ${name}`, 'Type', 'type', name));
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

  // The model diff pairs type definitions by name, so the fields of a struct the L1 renders under another name are
  // compared here, by the struct's old name: the fields of `from` that `to` lacks or restricts break the templates and
  // code that set them where `from` was
  for (const rename of l1Changes.renames) {
    const at = { service: serviceOf(head, rename.resource), resource: rename.resource, base };
    const fields = differ.diffTypeDefinition(
      typeDefinition(base, rename.resource, rename.from),
      typeDefinition(head, rename.resource, rename.to),
    )?.properties;
    changes.push(...propertyChanges(at, fields, `${rename.from}.`));
  }

  changes.push(...cdkCodeChanges(head, l1Changes));
  changes.sort(
    (a, b) =>
      compare(a.service, b.service) ||
      compare(a.resource, b.resource) ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      compare(a.element, b.element) ||
      compare(a.change, b.change),
  );
  // A struct changed under its own name that the L1 renders under another name elsewhere can give a change twice
  const unique = changes.filter((c, i) => i === 0 || JSON.stringify(c) !== JSON.stringify(changes[i - 1]));

  return {
    changes: unique,
    nonStandardServices: nonStandardServices(base, head, unique, Object.keys(diff.services.added ?? {})),
  };
}

/** The paragraph that starts the changelog block; aws-cdk's release tooling finds the L1 changes by its first words */
const CHANGELOG_PARAGRAPH =
  '**CHANGES TO L1 RESOURCES:** L1 resources are automatically generated from public CloudFormation Resource Schemas. They are built to closely reflect the real state of CloudFormation. Sometimes these updates can contain changes that are incompatible with previous types, but more accurately reflect reality. In this release we have changed:';

/**
 * The breaking changes as markdown: a table, the non-standard service prefixes if there are any, and the changelog
 * text for the L1 pull request, one line per change
 */
export function formatBreakingChanges(report: BreakingChanges): string {
  const lines = [
    '### Breaking Changes Analysis',
    '| Service | Resource | Change | Explanation |',
    '|---------|----------|--------|-------------|',
    ...report.changes.map(
      (c) => `| ${cell(c.service)} | ${cell(c.resource)} | ${code(c.change)} | ${cell(c.explanation)} |`,
    ),
  ];
  if (report.changes.length === 0) {
    lines.push('', 'No breaking changes found.');
  }

  if (report.nonStandardServices.length > 0) {
    lines.push(
      '',
      '### Non-Standard Service Prefixes Detected',
      '',
      '| Detected Service | Expected Service | CloudFormation Namespace |',
      '|------------------|------------------|--------------------------|',
      ...report.nonStandardServices.map((s) => `| ${cell(s.service)} | ${cell(s.expected)} | ${cell(s.namespace)} |`),
      '',
      '**Action Required:** These services have non-standard prefixes that may indicate an error in the CloudFormation resource specification. Please verify these are intentional before merging.',
    );
  }

  // Each line but the last ends in two spaces, a markdown line break
  const entries =
    report.changes.length > 0
      ? report.changes.map(
          (c, i, all) => `${c.service}: ${c.resource}: ${c.description}.${i < all.length - 1 ? '  ' : ''}`,
        )
      : ['No breaking changes detected in this release.'];
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(entries.join('\n')) + 1));
  lines.push(
    '',
    '### Changelog Entry',
    '**Copy the text below for your L1 PR:**',
    '',
    fence,
    CHANGELOG_PARAGRAPH,
    '',
    ...entries,
    fence,
  );
  return lines.join('\n');
}

interface Place {
  readonly service: string;
  readonly resource: string;
  readonly base: SpecDatabase;
}

/**
 * The breaking changes of the properties of a resource, or the fields of a type definition (`prefix` is `Type.`)
 */
function propertyChanges(
  at: Place,
  diff: MapDiff<Property, UpdatedProperty> | undefined,
  prefix: string,
): BreakingChange[] {
  const ret = new Array<BreakingChange>();
  const change = (kind: BreakingChangeKind, element: string, text: string, explanation: string, description: string) =>
    ret.push({ service: at.service, resource: at.resource, kind, element, change: text, explanation, description });

  for (const [field, property] of Object.entries(diff?.removed ?? {})) {
    const name = `${prefix}${field}`;
    ret.push(removal(at.service, at.resource, name, typed(at.base, name, property), 'Property', 'property'));
  }

  for (const [field, { old, new: now }] of Object.entries(diff?.updated ?? {})) {
    const name = `${prefix}${field}`;
    if (!old.required && now.required) {
      change(
        'now-required',
        name,
        `${name}: optional → required`,
        'Property changed to required',
        `${name} property is now required`,
      );
    }
    const replaces = [old.causesReplacement ?? 'no', now.causesReplacement ?? 'no'];
    if (replaces[0] !== 'yes' && replaces[1] === 'yes') {
      change(
        'now-immutable',
        name,
        `${name}: ${MUTABILITY[replaces[0]]} → ${MUTABILITY[replaces[1]]}`,
        'Property changed to immutable',
        `${name} property is now immutable`,
      );
    }
    if (old.defaultValue !== undefined && now.defaultValue !== undefined && old.defaultValue !== now.defaultValue) {
      change(
        'default-changed',
        name,
        `${name}: default=${old.defaultValue} → default=${now.defaultValue}`,
        'Default value changed',
        `${name} property default value changed from ${old.defaultValue} to ${now.defaultValue}`,
      );
    }
    for (const narrowing of allowedValueNarrowings(old.type, now.type)) {
      if ('removed' in narrowing) {
        const value = JSON.stringify(narrowing.removed);
        change(
          'allowed-values-narrowed',
          name,
          `${name}: [-] allowed value ${value}`,
          'Allowed value removed',
          `${name} property no longer allows ${value}`,
        );
      } else {
        const values = narrowing.restrictedTo.map((v) => JSON.stringify(v)).join(', ');
        change(
          'allowed-values-narrowed',
          name,
          `${name}: allowed values restricted to ${values}`,
          'Allowed values restricted',
          `${name} property now only allows ${values}`,
        );
      }
    }
  }
  return ret;
}

/** How the model diff shows `causesReplacement` */
const MUTABILITY: Record<string, string> = { no: 'mutable', maybe: 'immutable?', yes: 'immutable' };

type AllowedValue = string | number;
type Narrowing = { readonly removed: AllowedValue } | { readonly restrictedTo: AllowedValue[] };

/**
 * How the allowed values of a type are narrower than before: each value no longer allowed, or the values now allowed
 * where any were
 *
 * Strings and integers are compared with the same type, lists and maps by their elements, and type unions by their
 * members of each type, where each union has one member of that type.
 */
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

/**
 * The struct renames and merges, and the rendered types that changed other than by widening, in the L1 change report,
 * including the fields of renamed and merged structs (by the struct's old name)
 */
function cdkCodeChanges(head: SpecDatabase, l1Changes: L1Changes): BreakingChange[] {
  const ret = new Array<BreakingChange>();
  // Rendered types are made of type names, `Array<...>`, `Map<string, ...>` and ` | `, so ` to ` separates them
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
        change: `${name}: ${from} → ${to}`,
        explanation: 'CDK type changed',
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
      change: `${rename.from} → ${rename.to}`,
      explanation: merged ? 'CDK type merged' : 'CDK type renamed',
      description: `${rename.from} type ${merged ? 'merged into' : 'renamed to'} ${rename.to}`,
    });
    // Field changes read `<field> type changed from A to B`, `<field> now required`, `<field> removed` and so on
    for (const fieldChange of rename.fieldChanges) {
      const field = /^(\S+) (type changed from .+)$/.exec(fieldChange);
      if (field) {
        typeChange(rename.resource, 'property', `${rename.from}.${field[1]}`, field[2]);
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

/** The service of a resource type in a database */
function serviceOf(db: SpecDatabase, resourceType: string): string {
  return db.incoming('hasResource', db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only()).only()
    .entity.name;
}

/** The type definition of a resource by its name, as the L1 change report names structs */
function typeDefinition(db: SpecDatabase, resourceType: string, name: string): TypeDefinition {
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only();
  const found = db.follow('usesType', resource).filter(({ entity }) => entity.name === name);
  if (found.length !== 1) {
    throw new Error(`Expected one type definition ${name} of ${resourceType}, found ${found.length}`);
  }
  return found[0].entity;
}

/**
 * Whether a rendered type accepts everything the old one did: it is `json`, or a union of the old type's members and
 * others, also inside lists and maps of the same kind
 */
function widens(from: string, to: string): boolean {
  if (to === 'json') {
    return true;
  }
  const [fromMembers, toMembers] = [unionMembers(from), unionMembers(to)];
  if (fromMembers.length === 1 && toMembers.length === 1) {
    for (const wrapper of ['Array<', 'Map<string, ']) {
      if (from.startsWith(wrapper) && to.startsWith(wrapper)) {
        return widens(from.slice(wrapper.length, -1), to.slice(wrapper.length, -1));
      }
    }
  }
  return fromMembers.every((m) => toMembers.includes(m));
}

/** The members of a rendered type union, split where no `<...>` is open */
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

/**
 * A removal: `what` is the change after `[-] `, `explanationNoun` starts the explanation and `noun` follows `name` in the
 * changelog description
 */
function removal(
  service: string,
  resource: string,
  element: string,
  what: string,
  explanationNoun: string,
  noun: string,
  name = element,
): BreakingChange {
  return {
    service,
    resource,
    kind: 'removed',
    element,
    change: `[-] ${what}`,
    explanation: `${explanationNoun} removed`,
    description: `${name ? `${name} ` : ''}${noun} removed`,
  };
}

function metricRemoval(service: string, resource: string, metric: Metric): BreakingChange {
  const name = `${metric.namespace} ${metric.name}`;
  return removal(service, resource, `metric ${name}`, `metric ${name}`, 'Metric', 'metric', name);
}

/** A property or attribute with the type that the base database gives it, as the L1 renders it */
function typed(db: SpecDatabase, name: string, field: Property | Attribute): string {
  return `${name}: ${renderType(db, field.type)}`;
}

/**
 * The services whose names do not start with `aws-` among the services of `changes` and `added`
 */
function nonStandardServices(
  base: SpecDatabase,
  head: SpecDatabase,
  changes: BreakingChange[],
  added: string[],
): NonStandardService[] {
  const names = [...new Set([...changes.map((c) => c.service), ...added])].filter((n) => !n.startsWith('aws-'));
  return names.sort(compare).map((name) => {
    const service: Service = [head, base].flatMap((db) => db.lookup('service', 'name', 'equals', name))[0];
    const rest = name.includes('-') ? name.slice(name.indexOf('-') + 1) : name;
    return { service: name, expected: `aws-${rest}`, namespace: service.cloudFormationNamespace };
  });
}

/** Compare by code point, so the order does not depend on the locale */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Text for a markdown table cell */
function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

/** Text as inline code in a markdown table cell */
function code(text: string): string {
  const ticks = '`'.repeat(longestBacktickRun(text) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${cell(text)}${pad}${ticks}`;
}

function longestBacktickRun(text: string): number {
  return Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
}
