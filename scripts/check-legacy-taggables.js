// Fails when this repository's copy of the CDK code generator's LEGACY_TAGGABLES table differs from aws-cdk's.
//
// Usage: node scripts/check-legacy-taggables.js <copy: l1-view.ts> <aws-cdk checkout, or its tagging.ts>
//
// Both files are read as text and never imported, compiled or run. Each table is taken from the lines between the
// constant's declaration, `const LEGACY_TAGGABLES ... = {`, and the first `};` at the start of a line after it. Every
// line in between must be one entry, `'<resource type>': ['<tag property>', '<variant>'],`, a blank line or a `//`
// comment. Anything else, a missing or repeated declaration, a missing closing brace, a repeated resource type or an
// empty table stops the check with an error, so it never passes without having compared the two tables.
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

class CannotCompare extends Error {}

function main(args) {
  if (args.length !== 2) {
    throw new CannotCompare(
      'Usage: node scripts/check-legacy-taggables.js <copy: l1-view.ts> <aws-cdk checkout, or its tagging.ts>',
    );
  }
  const copyFile = args[0];
  const awsCdkFile = resolveAwsCdkFile(args[1]);

  const copy = readTable(copyFile);
  const awsCdk = readTable(awsCdkFile);

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
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (CLOSING.test(line)) {
      if (table.size === 0) {
        throw new CannotCompare(`${CONSTANT} in ${file} has no entries (lines ${start + 1} to ${i + 1})`);
      }
      return table;
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
  throw new CannotCompare(`Cannot find the end of ${CONSTANT} in ${file}: no line '};' after line ${start + 1}`);
}

function formatEntry(type, value) {
  return `'${type}': ${formatValue(value)}`;
}

function formatValue([property, variant]) {
  return `['${property}', '${variant}']`;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (!(e instanceof CannotCompare)) {
    throw e;
  }
  console.error(`${e.message}. The check of ${CONSTANT} did not compare the tables.`);
  process.exitCode = 2;
}
