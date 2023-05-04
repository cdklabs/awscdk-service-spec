import * as path from 'node:path';
import { Module, TypeScriptRenderer } from '@cdklabs/typewriter';
import * as fs from 'fs-extra';
import { PatternKeys } from './generate';
import { PatternValues, PatternedString } from './naming/patterned-name';

export class TsFileWriter {
  public outputFiles = new Array<string>();

  constructor(
    private readonly outputPath: string,
    private readonly renderer: TypeScriptRenderer,
    private readonly values: PatternValues<PatternKeys>,
  ) {}

  public write(module: Module, filePath: string | PatternedString<PatternKeys>): string {
    const output = this.resolveFilePath(filePath);
    fs.outputFileSync(output, this.renderer.render(module));
    this.outputFiles.push(output);
    return output;
  }

  private resolveFilePath(filePath: string | PatternedString<PatternKeys>): string {
    if (typeof filePath === 'function') {
      return path.join(this.outputPath, filePath(this.values));
    }
    return filePath;
  }
}
