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

const ADDITION = '[+]';
const UPDATE = '[~]';
const REMOVAL = '[-]';
const META_INDENT = '      ';

type Colorizer = (x: string) => string;

const [OLD_DB, NEW_DB] = [0, 1];

function ident(x: string) {
  return x;
}

export class DiffFormatter {
  private readonly buffer = new Array<string>();
  private readonly prefix = new Array<string>();
  private readonly colors: Colorizer[] = [ident];
  private readonly dbs: SpecDatabase[];

  constructor(db1: SpecDatabase, db2: SpecDatabase) {
    this.dbs = [db1, db2];
  }

  public format(diff: SpecDatabaseDiff): string {
    this.buffer.splice(0, this.buffer.length);

    this.renderMapDiff(
      'service',
      diff.services,
      (s, db) => this.renderService(s, db),
      (u) => this.renderUpdatedService(u),
    );

    return this.buffer.join('');
  }

  private renderService(s: Service, db: number) {
    this.plainStringBlock(
      META_INDENT,
      listFromProps(s, ['capitalized', 'cloudFormationNamespace', 'name', 'shortName']),
    );

    this.emitList(
      this.dbs[db].follow('hasResource', s).map((x) => x.entity),
      (resource, last) =>
        this.withBullet(last, () => {
          this.renderResource(resource, db);
        }),
    );
  }

  private renderUpdatedService(s: UpdatedService) {
    const d = pick(s, ['capitalized', 'cloudFormationNamespace', 'name', 'shortName']);
    this.plainStringBlock(META_INDENT, listFromDiffs(d));

    this.renderMapDiff(
      'resource',
      s.resourceDiff,
      (r, db) => this.renderResource(r, db),
      (u) => this.renderUpdatedResource(u),
    );
  }

  private renderResource(r: Resource, db: number) {
    this.plainStringBlock(
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

    this.emitList(
      this.dbs[db].follow('usesType', r).map((x) => x.entity),
      (typeDef, last) =>
        this.withBullet(last, () => {
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
    this.plainStringBlock(META_INDENT, listFromDiffs(d));

    this.withPrefix(META_INDENT, () => {
      if (s.properties) {
        this.emit('properties\n');
        this.renderMapDiff(
          'prop',
          s.properties,
          (p, db) => this.renderProperty(p, db),
          (u) => this.renderUpdatedProperty(u),
        );
      }

      if (s.attributes) {
        this.emit('attributes\n');
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
    this.plainStringBlock(META_INDENT, listFromProps(r, ['documentation', 'mustRenderForBwCompat', 'name']));

    // Properties
    this.emitList(Object.entries(r.properties), ([name, p], last) => {
      this.withBullet(last, () => {
        this.emit(`${name}: `);
        this.renderProperty(p, db);
      });
    });
  }

  private renderUpdatedTypeDefinition(t: UpdatedTypeDefinition) {
    const d = pick(t, ['documentation', 'mustRenderForBwCompat', 'name']);
    this.plainStringBlock(META_INDENT, listFromDiffs(d));

    this.withPrefix('  ', () => {
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
    this.emit(types.map((type) => new RichPropertyType(type).stringify(this.dbs[db], false)).join(' ⇐ '));

    const attributes = [];
    if (p.defaultValue) {
      attributes.push(`default=${render(p.defaultValue)}`);
    }
    if (p.deprecated && p.deprecated !== Deprecation.NONE) {
      attributes.push(`deprecated=${p.deprecated}`);
    }
    // FIXME: Documentation?

    if (attributes.length) {
      this.emit(` (${attributes.join(', ')})`);
    }
  }

  private renderUpdatedProperty(t: UpdatedProperty) {
    this.withColor(chalk.red, () => {
      this.renderProperty(t.old, OLD_DB);
    });
    this.emit('\n');
    this.withColor(chalk.green, () => {
      this.renderProperty(t.new, NEW_DB);
    });
  }

  private renderAttribute(a: Attribute, db: number) {
    const types = [a.type, ...(a.previousTypes ?? []).reverse()];
    this.emit(types.map((type) => new RichPropertyType(type).stringify(this.dbs[db], false)).join(' ⇐ '));
  }

  private renderUpdatedAttribute(t: UpdatedAttribute) {
    this.withColor(chalk.red, () => {
      this.renderAttribute(t.old, OLD_DB);
    });
    this.emit('\n');
    this.withColor(chalk.green, () => {
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

    this.emitList(keys, (key, last) => {
      if (diff.added?.[key]) {
        this.withColor(chalk.green, () =>
          this.withBullet(last, () => {
            this.emit(ADDITION);
            this.emit(` ${type} ${key}\n`);
            renderEl(diff.added?.[key]!, NEW_DB);
          }),
        );
      } else if (diff.removed?.[key]) {
        this.withColor(chalk.green, () =>
          this.withBullet(last, () => {
            this.emit(REMOVAL);
            this.emit(` ${type} ${key}\n`);
            renderEl(diff.removed?.[key]!, OLD_DB);
          }),
        );
      } else if (diff.updated?.[key]) {
        this.withBullet(last, () => {
          this.emit(chalk.yellow(UPDATE));
          this.emit(` ${type} ${key}\n`);
          renderUpdated(diff.updated?.[key]!);
        });
      }
    });
  }

  private emitList<A>(as: A[], block: (a: A, last: boolean) => void) {
    for (let i = 0; i < as.length; i++) {
      if (i > 0) {
        this.emit('\n');
      }
      const last = i === as.length - 1;
      block(as[i], last);
    }
  }

  private withBullet(last: boolean, block: () => void): void;
  private withBullet(last: boolean, additionalIndent: string, block: () => void): void;
  private withBullet(last: boolean, blockOrIndent: string | (() => void), block?: () => void) {
    const header = last ? '└' : '├';
    const indent = (last ? ' ' : '│') + (typeof blockOrIndent === 'string' ? blockOrIndent : ' ');
    const theBlock = typeof blockOrIndent === 'function' ? blockOrIndent : block;

    this.emit(header);
    this.withPrefix(indent, theBlock!);
  }

  private withHeader(header: string, indent: string, block: () => void) {
    this.emit(header);
    this.withPrefix(indent, block);
  }

  private plainStringBlock(indent: string, as: string[]) {
    if (as.length === 0) {
      return;
    }

    this.withHeader(indent, indent, () => {
      this.emitList(as, (a) => {
        this.emit(a);
      });
    });
  }

  private emit(x: string) {
    if (this.buffer.length && this.buffer[this.buffer.length - 1].endsWith('\n')) {
      this.buffer.push(this.currentPrefix);
    }

    // Replace newlines with the prefix, except if the string ends in one
    const parts = x.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        this.buffer.push('\n');
        if (i < parts.length || parts[i] !== '') {
          this.buffer.push(this.currentPrefix);
        }
      }
      this.buffer.push(this.currentColor(parts[i]));
    }
  }

  private get currentPrefix() {
    return this.prefix.join('');
  }

  private get currentColor() {
    return this.colors[this.colors.length - 1];
  }

  private withPrefix(x: string, block: () => void) {
    this.prefix.push(this.currentColor(x));
    try {
      block();
    } finally {
      this.prefix.pop();
    }
  }

  private withColor(col: Colorizer, block: () => void) {
    this.colors.push(col);
    try {
      block();
    } finally {
      this.colors.pop();
    }
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
