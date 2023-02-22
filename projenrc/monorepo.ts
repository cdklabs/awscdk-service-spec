import * as path from 'path';
import * as pj from 'projen';

//////////////////////////////////////////////////////////////////////

export interface MonorepoRootOptions
  extends Omit<pj.typescript.TypeScriptProjectOptions, 'sampleCode' | 'jest' | 'jestOptions' | 'eslint'> {
  /**
   * Create a VSCode multi-root workspace file for all monorepo workspaces
   *
   * @default true
   */
  vscodeWorkspace?: boolean;
}

export class MonorepoRoot extends pj.typescript.TypeScriptProject {
  private projects = new Array<MonorepoTypeScriptProject>();
  private postInstallDependencies = new Array<() => boolean>();
  private vscodeHiddenFilesPatterns = new Array<string>();

  constructor(options: MonorepoRootOptions) {
    super({
      ...options,
      sampleCode: false,
      jest: false,
      eslint: false,
    });
    this.gitignore.addPatterns('.DS_Store');

    /**
     * Formatting
     */
    if (options.prettier) {
      this.addDevDeps('eslint-config-prettier', 'eslint-plugin-prettier');
      new pj.JsonFile(this, '.eslintrc.json', {
        allowComments: true,
        obj: {
          plugins: ['@typescript-eslint', 'prettier'],
          parser: '@typescript-eslint/parser',
          parserOptions: {
            ecmaVersion: 2018,
            sourceType: 'module',
            project: './tsconfig.dev.json',
          },
          ignorePatterns: ['!.projenrc.ts'],
          extends: ['plugin:prettier/recommended'],
        },
      });
      this.tasks.addTask('fmt', { exec: 'eslint --ext .ts --fix projenrc .projenrc.ts' });

      this.vscode?.extensions.addRecommendations('esbenp.prettier-vscode', 'dbaeumer.vscode-eslint');
      this.vscode?.settings.addSetting('editor.defaultFormatter', 'esbenp.prettier-vscode');
      this.vscode?.settings.addSetting('eslint.format.enable', true);
      this.vscode?.settings.addSettings({ 'editor.defaultFormatter': 'dbaeumer.vscode-eslint' }, [
        'javascript',
        'typescript',
      ]);
    }

    /**
     * VSCode
     */
    this.vscodeHiddenFilesPatterns.push(
      '**/.projen',
      '**/.eslintrc.js',
      '**/.eslintrc.json',
      '**/.gitattributes',
      '**/.gitignore',
      '**/.npmignore',
      '**/*.tsbuildinfo',
      '**/node_modules',
      '**/coverage',
      '**/dist',
      '**/lib',
      '**/test-reports',
      '.prettierignore',
      '.prettierrc.json',
      '**/tsconfig.json',
      '**/tsconfig.dev.json',
    );

    if (options.vscodeWorkspace ?? true) {
      const workspaceFile = `${this.name}.code-workspace`;
      this.vscodeHiddenFilesPatterns.push(workspaceFile);
      new pj.JsonFile(this, workspaceFile, {
        allowComments: true,
        obj: () => ({
          folders: this.projects
            .sort((p1, p2) => p1.name.localeCompare(p2.name))
            .map((p) => ({ path: `packages/${p.name}` })),
          settings: () => getObjFromFile(this, '.vscode/settings.json'),
          extensions: () => getObjFromFile(this, '.vscode/extensions.json'),
        }),
      });
    }

    /**
     * Tasks
     */
    // Tasks that should be applied in all workspaces
    this.tasks.removeTask('build');
    this.tasks.addTask('build', {
      steps: [{ spawn: 'default' }, { spawn: 'fmt' }, { exec: 'yarn workspaces run build' }],
    });
    this.tasks.tryFind('compile')?.reset('yarn workspaces run compile');
    this.tasks.tryFind('package')?.reset('yarn workspaces run package');
    this.tasks.tryFind('test')?.reset('yarn workspaces run test');
    this.addTask('run', {
      exec: 'yarn workspaces run',
      receiveArgs: true,
    });

    // Upgrade task
    this.tasks.removeTask('upgrade');
    this.tasks.addTask('upgrade', {
      env: { CI: '0' },
      description: 'Upgrade dependencies in all workspaces',
      steps: [
        { exec: 'yarn upgrade npm-check-updates' },
        { exec: 'yarn workspaces run check-for-updates' },
        { exec: 'yarn install --check-files' },
        { exec: 'yarn upgrade' },
        { spawn: 'default' },
        { spawn: 'post-upgrade' },
      ],
    });

    // Clean up tasks not required at top-level
    this.tasks.removeTask('eject');
    this.tasks.removeTask('watch');
    this.tasks.removeTask('pre-compile');
    this.tasks.removeTask('post-compile');
  }

