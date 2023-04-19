import { Component, JsonFile, javascript } from 'projen';

export interface NxCachableTask {
  name: string;
  outputs: string[];
  inputs?: string[];
}

export interface NxOptions {
  /**
   * Which tasks are cacheable.
   *
   * @default - default settings for build, compile, test
   */
  cachableTasks?: NxCachableTask[];

  /**
   * The default branch
   * @default "main"
   */
  defaultBase?: string;
}

export class Nx extends Component {
  public constructor(project: javascript.NodeProject, options: NxOptions = {}) {
    super(project);

    const compileOutputs = ['{projectRoot}/lib', '{projectRoot}/tsconfig.tsbuildinfo'];
    const testInputs = ['!{projectRoot}/test-reports/**'];
    const testOutputs = ['{projectRoot}/coverage', '{projectRoot}/test-reports'];
    const packOutputs = ['{projectRoot}/dist'];

    const {
      cachableTasks = [
        {
          name: 'build',
          inputs: testInputs,
          outputs: [...compileOutputs, ...testOutputs, ...packOutputs],
        },
        {
          name: 'compile',
          outputs: compileOutputs,
        },
        {
          name: 'test',
          inputs: testInputs,
          outputs: testOutputs,
        },
      ],
      defaultBase = 'main',
    } = options;

    // nx
    project.addDevDeps('nx');
    new JsonFile(project, 'nx.json', {
      obj: {
        tasksRunnerOptions: {
          default: {
            runner: 'nx/tasks-runners/default',
            options: {
              cacheableOperations: () =>
                cachableTasks.map(({ name }) => name).filter((name) => project.tasks.tryFind(name)),
            },
          },
        },
        targetDefaults: () =>
          cachableTasks.reduce((targetDefaults, { name, outputs, inputs }) => {
            const task = project.tasks.tryFind(name);
            if (task) {
              targetDefaults[name] = {
                dependsOn: [`^${name}`],
                outputs,
                inputs,
              };
            }
            return targetDefaults;
          }, {} as { [target: string]: any }),
        affected: {
          defaultBase,
        },
      },
    });
  }

  preSynthesize(): void {
    for (const subproject of (this.project as any).subprojects as javascript.NodeProject[]) {
      subproject.tasks.addTask('nx').exec('nx run', {
        receiveArgs: true,
      });
    }
  }
}
