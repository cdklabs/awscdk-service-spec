export class IndentedStringBuilder {
  private readonly indents = new Array<string>();
  private readonly parts = new Array<string>();

  constructor() {}

  public indent(x: string) {
    this.indents.push(x);
  }

  public unindent() {
    this.indents.pop();
  }

  public emit(x: string) {
    this.parts.push(x.replace(/\n/g, `\n${this.indents.join('')}`));
  }

  public toString() {
    return this.parts
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .trimEnd();
  }
}
