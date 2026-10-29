import { PropertyType, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec-types';
import { L1View, RenderedField, renderType } from './l1-view';

/**
 * A struct that the L1 renders under another name at the same positions, because its source renamed it or merged it
 * with other structs
 */
export interface L1StructRename {
  readonly resource: string;
  /** The struct the base database renders */
  readonly from: string;
  /** The struct the new database renders instead */
  readonly to: string;
  /** Where the L1 uses the struct, for example `property Destinations` or `field Settings.Filter` */
  readonly positions: string[];
  /** How the fields of `to` differ from the fields of `from`, for example `Url added` or `Port now required` */
  readonly fieldChanges: string[];
}

export interface L1Change {
  readonly resource: string;
  /** The changed L1 element, for example `property Settings`, `field Settings.Url` or `struct Settings` */
  readonly element: string;
  readonly description: string;
}

/**
 * The changes to what CDK renders as L1 code between two databases
 */
export interface L1Changes {
  readonly renames: L1StructRename[];
  /** Fields that a struct no longer has, where the struct keeps its name */
  readonly removedFields: L1Change[];
  /** Properties and fields that became required or optional */
  readonly requiredness: L1Change[];
  /** Removed resources, properties, attributes and structs, and changed types */
  readonly other: L1Change[];
  /** The number of added resources, properties, attributes, structs and fields */
  readonly additions: number;
}

/**
 * Compare what CDK renders as L1 code from a base database with what it renders from a new database
 *
 * Structs are compared by position: two different structs at the same property or field, in the same lists and
 * maps, are a struct rename (or a merge, when several structs become the same one).
 */
export function compareL1(base: SpecDatabase, head: SpecDatabase): L1Changes {
  const changes: MutableL1Changes = { renames: [], removedFields: [], requiredness: [], other: [], additions: 0 };

  for (const baseResource of base.all('resource')) {
    const found = head.lookup('resource', 'cloudFormationType', 'equals', baseResource.cloudFormationType);
    if (found.length === 0) {
      changes.other.push({ resource: baseResource.cloudFormationType, element: 'resource', description: 'removed' });
      continue;
    }
    new ResourceComparison(new L1View(base, baseResource), new L1View(head, found.only()), changes).compare();
  }
  for (const resource of head.all('resource')) {
    if (base.lookup('resource', 'cloudFormationType', 'equals', resource.cloudFormationType).length === 0) {
      changes.additions += 1;
    }
  }

  const byElement = (a: L1Change, b: L1Change) =>
    a.resource.localeCompare(b.resource) || a.element.localeCompare(b.element);
  for (const rename of changes.renames) {
    rename.positions.sort();
  }
  changes.renames.sort(
    (a, b) => a.resource.localeCompare(b.resource) || a.to.localeCompare(b.to) || a.from.localeCompare(b.from),
  );
  changes.removedFields.sort(byElement);
  changes.requiredness.sort(byElement);
  changes.other.sort(byElement);
  return changes;
}

/**
 * A human-readable report of the changes, grouped by resource
 */
export function formatL1Changes(changes: L1Changes): string {
  const lines = [
    [
      'L1 changes from the base database (what CDK renders):',
      `${changes.renames.length} renamed or merged structs,`,
      `${changes.removedFields.length} removed fields,`,
      `${changes.requiredness.length} requiredness changes,`,
      `${changes.other.length} other changes,`,
      `${changes.additions} additions`,
    ].join(' '),
  ];

  if (changes.renames.length > 0) {
    lines.push('', 'Renamed and merged structs (code that names the old struct needs the new name):');
    for (const resource of unique(changes.renames.map((r) => r.resource))) {
      lines.push(`  ${resource}`);
      const ofResource = changes.renames.filter((r) => r.resource === resource);
      for (const to of unique(ofResource.map((r) => r.to))) {
        const merged = ofResource.filter((r) => r.to === to);
        const positions = merged.flatMap((r) => r.positions).join(', ');
        if (merged.length === 1) {
          const fieldChanges = merged[0].fieldChanges.length > 0 ? `: ${merged[0].fieldChanges.join(', ')}` : '';
          lines.push(`    ${merged[0].from} -> ${to} (${positions})${fieldChanges}`);
          continue;
        }
        lines.push(`    ${merged.map((r) => r.from).join(', ')} -> ${to} (merge; ${positions})`);
        for (const rename of merged.filter((r) => r.fieldChanges.length > 0)) {
          lines.push(`      from ${rename.from}: ${rename.fieldChanges.join(', ')}`);
        }
      }
    }
  }

  const section = (title: string, ofKind: L1Change[], withDescription: boolean) => {
    if (ofKind.length === 0) {
      return;
    }
    lines.push('', title);
    for (const resource of unique(ofKind.map((c) => c.resource))) {
      lines.push(`  ${resource}`);
      for (const change of ofKind.filter((c) => c.resource === resource)) {
        lines.push(`    ${change.element}${withDescription ? `: ${change.description}` : ''}`);
      }
    }
  };
  section('Removed fields:', changes.removedFields, false);
  section('Requiredness changes:', changes.requiredness, true);
  section('Other changes:', changes.other, true);

  return lines.join('\n');
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type MutableL1Changes = Mutable<L1Changes>;

interface StructPair {
  readonly base: TypeDefinition;
  readonly head: TypeDefinition;
  readonly positions: string[];
}

/**
 * The differences between a rendered property, attribute or field in the base and in the new database
 */
interface FieldDifferences {
  readonly requiredness?: string;
  readonly type?: string;
}

class ResourceComparison {
  private readonly resourceType: string;
  private readonly pairs = new Map<string, StructPair>();
  private readonly queue = new Array<StructPair>();

  constructor(
    private readonly base: L1View,
    private readonly head: L1View,
    private readonly changes: MutableL1Changes,
  ) {
    this.resourceType = base.resource.cloudFormationType;
  }

  public compare() {
    for (const bag of ['properties', 'attributes'] as const) {
      const kind = bag === 'properties' ? 'property' : 'attribute';
      for (const [name, baseField] of Object.entries(this.base[bag])) {
        const element = `${kind} ${name}`;
        const headField = this.head[bag][name];
        if (!headField) {
          this.report(this.changes.other, element, 'removed');
          continue;
        }
        const differences = this.compareField(element, baseField, headField);
        this.reportDifferences(element, differences);
      }
      this.changes.additions += Object.keys(this.head[bag]).filter((name) => !this.base[bag][name]).length;
    }

    for (const [name, baseStruct] of this.base.structs) {
      const headStruct = this.head.structs.get(name);
      if (headStruct) {
        this.pair(baseStruct, headStruct);
      }
    }

    while (this.queue.length > 0) {
      this.comparePair(this.queue.shift()!);
    }

    const renamed = [...this.pairs.values()].filter((p) => p.base.name !== p.head.name);
    const renamedFrom = new Set(renamed.map((p) => p.base.name));
    for (const name of this.base.structs.keys()) {
      if (!this.head.structs.has(name) && !renamedFrom.has(name)) {
        this.report(this.changes.other, `struct ${name}`, 'no longer rendered');
      }
    }
    this.changes.additions += [...this.head.structs.keys()].filter((name) => !this.base.structs.has(name)).length;
  }

  /**
   * Compare a rendered property, attribute or field, and pair the structs at the same places in its type
   */
  private compareField(position: string, baseField: RenderedField, headField: RenderedField): FieldDifferences {
    const requiredness =
      baseField.required === headField.required
        ? undefined
        : headField.required
        ? 'now required'
        : 'no longer required';
    if (this.pairStructs(position, baseField.type, headField.type)) {
      return { requiredness };
    }
    const baseType = renderType(this.base.db, baseField.type);
    const headType = renderType(this.head.db, headField.type);
    return { requiredness, type: baseType === headType ? undefined : `type changed from ${baseType} to ${headType}` };
  }

  /**
   * Pair the structs of two types that have them at the same place, in the same lists and maps
   *
   * Returns false if the types do not have that shape.
   */
  private pairStructs(position: string, baseType: PropertyType, headType: PropertyType): boolean {
    if ((baseType.type === 'array' || baseType.type === 'map') && headType.type === baseType.type) {
      return this.pairStructs(position, baseType.element, headType.element);
    }
    if (baseType.type === 'ref' && headType.type === 'ref') {
      this.pair(
        this.base.db.get('typeDefinition', baseType.reference),
        this.head.db.get('typeDefinition', headType.reference),
        position,
      );
      return true;
    }
    return false;
  }

  private pair(base: TypeDefinition, head: TypeDefinition, position?: string) {
    const key = `${base.$id} ${head.$id}`;
    let pair = this.pairs.get(key);
    if (!pair) {
      pair = { base, head, positions: [] };
      this.pairs.set(key, pair);
      this.queue.push(pair);
    }
    if (position && !pair.positions.includes(position)) {
      pair.positions.push(position);
    }
  }

  private comparePair(pair: StructPair) {
    const baseFields = this.base.fields(pair.base);
    const headFields = this.head.fields(pair.head);
    const renamed = pair.base.name !== pair.head.name;
    const fieldChanges = new Array<string>();

    for (const [name, baseField] of Object.entries(baseFields)) {
      const element = `field ${pair.head.name}.${name}`;
      const headField = headFields[name];
      if (!headField) {
        if (renamed) {
          fieldChanges.push(`${name} removed`);
        } else {
          this.report(this.changes.removedFields, element, 'removed');
        }
        continue;
      }
      const differences = this.compareField(element, baseField, headField);
      if (renamed) {
        fieldChanges.push(...[differences.requiredness, differences.type].filter(isDefined).map((d) => `${name} ${d}`));
      } else {
        this.reportDifferences(element, differences);
      }
    }
    const added = Object.keys(headFields).filter((name) => !baseFields[name]);
    if (renamed) {
      fieldChanges.push(...added.map((name) => `${name} added`));
      this.changes.renames.push({
        resource: this.resourceType,
        from: pair.base.name,
        to: pair.head.name,
        positions: pair.positions,
        fieldChanges: fieldChanges.sort(),
      });
    } else {
      this.changes.additions += added.length;
    }
  }

  private reportDifferences(element: string, differences: FieldDifferences) {
    if (differences.requiredness) {
      this.report(this.changes.requiredness, element, differences.requiredness);
    }
    if (differences.type) {
      this.report(this.changes.other, element, differences.type);
    }
  }

  private report(list: L1Change[], element: string, description: string) {
    list.push({ resource: this.resourceType, element, description });
  }
}

function unique<A>(xs: A[]): A[] {
  return [...new Set(xs)];
}

function isDefined<A>(x: A | undefined): x is A {
  return x !== undefined;
}
