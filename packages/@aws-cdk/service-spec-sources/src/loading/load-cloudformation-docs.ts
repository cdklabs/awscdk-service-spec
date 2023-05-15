import * as path from 'path';
import { assertSuccess } from '@cdklabs/tskb';
import { Loader } from './loader';
import { ProblemReport, ReportAudience } from '../report';
import { CloudFormationDocumentation } from '../types';

export async function loadDefaultCloudFormationDocs(
  report: ProblemReport,
  mustValidate = true,
): Promise<CloudFormationDocumentation> {
  const loader = await Loader.fromSchemaFile<CloudFormationDocumentation>('CloudFormationDocumentation.schema.json', {
    mustValidate,
    report: report.forAudience(ReportAudience.cdkTeam()),
  });

  const result = await loader.loadFile(
    path.join(__dirname, '../../../../../sources/CloudFormationDocumentation/CloudFormationDocumentation.json'),
  );
  assertSuccess(result);
  return result.value;
}
