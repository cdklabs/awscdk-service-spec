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

/** The paragraph that starts the changelog text, as the prompt for L1 pull requests gives it */
const CHANGELOG_PARAGRAPH =
  '**CHANGES TO L1 RESOURCES:** L1 resources are automatically generated from public CloudFormation Resource Schemas. They are built to closely reflect the real state of CloudFormation. Sometimes these updates can contain changes that are incompatible with previous types, but more accurately reflect reality. In this release we have changed:';

const NO_CHANGES = 'No breaking changes detected in this release.';

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

function changelogLines(): string[] {
  const [paragraph, empty, ...lines] = formatBreakingChanges(findBreakingChanges(base, head)).split('\n');
  expect([paragraph, empty]).toEqual([CHANGELOG_PARAGRAPH, '']);
  return lines;
}

/** Import `RESOURCE` into `base` and `head` */
function both(before: Partial<CloudFormationRegistryResource>, after: Partial<CloudFormationRegistryResource>) {
  importRegistry(base, before);
  importRegistry(head, after);
}

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
  test('a removed property is listed', () => {
    both({ properties: { Name: str(), StatusInfos: str() } }, { properties: { Name: str() } });

    expect(changelogLines()).toEqual([`${SERVICE}: ${RESOURCE}: StatusInfos property removed.`]);
  });

  test('a removed attribute is listed', () => {
    both(
      { properties: { Name: str(), Arn: str() }, readOnlyProperties: ['/properties/Arn'] },
      { properties: { Name: str() } },
    );

    expect(changelogLines()).toEqual([`${SERVICE}: ${RESOURCE}: Arn attribute removed.`]);
  });

  test('a removed property and a removed attribute of the same name and type are two lines', () => {
    importLegacySpec(base, {
      properties: { Name: { PrimitiveType: 'String', UpdateType: 'Mutable' } },
      attributes: { Name: { PrimitiveType: 'String' } },
      types: {},
    });
    importLegacySpec(head, { properties: {}, types: {} });

    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: Name attribute removed.  `,
      `${SERVICE}: ${RESOURCE}: Name property removed.`,
    ]);
  });

  test('a removed type definition is listed, next to the removal of the property that used it', () => {
    both(
      { properties: { Name: str(), Settings: ref('Settings') }, definitions: { Settings: object({ Url: str() }) } },
      { properties: { Name: str() } },
    );

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

    expect(changelogLines()).toEqual([`${SERVICE}: ${RESOURCE}: Settings.Port property removed.`]);
  });

  test('each removed metric of a resource or a service is listed on its own line', () => {
    both({ properties: { Name: str() } }, { properties: { Name: str() } });
    for (const name of ['Errors', 'Throttles', 'Invocations']) {
      addMetric(base, name, { resource: RESOURCE });
    }
    addMetric(head, 'Invocations', { resource: RESOURCE });
    addMetric(base, 'Requests', { service: SERVICE });

    expect(changelogLines()).toEqual([
      `${SERVICE}: AWS::Some: AWS/Some Requests metric removed.  `,
      `${SERVICE}: ${RESOURCE}: AWS/Some Errors metric removed.  `,
      `${SERVICE}: ${RESOURCE}: AWS/Some Throttles metric removed.`,
    ]);
  });

  test('a removed service lists each of its resources and its metrics', () => {
    importRegistry(base, { properties: { Name: str(), Other: str() } }, 'Dev::Thing::Widget');
    importRegistry(base, { properties: { Name: str() } }, 'Dev::Thing::Gadget');
    addMetric(base, 'Requests', { service: 'dev-thing' });
    importRegistry(base, { properties: { Name: str() } });
    importRegistry(head, { properties: { Name: str() } });

    expect(changelogLines()).toEqual([
      'dev-thing: Dev::Thing: AWS/Some Requests metric removed.  ',
      'dev-thing: Dev::Thing::Gadget: resource removed.  ',
      'dev-thing: Dev::Thing::Widget: resource removed.',
    ]);
  });

  test('a removed resource is one line, not one per property', () => {
    importRegistry(base, { properties: { Name: str(), Other: str() } }, 'AWS::Some::Gone');
    importRegistry(base, { properties: { Name: str() } });
    importRegistry(head, { properties: { Name: str() } });

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

    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: BucketName property is now immutable.  `,
      `${SERVICE}: ${RESOURCE}: Settings.Url property is now immutable.`,
    ]);
  });

  test('a property that conditionally caused replacement and now always does is listed', () => {
    legacyName(base, 'Conditional');
    legacyName(head, 'Immutable');

    expect(changelogLines()).toEqual([`${SERVICE}: ${RESOURCE}: Name property is now immutable.`]);
  });

  test('a mutable property that may now cause replacement is listed', () => {
    legacyName(base, 'Mutable');
    legacyName(head, 'Conditional');

    expect(changelogLines()).toEqual([`${SERVICE}: ${RESOURCE}: Name property may now require replacement.`]);
  });

  test('a property that always caused replacement and now only may is not listed', () => {
    legacyName(base, 'Immutable');
    legacyName(head, 'Conditional');

    expect(changelogLines()).toEqual([NO_CHANGES]);
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

    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: Settings.Port property default value changed from 80 to 443.`,
    ]);
  });

  test('each allowed value that is removed is listed on its own line', () => {
    both(
      { properties: { Mode: { type: 'string', enum: ['A', 'B', 'C', 'D'] } } },
      { properties: { Mode: { type: 'string', enum: ['B', 'A', 'E'] } } },
    );

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

    expect(changelogLines()).toEqual([`${SERVICE}: ${RESOURCE}: Mode property no longer allows "B".`]);
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

    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: BurnSettings type merged into BurnDvbSettings.  `,
      `${SERVICE}: ${RESOURCE}: DestinationRequest type renamed to Destination.  `,
      `${SERVICE}: ${RESOURCE}: DvbSettings type merged into BurnDvbSettings.`,
    ]);
  });

  test('the field changes of a renamed struct are listed by the old struct name, next to the rename', () => {
    both(
      {
        properties: { Settings: ref('OldSettings') },
        definitions: {
          OldSettings: object({
            Url: str(),
            Port: str(),
            Mode: { type: 'string', enum: ['A', 'B'] },
            Timeout: { type: 'integer', default: 5 },
            Kind: {},
            Wide: str(),
          }),
        },
      },
      {
        properties: { Settings: ref('NewSettings') },
        definitions: {
          NewSettings: object(
            {
              Url: str(),
              Mode: { type: 'string', enum: ['A'] },
              Timeout: { type: 'integer', default: 10 },
              Kind: str(),
              Wide: {},
            },
            ['Url'],
          ),
        },
        createOnlyProperties: ['/properties/Settings/Url'],
      },
    );

    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: OldSettings.Port property removed.  `,
      `${SERVICE}: ${RESOURCE}: OldSettings.Url property is now required.  `,
      `${SERVICE}: ${RESOURCE}: OldSettings.Url property is now immutable.  `,
      `${SERVICE}: ${RESOURCE}: OldSettings.Timeout property default value changed from 5 to 10.  `,
      `${SERVICE}: ${RESOURCE}: OldSettings.Mode property no longer allows "B".  `,
      `${SERVICE}: ${RESOURCE}: OldSettings type renamed to NewSettings.  `,
      `${SERVICE}: ${RESOURCE}: OldSettings.Kind property type changed from json to string.`,
    ]);
  });

  test('the field changes of each merged struct are listed by its own name', () => {
    both(
      {
        properties: { Settings: ref('Settings') },
        definitions: {
          Settings: object({ Burn: ref('BurnSettings'), Dvb: ref('DvbSettings') }),
          BurnSettings: object({ Font: str(), Size: str() }),
          DvbSettings: object({ Font: str() }),
        },
      },
      {
        properties: { Settings: ref('Settings') },
        definitions: {
          Settings: object({ Burn: ref('BurnDvbSettings'), Dvb: ref('BurnDvbSettings') }),
          BurnDvbSettings: object({ Font: str() }, ['Font']),
        },
      },
    );

    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: BurnSettings.Size property removed.  `,
      `${SERVICE}: ${RESOURCE}: BurnSettings.Font property is now required.  `,
      `${SERVICE}: ${RESOURCE}: DvbSettings.Font property is now required.  `,
      `${SERVICE}: ${RESOURCE}: BurnSettings type merged into BurnDvbSettings.  `,
      `${SERVICE}: ${RESOURCE}: DvbSettings type merged into BurnDvbSettings.`,
    ]);
  });

  test('a property that switches from a struct that is still used lists its field changes by the property', () => {
    both(
      {
        properties: { Source: ref('Endpoint'), Backup: ref('Endpoint') },
        definitions: { Endpoint: object({ Url: str(), Size: str(), Kind: {} }) },
      },
      {
        properties: { Source: ref('Address'), Backup: ref('Endpoint') },
        definitions: {
          Endpoint: object({ Url: str(), Size: str(), Kind: {} }),
          Address: object({ Url: str(), Kind: str() }, ['Url']),
        },
      },
    );

    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: Source.Size property removed.  `,
      `${SERVICE}: ${RESOURCE}: Source.Url property is now required.  `,
      `${SERVICE}: ${RESOURCE}: Endpoint type renamed to Address.  `,
      `${SERVICE}: ${RESOURCE}: Source.Kind property type changed from json to string.`,
    ]);
  });

  test('a struct that is still used and switches at two positions lists its field changes at each', () => {
    both(
      {
        properties: { Source: ref('Endpoint'), Settings: ref('Settings'), Backup: ref('Endpoint') },
        definitions: {
          Endpoint: object({ Url: str(), Size: str() }),
          Settings: object({ Primary: ref('Endpoint') }),
        },
      },
      {
        properties: { Source: ref('Address'), Settings: ref('Settings'), Backup: ref('Endpoint') },
        definitions: {
          Endpoint: object({ Url: str(), Size: str() }),
          Settings: object({ Primary: ref('Address') }),
          Address: object({ Url: str() }),
        },
      },
    );

    expect(compareL1(base, head).renames.map((r) => r.positions)).toEqual([
      ['property Settings.Primary', 'property Source'],
    ]);
    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: Settings.Primary.Size property removed.  `,
      `${SERVICE}: ${RESOURCE}: Source.Size property removed.  `,
      `${SERVICE}: ${RESOURCE}: Endpoint type renamed to Address.`,
    ]);
  });

  test('a change found under the struct name and at a property of the same name is listed once', () => {
    both(
      {
        properties: { Endpoint: ref('Endpoint'), Backup: ref('Endpoint') },
        definitions: { Endpoint: object({ Url: str(), Port: str(), Size: str() }) },
      },
      {
        properties: { Endpoint: ref('Address'), Backup: ref('Endpoint') },
        definitions: { Endpoint: object({ Url: str(), Size: str() }), Address: object({ Url: str() }) },
      },
    );

    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: Endpoint.Port property removed.  `,
      `${SERVICE}: ${RESOURCE}: Endpoint.Size property removed.  `,
      `${SERVICE}: ${RESOURCE}: Endpoint type renamed to Address.`,
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
    expect(changelogLines()).toEqual([NO_CHANGES]);
  });

  test('a rendered type union that loses a member is listed', () => {
    both(
      { properties: { Value: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'boolean' }] } } },
      { properties: { Value: { type: 'array', items: { type: 'string' } } } },
    );

    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: Value property type changed from Array<string> | boolean to Array<string>.`,
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

    expect(changelogLines()).toEqual([NO_CHANGES]);
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

    expect(changelogLines()).toEqual([NO_CHANGES]);
  });
});

