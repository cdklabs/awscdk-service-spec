import { PropertyType, Resource, RichTypedField, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec-types';
import { applyTypeHistory } from './type-history-apply';
import {
  cloudFormationTypes,
  CloudFormationPosition,
  constrainingUses,
  CurrentOnlyPosition,
  DecidedRound,
  Decision,
  Field,
  fieldKey,
  followsIn,
  hasNewField,
  insideContainers,
  isDefined,
  isUnpaired,
  keepsMixinsFields,
  need,
  ownerKey,
  Owner,
  Position,
  pushTo,
  releasedAnd,
  reportInactive,
  Round,
  sameRenderedType,
  sameSet,
  staysIn,
  unique,
  UnreachedPosition,
  Use,
  UseStatus,
  VisitedPosition,
} from './type-history-model';
import { reportTagBreaks, reportTypeHistory } from './type-history-report';
import { TypeHistoryResult } from './type-history-result';
import { fieldLabel, referencedStructs, renderedFieldType, renderedPropertyTypes } from '../l1-view';
import { TypeMapping } from '../type-mappings';
import { matchShape, sameNameOrSharedField } from '../type-pairing';

export * from './type-history-result';

/**
 * Keep the L1 types of a released database in `db`, which must already hold the current sources
 *
 * The rules, the merge and split rule and the mapping kinds are stated in "Released database baseline" in README.md.
 * Per resource that both databases have, the steps are:
 *
 * 1. Collect the positions where the released L1 renders a type definition, as `renderedPropertyTypes()` and
 *    `renderedFieldType()` in l1-view.ts say, pair each with CloudFormation's type there, and add the positions where
 *    CloudFormation uses a current type definition of a released name. A modern tag property renders the newest type
 *    of its history, so where CloudFormation changed its type the build adds CloudFormation's type last and the L1
 *    renders it there: no released type is kept there. (Where CloudFormation's type is already an older type of the
 *    released history, the build does not add it again, and the L1 keeps rendering the released newest type there,
 *    by name and without comparing it with CloudFormation's.) The released types whose structs only
 *    cfn-property-mixins renders there keep their released fields, plus those their other positions need; they do not
 *    decide the fields or requiredness aws-cdk-lib renders, and a position that lacks one of their released fields
 *    leaves them undecided.
 * 2. Decide every released type definition in rounds: by its mapping entry, else by the merge and split rule, else
 *    from the fields its positions need. Each round counts again the positions the decisions render, until they
 *    settle.
 * 3. Report the undecided, settled, switched and weak cases and the applied and inactive entries.
 * 4. Apply the decisions to `db`: the kept type definitions' fields, the released histories first, and the flags for
 *    backwards compatibility. Then report the modern tag properties whose rendered type changed, as type breaks.
 *
 * Undecided type definitions keep their released fields plus all carried ones, and are returned with the entries that
 * would decide them.
 */
export function importTypeHistory(
  db: SpecDatabase,
  released: SpecDatabase,
  mappings: TypeMapping[],
): TypeHistoryResult {
  const result: TypeHistoryResult = {
    undecided: [],
    settled: [],
    weak: [],
    switched: [],
    tagBreaks: [],
    applied: [],
    inactive: [],
  };

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
      const lacking = inCurrent ? 'released database does' : 'current sources do';
      reportInactive(result, entry, `the ${lacking} not have ${entry.resource}`);
    }
  }

  const byType = (a: { resource: string; releasedType: string }, b: { resource: string; releasedType: string }) =>
    a.resource.localeCompare(b.resource) || a.releasedType.localeCompare(b.releasedType);
  result.undecided.sort(byType);
  result.settled.sort(byType);
  result.weak.sort((a, b) => byType(a, b) || a.newType.localeCompare(b.newType));
  result.switched.sort((a, b) => byType(a, b) || a.newType.localeCompare(b.newType));
  result.tagBreaks.sort((a, b) => a.resource.localeCompare(b.resource) || a.position.localeCompare(b.position));
  result.applied.sort((a, b) => mappings.indexOf(a.entry) - mappings.indexOf(b.entry));
  result.inactive.sort((a, b) => mappings.indexOf(a.entry) - mappings.indexOf(b.entry));
  return result;
}

