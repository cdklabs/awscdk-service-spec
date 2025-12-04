import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';
import path from 'path';

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
    const candidateSpec = path.join(awsCdkPath, 'packages', 'aws-cdk-lib');
    const candidateSpecJobName = 'test-with-new-codegen';
    const jsiiDiffIgnore = '.jsiidiffignore';
    const diffIgnoreFile = path.join(
      root.name,
      path.relative(options.serviceSpec.root.outdir, options.serviceSpec.outdir),
      jsiiDiffIgnore,
    );

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
        ...buildAwsCdkLib(awsCdkRepo, awsCdkPath),
        // Temporarily disabled, as it regularly prevents legitimate spec imports with intentional breaking changes.
        // Instead, we need to add more purposeful validations like type renames.
        // ...runJsiiDiff(candidateSpec, diffIgnoreFile),
      ],
    });
    void runJsiiDiff, candidateSpec, diffIgnoreFile;
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
      run: 'npx lerna run build --no-bail --scope aws-cdk-lib --scope @aws-cdk/mixins-preview --include-dependencies',
    },
  ];
}

function runJsiiDiff(specPath: string, ignoreFilePath: string): pj.github.workflows.Step[] {
  return [
    {
      name: `Install jsii-diff`,
      run: 'npm install -g jsii-diff',
    },
    {
      name: `Compare current and candidate spec`,
      run: `npx jsii-diff --verbose --keys --ignore-file=${ignoreFilePath} --error-on=non-experimental npm:aws-cdk-lib@latest ${specPath}`,
    },
  ];
}
