import {
  Attribute,
  Property,
  PropertyType,
  Resource,
  RichPropertyType,
  RichTypedField,
  SpecDatabase,
  TypeDefinition,
} from '@aws-cdk/service-spec-types';
import { ref } from '@cdklabs/tskb';
import { referencedStructs, renderType } from '../l1-view';
import { PR_PLACEHOLDER, REASON_PLACEHOLDER, TypeMapping, TypeMappingKind } from '../type-mappings';
import { matchShape, sameNameOrSharedField } from '../type-pairing';

/**
 * Why the matcher cannot decide how a released type definition continues
 *
 * - `no-pair`: at a position where CloudFormation changed its type, no current type shares a field with it.
 * - `ambiguous`: at such a position, more than one current type does.
 * - `unsettled-merge`: it was merged into a current type, and its positions need different fields.
 * - `unsettled-split`: it was renamed at a position, and its positions need different fields.
 * - `diverging`: CloudFormation's types at its positions need different fields.
 */
export type UndecidedKind = 'no-pair' | 'ambiguous' | 'unsettled-merge' | 'unsettled-split' | 'diverging';

export interface TypePosition {
  /** Where the L1 renders the released type, for example `property Settings.Destination` */
  readonly position: string;
  /** CloudFormation's type there */
  readonly cloudFormationType: string;
  /** The fields the released type needs there */
  readonly fields: string[];
}

export interface UndecidedCase {
  readonly resource: string;
  readonly kind: UndecidedKind;
  readonly releasedType: string;
  readonly positions: TypePosition[];
  /** One entry per kind that resolves the case, with the reason and pull request link to fill in */
  readonly entries: TypeMapping[];
}

/**
 * A released type definition that CloudFormation renamed, merged or split, and that keeps its name in the L1
 */
export interface SettledChange {
  readonly resource: string;
  readonly kind: 'rename' | 'merge' | 'split';
  readonly releasedType: string;
  readonly newTypes: string[];
  readonly positions: string[];
}

export interface AppliedMapping {
  readonly entry: TypeMapping;
  /** The positions the entry decided */
  readonly positions: string[];
}

export interface InactiveMapping {
  readonly entry: TypeMapping;
  /** Why it applies nowhere */
  readonly reason: string;
}

export interface TypeHistoryResult {
  readonly undecided: UndecidedCase[];
  readonly settled: SettledChange[];
  readonly applied: AppliedMapping[];
  readonly inactive: InactiveMapping[];
}

/**
 * Keep the L1 types of a released database in `db`, which must already hold the current sources
 *
 * Every property, attribute and nested field that both databases have keeps the released type history first, so the
 * L1 renders the released type (always the oldest one):
 *
 * 1. Where CloudFormation's type at a position equals the released newest type there, the position keeps the
 *    released history as is, and the released type definitions it names are kept even if no current source
 *    describes them.
 * 2. Where CloudFormation changed the type since the release, CloudFormation's type is added to the history. A
 *    released type definition that CloudFormation no longer has there is paired with the current type at the same
 *    place in a type of the same shape (also once lists and maps are left out) that has its name, or else shares a
 *    field with it.
 * 3. A kept type definition takes, at each position where the L1 renders it, the fields of CloudFormation's type
 *    there (the struct inside, where CloudFormation put it into lists or maps or took it out) plus its own released
 *    fields that a current type at that position still has; where CloudFormation's type there, inside any lists and
 *    maps, is not a type definition, exactly its released fields. Positions where CloudFormation uses a current
 *    type of the released name and the released L1 does not count too. Where its positions need different fields,
 *    the matcher cannot decide. A field is required if CloudFormation requires it at every position.
 * 4. Released resources, properties, attributes and fields that no current source has are not kept. A kept released
 *    field keeps its released history first, even where no position reaches it.
 *
 * The mapping entries decide what the matcher cannot, see `TypeMappingKind`. Undecided type definitions keep their
 * released fields plus all carried ones, and are returned with the entries that would decide them.
 */
