import * as path from 'path';
import * as util from 'util';
import { isSuccess, Result } from '@cdklabs/tskb';
import * as _glob from 'glob';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { ProblemReport, ReportAudience } from '../report';
import { EventBridgeSchema } from '../types';

const glob = util.promisify(_glob.glob);

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

    const files = await glob(path.join(directory, '*.json'));
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
