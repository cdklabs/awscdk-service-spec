import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Deprecation, emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';
import { importLegacySpec, importRegistry, object, ref, RESOURCE, str } from './utils';
import { findBreakingChanges, formatBreakingChanges } from '../src/breaking-changes';
import { compareL1, formatL1Changes } from '../src/l1-changes';
import { CloudFormationRegistryResource, resourcespec } from '../src/types';

/** The service of `RESOURCE` */
const SERVICE = 'aws-some';

/** The paragraph that starts the changelog block, as the prompt for L1 pull requests gives it */
const CHANGELOG_PARAGRAPH =
  '**CHANGES TO L1 RESOURCES:** L1 resources are automatically generated from public CloudFormation Resource Schemas. They are built to closely reflect the real state of CloudFormation. Sometimes these updates can contain changes that are incompatible with previous types, but more accurately reflect reality. In this release we have changed:';

/**
 * How aws-cdk's release tooling finds the note in a commit message: `cdk-release` passes `CHANGES TO L1 RESOURCES` as
 * a note keyword to conventional-commits-parser 3.2.4, which builds this expression from it (`getNotesRegex` in its
 * `lib/regex.js`) and matches it against each line
 */
const RELEASE_NOTE_LINE = /^[\s|*]*(BREAKING CHANGE|BREAKING-CHANGES|CHANGES TO L1 RESOURCES)[:\s]+(.*)/i;

let base: SpecDatabase;
let head: SpecDatabase;
beforeEach(() => {
  base = emptyDatabase();
  head = emptyDatabase();
});

/** The rows of the breaking changes table, as `service | resource | change | explanation` */
function rows(): string[] {
  return findBreakingChanges(base, head).changes.map(
    (c) => `${c.service} | ${c.resource} | ${c.change} | ${c.explanation}`,
  );
}

/** The changelog lines, without the paragraph that starts the block */
function changelogLines(): string[] {
  const text = formatBreakingChanges(findBreakingChanges(base, head));
  const block = text.slice(text.indexOf(CHANGELOG_PARAGRAPH) + CHANGELOG_PARAGRAPH.length, text.lastIndexOf('```'));
  return block.split('\n').filter((l) => l !== '');
}

/** Import `RESOURCE` into both databases, from a schema before and after */
function both(before: Partial<CloudFormationRegistryResource>, after: Partial<CloudFormationRegistryResource>) {
  importRegistry(base, before);
  importRegistry(head, after);
}

/** Import `RESOURCE` from the legacy resource specification, with one string property `Name` */
function legacyName(target: SpecDatabase, updateType: resourcespec.Property['UpdateType']) {
  importLegacySpec(target, { properties: { Name: { PrimitiveType: 'String', UpdateType: updateType } }, types: {} });
}

function addMetric(db: SpecDatabase, name: string, on: { resource?: string; service?: string }) {
  const metric = db.allocate('metric', {
    namespace: 'AWS/Some',
    name,
    statistic: 'Average',
    previousStatistics: [],
    dedupKey: name,
  });
  if (on.resource) {
    db.link('resourceHasMetric', db.lookup('resource', 'cloudFormationType', 'equals', on.resource).only(), metric);
  }
  if (on.service) {
    db.link('serviceHasMetric', db.lookup('service', 'name', 'equals', on.service).only(), metric);
  }
}