export function importTypeHistory(
  db: SpecDatabase,
  released: SpecDatabase,
  mappings: TypeMapping[],
): TypeHistoryResult {
  const result: TypeHistoryResult = { undecided: [], settled: [], applied: [], inactive: [] };

  for (const releasedResource of released.all('resource')) {
    const current = db.lookup('resource', 'cloudFormationType', 'equals', releasedResource.cloudFormationType);
    if (current.length > 0) {
      const entries = mappings.filter((m) => m.resource === releasedResource.cloudFormationType);
      new ResourceTypeHistory(db, released, releasedResource, current.only(), entries, result).run();
    }
  }
  for (const entry of mappings) {
    const inCurrent = db.lookup('resource', 'cloudFormationType', 'equals', entry.resource).length > 0;
    const inReleased = released.lookup('resource', 'cloudFormationType', 'equals', entry.resource).length > 0;
    if (!inCurrent || !inReleased) {
      result.inactive.push({
        entry,
        reason: `the ${inCurrent ? 'released database does' : 'current sources do'} not have ${entry.resource}`,
      });
    }
  }

  const byType = (a: { resource: string; releasedType: string }, b: { resource: string; releasedType: string }) =>
    a.resource.localeCompare(b.resource) || a.releasedType.localeCompare(b.releasedType);
  result.undecided.sort(byType);
  result.settled.sort(byType);
  result.applied.sort((a, b) => mappings.indexOf(a.entry) - mappings.indexOf(b.entry));
  result.inactive.sort((a, b) => mappings.indexOf(a.entry) - mappings.indexOf(b.entry));
  return result;
}

type Field = Property | Attribute;

/**
 * A field of a current type definition
 */
interface CurrentField {
  readonly typeDef: TypeDefinition;
  readonly name: string;
}

/**
 * A place CloudFormation's newest types reach: a property, an attribute, or a field of a type definition they reach
 */
interface CloudFormationPosition {
  readonly label: string;
  readonly field: Field;
  readonly within?: CurrentField;
}

/**
 * - `same`: CloudFormation's type there has the released name.
 * - `paired`: CloudFormation's type there has another name and is paired with the released type.
 * - `not-a-type`: CloudFormation's type there has another shape, even inside its lists and maps, so it has no type
 *   definition at that place.
 */
type UseStatus = 'same' | 'paired' | 'not-a-type' | 'no-pair' | 'ambiguous';

/**
 * Where the history of a position lives: a resource property or attribute, or a field of a released type definition
 */
interface Owner {
  readonly key: string;
  readonly bag?: 'properties' | 'attributes';
  readonly parent?: TypeDefinition;
  readonly name: string;
}

interface Position {
  readonly label: string;
  /**
   * Undefined for a position that only the current sources have, and for a kept released field that CloudFormation's
   * types do not reach
   */
  readonly owner?: Owner;
  readonly releasedField?: Field;
  /** Undefined for a kept released field that CloudFormation's types do not reach */
  readonly currentField?: Field;
  /** CloudFormation's type here: the newest type of the current sources */
  readonly cfnType?: PropertyType;
  /** Every type definition the current sources give this position */
  readonly currentTypes: TypeDefinition[];
  /** Whether CloudFormation's type equals the released newest type here */
  readonly rule1: boolean;
  /** For a position that only the current sources have: the current type definition and field it is, if a field */
  readonly within?: CurrentField;
  /** The use of the parent type definition this position is a field of */
  readonly parentUse?: Use;
  readonly uses: Use[];
}

/**
 * A released type definition that the L1 renders at a position
 */
interface Use {
  readonly released: TypeDefinition;
  readonly position: Position;
  /** The type definitions at the same place in CloudFormation's type, if it has the same shape */
  readonly candidates: TypeDefinition[];
  readonly status: UseStatus;
  /** CloudFormation's type definition there */
  readonly cfn?: TypeDefinition;
  /** Whether the use is at a kept released field that CloudFormation's types do not reach */
  readonly unreached?: boolean;
}

interface Decision {
  /** The uses where the L1 renders the released type */
  readonly stays: Use[];
  /** The uses whose position renders CloudFormation's type instead */
  readonly follows: Use[];
  /** The fields of the released type in the L1 */
  readonly fields: string[];
  readonly undecided?: UndecidedKind;
  readonly entry?: TypeMapping;
  /** The uses an entry decided */
  readonly matched?: Use[];
}

class ResourceTypeHistory {
  private readonly currentByName: Map<string, TypeDefinition>;
  private readonly releasedByName: Map<string, TypeDefinition>;
  private readonly entries = new Map<string, TypeMapping>();
  private readonly positions = new Array<Position>();
  private readonly uses = new Map<TypeDefinition, Use[]>();
  /** The released type definitions paired with each current type definition (by current id) */
  private readonly pairedWith = new Map<string, Set<string>>();
  /** The type definition in `db` for each kept released type definition (by released id) */
  private readonly targets = new Map<string, TypeDefinition>();
  private decisions = new Map<TypeDefinition, Decision>();
  private active = new Set<Position>();
  /** The current type definitions that the L1 renders, see `renderedCurrentTypes()` */
  private renderedTypes = new Set<TypeDefinition>();

