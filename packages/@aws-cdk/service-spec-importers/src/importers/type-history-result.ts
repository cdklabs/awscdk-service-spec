import { TypeMapping } from '../type-mappings';

/**
 * Why the matcher cannot decide how a released type definition continues
 *
 * - `no-pair`: at a position where CloudFormation changed its type, no current type shares a field with it.
 * - `ambiguous`: at such a position, more than one current type does.
 * - `diverging`: its positions need different fields, and it is neither a merge nor a split, or it is one that follows
 *   CloudFormation and the positions where it keeps its name need different fields.
 * - `interdependent`: whether it follows CloudFormation depends on whether other types do, and the rounds that decide
 *   them do not settle, so the build does not choose, even where only one result would fit.
 */
export type UndecidedKind = 'no-pair' | 'ambiguous' | 'diverging' | 'interdependent';

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

/**
 * A current type that a settled rename, merge or split pairs with a released type, sharing fewer than half of the
 * released type's fields (or none, if the released type has none)
 */
export interface WeakMatch {
  readonly resource: string;
  readonly releasedType: string;
  readonly newType: string;
  /** Where CloudFormation renamed the released type to the current type */
  readonly positions: string[];
  /** The number of released fields that the current type has */
  readonly shared: number;
  /** The number of released fields */
  readonly total: number;
}

/**
 * A merged or split released type definition whose positions now render a CloudFormation type of another name, a
 * reported type break
 */
export interface SwitchedType {
  readonly resource: string;
  readonly releasedType: string;
  /** The CloudFormation type the L1 renders instead */
  readonly newType: string;
  /** Where the L1 renders it */
  readonly positions: string[];
}

/**
 * A modern tag property whose type CloudFormation changed, a reported type break
 *
 * The generated packages render the newest type of a modern tag property's history, so there they render
 * CloudFormation's type, whatever the released history keeps. The released types stay first in the history, so
 * cfn-property-mixins still renders the structs of the oldest one.
 */
export interface TagTypeBreak {
  readonly resource: string;
  /** The tag property, for example `property Tags` */
  readonly position: string;
  /** The type the released L1 renders there */
  readonly releasedType: string;
  /** The type the L1 renders there now, CloudFormation's */
  readonly newType: string;
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
  /** The settled changes whose current type shares few released fields; they do not fail the gate */
  readonly weak: WeakMatch[];
  /** The merged and split types that follow CloudFormation's types; they do not fail the gate */
  readonly switched: SwitchedType[];
  /** The modern tag properties that follow CloudFormation's type; they do not fail the gate */
  readonly tagBreaks: TagTypeBreak[];
  readonly applied: AppliedMapping[];
  readonly inactive: InactiveMapping[];
}
