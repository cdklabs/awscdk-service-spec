import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';
import fs from 'fs';
import path from 'path';

/**
 * Node.js version used to build awscdk-service-spec and aws-cdk in the integration test.
 *
 * Pinned rather than `lts/*`, so a new Node.js release cannot change the aws-cdk build under every pull request.
 * Keep it on a version that jsii supports.
 */
const NODE_VERSION = '24';

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
        pj.github.WorkflowSteps.checkout({
          name: `Checkout ${root.name}`,
          with: {
            path: root.name,
            ref: '${{ github.event.pull_request.head.ref }}',
            repository: '${{ github.event.pull_request.head.repo.full_name }}',
            lfs: true,
          },
        }),
        ...withNodeVersion(
          root.renderWorkflowSetup({ installStepConfiguration: { workingDirectory: root.name } }),
          NODE_VERSION,
        ),
        {
          name: `Build ${root.name}`,
          workingDirectory: root.name,
          run: root.runTaskCommand(root.compileTask),
        },
        ...checkoutRepository(awsCdkRepo, awsCdkPath),
        ...checkLegacyTaggables(root, awsCdkPath),
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

function withNodeVersion(steps: pj.github.workflows.JobStep[], nodeVersion: string): pj.github.workflows.JobStep[] {
  const setupNode = steps.filter((step) => step.uses?.startsWith('actions/setup-node@'));
  if (setupNode.length !== 1) {
    throw new Error(`Expected exactly one actions/setup-node step in the workflow setup, found ${setupNode.length}`);
  }
  return steps.map((step) =>
    step === setupNode[0] ? { ...step, with: { ...step.with, 'node-version': nodeVersion } } : step,
  );
}

function checkoutRepository(repository: string, path: string): pj.github.workflows.Step[] {
  return [
    pj.github.WorkflowSteps.checkout({
      name: `Checkout ${repository}`,
      with: {
        path,
        repository,
      },
    }),
  ];
}

/**
 * Fail when the copy of the CDK code generator's legacy tag table in service-spec-importers differs from aws-cdk's
 *
 * The comparison program is scripts/check-legacy-taggables.js, read here at synthesis and placed in the step's
 * environment, from which the step passes it to `node -e`. So the step executes no file from either checkout: the
 * job checks out pull request code, and running a file from it would be a step that the code can poison. The program
 * reads both tables as text, so the step runs before anything from aws-cdk is installed or built.
 */
function checkLegacyTaggables(root: pj.Project, awsCdkPath: string): pj.github.workflows.Step[] {
  const programFile = path.join(root.outdir, 'scripts', 'check-legacy-taggables.js');
  const program = fs.readFileSync(programFile, 'utf-8');
  if (program.includes('${{')) {
    throw new Error(`${programFile} contains '\${{', which GitHub Actions would evaluate in the step's environment`);
  }
  const copy = path.join(root.name, 'packages', '@aws-cdk', 'service-spec-importers', 'src', 'l1-view.ts');
  return [
    {
      name: `Check the copied legacy tag table against ${awsCdkPath}`,
      env: { LEGACY_TAGGABLES_CHECK: program },
      run: `node -e "$LEGACY_TAGGABLES_CHECK" ${copy} ${awsCdkPath}`,
    },
  ];
}

function linkPackage(project: pj.Project, targetPath: string): pj.github.workflows.Step[] {
  const sourcePath = path.join(project.root.name, path.relative(project.root.outdir, project.outdir));
  return [
    {
      name: `Register drop-in ${project.name} replacement`,
      workingDirectory: sourcePath,
      env: { COREPACK_ENABLE_PROJECT_SPEC: '0' },
      run: 'yarn link',
    },
    {
      name: `Link drop-in ${project.name} replacement`,
      workingDirectory: targetPath,
      env: { COREPACK_ENABLE_PROJECT_SPEC: '0' },
      run: `yarn link "${project.name}"`,
    },
  ];
}

function buildAwsCdkLib(repository: string, path: string): pj.github.workflows.Step[] {
  return [
    {
      name: `Setup ${repository}`,
      workingDirectory: path,
      env: { COREPACK_ENABLE_PROJECT_SPEC: '0' },
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