describe('removals', () => {
  test('a removed property is listed with its type', () => {
    both({ properties: { Name: str(), StatusInfos: str() } }, { properties: { Name: str() } });

    expect(rows()).toEqual([`${SERVICE} | ${RESOURCE} | [-] StatusInfos: string | Property removed`]);
    expect(changelogLines()).toEqual([`${SERVICE}: ${RESOURCE}: StatusInfos property removed.`]);
  });

  test('a removed attribute is listed', () => {
    both(
      { properties: { Name: str(), Arn: str() }, readOnlyProperties: ['/properties/Arn'] },
      { properties: { Name: str() } },
    );

    expect(rows()).toEqual([`${SERVICE} | ${RESOURCE} | [-] Arn: string | Attribute removed`]);
    expect(changelogLines()).toEqual([`${SERVICE}: ${RESOURCE}: Arn attribute removed.`]);
  });

  test('a removed type definition is listed, next to the removal of the property that used it', () => {
    both(
      { properties: { Name: str(), Settings: ref('Settings') }, definitions: { Settings: object({ Url: str() }) } },
      { properties: { Name: str() } },
    );

    expect(rows()).toEqual([
      `${SERVICE} | ${RESOURCE} | [-] Settings: Settings | Property removed`,
      `${SERVICE} | ${RESOURCE} | [-] type Settings | Type removed`,
    ]);
    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: Settings property removed.  `,
      `${SERVICE}: ${RESOURCE}: Settings type removed.`,
    ]);
  });

  test('a removed field of a type definition is listed by type and field', () => {
    both(
      { properties: { Settings: ref('Settings') }, definitions: { Settings: object({ Url: str(), Port: str() }) } },
      { properties: { Settings: ref('Settings') }, definitions: { Settings: object({ Url: str() }) } },
    );

    expect(rows()).toEqual([`${SERVICE} | ${RESOURCE} | [-] Settings.Port: string | Property removed`]);
    expect(changelogLines()).toEqual([`${SERVICE}: ${RESOURCE}: Settings.Port property removed.`]);
  });

  test('each removed metric of a resource or a service is listed on its own line', () => {
    both({ properties: { Name: str() } }, { properties: { Name: str() } });
    for (const name of ['Errors', 'Throttles', 'Invocations']) {
      addMetric(base, name, { resource: RESOURCE });
    }
    addMetric(head, 'Invocations', { resource: RESOURCE });
    addMetric(base, 'Requests', { service: SERVICE });

    expect(rows()).toEqual([
      `${SERVICE} | AWS::Some | [-] metric AWS/Some Requests | Metric removed`,
      `${SERVICE} | ${RESOURCE} | [-] metric AWS/Some Errors | Metric removed`,
      `${SERVICE} | ${RESOURCE} | [-] metric AWS/Some Throttles | Metric removed`,
    ]);
    expect(changelogLines()).toEqual([
      `${SERVICE}: AWS::Some: AWS/Some Requests metric removed.  `,
      `${SERVICE}: ${RESOURCE}: AWS/Some Errors metric removed.  `,
      `${SERVICE}: ${RESOURCE}: AWS/Some Throttles metric removed.`,
    ]);
  });

  test('a removed resource is one line, not one per property', () => {
    importRegistry(base, { properties: { Name: str(), Other: str() } }, 'AWS::Some::Gone');
    importRegistry(base, { properties: { Name: str() } });
    importRegistry(head, { properties: { Name: str() } });

    expect(rows()).toEqual([`${SERVICE} | AWS::Some::Gone | [-] AWS::Some::Gone | Resource removed`]);
    expect(changelogLines()).toEqual([`${SERVICE}: AWS::Some::Gone: resource removed.`]);
  });
});

describe('restrictions', () => {
  test('a property or a field that becomes required is listed', () => {
    both(
      {
        properties: { InstanceType: str(), Settings: ref('Settings') },
        definitions: { Settings: object({ Url: str() }) },
      },
      {
        properties: { InstanceType: str(), Settings: ref('Settings') },
        definitions: { Settings: object({ Url: str() }, ['Url']) },
        required: ['InstanceType'],
      },
    );

    expect(rows()).toEqual([
      `${SERVICE} | ${RESOURCE} | InstanceType: optional → required | Property changed to required`,
      `${SERVICE} | ${RESOURCE} | Settings.Url: optional → required | Property changed to required`,
    ]);
    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: InstanceType property is now required.  `,
      `${SERVICE}: ${RESOURCE}: Settings.Url property is now required.`,
    ]);
  });

  test('a property or a field that becomes immutable is listed', () => {
    both(
      {
        properties: { BucketName: str(), Settings: ref('Settings') },
        definitions: { Settings: object({ Url: str() }) },
      },
      {
        properties: { BucketName: str(), Settings: ref('Settings') },
        definitions: { Settings: object({ Url: str() }) },
        createOnlyProperties: ['/properties/BucketName', '/properties/Settings/Url'],
      },
    );

    expect(rows()).toEqual([
      `${SERVICE} | ${RESOURCE} | BucketName: mutable → immutable | Property changed to immutable`,
      `${SERVICE} | ${RESOURCE} | Settings.Url: mutable → immutable | Property changed to immutable`,
    ]);
    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: BucketName property is now immutable.  `,
      `${SERVICE}: ${RESOURCE}: Settings.Url property is now immutable.`,
    ]);
  });

  test('a property that conditionally caused replacement and now always does is listed', () => {
    legacyName(base, 'Conditional');
    legacyName(head, 'Immutable');

    expect(rows()).toEqual([`${SERVICE} | ${RESOURCE} | Name: immutable? → immutable | Property changed to immutable`]);
  });

  test('a mutable property that may now cause replacement is not listed: the database does not say when it does', () => {
    legacyName(base, 'Mutable');
    legacyName(head, 'Conditional');

    expect(rows()).toEqual([]);
  });

  test('a changed default value is listed when both databases have one', () => {
    both(
      {
        properties: {
          Mode: { type: 'string', default: 'fast' },
          Count: { type: 'integer', default: 1 },
          Added: { type: 'string' },
          Dropped: { type: 'string', default: 'x' },
        },
      },
      {
        properties: {
          Mode: { type: 'string', default: 'safe' },
          Count: { type: 'integer', default: 1 },
          Added: { type: 'string', default: 'y' },
          Dropped: { type: 'string' },
        },
      },
    );

    expect(rows()).toEqual([
      `${SERVICE} | ${RESOURCE} | Mode: default="fast" → default="safe" | Default value changed`,
    ]);
    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: Mode property default value changed from "fast" to "safe".`,
    ]);
  });

  test('a changed default value of a field is listed', () => {
    both(
      {
        properties: { Settings: ref('Settings') },
        definitions: { Settings: object({ Port: { type: 'integer', default: 80 } }) },
      },
      {
        properties: { Settings: ref('Settings') },
        definitions: { Settings: object({ Port: { type: 'integer', default: 443 } }) },
      },
    );

    expect(rows()).toEqual([
      `${SERVICE} | ${RESOURCE} | Settings.Port: default=80 → default=443 | Default value changed`,
    ]);
  });

  test('each allowed value that is removed is listed on its own line', () => {
    both(
      { properties: { Mode: { type: 'string', enum: ['A', 'B', 'C', 'D'] } } },
      { properties: { Mode: { type: 'string', enum: ['B', 'A', 'E'] } } },
    );

    expect(rows()).toEqual([
      `${SERVICE} | ${RESOURCE} | Mode: [-] allowed value "C" | Allowed value removed`,
      `${SERVICE} | ${RESOURCE} | Mode: [-] allowed value "D" | Allowed value removed`,
    ]);
    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: Mode property no longer allows "C".  `,
      `${SERVICE}: ${RESOURCE}: Mode property no longer allows "D".`,
    ]);
  });

  test('allowed values where there were none are listed, also inside a list and on a field', () => {
    both(
      {
        properties: { Mode: str(), Sizes: { type: 'array', items: { type: 'integer' } }, Settings: ref('Settings') },
        definitions: { Settings: object({ Kind: str() }) },
      },
      {
        properties: {
          Mode: { type: 'string', enum: ['A', 'B'] },
          Sizes: { type: 'array', items: { type: 'integer', enum: [1, 2] } },
          Settings: ref('Settings'),
        },
        definitions: { Settings: object({ Kind: { type: 'string', enum: ['X'] } }) },
      },
    );

    expect(rows()).toEqual([
      `${SERVICE} | ${RESOURCE} | Mode: allowed values restricted to "A", "B" | Allowed values restricted`,
      `${SERVICE} | ${RESOURCE} | Settings.Kind: allowed values restricted to "X" | Allowed values restricted`,
      `${SERVICE} | ${RESOURCE} | Sizes: allowed values restricted to 1, 2 | Allowed values restricted`,
    ]);
    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: Mode property now only allows "A", "B".  `,
      `${SERVICE}: ${RESOURCE}: Settings.Kind property now only allows "X".  `,
      `${SERVICE}: ${RESOURCE}: Sizes property now only allows 1, 2.`,
    ]);
  });

  test('an allowed value removed from a member of a type union is listed', () => {
    both(
      {
        properties: { Mode: { anyOf: [{ type: 'string', enum: ['A', 'B'] }, ref('Settings')] } },
        definitions: { Settings: object({ Url: str() }) },
      },
      {
        properties: { Mode: { anyOf: [{ type: 'string', enum: ['A'] }, ref('Settings')] } },
        definitions: { Settings: object({ Url: str() }) },
      },
    );

    expect(rows()).toEqual([`${SERVICE} | ${RESOURCE} | Mode: [-] allowed value "B" | Allowed value removed`]);
  });
});

