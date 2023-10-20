import * as path from 'path';
import * as util from 'util';
import { isSuccess, Result } from '@cdklabs/tskb';
import * as _glob from 'glob';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { patchCloudFormationRegistry } from '../patches/registry-patches';
import { ProblemReport, ReportAudience } from '../report';
import { CloudFormationRegistryResource } from '../types';

const glob = util.promisify(_glob.glob);

export async function loadCloudFormationRegistryDirectory(
  directory: string,
  report: ProblemReport,
  mustValidate = true,
  errorRootDirectory?: string,
): Promise<CloudFormationRegistryResource[]> {
  const loader = await Loader.fromSchemaFile<CloudFormationRegistryResource>(
    'CloudFormationRegistryResource.schema.json',
    {
      mustValidate,
      patcher: patchCloudFormationRegistry,
      errorRootDirectory,
    },
  );

  const files = await glob(path.join(directory, '*.json'));
  return loader.loadFiles(files, problemReportCombiner(report));
}

export interface CloudFormationRegistryResources {
  readonly regionName: string;
  readonly resources: Array<CloudFormationRegistryResource>;
}

export async function loadDefaultCloudFormationRegistryResources(
  schemaDir: string,
  report: ProblemReport,
  options: LoadSourceOptions = {},
): Promise<CloudFormationRegistryResources[]> {
  const files = await glob(`${schemaDir}/*`);
  return Promise.all(
    files.map(async (directoryName) => {
      const regionName = path.basename(directoryName);
      const resources = await loadCloudFormationRegistryDirectory(directoryName, report, options.validate, schemaDir);

      return { regionName, resources };
    }),
  );
}

function problemReportCombiner(report: ProblemReport) {
  return (results: Result<LoadResult<CloudFormationRegistryResource>>[]): CloudFormationRegistryResource[] => {
    for (const r of results) {
      if (isSuccess(r)) {
        const audience = ReportAudience.fromCloudFormationResource(r.value.typeName);
        report.reportFailure(audience, 'loading', ...r.warnings);
        report.reportPatch(audience, ...r.patchesApplied);
      } else {
        report.reportFailure(ReportAudience.cdkTeam(), 'loading', r);
      }
    }

    return results.filter(isSuccess).map((r) => r.value);
  };
}