  constructor(
    private readonly db: SpecDatabase,
    private readonly released: SpecDatabase,
    private readonly releasedResource: Resource,
    private readonly resource: Resource,
    entries: TypeMapping[],
    private readonly result: TypeHistoryResult,
  ) {
    this.currentByName = new Map(db.follow('usesType', resource).map(({ entity }) => [entity.name, entity]));
    this.releasedByName = new Map(
      released.follow('usesType', releasedResource).map(({ entity }) => [entity.name, entity]),
    );

    for (const entry of entries) {
      const missing = entry.newTypes.filter((name) => !this.currentByName.has(name));
      if (!this.releasedByName.has(entry.oldType)) {
        this.inactive(entry, `the released database does not have ${entry.oldType}`);
      } else if (missing.length > 0) {
        this.inactive(entry, `the current sources do not have ${missing.join(', ')}`);
      } else {
        this.entries.set(entry.oldType, entry);
      }
    }
  }

  public run() {
    for (const bag of ['properties', 'attributes'] as const) {
      for (const [name, releasedField] of Object.entries(this.releasedResource[bag])) {
        const current = this.resource[bag][name];
        if (current) {
          const label = `${bag === 'properties' ? 'property' : 'attribute'} ${name}`;
          this.visit(label, { key: `${bag} ${name}`, bag, name }, releasedField, current, [current], []);
        }
      }
    }
    this.addCurrentOnlyPositions();
    for (const use of [...this.uses.values()].flat()) {
      if (use.cfn) {
        const paired = this.pairedWith.get(use.cfn.$id) ?? new Set();
        this.pairedWith.set(use.cfn.$id, paired.add(use.released.$id));
      }
    }

    this.decideAll();
    this.report();
    this.apply();
  }

  /**
   * Record a position and the released type definitions the L1 renders there, then the fields they keep
   */
  private visit(
    label: string,
    owner: Owner,
    releasedField: Field,
    currentField: Field,
    currentFields: Field[],
    ancestry: string[],
    parentUse?: Use,
  ) {
    const releasedTypes = new RichTypedField(releasedField).types();
    const cfnType = last(new RichTypedField(currentField).types());
    const position: Position = {
      label,
      owner,
      releasedField,
      currentField,
      cfnType,
      currentTypes: unique(
        currentFields.flatMap((f) => new RichTypedField(f).types()).flatMap((t) => referencedStructs(this.db, t)),
      ),
      rule1: renderType(this.released, last(releasedTypes)) === renderType(this.db, cfnType),
      parentUse,
      uses: [],
    };
    this.positions.push(position);

    const rendered = releasedTypes[0];
    // Where CloudFormation put the type into a list or map, or took it out, the structs inside pair and are compared
    // as at any other position, while the L1 keeps rendering the released type
    const pairs =
      matchShape(this.released, rendered, this.db, cfnType, () => true) ??
      matchShape(this.released, insideContainers(rendered), this.db, insideContainers(cfnType), () => true);
    for (const releasedType of unique(referencedStructs(this.released, rendered))) {
      const candidates = unique((pairs ?? []).filter(([r]) => r === releasedType).map(([, c]) => c));
      const use: Use = {
        released: releasedType,
        position,
        candidates,
        ...this.classify(releasedType, position, candidates, pairs !== undefined),
      };
      position.uses.push(use);
      this.uses.set(releasedType, [...(this.uses.get(releasedType) ?? []), use]);

      // Recursive types stop where they repeat
      if (ancestry.includes(releasedType.$id)) {
        continue;
      }
      if (!use.cfn) {
        this.visitUnreached(label, releasedType, [...ancestry, releasedType.$id], use);
        continue;
      }
      for (const name of this.need(use)) {
        const releasedNested = releasedType.properties[name];
        const currentNested = position.currentTypes.flatMap((t) => (t.properties[name] ? [t.properties[name]] : []));
        const cfnNested = use.cfn.properties[name] ?? currentNested[0];
        if (releasedNested && cfnNested) {
          const nestedOwner = { key: `${releasedType.$id} ${name}`, parent: releasedType, name };
          const nestedAncestry = [...ancestry, releasedType.$id];
          this.visit(`${label}.${name}`, nestedOwner, releasedNested, cfnNested, currentNested, nestedAncestry, use);
        }
      }
    }
  }