describe('CDK code breaks', () => {
  test('a struct rename and a merge are listed, and the renamed type is not also listed as removed', () => {
    both(
      {
        properties: { Destinations: { type: 'array', items: ref('DestinationRequest') }, Settings: ref('Settings') },
        definitions: {
          DestinationRequest: object({ StreamName: str() }),
          Settings: object({ Burn: ref('BurnSettings'), Dvb: ref('DvbSettings') }),
          BurnSettings: object({ Font: str() }),
          DvbSettings: object({ Font: str() }),
        },
      },
      {
        properties: { Destinations: { type: 'array', items: ref('Destination') }, Settings: ref('Settings') },
        definitions: {
          Destination: object({ StreamName: str() }),
          Settings: object({ Burn: ref('BurnDvbSettings'), Dvb: ref('BurnDvbSettings') }),
          BurnDvbSettings: object({ Font: str() }),
        },
      },
    );

    expect(rows()).toEqual([
      `${SERVICE} | ${RESOURCE} | BurnSettings → BurnDvbSettings | CDK type merged`,
      `${SERVICE} | ${RESOURCE} | DestinationRequest → Destination | CDK type renamed`,
      `${SERVICE} | ${RESOURCE} | DvbSettings → BurnDvbSettings | CDK type merged`,
    ]);
    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: BurnSettings type merged into BurnDvbSettings.  `,
      `${SERVICE}: ${RESOURCE}: DestinationRequest type renamed to Destination.  `,
      `${SERVICE}: ${RESOURCE}: DvbSettings type merged into BurnDvbSettings.`,
    ]);
  });

  test('a rendered type that changed is listed, for properties, fields and attributes', () => {
    both(
      {
        properties: { Policy: {}, Settings: ref('Settings'), CreateTime: { type: 'number' } },
        definitions: { Settings: object({ Type: {} }) },
        readOnlyProperties: ['/properties/CreateTime'],
      },
      {
        properties: { Policy: str(), Settings: ref('Settings'), CreateTime: str() },
        definitions: { Settings: object({ Type: str() }) },
        readOnlyProperties: ['/properties/CreateTime'],
      },
    );

    expect(rows()).toEqual([
      `${SERVICE} | ${RESOURCE} | CreateTime: number → string | CDK type changed`,
      `${SERVICE} | ${RESOURCE} | Policy: json → string | CDK type changed`,
      `${SERVICE} | ${RESOURCE} | Settings.Type: json → string | CDK type changed`,
    ]);
    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: CreateTime attribute type changed from number to string.  `,
      `${SERVICE}: ${RESOURCE}: Policy property type changed from json to string.  `,
      `${SERVICE}: ${RESOURCE}: Settings.Type property type changed from json to string.`,
    ]);
  });

  test('a rendered type that is widened is not listed', () => {
    both(
      {
        properties: {
          ToJson: str(),
          ToUnion: { type: 'array', items: { type: 'string' } },
          ToWiderUnion: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'boolean' }] },
        },
      },
      {
        properties: {
          ToJson: {},
          ToUnion: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'boolean' }] } },
          ToWiderUnion: {
            anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'boolean' }, { type: 'number' }],
          },
        },
      },
    );

    expect(compareL1(base, head).other.map((c) => `${c.element}: ${c.description}`)).toEqual([
      'property ToJson: type changed from string to json',
      'property ToUnion: type changed from Array<string> to Array<boolean | string>',
      'property ToWiderUnion: type changed from Array<string> | boolean to Array<string> | boolean | number',
    ]);
    expect(rows()).toEqual([]);
  });

  test('a rendered type union that loses a member is listed', () => {
    both(
      { properties: { Value: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'boolean' }] } } },
      { properties: { Value: { type: 'array', items: { type: 'string' } } } },
    );

    expect(rows()).toEqual([
      `${SERVICE} | ${RESOURCE} | Value: Array<string> | boolean → Array<string> | CDK type changed`,
    ]);
  });
});