describe('output', () => {
  test('the output is the paragraph, an empty line and one line per change, ordered by service', () => {
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
        CHANGELOG_PARAGRAPH,
        '',
        'aws-ec2: AWS::EC2::Instance: InstanceType property is now required.  ',
        'aws-rds: AWS::RDS::DBInstance: StatusInfos property removed.  ',
        'aws-s3: AWS::S3::Bucket: BucketName property is now immutable.',
      ].join('\n'),
    );
  });

  test('with no breaking change, the output is the paragraph, an empty line and the line that says so', () => {
    both({ properties: { Name: str() } }, { properties: { Name: str(), Extra: str() } });

    expect(formatBreakingChanges(findBreakingChanges(base, head))).toEqual(
      [CHANGELOG_PARAGRAPH, '', NO_CHANGES].join('\n'),
    );
  });

  test('no table, heading, copy instruction, code fence or service prefix section is printed', () => {
    importRegistry(base, { properties: { Name: str(), 'Back`tick': str(), Old: str() } }, 'Alexa::ASK::Skill');
    importRegistry(head, { properties: { Name: str() } }, 'Alexa::ASK::Skill');
    importRegistry(head, { properties: { Name: str() } }, 'Dev::ServiceCatalog::Portfolio');
    const text = formatBreakingChanges(findBreakingChanges(base, head));

    expect(text).toEqual(
      [
        CHANGELOG_PARAGRAPH,
        '',
        'alexa-ask: Alexa::ASK::Skill: Back`tick property removed.  ',
        'alexa-ask: Alexa::ASK::Skill: Old property removed.',
      ].join('\n'),
    );
    expect(text).not.toMatch(/^#|^\||^`{3}|Copy the text below|Non-Standard|aws-ask|Action Required/m);
  });

  test('the output starts with the line that aws-cdk release tooling reads as the L1 changes note', () => {
    both({ properties: { Name: str(), Old: str() } }, { properties: { Name: str() } });
    const [first] = formatBreakingChanges(findBreakingChanges(base, head)).split('\n');

    expect(RELEASE_NOTE_LINE.exec(first)?.[1]).toEqual('CHANGES TO L1 RESOURCES');
  });

  test('a vertical bar or a backtick in a name is printed as it is', () => {
    both(
      { properties: { Mode: { type: 'string', enum: ['a|b', 'c'] }, 'Tri```ple': str() } },
      { properties: { Mode: { type: 'string', enum: ['c'] } } },
    );

    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: Tri\`\`\`ple property removed.  `,
      `${SERVICE}: ${RESOURCE}: Mode property no longer allows "a|b".`,
    ]);
  });

  test('a line break in a name stays on one changelog line', () => {
    both(
      { properties: { Name: str(), 'New\nLine': str(), 'Odd\rLine': str(), 'Old\r\nLine': str() } },
      { properties: { Name: str() } },
    );

    expect(changelogLines()).toEqual([
      `${SERVICE}: ${RESOURCE}: New Line property removed.  `,
      `${SERVICE}: ${RESOURCE}: Odd Line property removed.  `,
      `${SERVICE}: ${RESOURCE}: Old Line property removed.`,
    ]);
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
    expect(text.split('\n').slice(2)).toEqual([
      'aws-alpha: AWS::Alpha::Bee: P property removed.  ',
      'aws-alpha: AWS::Alpha::Bee: Q property removed.  ',
      'aws-alpha: AWS::Alpha::Thing: X property removed.  ',
      'aws-alpha: AWS::Alpha::Thing: Y property is now required.  ',
      'aws-alpha: AWS::Alpha::Thing: Z property is now required.  ',
      'aws-alpha: AWS::Alpha::Thing: Y property is now immutable.  ',
      'aws-zeta: AWS::Zeta::Thing: A property removed.  ',
      'aws-zeta: AWS::Zeta::Thing: B property removed.',
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

  /** The changelog text for the databases below, as `--breaking-changes` prints it */
  const CHANGELOG = [
    CHANGELOG_PARAGRAPH,
    '',
    `${SERVICE}: ${RESOURCE}: Old property removed.  `,
    `${SERVICE}: ${RESOURCE}: DestinationRequest type renamed to Destination.`,
  ].join('\n');

  /** The breaking changes for the databases below, as `--json` prints them */
  const CHANGES = [
    { service: SERVICE, resource: RESOURCE, kind: 'removed', element: 'Old', description: 'Old property removed' },
    {
      service: SERVICE,
      resource: RESOURCE,
      kind: 'cdk-type-renamed',
      element: 'DestinationRequest',
      description: 'DestinationRequest type renamed to Destination',
    },
  ];

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
    expect(result.stdout).not.toContain('CHANGES TO L1 RESOURCES');
    expect(result.status).toBe(0);
  });

  test('--breaking-changes alone prints the changelog text and nothing else', () => {
    const result = diffDb(['--breaking-changes']);

    expect(result.stdout).toEqual(`${CHANGELOG}\n`);
    expect(result.status).toBe(0);
  });

  test('both options print the L1 change report, an empty line and the changelog text', () => {
    const result = diffDb(['--l1-changes', '--breaking-changes']);

    expect(result.stdout).toEqual(`${formatL1Changes(compareL1(base, head))}\n\n${CHANGELOG}\n`);
    expect(result.status).toBe(0);
  });

  test('with --json, --l1-changes alone prints the L1 changes and --breaking-changes the list of changes', () => {
    expect(JSON.parse(diffDb(['--l1-changes', '--json']).stdout)).toEqual(
      JSON.parse(JSON.stringify(compareL1(base, head))),
    );
    expect(JSON.parse(diffDb(['--breaking-changes', '--json']).stdout)).toEqual(CHANGES);
  });

  test('with --json, both options print the L1 changes with the list of changes as breakingChanges', () => {
    expect(JSON.parse(diffDb(['--l1-changes', '--breaking-changes', '--json']).stdout)).toEqual({
      ...JSON.parse(JSON.stringify(compareL1(base, head))),
      breakingChanges: CHANGES,
    });
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
