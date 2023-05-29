import { forResource, registerServicePatches, renameDefinition } from './core';
import { Reason } from '../../patching';

registerServicePatches(
  forResource('AWS::Batch::JobDefinition', (lens) => {
    const reason = Reason.upstreamTypeNameChange();

    renameDefinition('EksEmptyDir', 'EmptyDir', reason)(lens);
    renameDefinition('EksHostPath', 'HostPath', reason)(lens);
    renameDefinition('EksContainerResourceRequirements', 'Resources', reason)(lens);
    renameDefinition('EksContainerSecurityContext', 'SecurityContext', reason)(lens);
  }),
);