describe('never listed', () => {
  test('additions of any kind, and everything in a new resource', () => {
    both(
      { properties: { Name: str(), Settings: ref('Settings') }, definitions: { Settings: object({ Url: str() }) } },
      {
        properties: {
          Name: str(),
          Settings: ref('Settings'),
          NewRequired: str(),
          NewImmutable: str(),
          Extra: ref('Extra'),
          Arn: str(),
        },
        definitions: { Settings: object({ Url: str(), Port: str() }, ['Port']), Extra: object({ Id: str() }, ['Id']) },
        required: ['NewRequired'],
        createOnlyProperties: ['/properties/NewImmutable'],
        readOnlyProperties: ['/properties/Arn'],
      },
    );
    importRegistry(
      head,
      { properties: { Name: { type: 'string', enum: ['A'] } }, required: ['Name'] },
      'AWS::Some::New',
    );
    importRegistry(head, { properties: { Name: str() } }, 'AWS::Other::New');
    addMetric(head, 'Errors', { resource: RESOURCE });

    expect(rows()).toEqual([]);
  });

  test('relaxations, deprecations and documentation changes', () => {
    both(
      {
        properties: {
          Name: { type: 'string', description: 'old words' },
          Mode: { type: 'string', enum: ['A'] },
          Kind: { type: 'string', enum: ['A'] },
          Id: str(),
          Old: str(),
        },
        required: ['Name'],
        createOnlyProperties: ['/properties/Id'],
      },
      {
        properties: {
          Name: { type: 'string', description: 'new words' },
          Mode: { type: 'string', enum: ['A', 'B'] },
          Kind: str(),
          Id: str(),
          Old: str(),
        },
      },
    );
    head.lookup('resource', 'cloudFormationType', 'equals', RESOURCE).only().properties.Old.deprecated =
      Deprecation.WARN;

    expect(rows()).toEqual([]);
  });
});

