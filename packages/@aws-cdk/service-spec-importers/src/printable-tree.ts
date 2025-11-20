type Colorizer = (x: string) => string;
type Cell = [string, Colorizer];

function ident(x: string) {
  return x;
}

function mkCell(x: string): Cell {
  return [x, ident];
}

export class PrintableTree {
  private readonly lines: Cell[][] = [];

  constructor(...lines: string[]) {
    this.emit(lines.join('\n'));
  }

  public get empty() {
    return this.lines.length === 0;
  }

  public emit(x: string) {
    const parts = x.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '') {
        continue;
      }

      if (i > 0) {
        this.newline();
      }
      if (this.lines.length === 0) {
        this.lines.push([]);
      }
      this.lines[this.lines.length - 1].push(mkCell(parts[i]));
    }
  }

  public addTree(tree: PrintableTree) {
    for (let i = 0; i < tree.lines.length; i++) {
      this.lines.push([...tree.lines[i]]);
    }
    return this;
  }

  public addBullets(trees: PrintableTree[]) {
    trees = trees.filter((t) => !t.empty);

    for (let i = 0; i < trees.length; i++) {
      this.addBullet(i === trees.length - 1, trees[i]);
    }
    return this;
  }

  public addBullet(last: boolean, tree: PrintableTree) {
    const header = last ? '└' : '├';
    const indent = last ? ' ' : '│';

    for (let i = 0; i < tree.lines.length; i++) {
      const prefix = i === 0 ? header : indent;
      this.lines.push([mkCell(prefix), ...tree.lines[i]]);
    }
    return this;
  }

  /**
   * Indent the lines in this printable tree
   */
  public indent(n: number) {
    if (this.empty) {
      return this;
    }

    for (const line of this.lines) {
      line.unshift(mkCell(' '.repeat(n)));
    }
    return this;
  }

  /**
   * Prefix all lines of the tree with the given list of cells.
   *
   * The first line will be prefixed with `first`.
   *
   * The other lines will be prefixed with `rest` if given, or the length of
   * `first` in spaces if rest is not given.
   */
  public prefix(first: string[], rest?: string[]) {
    rest = rest ?? first.map((x) => ' '.repeat(x.length));

    for (let i = 0; i < this.lines.length; i++) {
      if (i === 0) {
        this.lines[i].unshift(...first.map(mkCell));
      } else {
        this.lines[i].unshift(...rest.map(mkCell));
      }
    }

    return this;
  }

  public newline() {
    if (this.lines.length === 0 || this.lines[this.lines.length - 1].length > 0) {
      this.lines.push([]);
    }
    return this;
  }

  public colorize(colorizer: Colorizer) {
    for (const line of this.lines) {
      for (const cell of line) {
        cell[1] = colorizer;
      }
    }
    return this;
  }

  public toString() {
    return this.lines.map(renderRow).join('\n');

    function renderRow(row: Cell[]): string {
      // To minimize the amount of ANSI color coding, find the longest possible runs that use the
      // same colorizer, and invoke it once
      const ret: string[] = [];
      let s = 0;
      while (s < row.length) {
        let i = s + 1;
        while (i < row.length && row[i][1] === row[s][1]) {
          i += 1;
        }

        // [s..i) have the same colorizer
        ret.push(
          row[s][1](
            row
              .slice(s, i)
              .map((c) => c[0])
              .join(''),
          ),
        );
        s = i;
      }
      return ret.join('');
    }
  }
}
