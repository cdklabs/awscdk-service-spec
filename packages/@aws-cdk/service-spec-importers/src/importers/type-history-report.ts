import { Resource, RichTypedField, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec-types';
import { Field, fieldKey, need, Position, reportInactive, Round, Use, unique } from './type-history-model';
import { TypeHistoryResult, TypePosition, UndecidedKind } from './type-history-result';
import { renderedPropertyTypes, renderType } from '../l1-view';
import { PR_PLACEHOLDER, REASON_PLACEHOLDER, TypeMapping, TypeMappingKind } from '../type-mappings';

/**
 * What the report of one resource's type history reads: the last round of decisions and the resource's entries
 */
export interface TypeHistoryReportContext {
  readonly db: SpecDatabase;
  readonly resource: Resource;
  readonly round: Round;
  /** The entries of the mapping file that name a released and current type of the resource */
  readonly entries: ReadonlyMap<string, TypeMapping>;
  readonly releasedByName: ReadonlyMap<string, TypeDefinition>;
  readonly result: TypeHistoryResult;
}

/**
 * Add the undecided, settled, switched and weak cases and the applied and inactive entries of one resource's last
 * round of decisions to the result
 */
export function reportTypeHistory(context: TypeHistoryReportContext) {
  new TypeHistoryReporter(context).report();
}

/**
 * What the report of one resource's tag type breaks reads, once its decisions are applied to `db`
 */
export interface TagBreakReportContext {
  readonly db: SpecDatabase;
  readonly released: SpecDatabase;
  readonly releasedResource: Resource;
  /** The resource in `db` */
  readonly resource: Resource;
  readonly positions: readonly Position[];
  readonly result: TypeHistoryResult;
}

/**
 * Add each position where the L1 renders CloudFormation's type whatever the released history keeps, a modern tag
 * property, to the result if the type it renders there differs from the one the released L1 renders
 */
export function reportTagBreaks(context: TagBreakReportContext) {
  const { db, released, releasedResource, resource, result } = context;
  for (const position of context.positions) {
    if (position.kind !== 'visited' || !position.rendersCloudFormation) {
      continue;
    }
    const { name } = position.owner;
    const rendered = (r: Resource, field: Field) =>
      renderedPropertyTypes(r, name, new RichTypedField(field).types(), 'aws-cdk-lib').type;
    const releasedType = renderType(released, rendered(releasedResource, position.releasedField));
    const newType = renderType(db, rendered(resource, resource.properties[name]));
    if (releasedType !== newType) {
      result.tagBreaks.push({ resource: resource.cloudFormationType, position: position.label, releasedType, newType });
    }
  }
}

class TypeHistoryReporter {
  private readonly db: SpecDatabase;
  private readonly resource: Resource;
  private readonly round: Round;
  private readonly entries: ReadonlyMap<string, TypeMapping>;
  private readonly releasedByName: ReadonlyMap<string, TypeDefinition>;
  private readonly result: TypeHistoryResult;

  constructor(context: TypeHistoryReportContext) {
    this.db = context.db;
    this.resource = context.resource;
    this.round = context.round;
    this.entries = context.entries;
    this.releasedByName = context.releasedByName;
    this.result = context.result;
  }

  public report() {
    const resource = this.resource.cloudFormationType;
    for (const [releasedType, decision] of this.round.decisions) {
      switch (decision.kind) {
        case 'entry': {
          const positions = unique(decision.matched.map((u) => this.label(u.position))).sort();
          this.result.applied.push({ entry: decision.entry, positions });
          break;
        }
        case 'undecided':
          this.result.undecided.push({
            resource,
            kind: decision.undecided,
            releasedType: releasedType.name,
            positions: this.typePositions(decision.stays),
            entries: this.proposals(releasedType, decision.stays, decision.undecided),
          });
          break;
        case 'switched':
          for (const newType of unique(decision.follows.map((u) => u.cfn!.name)).sort()) {
            const at = decision.follows.filter((u) => u.cfn!.name === newType);
            const positions = unique(at.map((u) => this.label(u.position))).sort();
            this.result.switched.push({ resource, releasedType: releasedType.name, newType, positions });
          }
          break;
        case 'kept': {
          const renamed = decision.stays.filter((u) => this.renamedAt(u));
          if (renamed.length > 0) {
            const newTypes = unique(renamed.map((u) => u.cfn!.name)).sort();
            const kind = newTypes.length > 1 ? 'split' : this.isMergeTarget(renamed[0].cfn!) ? 'merge' : 'rename';
            const positions = unique(renamed.map((u) => this.label(u.position))).sort();
            this.result.settled.push({ resource, kind, releasedType: releasedType.name, newTypes, positions });
            this.reportWeakMatches(releasedType, renamed);
          }
          break;
        }
      }
    }
    for (const entry of this.entries.values()) {
      if (!this.result.applied.some((a) => a.entry === entry)) {
        const released = this.releasedByName.get(entry.oldType)!;
        reportInactive(
          this.result,
          entry,
          this.round.decisions.has(released)
            ? `${entry.newTypes.join(', ')} stands at none of the positions of ${entry.oldType}`
            : `the L1 renders ${entry.oldType} at no position that the current sources have`,
        );
      }
    }
  }

  /**
   * Report each current type of a settled change that shares fewer than half of the released type's fields, by name,
   * and each one paired with a released type without fields, since only its position paired them
   */
  private reportWeakMatches(releasedType: TypeDefinition, renamed: Use[]) {
    const releasedFields = Object.keys(releasedType.properties);
    for (const current of unique(renamed.map((u) => u.cfn!))) {
      const shared = releasedFields.filter((name) => current.properties[name]).length;
      if (releasedFields.length === 0 || shared * 2 < releasedFields.length) {
        this.result.weak.push({
          resource: this.resource.cloudFormationType,
          releasedType: releasedType.name,
          newType: current.name,
          positions: unique(renamed.filter((u) => u.cfn === current).map((u) => this.label(u.position))).sort(),
          shared,
          total: releasedFields.length,
        });
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
      const label = this.label(use.position);
      positions.set(label, {
        position: label,
        cloudFormationType,
        fields: [...need(use)].sort(),
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
      default:
        return [...split, ...keepOrFollow];
    }
  }

  /**
   * Where the L1 renders a position: for a field of a current type definition, the first place the L1 renders that
   * field, which need not be the first place CloudFormation's types reach it
   */
  private label(position: Position) {
    return (position.within && this.round.renderedFields.get(fieldKey(position.within))) ?? position.label;
  }

  private renamedAt(use: Use) {
    // Only a visited position compares CloudFormation's type with the released one
    return use.status === 'paired' && use.position.kind === 'visited' && !use.position.typeUnchanged;
  }

  private isMergeTarget(current: TypeDefinition) {
    return this.round.mergeTargets.has(current);
  }
}