  /**
   * Record the released type definitions at the fields of a kept released type that CloudFormation's types do not
   * reach, because CloudFormation's type at its position has another shape or no pair
   *
   * They keep exactly their released fields there, and are compared like any other use, so a current type of their
   * name that CloudFormation uses elsewhere with other fields leaves them undecided.
   */
  private visitUnreached(label: string, releasedType: TypeDefinition, ancestry: string[], parentUse: Use) {
    for (const [name, field] of Object.entries(releasedType.properties)) {
      const position: Position = { label: `${label}.${name}`, currentTypes: [], rule1: true, parentUse, uses: [] };
      for (const nested of unique(referencedStructs(this.released, new RichTypedField(field).types()[0]))) {
        const use: Use = { released: nested, position, candidates: [], status: 'not-a-type', unreached: true };
        position.uses.push(use);
        this.uses.set(nested, [...(this.uses.get(nested) ?? []), use]);
        if (!ancestry.includes(nested.$id)) {
          this.visitUnreached(position.label, nested, [...ancestry, nested.$id], use);
        }
      }
      if (position.uses.length > 0) {
        this.positions.push(position);
      }
    }
  }

  /**
   * Add the positions where CloudFormation uses a current type definition of a released name and the released L1
   * does not, so that rule 3 compares them too: the kept type definition is that current one
   */
  private addCurrentOnlyPositions() {
    const visited = new Set(this.positions.map((p) => p.currentField).filter(isDefined));
    const cloudFormationPositions = this.cloudFormationPositions();
    for (const [releasedType, uses] of this.uses) {
      const current = this.currentByName.get(releasedType.name);
      for (const { label, field, within } of (current && cloudFormationPositions.get(current)) || []) {
        if (visited.has(field)) {
          continue;
        }
        const cfnType = last(new RichTypedField(field).types());
        const position: Position = {
          label,
          currentField: field,
          cfnType,
          currentTypes: [current!],
          rule1: true,
          within,
          uses: [],
        };
        const use: Use = { released: releasedType, position, candidates: [current!], status: 'same', cfn: current };
        position.uses.push(use);
        uses.push(use);
        this.positions.push(position);
      }
    }
  }

  /**
   * Where CloudFormation's types refer to each current type definition: the newest types of the properties and
   * attributes, and of the fields of the type definitions those reach
   */
  private cloudFormationPositions(): Map<TypeDefinition, CloudFormationPosition[]> {
    const positions = new Map<TypeDefinition, CloudFormationPosition[]>();
    const queue = new Array<CloudFormationPosition>();
    for (const bag of ['properties', 'attributes'] as const) {
      for (const [name, field] of Object.entries(this.resource[bag])) {
        queue.push({ label: `${bag === 'properties' ? 'property' : 'attribute'} ${name}`, field });
      }
    }
    while (queue.length > 0) {
      const position = queue.shift()!;
      for (const typeDef of unique(referencedStructs(this.db, last(new RichTypedField(position.field).types())))) {
        if (!positions.has(typeDef)) {
          positions.set(typeDef, []);
          for (const [name, nested] of Object.entries(typeDef.properties)) {
            queue.push({ label: `${position.label}.${name}`, field: nested, within: { typeDef, name } });
          }
        }
        positions.get(typeDef)!.push(position);
      }
    }
    return positions;
  }

  /**
   * Whether the L1 renders a position: a field of a current type definition is rendered only if the L1 renders that
   * type definition and keeps the field
   */
  private rendered(position: Position, renderedTypes: Set<TypeDefinition>) {
    if (!position.within) {
      return true;
    }
    const { typeDef, name } = position.within;
    return renderedTypes.has(typeDef) && this.keepsField(typeDef, name);
  }

  /**
   * The current type definitions that CloudFormation's types reach through the properties, attributes and fields the
   * L1 renders, so a struct below a field the L1 leaves out, at any depth, is not among them
   */
  private renderedCurrentTypes(): Set<TypeDefinition> {
    const rendered = new Set<TypeDefinition>();
    const queue = [...Object.values(this.resource.properties), ...Object.values(this.resource.attributes)];
    while (queue.length > 0) {
      const field = queue.shift()!;
      for (const typeDef of referencedStructs(this.db, last(new RichTypedField(field).types()))) {
        if (!rendered.has(typeDef)) {
          rendered.add(typeDef);
          for (const [name, nested] of Object.entries(typeDef.properties)) {
            if (this.keepsField(typeDef, name)) {
              queue.push(nested);
            }
          }
        }
      }
    }
    return rendered;
  }

  /**
   * Whether the L1 renders a field of a current type definition of the resource: not if it keeps a released type
   * definition of its name that leaves the field out
   */
  private keepsField(typeDef: TypeDefinition, name: string) {
    const released = this.releasedByName.get(typeDef.name);
    const decision = released && this.decisions.get(released);
    return !decision || decision.stays.length === 0 || decision.fields.includes(name);
  }