describe('non-standard service prefixes', () => {
  const SECTION = [
    '### Non-Standard Service Prefixes Detected',
    '',
    '| Detected Service | Expected Service | CloudFormation Namespace |',
    '|------------------|------------------|--------------------------|',
  ].join('\n');

  test('a new service is listed with the expected name and its namespace', () => {
    importRegistry(head, { properties: { Name: str() } }, 'Dev::ServiceCatalog::Portfolio');

    expect(findBreakingChanges(base, head).nonStandardServices).toEqual([
      { service: 'dev-servicecatalog', expected: 'aws-servicecatalog', namespace: 'Dev::ServiceCatalog' },
    ]);
  });

  test('an existing service is listed only when it has a breaking change', () => {
    importRegistry(base, { properties: { Name: str(), Old: str() } }, 'Alexa::ASK::Skill');
    importRegistry(head, { properties: { Name: str() } }, 'Alexa::ASK::Skill');
    importRegistry(base, { properties: { Name: str() } }, 'Beta::Lambda::Function');
    importRegistry(head, { properties: { Name: str(), New: str() } }, 'Beta::Lambda::Function');

    const report = findBreakingChanges(base, head);
    expect(report.nonStandardServices).toEqual([
      { service: 'alexa-ask', expected: 'aws-ask', namespace: 'Alexa::ASK' },
    ]);
    expect(formatBreakingChanges(report)).toContain(
      [
        SECTION,
        '| alexa-ask | aws-ask | Alexa::ASK |',
        '',
        '**Action Required:** These services have non-standard prefixes that may indicate an error in the CloudFormation resource specification. Please verify these are intentional before merging.',
      ].join('\n'),
    );
  });

  test('services that start with aws- are not listed, and the section is left out', () => {
    importRegistry(head, { properties: { Name: str() } }, 'AWS::New::Thing');

    const report = findBreakingChanges(base, head);
    expect(report.nonStandardServices).toEqual([]);
    expect(formatBreakingChanges(report)).not.toContain('Non-Standard');
  });
});