  public register(project: MonorepoTypeScriptProject) {
    this.projects.push(project);
  }

  public synth() {
    this.finalEscapeHatches();
    super.synth();
  }

  /**
   * Allows a sub project to request installation of dependency at the Monorepo root
   * They must provide a function that is executed after dependencies have been installed
   * If this function returns true, the install command is run for a second time after all sub project requests have run.
   * This is used to resolve dependency versions from `*` to a concrete version constraint.
   */
  public requestInstallDependencies(request: () => boolean) {
    this.postInstallDependencies.push(request);
  }

  private finalEscapeHatches() {
    // Get the ObjectFile
    this.package.addField('private', true);
    this.package.addField('workspaces', {
      packages: this.projects.map((p) => `packages/${p.name}`),
    });

    this.tsconfig?.file.addOverride('include', []);
    this.tsconfigDev?.file.addOverride('include', ['.projenrc.ts', 'projenrc/**/*.ts']);
    for (const tsconfig of [this.tsconfig, this.tsconfigDev]) {
      tsconfig?.file.addOverride(
        'references',
        this.projects.map((p) => ({ path: `packages/${p.name}` })),
      );
    }

    this.vscode?.settings.addSettings({
      'files.exclude': Object.fromEntries(this.vscodeHiddenFilesPatterns.map((p) => [p, true])),
    });
  }

  public postSynthesize() {
    if (this.postInstallDependencies.length) {
      const nodePkg: any = this.package;
      nodePkg.installDependencies();

      const completedRequests = this.postInstallDependencies.map((request) => request());
      if (completedRequests.some(Boolean)) {
        nodePkg.installDependencies();
      }

      this.postInstallDependencies = [];
    }
  }
}

//////////////////////////////////////////////////////////////////////

export interface MonorepoTypeScriptProjectOptions
  extends Omit<
    pj.typescript.TypeScriptProjectOptions,
    | 'parent'
    | 'defaultReleaseBranch'
    | 'release'
    | 'repositoryDirectory'
    | 'autoDetectBin'
    | 'outdir'
    | 'deps'
    | 'devDeps'
    | 'peerDeps'
    | 'depsUpgradeOptions'
  > {
  readonly parent: MonorepoRoot;

  readonly private?: boolean;

  readonly deps?: Array<string | MonorepoTypeScriptProject>;
  readonly devDeps?: Array<string | MonorepoTypeScriptProject>;
  readonly peerDeps?: Array<string | MonorepoTypeScriptProject>;
  readonly excludeDepsFromUpgrade?: Array<string>;
}

export class MonorepoTypeScriptProject extends pj.typescript.TypeScriptProject {
  public readonly parent: MonorepoRoot;

