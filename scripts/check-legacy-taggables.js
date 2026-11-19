// Fails when this repository's copy of the CDK code generator's LEGACY_TAGGABLES table differs from aws-cdk's.
//
// Usage: node scripts/check-legacy-taggables.js <copy: l1-view.ts> <aws-cdk checkout, or its tagging.ts>
//
// CI does not run this file. projenrc/aws-cdk-integration-test.ts embeds its text, at synthesis, in a step of the
// test-aws-cdk-integration workflow, which passes it to `node -e` from the step's environment. So the step executes
// nothing from either checkout. After changing this file, run `npx projen` to regenerate that step. The file uses
// only Node.js built-ins, and must not contain a GitHub Actions expression (a dollar sign and two opening braces),
// which the runner would evaluate; projen refuses to embed it if it does.
//
// Both files are read as text and never imported, compiled or run. Each table is taken from the lines between the
// constant's declaration, `const LEGACY_TAGGABLES ... = {`, and the first `}` or `};` at the start of a line after it.
// Every line in between must be one entry, `'<resource type>': ['<tag property>', '<variant>'],`, a blank line or a
// `//` comment. Anything else, a missing or repeated declaration, a missing closing brace, a repeated resource type, an
// empty table or an entry-shaped line elsewhere in the file (a table split in two) stops the check with an error, so
// it never passes without having compared the two tables. Only the object literal is read: an entry that aws-cdk adds
// to the table in code, such as an assignment after the declaration, is not seen.
//
// Exit codes: 0 the tables are equal, 1 they differ, 2 a table could not be read.
const fs = require('fs');
const path = require('path');

const CONSTANT = 'LEGACY_TAGGABLES';
const TAGGING_FILE = path.join('tools', '@aws-cdk', 'spec2cdk', 'lib', 'cdk', 'tagging.ts');

const DECLARATION = new RegExp(`^(export\\s+)?const\\s+${CONSTANT}\\b[^=]*=\\s*\\{\\s*$`);
const MENTION = new RegExp(`\\bconst\\s+${CONSTANT}\\b`);
const CLOSING = /^\};?\s*$/;
const STRING = `(['"])([^'"\\\\]+)\\`;
const ENTRY = new RegExp(`^${STRING}1\\s*:\\s*\\[\\s*${STRING}3\\s*,\\s*${STRING}5\\s*\\]\\s*,?$`);

class CannotCompare extends Error {
  constructor(message, advice) {
    super(message);
    this.advice = advice;
  }
}

function main(args) {
  if (args.length !== 2) {
    throw new CannotCompare(
      'Usage: node scripts/check-legacy-taggables.js <copy: l1-view.ts> <aws-cdk checkout, or its tagging.ts>',
    );
  }
  const copyFile = args[0];
  const awsCdkFile = resolveAwsCdkFile(args[1]);

  const copy = readTable(copyFile);
  let awsCdk;
  try {
    awsCdk = readTable(awsCdkFile);
  } catch (e) {
    if (!(e instanceof CannotCompare)) {
      throw e;
    }
    throw new CannotCompare(
      e.message,
      `The cause is in aws-cdk, not in this pull request: aws-cdk's table has moved or changed form. ` +
        `Update scripts/check-legacy-taggables.js to read the new form, run 'npx projen' to regenerate the step, ` +
        `and keep the copy in ${copyFile} equal to aws-cdk's table.`,
    );
  }

  const differences = [];
  for (const type of [...new Set([...copy.keys(), ...awsCdk.keys()])].sort()) {
    const mine = copy.get(type);
    const theirs = awsCdk.get(type);
    if (!mine) {
      differences.push(`only in aws-cdk:  ${formatEntry(type, theirs)}`);
    } else if (!theirs) {
      differences.push(`only in the copy: ${formatEntry(type, mine)}`);
    } else if (mine[0] !== theirs[0] || mine[1] !== theirs[1]) {
      differences.push(`changed:          '${type}': copy ${formatValue(mine)}, aws-cdk ${formatValue(theirs)}`);
    }
  }

  if (differences.length > 0) {
    console.error(`${CONSTANT} differs between the copy and aws-cdk:`);
    console.error(`  copy:    ${copyFile} (${copy.size} entries)`);
    console.error(`  aws-cdk: ${awsCdkFile} (${awsCdk.size} entries)`);
    for (const difference of differences) {
      console.error(`  ${difference}`);
    }
    console.error(`${differences.length} difference(s). Make the copy in ${copyFile} match aws-cdk's table.`);
    return 1;
  }

  console.log(`${CONSTANT}: the copy in ${copyFile} equals aws-cdk's table in ${awsCdkFile} (${copy.size} entries).`);
  return 0;
}