describe('output', () => {
  test('with no breaking change, the output is the empty table and the changelog block', () => {
    both({ properties: { Name: str() } }, { properties: { Name: str(), Extra: str() } });

    expect(formatBreakingChanges(findBreakingChanges(base, head))).toEqual(
      [
        '### Breaking Changes Analysis',
        '| Service | Resource | Change | Explanation |',
        '|---------|----------|--------|-------------|',
        '',
        'No breaking changes found.',
        '',
        '### Changelog Entry',
        '**Copy the text below for your L1 PR:**',
        '',
        '```',
        CHANGELOG_PARAGRAPH,
        '',
        'No breaking changes detected in this release.',
        '```',
      ].join('\n'),
    );
  });

  test('a new service with a non-standard prefix and no breaking change prints the three sections', () => {
    importRegistry(head, { properties: { Name: str() } }, 'Dev::ServiceCatalog::Portfolio');

    expect(formatBreakingChanges(findBreakingChanges(base, head))).toEqual(
      [
        '### Breaking Changes Analysis',
        '| Service | Resource | Change | Explanation |',
        '|---------|----------|--------|-------------|',
        '',
        'No breaking changes found.',
        '',
        '### Non-Standard Service Prefixes Detected',
        '',
        '| Detected Service | Expected Service | CloudFormation Namespace |',
        '|------------------|------------------|--------------------------|',
        '| dev-servicecatalog | aws-servicecatalog | Dev::ServiceCatalog |',
        '',
        '**Action Required:** These services have non-standard prefixes that may indicate an error in the CloudFormation resource specification. Please verify these are intentional before merging.',
        '',
        '### Changelog Entry',
        '**Copy the text below for your L1 PR:**',
        '',
        '```',
        CHANGELOG_PARAGRAPH,
        '',
        'No breaking changes detected in this release.',
        '```',
      ].join('\n'),
    );
  });

  test("the prompt's example changes print as its example, ordered by service", () => {
    importRegistry(base, { properties: { StatusInfos: str(), Name: str() } }, 'AWS::RDS::DBInstance');
    importRegistry(head, { properties: { Name: str() } }, 'AWS::RDS::DBInstance');
    importRegistry(base, { properties: { InstanceType: str() } }, 'AWS::EC2::Instance');
    importRegistry(head, { properties: { InstanceType: str() }, required: ['InstanceType'] }, 'AWS::EC2::Instance');
    importRegistry(base, { properties: { BucketName: str() } }, 'AWS::S3::Bucket');
    importRegistry(
      head,
      { properties: { BucketName: str() }, createOnlyProperties: ['/properties/BucketName'] },
      'AWS::S3::Bucket',
    );

    expect(formatBreakingChanges(findBreakingChanges(base, head))).toEqual(
      [
        '### Breaking Changes Analysis',
        '| Service | Resource | Change | Explanation |',
        '|---------|----------|--------|-------------|',
        '| aws-ec2 | AWS::EC2::Instance | `InstanceType: optional → required` | Property changed to required |',
        '| aws-rds | AWS::RDS::DBInstance | `[-] StatusInfos: string` | Property removed |',
        '| aws-s3 | AWS::S3::Bucket | `BucketName: mutable → immutable` | Property changed to immutable |',
        '',
        '### Changelog Entry',
        '**Copy the text below for your L1 PR:**',
        '',
        '```',
        CHANGELOG_PARAGRAPH,
        '',
        'aws-ec2: AWS::EC2::Instance: InstanceType property is now required.  ',
        'aws-rds: AWS::RDS::DBInstance: StatusInfos property removed.  ',
        'aws-s3: AWS::S3::Bucket: BucketName property is now immutable.',
        '```',
      ].join('\n'),
    );
  });

  test('the changelog block starts with the line that aws-cdk release tooling reads as the L1 changes note', () => {
    both({ properties: { Name: str(), Old: str() } }, { properties: { Name: str() } });
    const lines = formatBreakingChanges(findBreakingChanges(base, head)).split('\n');
    const fence = lines.indexOf('```');

    expect(lines.slice(fence + 1)).toEqual([
      CHANGELOG_PARAGRAPH,
      '',
      `${SERVICE}: ${RESOURCE}: Old property removed.`,
      '```',
    ]);
    expect(RELEASE_NOTE_LINE.exec(lines[fence + 1])?.[1]).toEqual('CHANGES TO L1 RESOURCES');
  });

  test('a vertical bar in a table cell is escaped, and not in the changelog', () => {
    both(
      { properties: { Mode: { type: 'string', enum: ['a|b', 'c'] } } },
      { properties: { Mode: { type: 'string', enum: ['c'] } } },
    );
    const text = formatBreakingChanges(findBreakingChanges(base, head));

    expect(text).toContain('| `Mode: [-] allowed value "a\\|b"` | Allowed value removed |');
    expect(text).toContain(`${SERVICE}: ${RESOURCE}: Mode property no longer allows "a|b".`);
  });

  test('changes are ordered by service, resource, kind and name, whatever order the databases have', () => {
    const schemas: Array<[string, Partial<CloudFormationRegistryResource>, Partial<CloudFormationRegistryResource>]> = [
      ['AWS::Zeta::Thing', { properties: { B: str(), A: str() } }, { properties: {} }],
      [
        'AWS::Alpha::Thing',
        { properties: { Z: str(), Y: str(), X: str() } },
        { properties: { Z: str(), Y: str() }, required: ['Z', 'Y'], createOnlyProperties: ['/properties/Y'] },
      ],
      ['AWS::Alpha::Bee', { properties: { Q: str(), P: str() } }, { properties: {} }],
    ];
    const build = (order: number[]) => {
      const [b, h] = [emptyDatabase(), emptyDatabase()];
      for (const i of order) {
        importRegistry(b, schemas[i][1], schemas[i][0]);
      }
      for (const i of [...order].reverse()) {
        importRegistry(h, schemas[i][2], schemas[i][0]);
      }
      return formatBreakingChanges(findBreakingChanges(b, h));
    };

    const text = build([0, 1, 2]);
    expect(build([2, 1, 0])).toEqual(text);
    expect(build([1, 0, 2])).toEqual(text);
    expect(text.split('\n').filter((l) => l.startsWith('| aws-'))).toEqual([
      '| aws-alpha | AWS::Alpha::Bee | `[-] P: string` | Property removed |',
      '| aws-alpha | AWS::Alpha::Bee | `[-] Q: string` | Property removed |',
      '| aws-alpha | AWS::Alpha::Thing | `[-] X: string` | Property removed |',
      '| aws-alpha | AWS::Alpha::Thing | `Y: optional → required` | Property changed to required |',
      '| aws-alpha | AWS::Alpha::Thing | `Z: optional → required` | Property changed to required |',
      '| aws-alpha | AWS::Alpha::Thing | `Y: mutable → immutable` | Property changed to immutable |',
      '| aws-zeta | AWS::Zeta::Thing | `[-] A: string` | Property removed |',
      '| aws-zeta | AWS::Zeta::Thing | `[-] B: string` | Property removed |',
    ]);
  });
});

