import path from 'path';
import { SpecDatabase } from '@aws-cdk/service-spec';
import { Module, TypeScriptRenderer } from '@cdklabs/typewriter';
import * as fs from 'fs-extra';
import { AstBuilder } from './cdk/ast';
import { ModuleImportLocations } from './cdk/cdk';
import { loadDatabase } from './db';
import { debug } from './log';
import { PatternedString, PatternValues } from './naming/patterned-name';

type PatternKeys = 'package' | 'service' | 'shortname';

export interface GenerateOptions {
  /**
   * Location of the generated files
   */
  readonly outputPath: string;
  /**
   * Should the location be deleted before generating new files
   * @default false
   */
  readonly clearOutput?: boolean;
  /**
   * The pattern used to name files.
   */
  readonly resourceFilePattern: PatternedString<PatternKeys>;

  /**
   * The pattern used to name augmentations.
   */
  readonly augmentationsFilePattern: PatternedString<PatternKeys>;

  /**
   * The pattern used to name canned metrics.
   */
  readonly cannedMetricsFilePattern: PatternedString<PatternKeys>;

  /**
   * Output debug messages
   * @default false
   */
  readonly debug?: boolean;
  /**
   * The services to generate files for.
   */
  readonly services?: string[];
  /**
   * Override the locations modules are imported from
   */
  readonly importLocations?: ModuleImportLocations;

  /**
   * Generate L2 support files for augmentations (only for testing)
   *
   * @default false
   */
  readonly augmentationsSupport?: boolean;
}

export async function generate(options: GenerateOptions) {
  if (options.debug) {
    process.env.DEBUG = '1';
  }
  debug('Options', options);
  const { outputPath, clearOutput, importLocations } = options;

  const db = await loadDatabase();
  const renderer = new TypeScriptRenderer();

  let resourceCount = 0;
  const services = getServices(db, options.services).map((s) => {
    debug(s.name, 'ast');
    const ast = AstBuilder.forService(s, { db, importLocations });
    resourceCount += db.follow('hasResource', s).length;
    return ast;
  });

  console.log('Generating %i Resources for %i Services', resourceCount, services.length);

  if (clearOutput) {
    fs.removeSync(outputPath);
  }

  for (const s of services) {
    debug(`${s.module.service}`, 'render');

    const writer = new ServiceFileWriter(outputPath, renderer, {
      package: s.module.name.toLowerCase(),
      service: s.module.service.toLowerCase(),
      shortname: s.module.shortName.toLowerCase(),
    });

    writer.writePattern(s.module, options.resourceFilePattern);

    if (s.augmentations?.hasAugmentations) {
      const augFile = writer.writePattern(s.augmentations, options.augmentationsFilePattern);

      if (options.augmentationsSupport) {
        const augDir = path.dirname(augFile);
        for (const supportMod of s.augmentations.supportModules) {
          writer.write(supportMod, path.resolve(augDir, `${supportMod.importName}.ts`));
        }
      }
    }

    if (s.cannedMetrics?.hasCannedMetrics) {
      writer.writePattern(s.cannedMetrics, options.cannedMetricsFilePattern);
    }
  }
}

class ServiceFileWriter {
  constructor(
    private readonly outputPath: string,
    private readonly renderer: TypeScriptRenderer,
    private readonly values: PatternValues<PatternKeys>,
  ) {}

  public writePattern(module: Module, fileNamePattern: PatternedString<PatternKeys>) {
    const filePath = path.join(this.outputPath, fileNamePattern(this.values));
    fs.outputFileSync(filePath, this.renderer.render(module));
    return filePath;
  }

  public write(module: Module, filePath: string) {
    fs.outputFileSync(filePath, this.renderer.render(module));
    return filePath;
  }
}

function getServices(db: SpecDatabase, services?: string[]) {
  if (!services) {
    return db.all('service');
  }

  return services.flatMap((name) => db.lookup('service', 'name', 'equals', name));
}
