import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';
import path from 'path';

export class AwsCdkIntgrationTest extends pj.Component {
  public constructor(project: yarn.TypeScriptWorkspace) {
    super(project);

    const root = project.root as yarn.Monorepo;
    if (!root.github || project.name !== '@aws-cdk/cfn2ts') {
      throw 'Error: Can add AwsCdkIntgrationTest only to @aws-cdk/cfn2ts';
    }

    const workflow = new pj.github.GithubWorkflow(root.github, 'test-aws-cdk-integration');

    workflow.on({
      workflowDispatch: {},
      pullRequest: {},
    });

    const projectPath = path.join(root.name, path.relative(root.outdir, project.outdir));
    const awsCdkRepo = 'aws/aws-cdk';
    const awsCdkPath = 'aws-cdk';

    workflow.addJob('test-with-new-codegen', {
      runsOn: ['ubuntu-latest'],
      env: {
        CI: '1',
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
          run: [
            'yarn install --frozen-lockfile',
            'yarn compile',
            'yarn workspace @aws-cdk/service-spec-build run build:db',
          ].join('\n'),
        },
        {
          name: `Checkout ${awsCdkRepo}`,
          uses: 'actions/checkout@v3',
          with: {
            path: awsCdkPath,
            repository: awsCdkRepo,
          },
        },
        {
          name: `Register drop-in ${project.name} replacement`,
          workingDirectory: projectPath,
          run: 'yarn link',
        },
        {
          name: `Link drop-in ${project.name} replacement`,
          workingDirectory: awsCdkPath,
          run: `yarn link "${project.name}"`,
        },
        {
          name: `Setup ${awsCdkRepo}`,
          workingDirectory: awsCdkPath,
          run: 'yarn install',
        },
        {
          // aws-cdk attempts to run ts3.9 on awscdk-service-spec which fails
          // this fix enables skipLibCheck to prevent the behavior
          name: 'Fix: aws-cdk attempts to compile awscdk-service-spec code',
          workingDirectory: path.join(awsCdkPath, 'packages', 'aws-cdk'),
          run: `npx tsc --showConfig | jq '.references = []' > tmp && mv tmp tsconfig.json`,
        },
        {
          name: `Build ${awsCdkRepo}`,
          workingDirectory: awsCdkPath,
          run: 'npx lerna run build --no-bail --concurrency=1 --scope aws-cdk-lib --include-dependencies',
        },
      ],
    });
  }
}
