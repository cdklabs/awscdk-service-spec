import * as path from 'path';
import * as util from 'util';
import { isSuccess, Result } from '@cdklabs/tskb';
import * as _glob from 'glob';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { ProblemReport, ReportAudience } from '../report';
import { EventBridgeSchema } from '../types';

const glob = util.promisify(_glob.glob);

/**
 * Schemas whose generated aws-cdk code fails the mixins-preview build. Excluded
 * until the aws-cdk code generator handles them:
 * - kinesis: a nested type named `Record` shadows TypeScript's `Record<K, V>`
 *   (`error TS2315: Type 'Record' is not generic`).
 * - rekognition: properties named `getRequestMetadata` are rejected by jsii,
 *   because `getXxx` names conflict with Java getters (`JSII5000`).
 * - iot: an `aws_iot.events` module emits to the same Go package as
 *   `aws_iotevents` (`JSII4010`).
 * - directconnect, ec2 EBSFailoverNotification: properties with the same name
 *   as their declaring interface, e.g. `Connections.connections` (`JSII5019`).
 */
const UNSUPPORTED_SCHEMAS = [
  'aws.kinesis@AWSAPICallviaCloudTrail.json',
  'aws.rekognition@AWSAPICallviaCloudTrail.json',
  'aws.iot@AWSAPICallviaCloudTrail.json',
  'aws.iot@AWSConsoleActionviaCloudTrail.json',
  'aws.iot@AWSConsoleSignInviaCloudTrail.json',
  'aws.iot@AWSInsightviaCloudTrail.json',
  'aws.iot@AWSNetworkActivityEventviaCloudTrail.json',
  'aws.iot@AWSServiceEventviaCloudTrail.json',
  'aws.directconnect@AWSAPICallviaCloudTrail.json',
  'aws.ec2@EBSFailoverNotification.json',
];

/**
 * Drops legacy schema files that have a newer dashed copy in the same directory.
 *
 * Some schemas exist twice: an old file without dashes and a newer file with
 * dashes, for example `aws.ec2@EBSMultiVolumeSnapshotsCompletionStatus.json` and
 * `aws.ec2@EBSMulti-VolumeSnapshotsCompletionStatus.json`. Only the dashed file
 * receives updates. Code generation removes each dash and uppercases the letter
 * after it, so both files become the same class name and generation fails.
 *
 * A file without a dashed copy is kept, so a service that only has the old file
 * keeps its events.
 */
export function withoutLegacyDuplicates(files: string[]): string[] {
  const dashedNames = new Set(
    files
      .map((file) => path.basename(file))
      .filter((name) => name.includes('-'))
      .map(dashesToCamelCase),
  );
  return files.filter((file) => {
    const name = path.basename(file);
    return name.includes('-') || !dashedNames.has(name);
  });
}

// Same conversion the code generator applies to event names:
// 'EC2Instance-launchLifecycleAction' -> 'EC2InstanceLaunchLifecycleAction'.
function dashesToCamelCase(name: string): string {
  return name.replace(/-([a-zA-Z])/g, (_, letter: string) => letter.toUpperCase());
}

export interface EventBridgeSchemas {
  readonly regionName: string;
  readonly events: Array<EventBridgeSchema>;
}

export async function loadDefaultEventBridgeSchema(
  schemaDir: string,
  options: EventBridgeSchemaSourceOptions,
): Promise<EventBridgeSchemas[]> {
  const files = await glob(`${schemaDir}/*`);
  return Promise.all(
    files.map(async (directoryName) => {
      const regionName = path.basename(directoryName);
      const events = await loadEventBridgeSchemaDirectory(schemaDir)(directoryName, options);

      return { regionName, events };
    }),
  );
}

function loadEventBridgeSchemaDirectory(
  baseDir: string,
): (directory: string, options: EventBridgeSchemaSourceOptions) => Promise<EventBridgeSchema[]> {
  return async (directory, options: EventBridgeSchemaSourceOptions) => {
    const loader = await Loader.fromSchemaFile<EventBridgeSchema>('EventBridge.schema.json', {
      mustValidate: options.validate,
      errorRootDirectory: baseDir,
    });

    const files = withoutLegacyDuplicates(await glob(path.join(directory, '*.json'))).filter(
      (file) => !UNSUPPORTED_SCHEMAS.includes(path.basename(file)),
    );
    return loader.loadFiles(files, problemReportCombiner(options.report, options.failureAudience));
  };
}

export interface EventBridgeSchemas {
  readonly regionName: string;
  readonly events: Array<EventBridgeSchema>;
}

interface EventBridgeSchemaSourceOptions extends LoadSourceOptions {
  readonly report: ProblemReport;
  readonly failureAudience: ReportAudience;
  // FIX: ReportAudience directing to cloudformation
}

function problemReportCombiner(report: ProblemReport, failureAudience: ReportAudience) {
  return (results: Result<LoadResult<EventBridgeSchema>>[]): EventBridgeSchema[] => {
    for (const r of results) {
      if (isSuccess(r)) {
        // const audience = ReportAudience.fromCloudFormationResource(r.value.typeName);
        // report.reportFailure(audience, 'loading', ...r.warnings);
      } else {
        report.reportFailure(failureAudience, 'loading', r);
      }
    }

    return results.filter(isSuccess).map((r) => r.value);
  };
}
