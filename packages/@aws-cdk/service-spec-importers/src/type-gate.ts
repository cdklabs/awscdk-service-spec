import { TypeHistoryResult, UndecidedCase, UndecidedKind } from './importers/import-type-history';

export interface TypeGateOptions {
  /** The mapping file that decides the undecided cases, as the printed text names it */
  readonly mappingFile: string;
  /** The version of the released database the build kept the types of */
  readonly baselineVersion: string;
}

export interface TypeGate {
  /** Whether the matcher left a case undecided */
  readonly failed: boolean;
  /** The whole gate output */
  readonly report: string;
  /** The undecided cases, each with the mapping entries that decide it */
  readonly entries: string;
}

const WHY: Record<UndecidedKind, string> = {
  'no-pair': 'has no pair: no current type at its position shares a field with it',
  ambiguous: 'has ambiguous candidates: more than one current type at its position shares a field with it',
  diverging: 'diverges: the positions where it keeps its name need different fields',
  interdependent:
    'is interdependent: whether it follows CloudFormation depends on other types, and the rounds do not settle',
};

/**
 * The type history gate: it fails when the matcher left a released type definition undecided
 *
 * Settled renames, merges and splits, weak matches among them, merged and split types that follow CloudFormation,
 * applied mapping entries and entries that apply nowhere are reported only.
 */
export function typeGate(result: TypeHistoryResult, options: TypeGateOptions): TypeGate {
  const failed = result.undecided.length > 0;
  const entries = result.undecided.map((c) => formatUndecided(c, options.mappingFile)).join('\n\n');

  const lines = [
    `Type history gate against the released database ${options.baselineVersion}: ${
      failed ? `FAIL (${result.undecided.length} undecided)` : 'OK'
    }`,
  ];
  if (failed) {
    lines.push('', entries);
  }
  if (result.settled.length > 0) {
    lines.push('', 'Settled renames, merges and splits (the L1 keeps the released names):');
    for (const s of result.settled) {
      lines.push(
        `  ${s.resource}: ${s.kind} ${s.releasedType} -> ${s.newTypes.join(', ')} (${s.positions.join(', ')})`,
      );
    }
  }
  if (result.switched.length > 0) {
    lines.push('', "Merged and split types that follow CloudFormation's types (type breaks):");
    for (const s of result.switched) {
      lines.push(`  ${s.resource}: ${s.releasedType} -> ${s.newType} (${s.positions.join(', ')})`);
    }
  }
  if (result.weak.length > 0) {
    lines.push('', 'Weak matches (settled renames, merges and splits sharing fewer than half of the released fields):');
    for (const w of result.weak) {
      const share = `shares ${w.shared} of ${w.total} released fields`;
      lines.push(`  ${w.resource}: ${w.releasedType} -> ${w.newType} ${share} (${w.positions.join(', ')})`);
    }
  }
  if (result.applied.length > 0) {
    lines.push('', `Applied entries of ${options.mappingFile}:`);
    for (const a of result.applied) {
      const { resource, kind, oldType, newTypes } = a.entry;
      lines.push(`  ${resource}: ${kind} ${oldType} -> ${newTypes.join(', ') || '-'} (${a.positions.join(', ')})`);
    }
  }
  if (result.inactive.length > 0) {
    lines.push('', `Entries of ${options.mappingFile} that apply nowhere (reported only):`);
    for (const i of result.inactive) {
      lines.push(`  ${i.entry.resource}: ${i.entry.kind} ${i.entry.oldType}: ${i.reason}`);
    }
  }

  return { failed, report: lines.join('\n'), entries };
}

function formatUndecided(c: UndecidedCase, mappingFile: string) {
  return [
    `${c.resource}: ${c.releasedType} ${WHY[c.kind]}`,
    ...c.positions.map(
      (p) => `  ${p.position}: CloudFormation has ${p.cloudFormationType}, needs ${p.fields.join(', ')}`,
    ),
    `  Add one of these entries to ${mappingFile}:`,
    ...c.entries.map((e) => `    ${JSON.stringify(e)}`),
  ].join('\n');
}
