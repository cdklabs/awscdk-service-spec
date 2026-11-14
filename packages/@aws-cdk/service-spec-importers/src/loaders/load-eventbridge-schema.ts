import * as path from 'path';
import * as util from 'util';
import { isSuccess, Result } from '@cdklabs/tskb';
import * as _glob from 'glob';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { ProblemReport, ReportAudience } from '../report';
import { EventBridgeSchema } from '../types';

const glob = util.promisify(_glob.glob);

// These schemas are duplicated: a legacy version without dashes and a newer version with dashes.
// e.g. old: aws.ec2@EBSMultiVolumeSnapshotsCompletionStatus.json
//      new: aws.ec2@EBSMulti-VolumeSnapshotsCompletionStatus.json
// Only the new (dashed) version receives updates, so we exclude the old ones.
const EXCLUDED_FILES = [
  'aws.ec2@EBSMultiVolumeSnapshotsCompletionStatus.json',
  'aws.securityhub@SecurityHubFindingsCustomAction.json',
  'aws.securityhub@SecurityHubFindingsImported.json',
  'aws.xray@AWSXRayInsightUpdate.json',
  'aws.autoscaling@EC2InstanceLaunchLifecycleAction.json',
  'aws.autoscaling@EC2InstanceTerminateLifecycleAction.json',
  'aws.codedeploy@CodeDeployDeploymentStateChangeNotification.json',
  'aws.codedeploy@CodeDeployInstanceStateChangeNotification.json',
  'aws.ec2@EC2FastLaunchStateChangeNotification.json',
  'aws.ec2@EC2InstanceStateChangeNotification.json',
];

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

    const files = (await glob(path.join(directory, '*.json'))).filter(
      (file) => !EXCLUDED_FILES.includes(path.basename(file)),
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
