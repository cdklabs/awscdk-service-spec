import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';
import path from 'path';
import { JobPermission } from 'projen/lib/github/workflows-model';

export interface AwsCdkIntegrationTestOptions {
  readonly workflowRunsOn: string[];
  readonly serviceSpec: yarn.TypeScriptWorkspace;
  readonly serviceSpecTypes: yarn.TypeScriptWorkspace;
}

export class AwsCdkIntegrationTest extends pj.Component {
  public constructor(root: yarn.Monorepo, options: AwsCdkIntegrationTestOptions) {
    super(root);

    const workflow = new pj.github.GithubWorkflow(root.github!, 'test-aws-cdk-integration');

    workflow.on({
      workflowDispatch: {},
      pullRequest: {},
      mergeGroup: {
        branches: ['main'],
      },
    });

    const runsOn = options.workflowRunsOn;
    const awsCdkRepo = 'aws/aws-cdk';
    const awsCdkPath = 'aws-cdk';
    const candidateSpec = 'aws-cdk-lib-candidate';
    const candidateSpecJobName = 'test-with-new-codegen';

    workflow.addJob(candidateSpecJobName, {
      runsOn,
      env: {
        ...awsCdkLibEnv(),
      },
      permissions: {
        contents: pj.github.workflows.JobPermission.READ,
      },
      steps: [
        {
          name: `Checkout ${root.name}`,
          uses: 'actions/checkout@v3',
          with: {
            path: root.name,
            ref: '${{ github.event.pull_request.head.ref }}',
            repository: '${{ github.event.pull_request.head.repo.full_name }}',
            lfs: true,
          },
        },
        {
          name: `Build ${root.name}`,
          workingDirectory: root.name,
          run: ['yarn install --frozen-lockfile', 'yarn compile'].join('\n'),
        },
        ...checkoutRepository(awsCdkRepo, awsCdkPath),
        ...linkPackage(options.serviceSpec, awsCdkPath),
        ...linkPackage(options.serviceSpecTypes, awsCdkPath),
        ...useSpec2Cdk(awsCdkPath),
        ...buildAwsCdkLib(awsCdkRepo, awsCdkPath),
        ...uploadSpec(candidateSpec, awsCdkPath),
      ],
    });

    /**
     * @TODO Separate job for now because this it is failing
     * Once it passes, this should be merged with the main job above
     */
    const jsiiDiffIgnore = '.jsiidiffignore';
    const diffIgnoreFile = path.join(
      root.name,
      path.relative(options.serviceSpec.root.outdir, options.serviceSpec.outdir),
      jsiiDiffIgnore,
    );
    options.serviceSpec.addPackageIgnore(jsiiDiffIgnore);

    workflow.addJob('jsii-diff', {
      needs: [candidateSpecJobName],
      runsOn,
      env: {
        ...awsCdkLibEnv(),
      },
      permissions: {
        contents: JobPermission.READ,
      },
      steps: [
        {
          name: `Checkout ${root.name}`,
          uses: 'actions/checkout@v3',
          with: {
            path: root.name,
            ref: '${{ github.event.pull_request.head.ref }}',
            repository: '${{ github.event.pull_request.head.repo.full_name }}',
          },
        },
        ...specFromArtifact(candidateSpec),
        {
          name: `Install jsii-diff`,
          run: 'npm install jsii-diff',
        },
        {
          name: `Compare current and candidate spec`,
          run: `npx jsii-diff --verbose --keys --ignore-file=${diffIgnoreFile} --error-on=non-experimental npm:aws-cdk-lib@latest ${candidateSpec}`,
        },
      ],
    });
  }
}

function awsCdkLibEnv(): Record<string, string> {
  return {
    CI: '1',
    NODE_OPTIONS: '--max-old-space-size=8196',
  };
}

function checkoutRepository(repository: string, path: string): pj.github.workflows.Step[] {
  return [
    {
      name: `Checkout ${repository}`,
      uses: 'actions/checkout@v3',
      with: {
        path,
        repository,
      },
    },
  ];
}

function linkPackage(project: pj.Project, targetPath: string): pj.github.workflows.Step[] {
  const sourcePath = path.join(project.root.name, path.relative(project.root.outdir, project.outdir));
  return [
    {
      name: `Register drop-in ${project.name} replacement`,
      workingDirectory: sourcePath,
      run: 'yarn link',
    },
    {
      name: `Link drop-in ${project.name} replacement`,
      workingDirectory: targetPath,
      run: `yarn link "${project.name}"`,
    },
  ];
}

function useSpec2Cdk(path: string): pj.github.workflows.Step[] {
  return [
    {
      name: `Use spec2cdk`,
      workingDirectory: path,
      run: `echo "export * from '@aws-cdk/spec2cdk';" > packages/aws-cdk-lib/scripts/codegen.ts`,
    },
  ];
}

function buildAwsCdkLib(repository: string, path: string): pj.github.workflows.Step[] {
  return [
    {
      name: `Setup ${repository}`,
      workingDirectory: path,
      run: 'yarn install',
    },
    {
      name: `Build ${repository}`,
      workingDirectory: path,
      run: 'npx lerna run build --no-bail --scope aws-cdk-lib --include-dependencies',
    },
  ];
}

function uploadSpec(artifactName: string, workingDir: string): pj.github.workflows.Step[] {
  return [
    {
      name: `Prepare artifacts`,
      workingDirectory: workingDir,
      run: [
        `jq 'del(.devDependencies)' packages/aws-cdk-lib/package.json > \${{ runner.temp }}/package.json`,
        `cp packages/aws-cdk-lib/.jsii \${{ runner.temp }}/.jsii`,
        `cp packages/aws-cdk-lib/.jsii.gz \${{ runner.temp }}/.jsii.gz`,
      ].join('\n'),
    },
    {
      name: `Upload spec`,
      uses: 'actions/upload-artifact@v3',
      with: {
        name: artifactName,
        'if-no-files-found': 'error',
        path: ['${{ runner.temp }}/package.json', '${{ runner.temp }}/.jsii', '${{ runner.temp }}/.jsii.gz'].join('\n'),
      },
    },
  ];
}

function specFromArtifact(name: string): pj.github.workflows.Step[] {
  return [
    {
      name: `Download ${name}`,
      uses: 'actions/download-artifact@v3',
      with: {
        name: name,
        path: name,
      },
    },
    {
      name: `Prepare dependency closure`,
      workingDirectory: name,
      run: 'npm install',
    },
  ];
}
