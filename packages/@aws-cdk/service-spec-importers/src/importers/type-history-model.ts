/**
 * The positions, uses, decisions and rounds of the type history, shared by its collection and decision
 * (`import-type-history.ts`), its report (`type-history-report.ts`) and its application (`type-history-apply.ts`)
 */
import { Attribute, Property, PropertyType, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec-types';
import { TypeHistoryResult, UndecidedKind } from './type-history-result';
import { renderType } from '../l1-view';
import { TypeMapping } from '../type-mappings';

export type Field = Property | Attribute;

/**
 * The fields a kept type definition gets: each with its requiredness and the field that types it, if any
 */
export type FieldPlan = Array<{ name: string; required: boolean; source?: Field }>;

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
export interface CloudFormationPosition {
  readonly label: string;
  readonly field: Field;
  readonly within?: CurrentField;
}

/**
 * - `same`: CloudFormation's type there has the released name.
 * - `paired`: CloudFormation's type there has another name and is paired with the released type.
 * - `not-a-type`: CloudFormation's type there has another shape, even inside its lists and maps, so it has no type
 *   definition at that place; also every use at an unreached position.
 * - `no-pair`: CloudFormation's type there has the same shape, but no type definition at that place shares a field
 *   with the released one.
 * - `ambiguous`: more than one does.
 */
export type UseStatus = 'same' | 'paired' | 'not-a-type' | 'no-pair' | 'ambiguous';

/**
 * Where the history of a position lives: a resource property or attribute, or a field of a released type definition
 */
export interface Owner {
  readonly key: string;
  readonly bag?: 'properties' | 'attributes';
  readonly parent?: TypeDefinition;
  readonly name: string;
}

interface PositionBase {
  readonly label: string;
  /** Every type definition the current sources give this position */
  readonly currentTypes: TypeDefinition[];
  /** The use of the parent type definition this position is a field of */
  readonly parentUse?: Use;
  readonly uses: Use[];
}

/**
 * A position that both the released L1 and CloudFormation's types have
 */
export interface VisitedPosition extends PositionBase {
  readonly kind: 'visited';
  readonly owner: Owner;
  readonly releasedField: Field;
  readonly currentField: Field;
  /** CloudFormation's type here: the newest type of the current sources */
  readonly cfnType: PropertyType;
  /** Whether CloudFormation's type renders as the released newest type here, so CloudFormation did not change it */
  readonly typeUnchanged: boolean;
  /**
   * Whether the L1 renders CloudFormation's type here whatever the released history keeps, as at a modern tag property
   * whose type CloudFormation changed, so no released type is kept here
   */
  readonly rendersCloudFormation: boolean;
  readonly within?: undefined;
}

/**
 * A field of a kept released type definition that CloudFormation's types do not reach
 */
export interface UnreachedPosition extends PositionBase {
  readonly kind: 'unreached';
  readonly owner?: undefined;
  readonly releasedField?: undefined;
  readonly currentField?: undefined;
  readonly cfnType?: undefined;
  readonly within?: undefined;
}

/**
 * A position where CloudFormation uses a current type definition of a released name and the released L1 does not
 */
export interface CurrentOnlyPosition extends PositionBase {
  readonly kind: 'current-only';
  readonly owner?: undefined;
  readonly releasedField?: undefined;
  readonly currentField: Field;
  readonly cfnType: PropertyType;
  /** The current type definition and field it is, if a field */
  readonly within?: CurrentField;
}

export type Position = VisitedPosition | UnreachedPosition | CurrentOnlyPosition;

/**
 * A released type definition that the L1 renders at a position
 */
export interface Use {
  readonly released: TypeDefinition;
  readonly position: Position;
  /** The type definitions at the same place in CloudFormation's type, if it has the same shape */
  readonly candidates: TypeDefinition[];
  readonly status: UseStatus;
  /** CloudFormation's type definition there */
  readonly cfn?: TypeDefinition;
}

interface DecisionBase {
  /** The uses where the L1 renders the released type */
  readonly stays: Use[];
  /** The uses whose position renders CloudFormation's type instead */
  readonly follows: Use[];
  /** The fields of the released type in the L1 */
  readonly fields: string[];
}

/**
 * - `kept`: the released type stays, with the fields its positions need.
 * - `switched`: the merge and split rule makes the released type follow CloudFormation.
 * - `entry`: a mapping entry decides it.
 * - `undecided`: the gate fails for it.
 */
export type Decision =
  | (DecisionBase & { readonly kind: 'kept' | 'switched' })
  | (DecisionBase & { readonly kind: 'undecided'; readonly undecided: UndecidedKind })
  | (DecisionBase & {
      readonly kind: 'entry';
      readonly entry: TypeMapping;
      /** The uses the entry decided */
      readonly matched: Use[];
    });

/**
 * One round of decisions, all from the same positions that count: the merges and switches come from their uses, the
 * decisions from those, and the rendered fields from the decisions
 */
export interface Round {
  /** The positions that count */
  readonly active: ReadonlySet<Position>;
  /** The current type definitions that several released ones continue as */
  readonly mergeTargets: ReadonlySet<TypeDefinition>;
  /** The released type definitions that follow CloudFormation by the merge and split rule */
  readonly switched: ReadonlySet<TypeDefinition>;
  readonly decisions: ReadonlyMap<TypeDefinition, Decision>;
  /**
   * The fields of current type definitions that the L1 renders, see `renderedCurrentFields()` in
   * `import-type-history.ts`
   */
  readonly renderedFields: ReadonlyMap<string, string>;
}

/**
 * A round before its rendered fields are known
 */
export type DecidedRound = Omit<Round, 'renderedFields'>;

/**
 * The fields a released type definition needs at one of its positions (rule 3)
 */
export function need(use: Use): string[] {
  const releasedFields = Object.keys(use.released.properties);
  // CloudFormation's type there, inside any lists and maps, is not a type definition
  if (!use.cfn) {
    return releasedFields;
  }
  const stillThere = releasedFields.filter((name) => use.position.currentTypes.some((t) => t.properties[name]));
  return unique([...Object.keys(use.cfn.properties), ...stillThere]);
}

/**
 * Whether the L1 renders the released type at a use, in a round
 */
export function staysIn(round: DecidedRound, use: Use) {
  return !!round.decisions.get(use.released)?.stays.includes(use);
}

/**
 * Whether the position of a use renders CloudFormation's type instead, in a round
 */
export function followsIn(round: DecidedRound, use: Use) {
  return !!round.decisions.get(use.released)?.follows.includes(use);
}

/**
 * Whether a released type renders as CloudFormation's type does, so CloudFormation did not change the type there
 */
export function sameRenderedType(
  released: SpecDatabase,
  db: SpecDatabase,
  releasedType: PropertyType,
  cfnType: PropertyType,
) {
  return renderType(released, releasedType) === renderType(db, cfnType);
}

/**
 * Report a mapping entry that applies nowhere, with the reason
 */
export function reportInactive(result: TypeHistoryResult, entry: TypeMapping, reason: string) {
  result.inactive.push({ entry, reason });
}

export function setTypeHistory(field: Field, types: PropertyType[]) {
  field.type = types[types.length - 1];
  if (types.length > 1) {
    field.previousTypes = types.slice(0, -1);
  } else {
    delete field.previousTypes;
  }
}

export function setRequired(field: Field, required: boolean) {
  if (required) {
    (field as Property).required = true;
  } else {
    delete (field as Property).required;
  }
}

/**
 * The `Owner.key` of a field of a released type definition
 */
export function ownerKey(parent: TypeDefinition, name: string) {
  return `${parent.$id} ${name}`;
}

/**
 * Whether no current type pairs with the released type at a use, or more than one does
 */
export function isUnpaired(use: Use): use is Use & { readonly status: 'no-pair' | 'ambiguous' } {
  return use.status === 'no-pair' || use.status === 'ambiguous';
}

/**
 * The released fields of a type definition, followed by the other names
 */
export function releasedAnd(releasedType: TypeDefinition, names: string[]): string[] {
  return unique([...Object.keys(releasedType.properties), ...names]);
}

export function pushTo<K, V>(map: Map<K, V[]>, key: K, ...values: V[]) {
  map.set(key, [...(map.get(key) ?? []), ...values]);
}

export function fieldKey({ typeDef, name }: CurrentField) {
  return `${typeDef.$id} ${name}`;
}

/**
 * The type definitions CloudFormation's types give a released type definition at its uses
 */
export function cloudFormationTypes(uses: Use[]): TypeDefinition[] {
  return unique(uses.map((u) => u.cfn).filter(isDefined));
}

/**
 * Whether a current type definition has a field that a released one lacks, by name
 */
export function hasNewField(releasedType: TypeDefinition, current: TypeDefinition) {
  return Object.keys(current.properties).some((name) => !releasedType.properties[name]);
}

export function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export function unique<A>(xs: A[]): A[] {
  return [...new Set(xs)];
}

/**
 * The type inside any lists and maps
 */
export function insideContainers(type: PropertyType): PropertyType {
  return type.type === 'array' || type.type === 'map' ? insideContainers(type.element) : type;
}

export function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}

export function isDefined<A>(x: A | undefined): x is A {
  return x !== undefined;
}