  private classify(
    releasedType: TypeDefinition,
    position: Position,
    candidates: TypeDefinition[],
    sameShape: boolean,
  ): { status: UseStatus; cfn?: TypeDefinition } {
    if (!sameShape) {
      return { status: 'not-a-type' };
    }
    const entry = this.entries.get(releasedType.name);
    if (entry && (entry.kind === 'rename' || entry.kind === 'merge')) {
      const named = candidates.find((c) => c.name === entry.newTypes[0]);
      if (named) {
        return { status: 'paired', cfn: named };
      }
    }
    const sameName = candidates.find((c) => c.name === releasedType.name);
    if (sameName) {
      return { status: 'same', cfn: sameName };
    }
    const sharing = candidates.filter((c) => sameNameOrSharedField(releasedType, c));
    if (sharing.length === 1) {
      return { status: 'paired', cfn: sharing[0] };
    }
    // Where CloudFormation did not change the type, its type is the one the released type was released with
    if (position.rule1 && candidates.length === 1) {
      return { status: 'paired', cfn: candidates[0] };
    }
    return { status: sharing.length === 0 ? 'no-pair' : 'ambiguous' };
  }

  /**
   * The fields a released type definition needs at one of its positions (rule 3)
   */
  private need(use: Use): string[] {
    const releasedFields = Object.keys(use.released.properties);
    // CloudFormation's type there, inside any lists and maps, is not a type definition
    if (!use.cfn) {
      return releasedFields;
    }
    const stillThere = releasedFields.filter((name) => use.position.currentTypes.some((t) => t.properties[name]));
    return unique([...Object.keys(use.cfn.properties), ...stillThere]);
  }

  /**
   * Decide every released type definition, until no decision drops a position another decision depends on
   *
   * A position whose parent type definition the L1 no longer renders there does not count, and neither does a
   * position that only the current sources have at or below a field a kept type definition leaves out.
   */
  private decideAll() {
    this.active = new Set(this.positions);
    for (let i = 0; i <= this.positions.length; i++) {
      this.decisions = new Map();
      for (const [releasedType, uses] of this.uses) {
        const activeUses = uses.filter((u) => this.active.has(u.position));
        if (activeUses.length > 0) {
          this.decisions.set(releasedType, this.decide(releasedType, activeUses));
        }
      }
      this.renderedTypes = this.renderedCurrentTypes();
      const next = new Set(
        [...this.active].filter(
          (p) =>
            (!p.parentUse || (this.active.has(p.parentUse.position) && this.stays(p.parentUse))) &&
            this.rendered(p, this.renderedTypes),
        ),
      );
      if (next.size === this.active.size) {
        return;
      }
      this.active = next;
    }
  }

  private decide(releasedType: TypeDefinition, uses: Use[]): Decision {
    const entry = this.entries.get(releasedType.name);
    if (entry) {
      const decision = this.applyEntry(releasedType, uses, entry);
      if (decision) {
        return decision;
      }
    }

    const needs = uses.map((u) => this.need(u));
    const keepAll = unique([...Object.keys(releasedType.properties), ...needs.flat()]);
    const unpaired = uses.find((u) => u.status === 'no-pair' || u.status === 'ambiguous');
    if (unpaired) {
      return { stays: uses, follows: [], fields: keepAll, undecided: unpaired.status as UndecidedKind };
    }
    if (needs.every((n) => sameSet(n, needs[0]))) {
      return { stays: uses, follows: [], fields: needs[0] };
    }
    const renamed = uses.filter((u) => this.renamedAt(u));
    const merged = renamed.some((u) => this.isMergeTarget(u.cfn!));
    const kind = merged ? 'unsettled-merge' : renamed.length > 0 ? 'unsettled-split' : 'diverging';
    return { stays: uses, follows: [], fields: keepAll, undecided: kind };
  }

  /**
   * The decision of a mapping entry, or undefined if it decides none of the positions
   */
  private applyEntry(releasedType: TypeDefinition, uses: Use[], entry: TypeMapping): Decision | undefined {
    const standsAt = (u: Use) => [u.cfn, ...u.candidates].some((t) => t && entry.newTypes.includes(t.name));
    const fieldsAt = (at: Use[]) => unique(at.flatMap((u) => this.need(u)));

    switch (entry.kind) {
      case 'rename':
      case 'merge': {
        const matched = uses.filter((u) => u.cfn?.name === entry.newTypes[0]);
        return matched.length > 0 ? { stays: uses, follows: [], fields: fieldsAt(matched), entry, matched } : undefined;
      }
      case 'split': {
        const matched = uses.filter(standsAt);
        const base = uses.filter((u) => !matched.includes(u));
        const baseFields = base.length > 0 ? fieldsAt(base) : undefined;
        const follows = matched.filter((u) => !baseFields || !sameSet(this.need(u), baseFields));
        const stays = uses.filter((u) => !follows.includes(u));
        return matched.length > 0
          ? { stays, follows, fields: baseFields ?? fieldsAt(stays), entry, matched }
          : undefined;
      }
      case 'replace': {
        const matched = uses.filter(standsAt);
        const stays = uses.filter((u) => !matched.includes(u));
        return matched.length > 0 ? { stays, follows: matched, fields: fieldsAt(stays), entry, matched } : undefined;
      }
      case 'keep-old': {
        const carried = uses.flatMap((u) =>
          u.cfn
            ? this.need(u)
            : u.candidates.filter((t) => entry.newTypes.includes(t.name)).flatMap((t) => Object.keys(t.properties)),
        );
        const fields = unique([...Object.keys(releasedType.properties), ...carried]);
        return { stays: uses, follows: [], fields, entry, matched: uses };
      }
      case 'follow-cloudformation':
        return { stays: [], follows: uses, fields: [], entry, matched: uses };
    }
  }