describe('diff-db', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'breaking-changes-'));
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Run the diff-db command line from its source with `args` and the databases `dbs` */
  function diffDb(args: string[], dbs = [base, head]) {
    const files = dbs.map((db, i) => {
      const file = path.join(dir, `db${i}.json`);
      fs.writeFileSync(file, JSON.stringify(db.save()));
      return file;
    });
    const cli = path.join(__dirname, '../src/cli/diff-db.ts');
    return spawnSync(
      process.execPath,
      [require.resolve('ts-node/dist/bin.js'), '--transpile-only', cli, ...args, ...files],
      {
        encoding: 'utf-8',
        timeout: 60_000,
      },
    );
  }

  beforeEach(() => {
    both(
      {
        properties: { Destinations: { type: 'array', items: ref('DestinationRequest') }, Old: str() },
        definitions: { DestinationRequest: object({ StreamName: str() }) },
      },
      {
        properties: { Destinations: { type: 'array', items: ref('Destination') } },
        definitions: { Destination: object({ StreamName: str() }) },
      },
    );
  });

  test('--l1-changes alone prints the L1 change report and nothing else', () => {
    const result = diffDb(['--l1-changes']);

    expect(result.stdout).toEqual(`${formatL1Changes(compareL1(base, head))}\n`);
    expect(result.status).toBe(0);
  });

  test('--breaking-changes alone prints the analysis', () => {
    const result = diffDb(['--breaking-changes']);

    expect(result.stdout).toEqual(`${formatBreakingChanges(findBreakingChanges(base, head))}\n`);
    expect(result.stdout).toContain('`[-] Old: string`');
    expect(result.status).toBe(0);
  });

  test('both options print the L1 change report with the analysis at the end', () => {
    const result = diffDb(['--l1-changes', '--breaking-changes']);

    expect(result.stdout).toEqual(
      `${formatL1Changes(compareL1(base, head))}\n\n${formatBreakingChanges(findBreakingChanges(base, head))}\n`,
    );
    expect(result.status).toBe(0);
  });

  test('with --json, --l1-changes alone prints the L1 changes and --breaking-changes the analysis', () => {
    expect(JSON.parse(diffDb(['--l1-changes', '--json']).stdout)).toEqual(
      JSON.parse(JSON.stringify(compareL1(base, head))),
    );
    expect(JSON.parse(diffDb(['--breaking-changes', '--json']).stdout)).toEqual(findBreakingChanges(base, head));
  });

  test('each option needs two databases', () => {
    const breaking = diffDb(['--breaking-changes'], [base]);
    const l1 = diffDb(['--l1-changes', '--breaking-changes'], [base]);

    expect(breaking.stderr).toContain('--breaking-changes needs two databases: the base database and the new database');
    expect(breaking.status).not.toBe(0);
    expect(l1.stderr).toContain('--l1-changes needs two databases: the base database and the new database');
    expect(l1.status).not.toBe(0);
  });
});
