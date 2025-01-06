import { forResource, registerServicePatches, renameDefinition, replaceExitingDefinitionWithNewOne } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  forResource('AWS::Batch::JobDefinition', (lens) => {
    const reason = patching.Reason.upstreamTypeNameChange();

    renameDefinition('EksEmptyDir', 'EmptyDir', reason)(lens);
    renameDefinition('EksHostPath', 'HostPath', reason)(lens);
    renameDefinition('EksContainerResourceRequirements', 'Resources', reason)(lens);
    renameDefinition('EksContainerSecurityContext', 'SecurityContext', reason)(lens);
    replaceExitingDefinitionWithNewOne('EksPodProperties', 'PodProperties', reason)(lens);
    replaceExitingDefinitionWithNewOne('Volume', 'Volumes', reason)(lens);
    replaceExitingDefinitionWithNewOne('EFSVolumeConfiguration', 'EfsVolumeConfiguration', reason)(lens);

  }),
);