  private renamedAt(use: Use) {
    return use.status === 'paired' && !use.position.rule1;
  }

  private isMergeTarget(current: TypeDefinition) {
    return (this.pairedWith.get(current.$id)?.size ?? 0) > 1;
  }

  private stays(use: Use) {
    return !!this.decisions.get(use.released)?.stays.includes(use);
  }

  private follows(use: Use) {
    return !!this.decisions.get(use.released)?.follows.includes(use);
  }

  private report() {
    const resource = this.resource.cloudFormationType;
    for (const [releasedType, decision] of this.decisions) {
      if (decision.entry) {
        const positions = unique(decision.matched!.map((u) => u.position.label)).sort();
        this.result.applied.push({ entry: decision.entry, positions });
      } else if (decision.undecided) {
        this.result.undecided.push({
          resource,
          kind: decision.undecided,
          releasedType: releasedType.name,
          positions: this.typePositions(decision.stays),
          entries: this.proposals(releasedType, decision.stays, decision.undecided),
        });
      } else {
        const renamed = decision.stays.filter((u) => this.renamedAt(u));
        if (renamed.length > 0) {
          const newTypes = unique(renamed.map((u) => u.cfn!.name)).sort();
          const kind = newTypes.length > 1 ? 'split' : this.isMergeTarget(renamed[0].cfn!) ? 'merge' : 'rename';
          const positions = unique(renamed.map((u) => u.position.label)).sort();
          this.result.settled.push({ resource, kind, releasedType: releasedType.name, newTypes, positions });
        }
      }
    }
    for (const entry of this.entries.values()) {
      if (!this.result.applied.some((a) => a.entry === entry)) {
        const released = this.releasedByName.get(entry.oldType)!;
        this.inactive(
          entry,
          this.decisions.has(released)
            ? `${entry.newTypes.join(', ')} stands at none of the positions of ${entry.oldType}`
            : `the L1 renders ${entry.oldType} at no position that the current sources have`,
        );
      }
    }
  }

  private typePositions(uses: Use[]): TypePosition[] {
    const positions = new Map<string, TypePosition>();
    for (const use of uses) {
      const cloudFormationType =
        use.cfn?.name ??
        (use.candidates.length > 0
          ? use.candidates
              .map((c) => c.name)
              .sort()
              .join(' | ')
          : use.position.cfnType
          ? renderType(this.db, use.position.cfnType)
          : 'no type');
      positions.set(use.position.label, {
        position: use.position.label,
        cloudFormationType,
        fields: [...this.need(use)].sort(),
      });
    }
    return [...positions.values()].sort((a, b) => a.position.localeCompare(b.position));
  }

  private proposals(releasedType: TypeDefinition, uses: Use[], kind: UndecidedKind): TypeMapping[] {
    const entry = (k: TypeMappingKind, newTypes: string[]): TypeMapping => ({
      resource: this.resource.cloudFormationType,
      oldType: releasedType.name,
      newTypes,
      kind: k,
      reason: REASON_PLACEHOLDER,
      pr: PR_PLACEHOLDER,
    });
    const others = unique(uses.flatMap((u) => (u.cfn ? [u.cfn] : u.candidates)).map((t) => t.name))
      .filter((name) => name !== releasedType.name)
      .sort();
    const split = others.length > 0 ? [entry('split', others)] : [];
    const keepOrFollow = [entry('keep-old', others), entry('follow-cloudformation', others)];

    switch (kind) {
      case 'no-pair':
        return [
          ...others.map((n) => entry('rename', [n])),
          ...others.map((n) => entry('replace', [n])),
          ...keepOrFollow,
        ];
      case 'ambiguous':
        return [...others.map((n) => entry('rename', [n])), ...keepOrFollow];
      case 'unsettled-merge': {
        const targets = uses.filter((u) => this.renamedAt(u) && this.isMergeTarget(u.cfn!)).map((u) => u.cfn!.name);
        return [
          ...unique(targets)
            .sort()
            .map((n) => entry('merge', [n])),
          ...split,
          ...keepOrFollow,
        ];
      }
      default:
        return [...split, ...keepOrFollow];
    }
  }

