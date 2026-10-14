import * as path from 'path';
import * as util from 'util';
import { isSuccess, Result } from '@cdklabs/tskb';
import * as _glob from 'glob';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { ProblemReport, ReportAudience } from '../report';
import { EventBridgeSchema } from '../types';

const glob = util.promisify(_glob.glob);

const EXCLUDED_FILES = [
  // Legacy duplicates: each of these has a newer hyphenated version that receives
  // updates (e.g. aws.ec2@EBSMulti-VolumeSnapshotsCompletionStatus.json), so we
  // exclude the stale undashed copy.
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

  // Unknown problems: these trigger failures in the downstream aws-cdk codegen /
  // awslint build (TS/jsii compile errors, namespace collisions, and an aggregate
  // awslint stack overflow). Root causes are not fully understood/resolved upstream;
  // excluding them keeps the generated event types building. See PR discussion.
  'aws.kinesis@AWSAPICallviaCloudTrail.json',
  'aws.rekognition@AWSAPICallviaCloudTrail.json',
  'aws.iot@AWSAPICallviaCloudTrail.json',
  'aws.iot@AWSConsoleActionviaCloudTrail.json',
  'aws.iot@AWSConsoleSignInviaCloudTrail.json',
  'aws.iot@AWSInsightviaCloudTrail.json',
  'aws.iot@AWSNetworkActivityEventviaCloudTrail.json',
  'aws.iot@AWSServiceEventviaCloudTrail.json',
  'aws.iot@AWSMcpEventviaCloudTrail.json',
  'aws.directconnect@AWSAPICallviaCloudTrail.json',
  'aws.ec2@EBSFailoverNotification.json',
  'aws.amplifyuibuilder@AWSAPICallviaCloudTrail.json',
  'aws.iottwinmaker@AWSAPICallviaCloudTrail.json',
  'aws.rdsdata@AWSAPICallviaCloudTrail.json',
  'aws.rdsdataapi@AWSAPICallviaCloudTrail.json',
  'aws.wafv2@AWSAPICallviaCloudTrail.json',
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
