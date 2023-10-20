import {
  Attribute,
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
  UpdatedAttribute,
  UpdatedProperty,
  UpdatedResource,
  UpdatedService,
  UpdatedTypeDefinition,
} from '@aws-cdk/service-spec-types';
import chalk from 'chalk';
import { TreeEmitter } from './tree-emitter';

const ADDITION = '[+]';
const UPDATE = '[~]';
const REMOVAL = '[-]';
const META_INDENT = '      ';

const [OLD_DB, NEW_DB] = [0, 1];

export class DiffFormatter {
  private readonly tree = new TreeEmitter();
  private readonly dbs: SpecDatabase[];

  constructor(db1: SpecDatabase, db2: SpecDatabase) {
    this.dbs = [db1, db2];
  }

  public format(diff: SpecDatabaseDiff): string {
    this.tree.clear();

    this.renderMapDiff(
      'service',
      diff.services,
      (s, db) => this.renderService(s, db),
      (u) => this.renderUpdatedService(u),
    );

    return this.tree.toString();
  }

  private renderService(s: Service, db: number) {
    this.tree.plainStringBlock(
      META_INDENT,
      listFromProps(s, ['capitalized', 'cloudFormationNamespace', 'name', 'shortName']),
    );

    this.tree.emitList(
      this.dbs[db].follow('hasResource', s).map((x) => x.entity),
      (resource, last) =>
        this.tree.withBullet(last, () => {
          this.renderResource(resource, db);
        }),
    );
  }

  private renderUpdatedService(s: UpdatedService) {
    const d = pick(s, ['capitalized', 'cloudFormationNamespace', 'name', 'shortName']);
    this.tree.plainStringBlock(META_INDENT, listFromDiffs(d));

    this.renderMapDiff(
      'resource',
      s.resourceDiff,
      (r, db) => this.renderResource(r, db),
      (u) => this.renderUpdatedResource(u),
    );
  }

  private renderResource(r: Resource, db: number) {
    this.tree.plainStringBlock(
      META_INDENT,
      listFromProps(r, [
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
    );

    // FIXME: props, attributes

    this.tree.emitList(
      this.dbs[db].follow('usesType', r).map((x) => x.entity),
      (typeDef, last) =>
        this.tree.withBullet(last, () => {
          this.renderTypeDefinition(typeDef, db);
        }),
    );
  }

  private renderUpdatedResource(s: UpdatedResource) {
    const d = pick(s, [
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
    this.tree.plainStringBlock(META_INDENT, listFromDiffs(d));

    this.tree.withPrefix(META_INDENT, () => {
      if (s.properties) {
        this.tree.emit('properties\n');
        this.renderMapDiff(
          'prop',
          s.properties,
          (p, db) => this.renderProperty(p, db),
          (u) => this.renderUpdatedProperty(u),
        );
      }

      if (s.attributes) {
        this.tree.emit('attributes\n');
        this.renderMapDiff(
          'attr',
          s.attributes,
          (p, db) => this.renderAttribute(p, db),
          (u) => this.renderUpdatedAttribute(u),
        );
      }
    });

    this.renderMapDiff(
      'type',
      s.typeDefinitionDiff,
      (p, db) => this.renderTypeDefinition(p, db),
      (u) => this.renderUpdatedTypeDefinition(u),
    );
  }

  private renderTypeDefinition(r: TypeDefinition, db: number) {
    this.tree.plainStringBlock(META_INDENT, listFromProps(r, ['documentation', 'mustRenderForBwCompat', 'name']));

    // Properties
    this.tree.emitList(Object.entries(r.properties), ([name, p], last) => {
      this.tree.withBullet(last, () => {
        this.tree.emit(`${name}: `);
        this.renderProperty(p, db);
      });
    });
  }

  private renderUpdatedTypeDefinition(t: UpdatedTypeDefinition) {
    const d = pick(t, ['documentation', 'mustRenderForBwCompat', 'name']);
    this.tree.plainStringBlock(META_INDENT, listFromDiffs(d));

    this.tree.withPrefix('  ', () => {
      this.renderMapDiff(
        'prop',
        t.properties,
        (p, db) => this.renderProperty(p, db),
        (u) => this.renderUpdatedProperty(u),
      );
    });
  }

  private renderProperty(p: Property, db: number) {
    const types = [p.type, ...(p.previousTypes ?? []).reverse()];
    this.tree.emit(types.map((type) => new RichPropertyType(type).stringify(this.dbs[db], false)).join(' ⇐ '));

    const attributes = [];
    if (p.defaultValue) {
      attributes.push(`default=${render(p.defaultValue)}`);
    }
    if (p.deprecated && p.deprecated !== Deprecation.NONE) {
      attributes.push(`deprecated=${p.deprecated}`);
    }
    // FIXME: Documentation?

    if (attributes.length) {
      this.tree.emit(` (${attributes.join(', ')})`);
    }
  }

  private renderUpdatedProperty(t: UpdatedProperty) {
    this.tree.withColor(chalk.red, () => {
      this.renderProperty(t.old, OLD_DB);
    });
    this.tree.emit('\n');
    this.tree.withColor(chalk.green, () => {
      this.renderProperty(t.new, NEW_DB);
    });
  }

  private renderAttribute(a: Attribute, db: number) {
    const types = [a.type, ...(a.previousTypes ?? []).reverse()];
    this.tree.emit(types.map((type) => new RichPropertyType(type).stringify(this.dbs[db], false)).join(' ⇐ '));
  }

  private renderUpdatedAttribute(t: UpdatedAttribute) {
    this.tree.withColor(chalk.red, () => {
      this.renderAttribute(t.old, OLD_DB);
    });
    this.tree.emit('\n');
    this.tree.withColor(chalk.green, () => {
      this.renderAttribute(t.new, NEW_DB);
    });
  }

  private renderMapDiff<E, U>(
    type: string,
    diff: MapDiff<E, U> | undefined,
    renderEl: (x: E, dbI: number) => void,
    renderUpdated: (x: U) => void,
  ) {
    if (!diff) {
      return;
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

    this.tree.emitList(keys, (key, last) => {
      if (diff.added?.[key]) {
        this.tree.withColor(chalk.green, () =>
          this.tree.withBullet(last, () => {
            this.tree.emit(ADDITION);
            this.tree.emit(` ${type} ${key}\n`);
            renderEl(diff.added?.[key]!, NEW_DB);
          }),
        );
      } else if (diff.removed?.[key]) {
        this.tree.withColor(chalk.green, () =>
          this.tree.withBullet(last, () => {
            this.tree.emit(REMOVAL);
            this.tree.emit(` ${type} ${key}\n`);
            renderEl(diff.removed?.[key]!, OLD_DB);
          }),
        );
      } else if (diff.updated?.[key]) {
        this.tree.withBullet(last, () => {
          this.tree.emit(chalk.yellow(UPDATE));
          this.tree.emit(` ${type} ${key}\n`);
          renderUpdated(diff.updated?.[key]!);
        });
      }
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
  return Object.entries(xs).map(([key, diff]) => `${String(key)}: ${render(diff?.old)} → ${render(diff?.new)}`);
}

function render(x: unknown) {
  return typeof x === 'object' ? JSON.stringify(x) : `${x}`;
}