class ResourceTypeHistory {
  private readonly currentByName: Map<string, TypeDefinition>;
  private readonly releasedByName: Map<string, TypeDefinition>;
  private readonly entries = new Map<string, TypeMapping>();
  private readonly positions = new Array<Position>();
  private readonly uses = new Map<TypeDefinition, Use[]>();

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
        reportInactive(this.result, entry, `the released database does not have ${entry.oldType}`);
      } else if (missing.length > 0) {
        reportInactive(this.result, entry, `the current sources do not have ${missing.join(', ')}`);
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
          const label = fieldLabel(bag, name);
          this.visit(label, { key: `${bag} ${name}`, bag, name }, releasedField, current, [current], []);
        }
      }
    }
    this.addCurrentOnlyPositions();
    const round = this.decideAll();
    const { db, released, releasedResource, resource, positions, currentByName } = this;
    reportTypeHistory({
      db,
      resource,
      round,
      entries: this.entries,
      releasedByName: this.releasedByName,
      result: this.result,
    });
    applyTypeHistory({ db, released, releasedResource, resource, positions, round, currentByName });
    reportTagBreaks({ db, released, releasedResource, resource, positions, result: this.result });
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
    const cfnType = currentField.type;
    const typeUnchanged = sameRenderedType(this.released, this.db, releasedField.type, cfnType);
    const { rendered, mixinsOnly } = this.renderedReleasedTypes(owner, releasedField, cfnType, typeUnchanged);
    const position: VisitedPosition = {
      kind: 'visited',
      label,
      owner,
      releasedField,
      currentField,
      cfnType,
      currentTypes: unique(
        currentFields.flatMap((f) => new RichTypedField(f).types()).flatMap((t) => referencedStructs(this.db, t)),
      ),
      typeUnchanged,
      rendersCloudFormation: !rendered,
      parentUse,
      uses: [],
    };
    this.positions.push(position);

    // Where CloudFormation put the type into a list or map, or took it out, the structs inside pair and are compared
    // as at any other position, while the L1 keeps rendering the released type
    const pairs =
      rendered &&
      (matchShape(this.released, rendered, this.db, cfnType) ??
        matchShape(this.released, insideContainers(rendered), this.db, insideContainers(cfnType)));
    const renderedStructs = rendered ? unique(referencedStructs(this.released, rendered)) : [];
    // The mixins render these as structs of their own, not as the position's type, so CloudFormation's type there does
    // not describe them: they keep their released fields, and take those their other uses need
    const mixinsStructs = unique(mixinsOnly.flatMap((t) => referencedStructs(this.released, t))).filter(
      (s) => !renderedStructs.includes(s),
    );
    for (const releasedType of [...renderedStructs, ...mixinsStructs]) {
      const candidates = unique((pairs ?? []).filter(([r]) => r === releasedType).map(([, c]) => c));
      const use: Use = {
        released: releasedType,
        position,
        candidates,
        ...(renderedStructs.includes(releasedType)
          ? this.classify(releasedType, position, candidates, pairs !== undefined)
          : { status: 'not-a-type' as const, mixinsOnly: true }),
      };
      position.uses.push(use);
      pushTo(this.uses, releasedType, use);

      // Recursive types stop where they repeat
      if (ancestry.includes(releasedType.$id)) {
        continue;
      }
      if (!use.cfn) {
        this.visitUnreached(label, releasedType, [...ancestry, releasedType.$id], use);
        continue;
      }
      for (const name of need(use)) {
        const releasedNested = releasedType.properties[name];
        const currentNested = position.currentTypes.flatMap((t) => (t.properties[name] ? [t.properties[name]] : []));
        const cfnNested = use.cfn.properties[name] ?? currentNested[0];
        if (releasedNested && cfnNested) {
          const nestedOwner = { key: ownerKey(releasedType, name), parent: releasedType, name };
          const nestedAncestry = [...ancestry, releasedType.$id];
          this.visit(`${label}.${name}`, nestedOwner, releasedNested, cfnNested, currentNested, nestedAncestry, use);
        }
      }
    }
  }

  /**
   * The released type the L1 renders at a position once the build has put the released history first, and the
   * released types only cfn-property-mixins renders the structs of there
   *
   * `rendered` is undefined where the L1 renders CloudFormation's type instead, whatever the history keeps: at a modern
   * tag property whose type CloudFormation changed, which renders the newest type of its history.
   */
  private renderedReleasedTypes(
    owner: Owner,
    releasedField: Field,
    cfnType: PropertyType,
    typeUnchanged: boolean,
  ): { rendered?: PropertyType; mixinsOnly: PropertyType[] } {
    if (owner.bag !== 'properties') {
      return { rendered: renderedFieldType(releasedField), mixinsOnly: [] };
    }
    // Where CloudFormation changed the type, the build adds it to the released history
    const releasedTypes = new RichTypedField(releasedField).types();
    const history = typeUnchanged ? releasedTypes : [...releasedTypes, cfnType];
    const lib = renderedPropertyTypes(this.resource, owner.name, history, 'aws-cdk-lib');
    const mixins = renderedPropertyTypes(this.resource, owner.name, history, 'cfn-property-mixins');
    return {
      rendered: lib.type === cfnType ? undefined : lib.type,
      mixinsOnly: mixins.structTypes.filter((t) => t !== cfnType && !lib.structTypes.includes(t)),
    };
  }

  /**
   * Record the released type definitions at the fields of a kept released type that CloudFormation's types do not
   * reach, because CloudFormation's type at its position has another shape or no pair
   *
   * They keep exactly their released fields there, and are compared like any other use, so a current type of their
   * name that CloudFormation uses elsewhere with other fields leaves them undecided. Below a struct that only
   * cfn-property-mixins renders, only it renders them too.
   */
  private visitUnreached(label: string, releasedType: TypeDefinition, ancestry: string[], parentUse: Use) {
    for (const [name, field] of Object.entries(releasedType.properties)) {
      const position: UnreachedPosition = {
        kind: 'unreached',
        label: `${label}.${name}`,
        currentTypes: [],
        parentUse,
        uses: [],
      };
      for (const nested of unique(referencedStructs(this.released, renderedFieldType(field)))) {
        const use: Use = {
          released: nested,
          position,
          candidates: [],
          status: 'not-a-type',
          ...(parentUse.mixinsOnly ? { mixinsOnly: true } : {}),
        };
        position.uses.push(use);
        pushTo(this.uses, nested, use);
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
        const position: CurrentOnlyPosition = {
          kind: 'current-only',
          label,
          currentField: field,
          cfnType: field.type,
          currentTypes: [current!],
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
        queue.push({ label: fieldLabel(bag, name), field });
      }
    }
    while (queue.length > 0) {
      const position = queue.shift()!;
      for (const typeDef of unique(referencedStructs(this.db, position.field.type))) {
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
   * Whether the L1 renders a position: one that only the current sources have counts only where the L1 renders the
   * current field it is
   */
  private rendered(position: Position, round: Round) {
    return !position.within || round.renderedFields.has(fieldKey(position.within));
  }

  /**
   * The fields of current type definitions that CloudFormation's types reach through the properties, attributes and
   * fields the L1 renders, each with the first place the L1 renders it, so a field below one the L1 leaves out, at any
   * depth, is not among them
   *
   * Where the L1 renders kept type definitions at a position, it renders the fields of the CloudFormation types they
   * are paired with that the kept ones keep. A resource property that renders the structs of the newest type of its
   * history, CloudFormation's (see `rendersNewestType()`), also renders the fields of each CloudFormation type, except
   * those that a kept type definition of its name leaves out. Elsewhere the L1 renders those fields only where no kept
   * type definition is rendered.
   */
  private renderedCurrentFields(round: DecidedRound): Map<string, string> {
    const keptAt = new Map<Field, Use[]>();
    for (const position of this.positions) {
      // Where a use follows CloudFormation, the position renders CloudFormation's type
      const staying = position.uses.filter((u) => staysIn(round, u));
      const followed = position.uses.some((u) => followsIn(round, u));
      if (position.currentField && round.active.has(position) && staying.length > 0 && !followed) {
        pushTo(keptAt, position.currentField, ...staying);
      }
    }

    const rendered = new Map<string, string>();
    const walked = new Set<string>();
    const queue = new Array<{ label: string; field: Field; rendersHistory?: boolean }>();
    for (const [name, field] of Object.entries(this.resource.properties)) {
      queue.push({ label: fieldLabel('properties', name), field, rendersHistory: this.rendersNewestType(name, field) });
    }
    for (const [name, field] of Object.entries(this.resource.attributes)) {
      queue.push({ label: fieldLabel('attributes', name), field });
    }
    while (queue.length > 0) {
      const { label, field, rendersHistory } = queue.shift()!;
      for (const typeDef of referencedStructs(this.db, field.type)) {
        const staying = keptAt.get(field);
        const kept = unique((staying ?? []).filter((u) => u.cfn === typeDef).map((u) => u.released));
        const views = [
          ...(kept.length > 0 ? [kept] : []),
          ...(!staying || rendersHistory ? [[] as TypeDefinition[]] : []),
        ];
        for (const view of views) {
          const key = `${typeDef.$id} ${view.map((r) => r.$id).join(',')}`;
          if (walked.has(key)) {
            continue;
          }
          walked.add(key);
          for (const [name, nested] of Object.entries(typeDef.properties)) {
            const keeps =
              view.length > 0
                ? view.some((r) => round.decisions.get(r)!.fields.includes(name))
                : this.keepsField(typeDef, name, round);
            if (keeps) {
              const fieldId = fieldKey({ typeDef, name });
              if (!rendered.has(fieldId)) {
                rendered.set(fieldId, `${label}.${name}`);
              }
              queue.push({ label: `${label}.${name}`, field: nested });
            }
          }
        }
      }
    }
    return rendered;
  }

  /**
   * Whether a resource property renders the structs of CloudFormation's type even where a kept released type stays
   * there: the build puts that type after the released history, and a property other than the tag property renders
   * the later types of its history as structs of their own, a modern tag property the newest as its type, and a
   * legacy one neither
   */
  private rendersNewestType(name: string, field: Field) {
    const released = this.releasedResource.properties[name];
    const history = [...(released ? new RichTypedField(released).types() : []), field.type];
    return renderedPropertyTypes(this.resource, name, history, 'aws-cdk-lib').structTypes.includes(field.type);
  }

  /**
   * Whether the L1 renders a field of a current type definition of the resource: not if it keeps a released type
   * definition of its name that leaves the field out
   */
  private keepsField(typeDef: TypeDefinition, name: string, round: DecidedRound) {
    const released = this.releasedByName.get(typeDef.name);
    const decision = released && round.decisions.get(released);
    return !decision || decision.stays.length === 0 || decision.fields.includes(name);
  }

  private classify(
    releasedType: TypeDefinition,
    position: VisitedPosition,
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
    if (position.typeUnchanged && candidates.length === 1) {
      return { status: 'paired', cfn: candidates[0] };
    }
    return { status: sharing.length === 0 ? 'no-pair' : 'ambiguous' };
  }

  /**
   * Decide every released type definition, until the positions that count are those the decisions render
   *
   * A position whose parent type definition the L1 no longer renders there does not count, and neither does a
   * position that only the current sources have at or below a field a kept type definition leaves out. Each round
   * counts the positions again from all of them, so a position left out because its parent followed CloudFormation in
   * an earlier round counts again once that parent stays. Where the rounds come back to positions they counted before
   * without settling, the released types whose positions changed are undecided.
   */
  private decideAll(): Round {
    let active: ReadonlySet<Position> = new Set(this.positions);
    const seen = new Set<string>([this.activeKey(active)]);
    // `seen` ends every cycle. The bound only stops a sequence of rounds that keeps changing without repeating; no
    // known input reaches it, see the fallback below.
    const maxRounds = this.positions.length + 1;
    for (let i = 0; i < maxRounds; i++) {
      const round = this.decideRound(active);
      const next = this.activeFromDecisions(round);
      const key = this.activeKey(next);
      if (key === this.activeKey(active)) {
        return round;
      }
      if (seen.has(key)) {
        return this.decideInterdependent(round, next);
      }
      seen.add(key);
      active = next;
    }
    // The rounds neither settled nor repeated within the bound: fail closed, as for a cycle
    const round = this.decideRound(active);
    const next = this.activeFromDecisions(round);
    return this.activeKey(next) !== this.activeKey(active) ? this.decideInterdependent(round, next) : round;
  }

  /**
   * Decide every released type definition on the positions that count
   */
  private decideRound(active: ReadonlySet<Position>): Round {
    const { mergeTargets, switched } = this.findMergesAndSplits(active);
    const decisions = new Map<TypeDefinition, Decision>();
    for (const [releasedType, uses] of this.uses) {
      const activeUses = uses.filter((u) => active.has(u.position));
      if (activeUses.length > 0) {
        decisions.set(releasedType, this.decide(releasedType, activeUses, switched));
      }
    }
    return this.withRenderedFields({ active, mergeTargets, switched, decisions });
  }

  private withRenderedFields(round: DecidedRound): Round {
    return { ...round, renderedFields: this.renderedCurrentFields(round) };
  }

  /**
   * The positions that count under a round's decisions: those the L1 renders, below parent uses that stay
   */
  private activeFromDecisions(round: Round): Set<Position> {
    const counts = new Map<Position, boolean>();
    const count = (p: Position): boolean => {
      let result = counts.get(p);
      if (result === undefined) {
        result =
          this.rendered(p, round) && (!p.parentUse || (count(p.parentUse.position) && staysIn(round, p.parentUse)));
        counts.set(p, result);
      }
      return result;
    };
    return new Set(this.positions.filter(count));
  }

  /**
   * Decide the positions of both rounds, and leave undecided each released type whose positions differ between them,
   * because the rounds that decide whether it follows CloudFormation do not settle
   */
  private decideInterdependent(round: Round, next: ReadonlySet<Position>): Round {
    const changed = new Set([...next, ...round.active].filter((p) => next.has(p) !== round.active.has(p)));
    const both = this.decideRound(new Set([...next, ...round.active]));
    const decisions = new Map(both.decisions);
    for (const [releasedType, uses] of this.uses) {
      if (uses.some((u) => changed.has(u.position))) {
        const activeUses = uses.filter((u) => both.active.has(u.position));
        const fields = releasedAnd(
          releasedType,
          activeUses.flatMap((u) => need(u)),
        );
        decisions.set(releasedType, {
          kind: 'undecided',
          stays: activeUses,
          follows: [],
          fields,
          undecided: 'interdependent',
        });
      }
    }
    return this.withRenderedFields({ ...both, decisions });
  }

  private activeKey(positions: ReadonlySet<Position>) {
    return this.positions
      .map((p, i) => (positions.has(p) ? i : -1))
      .filter((i) => i >= 0)
      .join(',');
  }

  private decide(releasedType: TypeDefinition, uses: Use[], switched: ReadonlySet<TypeDefinition>): Decision {
    const entry = this.entries.get(releasedType.name);
    if (entry) {
      const decision = this.applyEntry(releasedType, uses, entry);
      if (decision) {
        return decision;
      }
    }

    // A use that only cfn-property-mixins renders takes the fields the others need, if they keep its released ones
    const needs = constrainingUses(uses).map((u) => need(u));
    const keepAll = releasedAnd(
      releasedType,
      uses.flatMap((u) => need(u)),
    );
    const unpaired = uses.find(isUnpaired);
    if (unpaired) {
      return { kind: 'undecided', stays: uses, follows: [], fields: keepAll, undecided: unpaired.status };
    }
    if (switched.has(releasedType)) {
      // Where CloudFormation's type has another name, the L1 renders it; elsewhere the released type stays
      const follows = uses.filter((u) => u.status === 'paired');
      const stays = uses.filter((u) => !follows.includes(u));
      const stayNeeds = constrainingUses(stays).map((u) => need(u));
      const fields = stayNeeds[0] ?? [];
      if (stayNeeds.every((n) => sameSet(n, fields)) && keepsMixinsFields(stays, fields)) {
        return { kind: 'switched', stays, follows, fields };
      }
      return { kind: 'undecided', stays: uses, follows: [], fields: keepAll, undecided: 'diverging' };
    }
    if (needs.every((n) => sameSet(n, needs[0])) && keepsMixinsFields(uses, needs[0])) {
      return { kind: 'kept', stays: uses, follows: [], fields: needs[0] };
    }
    // A merge or split whose positions need different fields follows CloudFormation, so this is neither
    return { kind: 'undecided', stays: uses, follows: [], fields: keepAll, undecided: 'diverging' };
  }

  /**
   * Find the merges, and the merged and split released type definitions that follow CloudFormation, at the positions
   * that count
   *
   * A merge or split follows CloudFormation where one of CloudFormation's types has a field the released type lacks,
   * or where the positions of the released type need different fields. A released type definition that a mapping
   * entry decides, or that has a position without a pair, does not follow CloudFormation by this rule. Whether a merged
   * type has a field one of its released types lacks counts every one of them, so such a type still makes the others
   * follow that way; whether positions need different fields counts only the released types the rule decides.
   */
  private findMergesAndSplits(active: ReadonlySet<Position>) {
    const usesOf = new Map<TypeDefinition, Use[]>();
    const typesAt = new Map<TypeDefinition, TypeDefinition[]>();
    const mergedInto = new Map<TypeDefinition, TypeDefinition[]>();
    for (const [releasedType, uses] of this.uses) {
      const activeUses = uses.filter((u) => active.has(u.position));
      const types = cloudFormationTypes(activeUses);
      usesOf.set(releasedType, activeUses);
      typesAt.set(releasedType, types);
      for (const current of types) {
        pushTo(mergedInto, current, releasedType);
      }
    }
    const merges = [...mergedInto].filter(([, releasedTypes]) => releasedTypes.length > 1);
    const mergeTargets: ReadonlySet<TypeDefinition> = new Set(merges.map(([current]) => current));

    const byRule = (releasedType: TypeDefinition) => {
      const uses = usesOf.get(releasedType)!;
      const entry = this.entries.get(releasedType.name);
      const decidedByEntry = !!entry && uses.length > 0 && !!this.applyEntry(releasedType, uses, entry);
      return !decidedByEntry && !uses.some(isUnpaired);
    };
    const needsDiffer = (releasedType: TypeDefinition) => {
      const needs = constrainingUses(usesOf.get(releasedType)!).map((u) => need(u));
      return needs.some((n) => !sameSet(n, needs[0]));
    };
    const switched = new Set<TypeDefinition>();
    for (const [releasedType, types] of typesAt) {
      const gains = types.some((t) => hasNewField(releasedType, t));
      if (types.length > 1 && byRule(releasedType) && (gains || needsDiffer(releasedType))) {
        switched.add(releasedType);
      }
    }
    // Every released type of a merge follows CloudFormation together
    const switchAll = (releasedTypes: TypeDefinition[]) => {
      const added = releasedTypes.filter((r) => byRule(r) && !switched.has(r));
      added.forEach((r) => switched.add(r));
      return added.length > 0;
    };
    for (const [current, releasedTypes] of merges) {
      if (releasedTypes.some((r) => hasNewField(r, current) || (byRule(r) && needsDiffer(r)))) {
        switchAll(releasedTypes);
      }
    }
    let grown = true;
    while (grown) {
      grown = false;
      for (const [, releasedTypes] of merges) {
        if (releasedTypes.some((r) => switched.has(r)) && switchAll(releasedTypes)) {
          grown = true;
        }
      }
    }
    return { mergeTargets, switched };
  }

  /**
   * The decision of a mapping entry, or undefined if it decides none of the positions
   */
  private applyEntry(releasedType: TypeDefinition, uses: Use[], entry: TypeMapping): Decision | undefined {
    const standsAt = (u: Use) => [u.cfn, ...u.candidates].some((t) => t && entry.newTypes.includes(t.name));
    const fieldsAt = (at: Use[]) => unique(at.flatMap((u) => need(u)));
    const decided = (stays: Use[], follows: Use[], fields: string[], matched: Use[]): Decision => ({
      kind: 'entry',
      stays,
      follows,
      fields,
      entry,
      matched,
    });

    switch (entry.kind) {
      case 'rename':
      case 'merge': {
        const matched = uses.filter((u) => u.cfn?.name === entry.newTypes[0]);
        return matched.length > 0 ? decided(uses, [], fieldsAt(matched), matched) : undefined;
      }
      case 'split': {
        const matched = uses.filter(standsAt);
        const base = uses.filter((u) => !matched.includes(u));
        const baseFields = base.length > 0 ? fieldsAt(base) : undefined;
        const follows = matched.filter((u) => !baseFields || !sameSet(need(u), baseFields));
        const stays = uses.filter((u) => !follows.includes(u));
        return matched.length > 0 ? decided(stays, follows, baseFields ?? fieldsAt(stays), matched) : undefined;
      }
      case 'replace': {
        const matched = uses.filter(standsAt);
        const stays = uses.filter((u) => !matched.includes(u));
        return matched.length > 0 ? decided(stays, matched, fieldsAt(stays), matched) : undefined;
      }
      case 'keep-old': {
        const carried = uses.flatMap((u) =>
          u.cfn
            ? need(u)
            : u.candidates.filter((t) => entry.newTypes.includes(t.name)).flatMap((t) => Object.keys(t.properties)),
        );
        return decided(uses, [], releasedAnd(releasedType, carried), uses);
      }
      case 'follow-cloudformation':
        return decided([], uses, [], uses);
    }
  }
}
