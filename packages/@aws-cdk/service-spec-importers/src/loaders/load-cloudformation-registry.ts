import * as path from 'path';
import * as util from 'util';
import { isSuccess, Result } from '@cdklabs/tskb';
import * as _glob from 'glob';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { patchCloudFormationRegistry } from '../patches/registry-patches';
import { ProblemReport, ReportAudience } from '../report';
import { CloudFormationRegistryResource } from '../types';

const glob = util.promisify(_glob.glob);

interface LoadCloudFormationRegistrySourceOptions extends LoadSourceOptions {
  readonly report: ProblemReport;
  readonly failureAudience: ReportAudience;
}

export function loadCloudFormationRegistryDirectory(
  baseDir: string,
): (directory: string, options: LoadCloudFormationRegistrySourceOptions) => Promise<CloudFormationRegistryResource[]> {
  return async (directory, options) => {
    const loader = await Loader.fromSchemaFile<CloudFormationRegistryResource>(
      'CloudFormationRegistryResource.schema.json',
      {
        mustValidate: options.validate,
        patcher: patchCloudFormationRegistry,
        errorRootDirectory: baseDir,
      },
    );

    const files = await glob(path.join(directory, '*.json'));
    return loader.loadFiles(files, problemReportCombiner(options.report, options.failureAudience));
  };
}

export interface CloudFormationRegistryResources {
  readonly regionName: string;
  readonly resources: Array<CloudFormationRegistryResource>;
}

export async function loadDefaultCloudFormationRegistryResources(
  schemaDir: string,
  options: LoadCloudFormationRegistrySourceOptions,
): Promise<CloudFormationRegistryResources[]> {
  const files = await glob(`${schemaDir}/*`);
  return Promise.all(
    files.map(async (directoryName) => {
      const regionName = path.basename(directoryName);
      const resources = await loadCloudFormationRegistryDirectory(schemaDir)(directoryName, options);

      return { regionName, resources };
    }),
  );
}

function problemReportCombiner(report: ProblemReport, failureAudience: ReportAudience) {
  return (results: Result<LoadResult<CloudFormationRegistryResource>>[]): CloudFormationRegistryResource[] => {
    for (const r of results) {
      if (isSuccess(r)) {
        const audience = ReportAudience.fromCloudFormationResource(r.value.typeName);
        report.reportFailure(audience, 'loading', ...r.warnings);
        report.reportPatch(audience, ...r.patchesApplied);
      } else {
        report.reportFailure(failureAudience, 'loading', r);
      }
    }

    return results.filter(isSuccess).map((r) => r.value);
  };
}
