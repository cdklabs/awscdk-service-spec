import { PropertyType, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec-types';
import { fieldLabel, GENERATED_PACKAGES, L1View, RenderedField, renderType } from './l1-view';

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
  /**
   * Where the L1 uses the struct, as the path from a resource property or attribute, for example
   * `property Destinations` or `property Settings.Filter`, or as `field Struct.Field` below a struct the L1 renders only
   * as a struct of its own
   */
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
  /**
   * Resources, properties, attributes and structs the L1 no longer renders, and fields that a struct no longer has
   * where the struct keeps its name
   */
  readonly removed: L1Change[];
  /** Properties and fields that became required or optional */
  readonly requiredness: L1Change[];
  /** Changed types */
  readonly other: L1Change[];
  /** Fields that a struct has where it keeps its name */
  readonly addedFields: L1Change[];
  /** The number of added resources, properties, attributes, structs and fields */
  readonly additions: number;
}

/**
 * Compare what CDK renders as L1 code from a base database with what it renders from a new database
 *
 * Structs are compared by position: two different structs at the same property or field, in the same lists and
 * maps, are a struct rename (or a merge, when several structs become the same one).
 *
 * Each generated package (`GENERATED_PACKAGES`) is compared on its own, and a change is listed if it is a change in
 * either package, once: a struct that only cfn-property-mixins renders counts, and one that no package renders does
 * not. The mixins leave out the structs flagged for backwards compatibility and every requiredness, and add the
 * structs of the oldest type of a modern tag property (see `renderedPropertyTypes()`).
 */