  private apply() {
    // Plan from the current sources before any of their type definitions change
    const plans = new Map<TypeDefinition, Array<{ name: string; required: boolean; source?: Field }>>();
    for (const [releasedType, decision] of this.decisions) {
      if (decision.stays.length === 0) {
        continue;
      }
      const target = this.target(releasedType);
      // The current type definition of the released name types the fields only where the L1 renders it; elsewhere
      // CloudFormation's types at the positions do
      const ownFields = this.renderedTypes.has(target);
      plans.set(
        releasedType,
        decision.fields.map((name) => {
          const atPositions = decision.stays.map((u) => this.fieldAt(u, name));
          // CloudFormation says nothing about a field its types do not reach, so the release decides there
          const releasedRequired = !!releasedType.properties[name]?.required;
          return {
            name,
            required: decision.stays.every((u, i) => (u.unreached ? releasedRequired : atPositions[i]?.required)),
            source: (ownFields ? target.properties[name] : undefined) ?? atPositions.find(isDefined),
          };
        }),
      );
    }

    for (const [releasedType, plan] of plans) {
      const target = this.target(releasedType);
      for (const [name, field] of Object.entries(target.properties)) {
        const planned = plan.find((p) => p.name === name);
        // A field the released type does not have is CloudFormation's field at its positions
        if (!planned || (!releasedType.properties[name] && planned.source && planned.source !== field)) {
          delete target.properties[name];
        }
      }
      for (const { name, required, source } of plan) {
        if (!target.properties[name]) {
          const releasedField = releasedType.properties[name];
          const field = releasedField ? this.keptReleasedField(releasedField, source) : structuredClone(source!);
          if (!field) {
            continue;
          }
          target.properties[name] = field;
        }
        setRequired(target.properties[name], required);
      }
      if (releasedType.mustRenderForBwCompat) {
        target.mustRenderForBwCompat = true;
      }
    }

    const byOwner = new Map<string, Position[]>();
    for (const position of this.positions.filter((p) => p.owner && this.active.has(p))) {
      byOwner.set(position.owner!.key, [...(byOwner.get(position.owner!.key) ?? []), position]);
    }
    for (const positions of byOwner.values()) {
      const { owner } = positions[0];
      const field = owner!.bag
        ? this.resource[owner!.bag][owner!.name]
        : this.targets.get(owner!.parent!.$id)?.properties[owner!.name];
      if (field) {
        // Only visit() gives positions an owner, always with CloudFormation's field and type
        const reached = positions.map((p) => ({ ...p, currentField: p.currentField!, cfnType: p.cfnType! }));
        this.updateHistory(field, positions[0].releasedField!, reached);
      }
    }
    // A kept released field that no position reached, for example below a position whose CloudFormation type has
    // another shape, keeps its released history too
    for (const [releasedType, plan] of plans) {
      const target = this.target(releasedType);
      for (const { name } of plan) {
        const releasedField = releasedType.properties[name];
        const field = target.properties[name];
        // A field left out above, because nothing could give it a type, has no history to keep
        if (field && releasedField && !byOwner.has(`${releasedType.$id} ${name}`)) {
          const cfnType = last(new RichTypedField(field).types());
          const rule1 =
            renderType(this.released, last(new RichTypedField(releasedField).types())) === renderType(this.db, cfnType);
          this.updateHistory(field, releasedField, [{ currentField: field, cfnType, rule1, uses: [] }]);
        }
      }
    }

    for (const { entity } of this.released.follow('usesType', this.releasedResource)) {
      if (entity.mustRenderForBwCompat && !this.decisions.has(entity)) {
        const target = this.typeFor(entity);
        if (target) {
          target.mustRenderForBwCompat = true;
        }
      }
    }
  }

  /**
   * Put the released history first at the positions of one property, attribute or field (rules 1 and 2)
   *
   * The field is updated in place, because a nested read-only field is the same object as its attribute, and keeps
   * all its other details.
   */
  private updateHistory(
    field: Field,
    releasedField: Field,
    positions: Array<{ currentField: Field; cfnType: PropertyType; rule1: boolean; uses: Use[] }>,
  ) {
    const following = positions.find((p) => p.uses.some((u) => this.follows(u)));
    if (following) {
      setTypeHistory(field, [following.cfnType]);
      return;
    }

    const history = this.translateHistory(releasedField);
    if (history.length === 0) {
      return;
    }
    const rich = new RichTypedField({ type: last(history), previousTypes: history.slice(0, -1) });
    for (const position of positions.filter((p) => !p.rule1)) {
      rich.updateType(position.cfnType);
    }
    // A type that both have keeps the details of the current one, like its allowed values
    const currentTypes = positions.flatMap((p) => new RichTypedField(p.currentField).types());
    setTypeHistory(
      field,
      rich.types().map((t) => currentTypes.find((c) => new RichPropertyType(c).equals(t)) ?? t),
    );
  }

