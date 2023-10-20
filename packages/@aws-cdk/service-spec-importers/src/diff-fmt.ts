import {
  Deprecation,
  MapDiff,
  Property,
  Resource,
  RichPropertyType,
  ScalarDiff,
  Service,
  SpecDatabase,
  SpecDatabaseDiff,
  TypeDefinition,
  UpdatedProperty,
  UpdatedResource,
  UpdatedService,
  UpdatedTypeDefinition,
} from '@aws-cdk/service-spec-types';
import chalk from 'chalk';
import { PrintableTree } from './printable-tree';

const ADDITION = '[+]';
const UPDATE = '[~]';
const REMOVAL = '[-]';
const META_INDENT = 2;

const [OLD_DB, NEW_DB] = [0, 1];

export class DiffFormatter {
  private readonly dbs: SpecDatabase[];

  constructor(db1: SpecDatabase, db2: SpecDatabase) {
    this.dbs = [db1, db2];
  }

  public format(diff: SpecDatabaseDiff): string {
    const tree = new PrintableTree();

    tree.addBullets(
      this.renderMapDiff(
        diff.services,
        (s, db) => this.renderService(s, db),
        (k, u) => this.renderUpdatedService(k, u),
      ),
    );

    return tree.toString();
  }

  private renderService(s: Service, db: number): PrintableTree {
    return new PrintableTree(`service ${s.name}`).addBullets([
      new PrintableTree(...listFromProps(s, ['capitalized', 'cloudFormationNamespace', 'name', 'shortName'])).indent(
        META_INDENT,
      ),
      listWithCaption(
        'resources',
        this.dbs[db].follow('hasResource', s).map((e) => this.renderResource(e.entity, db)),
      ),
    ]);
  }

  private renderUpdatedService(key: string, s: UpdatedService): PrintableTree {
    const d = pick(s, ['capitalized', 'cloudFormationNamespace', 'name', 'shortName']);

    const bullets = [
      new PrintableTree(...listFromDiffs(d)).indent(META_INDENT),
      listWithCaption(
        'resources',
        this.renderMapDiff(
          s.resourceDiff,
          (r, db) => this.renderResource(r, db),
          (k, u) => this.renderUpdatedResource(k, u),
        ),
      ),
    ];

    const ret = new PrintableTree(`service ${key}`).addBullets(bullets);
    return ret;
  }

  private renderResource(r: Resource, db: number): PrintableTree {
    return new PrintableTree(`resource ${r.cloudFormationType}`).addBullets([
      new PrintableTree(
        ...listFromProps(r, [
          'name',
          'identifier',
          'cloudFormationType',
          'cloudFormationTransform',
          'documentation',
          'identifier',
          'isStateful',
          'scrutinizable',
          'tagInformation',
        ]),
      ).indent(META_INDENT),
      listWithCaption('properties', this.renderProperties(r.properties, db)),
      listWithCaption('attributes', this.renderProperties(r.attributes, db)),
      listWithCaption(
        'types',
        this.dbs[db].follow('usesType', r).map((e) => this.renderTypeDefinition(e.entity, db)),
      ),
    ]);
  }

  private renderUpdatedResource(key: string, r: UpdatedResource): PrintableTree {
    const d = pick(r, [
      'name',
      'identifier',
      'cloudFormationType',
      'cloudFormationTransform',
      'documentation',
      'identifier',
      'isStateful',
      'scrutinizable',
      'tagInformation',
    ]);

    return new PrintableTree(`resource ${key}`).addBullets([
      new PrintableTree(...listFromDiffs(d)).indent(META_INDENT),
      listWithCaption('properties', this.renderPropertyDiff(r.properties)),
      listWithCaption('attributes', this.renderPropertyDiff(r.attributes)),
      listWithCaption(
        'types',
        this.renderMapDiff(
          r.typeDefinitionDiff,
          (t, db) => this.renderTypeDefinition(t, db),
          (k, u) => this.renderUpdatedTypeDefinition(k, u),
        ),
      ),
    ]);
  }

  private renderTypeDefinition(t: TypeDefinition, db: number): PrintableTree {
    return new PrintableTree(`type ${t.name}`).addBullets([
      new PrintableTree(...listFromProps(t, ['documentation', 'mustRenderForBwCompat', 'name'])).indent(META_INDENT),
      listWithCaption('properties', this.renderProperties(t.properties, db)),
    ]);
  }

  private renderUpdatedTypeDefinition(key: string, t: UpdatedTypeDefinition): PrintableTree {
    const d = pick(t, ['documentation', 'mustRenderForBwCompat', 'name']);
    return new PrintableTree(`type ${key}`).addBullets([
      new PrintableTree(...listFromDiffs(d)).indent(META_INDENT),
      listWithCaption('properties', this.renderPropertyDiff(t.properties)),
    ]);
  }