  constructor(props: MonorepoTypeScriptProjectOptions) {
    const remainder = without(
      props,
      'parent',
      'name',
      'description',
      'deps',
      'peerDeps',
      'devDeps',
      'excludeDepsFromUpgrade',
    );

    const useEslint = remainder.eslint ?? true;
    const usePrettier = remainder.prettier ?? true;

    super({
      parent: props.parent,
      name: props.name,
      description: props.description,
      repositoryDirectory: `packages/${props.name}`,
      outdir: `packages/${props.name}`,
      defaultReleaseBranch: 'REQUIRED-BUT-SHOULDNT-BE',
      release: false,
      package: !props.private,
      eslint: useEslint,
      prettier: usePrettier,
      prettierOptions: usePrettier
        ? {
            overrides: props.parent.prettier?.overrides,
            settings: props.parent.prettier?.settings,
            ...remainder.prettierOptions,
          }
        : undefined,
      eslintOptions: useEslint
        ? {
            dirs: [remainder.srcdir ?? 'src'],
            devdirs: [remainder.testdir ?? 'test', 'build-tools'],
            ...remainder.eslintOptions,
            prettier: usePrettier,
          }
        : undefined,
      sampleCode: false,

      deps: packageNames(props.deps),
      peerDeps: packageNames(props.peerDeps),
      devDeps: packageNames(props.devDeps),

      depsUpgradeOptions: {
        exclude: [
          ...(props.excludeDepsFromUpgrade ?? []),
          ...(packageNames(props.deps?.filter(isMonorepoTypeScriptProject)) ?? []),
          ...(packageNames(props.peerDeps?.filter(isMonorepoTypeScriptProject)) ?? []),
          ...(packageNames(props.devDeps?.filter(isMonorepoTypeScriptProject)) ?? []),
        ],
      },

      ...remainder,
    });

    this.parent = props.parent;

    // jest config
    if (this.jest?.config && this.jest.config.preset === 'ts-jest') {
      delete this.jest.config.globals?.['ts-jest'];
      this.jest.config.transform = {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: this.tsconfigDev.fileName,
          },
        ],
      };
    }

    // Tasks
    this.tasks.tryFind('default')?.reset('(cd `git rev-parse --show-toplevel`; npx projen default)');
    this.tasks.removeTask('clobber');
    this.tasks.removeTask('eject');

    const upgrades: any = this.components.find(
      (c: pj.Component): c is pj.javascript.UpgradeDependencies => c instanceof pj.javascript.UpgradeDependencies,
    );
    this.tasks.removeTask('upgrade');
    this.tasks.removeTask('post-upgrade');
    this.tasks.addTask('check-for-updates', {
      env: { CI: '0' },
      steps: {
        toJSON: () => {
          const steps = upgrades.renderTaskSteps() as pj.TaskStep[];
          return steps.filter(
            (step) => step.exec && typeof step.exec === 'string' && step.exec?.startsWith('npm-check-updates'),
          );
        },
      } as any,
    });

    // Composite project and references
    const allDeps = [...(props.deps ?? []), ...(props.peerDeps ?? []), ...(props.devDeps ?? [])];

    for (const tsconfig of [this.tsconfig, this.tsconfigDev]) {
      tsconfig?.file.addOverride('compilerOptions.composite', true);
      tsconfig?.file.addOverride(
        'references',
        allDeps.filter(isMonorepoTypeScriptProject).map((p) => ({ path: path.relative(this.outdir, p.outdir) })),
      );
    }

    // FIXME: I don't know why `tsconfig.dev.json` doesn't have an outdir, or where it's used,
    // but it's causing in-place `.js` files to appear.
    this.tsconfigDev.file.addOverride('compilerOptions.outDir', 'lib');

    // Install dependencies via the parent project
    (this.package as any).installDependencies = () => {
      this.parent.requestInstallDependencies(() => (this.package as any).resolveDepsAndWritePackageJson());
    };

    if (props.private) {
      this.package.addField('private', true);
    }

    // Need to hack ESLint config
    // .eslintrc.js will take precedence over the JSON file, it will load the
    // JSON file and patch it with a dynamic directory name that cannot be represented in
    // plain JSON (see https://github.com/projen/projen/issues/2405).
    const eslintRc = new pj.SourceCode(this, '.eslintrc.js');
    eslintRc.line(`var path = require('path');`);
    eslintRc.line(`var fs = require('fs');`);
    eslintRc.line(`var contents = fs.readFileSync('.eslintrc.json', { encoding: 'utf-8' });`);
    eslintRc.line(`// Strip comments, JSON.parse() doesn't like those`);
    eslintRc.line(`contents = contents.replace(/^\\/\\/.*$/m, '');`);
    eslintRc.line(`var json = JSON.parse(contents);`);
    eslintRc.line(`// Patch the .json config with something that can only be represented in JS`);
    eslintRc.line(`json.parserOptions.tsconfigRootDir = __dirname;`);
    eslintRc.line(`module.exports = json;`);

    props.parent.register(this);
  }
}

function packageNames(xs?: Array<string | MonorepoTypeScriptProject>): string[] | undefined {
  if (!xs) {
    return undefined;
  }
  return xs.map((x) => (typeof x === 'string' ? x : x.name));
}

function without<A extends object, K extends keyof A>(x: A, ...ks: K[]): Omit<A, K> {
  const ret = { ...x };
  for (const k of ks) {
    delete ret[k];
  }
  return ret;
}

function isMonorepoTypeScriptProject(x: unknown): x is MonorepoTypeScriptProject {
  return typeof x === 'object' && !!x && x instanceof MonorepoTypeScriptProject;
}

function getObjFromFile(project: pj.Project, file: string): object {
  return (project.tryFindObjectFile(file) as any).obj;
}