export function compareL1(base: SpecDatabase, head: SpecDatabase): L1Changes {
  const changes: MutableL1Changes = {
    renames: [],
    removed: [],
    requiredness: [],
    other: [],
    addedFields: [],
    additions: 0,
  };

  for (const baseResource of base.all('resource')) {
    const found = head.lookup('resource', 'cloudFormationType', 'equals', baseResource.cloudFormationType);
    if (found.length === 0) {
      changes.removed.push({ resource: baseResource.cloudFormationType, element: 'resource', description: 'removed' });
      continue;
    }
    const perPackage = GENERATED_PACKAGES.map((pkg) =>
      new ResourceComparison(new L1View(base, baseResource, pkg), new L1View(head, found.only(), pkg)).compare(),
    );
    addResourceChanges(changes, perPackage);
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
  changes.removed.sort(byElement);
  changes.requiredness.sort(byElement);
  changes.other.sort(byElement);
  changes.addedFields.sort(byElement);
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
      `${changes.removed.length} removed,`,
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
  section('Removed:', changes.removed, false);
  section('Requiredness changes:', changes.requiredness, true);
  section('Other changes:', changes.other, true);
  section('Added fields:', changes.addedFields, false);

  return lines.join('\n');
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type MutableL1Changes = Mutable<L1Changes>;

/**
 * The changes of one resource in one generated package, with each added element by a key instead of a count
 */
interface ResourceChanges extends Omit<L1Changes, 'additions'> {
  readonly added: Set<string>;
}

const LISTED_CHANGES = ['removed', 'requiredness', 'other', 'addedFields'] as const;

/**
 * Add one resource's changes in each generated package to `changes`, listing a change that an earlier package has
 * only once
 */
function addResourceChanges(changes: MutableL1Changes, perPackage: ResourceChanges[]) {
  const renames = new Array<L1StructRename>();
  const listed: Record<(typeof LISTED_CHANGES)[number], L1Change[]> = {
    removed: [],
    requiredness: [],
    other: [],
    addedFields: [],
  };
  const added = new Set<string>();
  for (const resourceChanges of perPackage) {
    const earlierRenames = [...renames];
    for (const rename of resourceChanges.renames) {
      const same = earlierRenames.find((r) => r.from === rename.from && r.to === rename.to);
      if (same) {
        same.positions.push(...rename.positions.filter((p) => !same.positions.includes(p)));
        same.fieldChanges.push(...rename.fieldChanges.filter((c) => !same.fieldChanges.includes(c)));
        same.fieldChanges.sort();
      } else {
        renames.push(rename);
      }
    }
    for (const kind of LISTED_CHANGES) {
      const earlier = [...listed[kind]];
      listed[kind].push(
        ...resourceChanges[kind].filter(
          (c) => !earlier.some((e) => e.element === c.element && e.description === c.description),
        ),
      );
    }
    resourceChanges.added.forEach((key) => added.add(key));
  }
  changes.renames.push(...renames);
  for (const kind of LISTED_CHANGES) {
    changes[kind].push(...listed[kind]);
  }
  changes.additions += added.size;
}

interface StructPair {
  /** The key of the pair in `ResourceComparison.pairs` and its links */
  readonly key: string;
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

/**
 * A field of a pair of structs where another pair of structs is: `key` is that other pair
 */
interface PairLink {
  readonly name: string;
  readonly key: string;
}

class ResourceComparison {
  private readonly resourceType: string;
  private readonly pairs = new Map<string, StructPair>();
  private readonly queue = new Array<StructPair>();
  /** The pairs at each resource property and attribute */
  private readonly roots = new Array<{ readonly label: string; readonly key: string }>();
  /** The pairs at the fields of each pair */
  private readonly links = new Map<string, PairLink[]>();
  private readonly changes: ResourceChanges = {
    renames: [],
    removed: [],
    requiredness: [],
    other: [],
    addedFields: [],
    added: new Set(),
  };

  constructor(private readonly base: L1View, private readonly head: L1View) {
    this.resourceType = base.resource.cloudFormationType;
  }

  public compare(): ResourceChanges {
    for (const bag of ['properties', 'attributes'] as const) {
      for (const [name, baseField] of Object.entries(this.base[bag])) {
        const element = fieldLabel(bag, name);
        const headField = this.head[bag][name];
        if (!headField) {
          this.report(this.changes.removed, element, 'removed');
          continue;
        }
        const differences = this.compareField(element, baseField, headField, (key) =>
          this.roots.push({ label: element, key }),
        );
        this.reportDifferences(element, differences);
      }
      for (const name of Object.keys(this.head[bag]).filter((n) => !this.base[bag][n])) {
        this.changes.added.add(fieldLabel(bag, name));
      }
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
    this.placeRenames();

    const renamed = [...this.pairs.values()].filter((p) => p.base.name !== p.head.name);
    const renamedFrom = new Set(renamed.map((p) => p.base.name));
    for (const name of this.base.structs.keys()) {
      if (!this.head.structs.has(name) && !renamedFrom.has(name)) {
        this.report(this.changes.removed, `struct ${name}`, 'no longer rendered');
      }
    }
    for (const name of [...this.head.structs.keys()].filter((n) => !this.base.structs.has(n))) {
      this.changes.added.add(`struct ${name}`);
    }
    return this.changes;
  }

  /**
   * Name each renamed struct's positions as the type history gate does: the path from a resource property or
   * attribute, for example `property Checks.C`, at every path the L1 renders it
   *
   * A struct the L1 renders only as a struct of its own, not at any such path (for example a later type of a
   * property's history), keeps its positions as `field Struct.Field`.
   */
  private placeRenames() {
    const renamed = new Set([...this.pairs].filter(([, p]) => p.base.name !== p.head.name).map(([key]) => key));
    // Walk only into pairs from which a rename can be reached, so paths are only spelled out where they are printed
    const leadsToRename = new Set(renamed);
    let grown = true;
    while (grown) {
      grown = false;
      for (const [key, links] of this.links) {
        if (!leadsToRename.has(key) && links.some((l) => leadsToRename.has(l.key))) {
          leadsToRename.add(key);
          grown = true;
        }
      }
    }

    const paths = new Map<string, string[]>();
    const walk = (label: string, key: string, ancestry: string[]) => {
      if (!leadsToRename.has(key)) {
        return;
      }
      if (renamed.has(key)) {
        paths.set(key, [...(paths.get(key) ?? []), label]);
      }
      // Recursive structs stop where they repeat
      if (ancestry.includes(key)) {
        return;
      }
      for (const link of this.links.get(key) ?? []) {
        walk(`${label}.${link.name}`, link.key, [...ancestry, key]);
      }
    };
    for (const root of this.roots) {
      walk(root.label, root.key, []);
    }

    const reachable = new Set<string>();
    const queue = this.roots.map((r) => r.key);
    while (queue.length > 0) {
      const key = queue.shift()!;
      if (!reachable.has(key)) {
        reachable.add(key);
        queue.push(...(this.links.get(key) ?? []).map((l) => l.key));
      }
    }
    for (const key of renamed) {
      const pair = this.pairs.get(key)!;
      const unplaced = [...this.links]
        .filter(([parent]) => !reachable.has(parent))
        .flatMap(([parent, links]) =>
          links.filter((l) => l.key === key).map((l) => `field ${this.pairs.get(parent)!.head.name}.${l.name}`),
        );
      pair.positions.splice(0, pair.positions.length, ...unique([...(paths.get(key) ?? []), ...unplaced]));
    }
  }

  /**
   * Compare a rendered property, attribute or field, and pair the structs at the same places in its type, passing
   * each pair's key to `link`
   */
  private compareField(
    position: string,
    baseField: RenderedField,
    headField: RenderedField,
    link: (key: string) => void,
  ): FieldDifferences {
    const requiredness =
      baseField.required === headField.required
        ? undefined
        : headField.required
        ? 'now required'
        : 'no longer required';
    if (this.pairStructs(position, baseField.type, headField.type, link)) {
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
  private pairStructs(
    position: string,
    baseType: PropertyType,
    headType: PropertyType,
    link: (key: string) => void,
  ): boolean {
    if ((baseType.type === 'array' || baseType.type === 'map') && headType.type === baseType.type) {
      return this.pairStructs(position, baseType.element, headType.element, link);
    }
    if (baseType.type === 'ref' && headType.type === 'ref') {
      link(
        this.pair(
          this.base.db.get('typeDefinition', baseType.reference),
          this.head.db.get('typeDefinition', headType.reference),
          position,
        ),
      );
      return true;
    }
    return false;
  }

  private pair(base: TypeDefinition, head: TypeDefinition, position?: string): string {
    const key = `${base.$id} ${head.$id}`;
    let pair = this.pairs.get(key);
    if (!pair) {
      pair = { key, base, head, positions: [] };
      this.pairs.set(key, pair);
      this.queue.push(pair);
    }
    if (position && !pair.positions.includes(position)) {
      pair.positions.push(position);
    }
    return key;
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
          this.report(this.changes.removed, element, 'removed');
        }
        continue;
      }
      const differences = this.compareField(element, baseField, headField, (key) =>
        pushTo(this.links, pair.key, { name, key }),
      );
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
      for (const name of added) {
        this.changes.added.add(`field ${pair.key} ${name}`);
        this.report(this.changes.addedFields, `field ${pair.head.name}.${name}`, 'added');
      }
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

function pushTo<K, V>(map: Map<K, V[]>, key: K, ...values: V[]) {
  map.set(key, [...(map.get(key) ?? []), ...values]);
}

function isDefined<A>(x: A | undefined): x is A {
  return x !== undefined;
}
