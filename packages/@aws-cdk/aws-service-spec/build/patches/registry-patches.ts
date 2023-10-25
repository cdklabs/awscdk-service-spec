import { EXCEPTIONS_PATCHERS } from './service-patches';
import { patching, patches } from '@aws-cdk/service-spec-importers';

/**
 * Patchers that apply to the CloudFormation Registry source files
 */
export const patchCloudFormationRegistry = patching.makeCompositePatcher(
  patches.patchCloudFormationRegistry,
  ...EXCEPTIONS_PATCHERS,
);
