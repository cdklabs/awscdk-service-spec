import * as pj from 'projen';

//////////////////////////////////////////////////////////////////////

export interface MonorepoRootOptions
  extends Omit<
    pj.typescript.TypeScriptProjectOptions,
    'sampleCode' | 'jest' | 'jestOptions'
  > {}

export class MonorepoRoot extends pj.typescript.TypeScriptProject {
  private projects = new Array<MonorepoTypeScriptProject>();

  constructor(options: MonorepoRootOptions) {
    super({
      ...options,
      sampleCode: false,
      jest: false,
    });
    this.gitignore.addPatterns('.DS_Store');
  }

  public register(project: MonorepoTypeScriptProject) {
    this.projects.push(project);
  }

  public synth() {
    this.finalEscapeHatches();
    super.synth();
  }

  private finalEscapeHatches() {
    // Get the ObjectFile
    this.package.addField('private', true);
    this.package.addField('workspaces', {
      packages: this.projects.map((p) => `packages/${p.name}`),
    });

    this.tsconfig?.file.addOverride('include', []);
    this.tsconfig?.file.addOverride(
      'references',
      this.projects.map((p) => ({ path: `packages/${p.name}` })),
    );
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
  > {
  readonly parent: MonorepoRoot;

  readonly private?: boolean;
}

export class MonorepoTypeScriptProject extends pj.typescript.TypeScriptProject {
  constructor(props: MonorepoTypeScriptProjectOptions) {
    const remainder = without(props, 'parent', 'name', 'description');

    super({
      parent: props.parent,
      name: props.name,
      description: props.description,
      repositoryDirectory: `packages/${props.name}`,
      outdir: `packages/${props.name}`,
      defaultReleaseBranch: 'REQUIRED-BUT-SHOULDNT-BE',
      release: false,

      ...remainder,
    });
    // Composite project
    (this.tsconfig?.compilerOptions as any).composite = true;

    // Suppress installing dependencies
    (this.package as any).installDependencies = () => {};

    if (props.private) {
      this.package.addField('private', true);
    }

    props.parent.register(this);
  }
}

function without<A extends object, K extends keyof A>(
  x: A,
  ...ks: K[]
): Omit<A, K> {
  const ret = { ...x };
  for (const k of ks) {
    delete ret[k];
  }
  return ret;
}