  /**
   * The field of CloudFormation's type at a use, or else of another current type at its position
   */
  private fieldAt(use: Use, name: string): Property | undefined {
    return use.cfn?.properties[name] ?? use.position.currentTypes.find((t) => t.properties[name])?.properties[name];
  }

  /**
   * A released field for a kept type definition, or undefined if neither its released types nor a current field can
   * give it a type
   */
  private keptReleasedField(releasedField: Field, current?: Field): Property | undefined {
    const field = structuredClone(releasedField);
    const history = this.translateHistory(releasedField);
    if (history.length === 0 && !current) {
      return undefined;
    }
    setTypeHistory(field, history.length > 0 ? history : new RichTypedField(current!).types());
    return field;
  }

  private translateHistory(field: Field): PropertyType[] {
    return new RichTypedField(field)
      .types()
      .map((t) => this.translate(t))
      .filter(isDefined);
  }

  /**
   * Translate a released type into the same type in `db`, or undefined if it refers to a type definition that is
   * not kept
   */
  private translate(type: PropertyType): PropertyType | undefined {
    switch (type.type) {
      case 'array':
      case 'map': {
        const element = this.translate(type.element);
        return element ? { ...type, element } : undefined;
      }
      case 'union': {
        const types = type.types.map((t) => this.translate(t));
        return types.every(isDefined) ? { type: 'union', types } : undefined;
      }
      case 'ref': {
        const target = this.typeFor(this.released.get('typeDefinition', type.reference));
        return target ? { type: 'ref', reference: ref(target) } : undefined;
      }
      default:
        return structuredClone(type);
    }
  }

  /**
   * The type definition in `db` for a released one, or undefined if the L1 no longer renders it
   *
   * A released type definition that follows CloudFormation at all its positions is CloudFormation's type of its name,
   * if there is one. A released type definition that is not rendered at a position the current sources have, like a
   * later type of a property's history, is kept as the current type of its name, or else as released.
   */
  private typeFor(releasedType: TypeDefinition): TypeDefinition | undefined {
    const existing = this.targets.get(releasedType.$id);
    if (existing) {
      return existing;
    }
    const decision = this.decisions.get(releasedType);
    if (decision) {
      return decision.stays.length > 0 ? this.target(releasedType) : this.currentByName.get(releasedType.name);
    }
    const sameName = this.currentByName.get(releasedType.name);
    if (sameName) {
      this.targets.set(releasedType.$id, sameName);
      return sameName;
    }
    const created = this.target(releasedType);
    for (const [name, field] of Object.entries(releasedType.properties)) {
      const history = this.translateHistory(field);
      if (history.length > 0) {
        const kept = structuredClone(field);
        setTypeHistory(kept, history);
        created.properties[name] = kept;
      }
    }
    return created;
  }

  /**
   * The type definition that keeps a released one: the current one of its name, or a new one
   */
  private target(releasedType: TypeDefinition): TypeDefinition {
    let target = this.targets.get(releasedType.$id);
    if (!target) {
      target =
        this.currentByName.get(releasedType.name) ??
        this.db.allocate('typeDefinition', {
          name: releasedType.name,
          documentation: releasedType.documentation,
          properties: {},
        });
      if (!this.currentByName.has(releasedType.name)) {
        this.db.link('usesType', this.resource, target);
      }
      this.targets.set(releasedType.$id, target);
    }
    return target;
  }

  private inactive(entry: TypeMapping, reason: string) {
    this.result.inactive.push({ entry, reason });
  }
}

function setTypeHistory(field: Field, types: PropertyType[]) {
  field.type = types[types.length - 1];
  if (types.length > 1) {
    field.previousTypes = types.slice(0, -1);
  } else {
    delete field.previousTypes;
  }
}

function setRequired(field: Field, required: boolean) {
  if (required) {
    (field as Property).required = true;
  } else {
    delete (field as Property).required;
  }
}

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function unique<A>(xs: A[]): A[] {
  return [...new Set(xs)];
}

/**
 * The type inside any lists and maps
 */
function insideContainers(type: PropertyType): PropertyType {
  return type.type === 'array' || type.type === 'map' ? insideContainers(type.element) : type;
}

function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}

function isDefined<A>(x: A | undefined): x is A {
  return x !== undefined;
}