/**
 * The tagging.ts of an aws-cdk checkout, or the given path when it is not a directory
 */
function resolveAwsCdkFile(arg) {
  let stat;
  try {
    stat = fs.statSync(arg);
  } catch (e) {
    throw new CannotCompare(`Cannot read ${arg}: ${e.message}`);
  }
  return stat.isDirectory() ? path.join(arg, TAGGING_FILE) : arg;
}

/**
 * Read the table's entries from a file's text, as a map from resource type to [tag property, variant]
 */
function readTable(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch (e) {
    throw new CannotCompare(`Cannot read ${file}: ${e.message}`);
  }
  const lines = text.split(/\r?\n/);

  const declarations = [];
  lines.forEach((line, i) => {
    if (MENTION.test(line)) {
      declarations.push(i);
    }
  });
  if (declarations.length !== 1) {
    throw new CannotCompare(
      `Expected exactly one declaration of ${CONSTANT} in ${file}, found ${declarations.length}` +
        (declarations.length > 0 ? ` (lines ${declarations.map((i) => i + 1).join(', ')})` : ''),
    );
  }
  const start = declarations[0];
  if (!DECLARATION.test(lines[start])) {
    throw new CannotCompare(
      `Cannot parse line ${start + 1} of ${file} as the declaration of ${CONSTANT} ending in '= {': ${lines[start]}`,
    );
  }

  const table = new Map();
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (CLOSING.test(line)) {
      end = i;
      break;
    }
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('//')) {
      continue;
    }
    const match = ENTRY.exec(trimmed);
    if (!match) {
      throw new CannotCompare(`Cannot parse line ${i + 1} of ${CONSTANT} in ${file} as an entry: ${line}`);
    }
    const type = match[2];
    if (table.has(type)) {
      throw new CannotCompare(`${CONSTANT} in ${file} lists '${type}' more than once (line ${i + 1})`);
    }
    table.set(type, [match[4], match[6]]);
  }
  if (end < 0) {
    throw new CannotCompare(
      `Cannot find the end of ${CONSTANT} in ${file}: no line '}' or '};' after line ${start + 1}`,
    );
  }
  if (table.size === 0) {
    throw new CannotCompare(`${CONSTANT} in ${file} has no entries (lines ${start + 1} to ${end + 1})`);
  }

  const outside = [];
  lines.forEach((line, i) => {
    if ((i < start || i > end) && ENTRY.test(line.trim())) {
      outside.push(i + 1);
    }
  });
  if (outside.length > 0) {
    const at = formatLineRanges(outside);
    throw new CannotCompare(
      `${file} has ${outside.length} entry-shaped line(s) outside ${CONSTANT}, at lines ${at}; ` +
        `the table spans lines ${start + 1} to ${end + 1} and may have been split`,
    );
  }
  return table;
}

/**
 * Line numbers as ranges, such as `1-3, 7`
 */
function formatLineRanges(numbers) {
  const ranges = [];
  for (const n of numbers) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === n - 1) {
      last[1] = n;
    } else {
      ranges.push([n, n]);
    }
  }
  return ranges.map(([from, to]) => (from === to ? `${from}` : `${from}-${to}`)).join(', ');
}

function formatEntry(type, value) {
  return `'${type}': ${formatValue(value)}`;
}

function formatValue([property, variant]) {
  return `['${property}', '${variant}']`;
}

// Run as a file, argv[1] is this file; run with `node -e`, as the workflow step does, the arguments start at argv[1].
const args = process.argv.slice(require.main === module ? 2 : 1);

try {
  process.exitCode = main(args);
} catch (e) {
  if (!(e instanceof CannotCompare)) {
    throw e;
  }
  console.error(`${e.message}. The check of ${CONSTANT} did not compare the tables.${e.advice ? ` ${e.advice}` : ''}`);
  process.exitCode = 2;
}