  private renderProperty(p: Property, db: number): PrintableTree {
    const ret = new PrintableTree();

    const types = [p.type, ...(p.previousTypes ?? []).reverse()];
    ret.emit(types.map((type) => new RichPropertyType(type).stringify(this.dbs[db], false)).join(' ⇐ '));

    const attributes = [];
    if (p.required) {
      attributes.push('required');
    }

    if (p.defaultValue) {
      attributes.push(`default=${render(p.defaultValue)}`);
    }
    if (p.deprecated && p.deprecated !== Deprecation.NONE) {
      attributes.push(`deprecated=${p.deprecated}`);
    }
    if (p.causesReplacement === 'yes') {
      attributes.push('immutable');
    }
    if (p.causesReplacement === 'maybe') {
      attributes.push('immutable?');
    }

    // Documentation changes are rendered outside, they'll be too large

    if (attributes.length) {
      ret.emit(` (${attributes.join(', ')})`);
    }

    return ret;
  }

  private renderProperties(ps: Record<string, Property>, db: number): PrintableTree[] {
    return Object.entries(ps).map(([name, p]) => this.renderProperty(p, db).prefix([`${name}: `]));
  }

  private renderMapDiff<E, U>(
    diff: MapDiff<E, U> | undefined,
    renderEl: (x: E, dbI: number) => PrintableTree,
    renderUpdated: (key: string, x: U) => PrintableTree,
  ): PrintableTree[] {
    if (!diff) {
      return [];
    }

    // Turn the lists into maps
    const keys = Array.from(
      new Set([
        ...Object.keys(diff.added ?? {}),
        ...Object.keys(diff.removed ?? {}),
        ...Object.keys(diff.updated ?? {}),
      ]),
    );
    keys.sort((a, b) => a.localeCompare(b));

    return keys.map((key) => {
      if (diff.added?.[key]) {
        return renderEl(diff.added?.[key]!, NEW_DB).prefix([chalk.green(ADDITION), ' '], [' ']);
      } else if (diff.removed?.[key]) {
        return renderEl(diff.removed?.[key]!, OLD_DB).prefix([chalk.red(REMOVAL), ' '], [' ']);
      } else if (diff.updated?.[key]) {
        return renderUpdated(key, diff.updated?.[key]!).prefix([chalk.yellow(UPDATE), ' '], [' ']);
      }
      return new PrintableTree();
    });
  }

  private renderPropertyDiff(diff: MapDiff<Property, UpdatedProperty> | undefined): PrintableTree[] {
    if (!diff) {
      return [];
    }

    // Turn the lists into maps
    const keys = Array.from(
      new Set([
        ...Object.keys(diff.added ?? {}),
        ...Object.keys(diff.removed ?? {}),
        ...Object.keys(diff.updated ?? {}),
      ]),
    );
    keys.sort((a, b) => a.localeCompare(b));

    return keys.flatMap((key) => {
      const header = [' ', key, ': '];
      const rest = [' ', ' '.repeat(key.length), '  '];

      if (diff.added?.[key]) {
        return [
          this.renderProperty(diff.added?.[key]!, NEW_DB).prefix([chalk.green(ADDITION), ...header], [' ', ...rest]),
        ];
      } else if (diff.removed?.[key]) {
        return [
          this.renderProperty(diff.removed?.[key]!, OLD_DB).prefix([chalk.red(REMOVAL), ...header], [' ', ...rest]),
        ];
      } else if (diff.updated?.[key]) {
        const pu = diff.updated?.[key]!;
        const old = this.renderProperty(pu.old, OLD_DB);
        const noo = this.renderProperty(pu.new, NEW_DB);

        const ret = new PrintableTree();
        if (old.toString() !== noo.toString()) {
          ret.addTree(old.prefix(['- ']).colorize(chalk.red));
          ret.addTree(noo.prefix(['+ ']).colorize(chalk.green));
        }
        if (pu.old.documentation !== pu.new.documentation) {
          ret.addTree(new PrintableTree('(documentation changed)'));
        }
        return ret.prefix([` ${key}: `]);
      }
      return new PrintableTree();
    });
  }
}

function listFromProps<A extends object, K extends keyof A>(a: A, ks: K[]) {
  return listFromObj(pick(a, ks));
}

function listFromObj(xs: Record<string, unknown>): string[] {
  return Object.entries(xs).map(([k, v]) => `${String(k)}: ${render(v)}`);
}

function pick<A extends object, K extends keyof A>(a: A, ks: K[]): Pick<A, K> {
  const pairs = ks.flatMap((k) => (a[k] !== undefined ? [[k, a[k]] as const] : []));
  return Object.fromEntries(pairs) as any;
}

function listFromDiffs(xs: Record<string, ScalarDiff<any> | undefined>): string[] {
  return Object.entries(xs).flatMap(([key, diff]) => [
    chalk.red(`- ${String(key)}: ${render(diff?.old)}`),
    chalk.green(`+ ${String(key)}: ${render(diff?.new)}`),
  ]);
}

function render(x: unknown) {
  return typeof x === 'object' ? JSON.stringify(x) : `${x}`;
}

function listWithCaption(caption: string, trees: PrintableTree[]) {
  trees = trees.filter((t) => !t.empty);
  if (trees.length === 0) {
    return new PrintableTree();
  }
  const ret = new PrintableTree(`${caption}`);
  ret.addBullets(trees);
  return ret.prefix([' '], ['  ']);
}
