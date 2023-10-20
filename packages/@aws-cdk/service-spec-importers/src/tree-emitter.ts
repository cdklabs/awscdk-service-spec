type Colorizer = (x: string) => string;

/**
 * A class to emit ASCII art tree structures
 */
export class TreeEmitter {
  private readonly buffer = new Array<string>();
  private readonly prefix = new Array<string>();
  private readonly colors: Colorizer[] = [ident];

  public clear() {
    this.buffer.splice(0, this.buffer.length);
  }

  public toString() {
    return this.buffer.join('');
  }

  public emitList<A>(as: A[], block: (a: A, last: boolean) => void) {
    for (let i = 0; i < as.length; i++) {
      if (i > 0) {
        this.emit('\n');
      }
      const last = i === as.length - 1;
      block(as[i], last);
    }
  }

  public withBullet(last: boolean, block: () => void): void;
  public withBullet(last: boolean, additionalIndent: string, block: () => void): void;
  public withBullet(last: boolean, blockOrIndent: string | (() => void), block?: () => void) {
    const header = last ? '└' : '├';
    const indent = (last ? ' ' : '│') + (typeof blockOrIndent === 'string' ? blockOrIndent : ' ');
    const theBlock = typeof blockOrIndent === 'function' ? blockOrIndent : block;

    this.emit(header);
    this.withPrefix(indent, theBlock!);
  }

  public withHeader(header: string, indent: string, block: () => void) {
    this.emit(header);
    this.withPrefix(indent, block);
  }

  public plainStringBlock(indent: string, as: string[]) {
    if (as.length === 0) {
      return;
    }

    this.withHeader(indent, indent, () => {
      this.emitList(as, (a) => {
        this.emit(a);
      });
    });
  }

  public emit(x: string) {
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

  public withPrefix(x: string, block: () => void) {
    this.prefix.push(this.currentColor(x));
    try {
      block();
    } finally {
      this.prefix.pop();
    }
  }

  public withColor(col: Colorizer, block: () => void) {
    this.colors.push(col);
    try {
      block();
    } finally {
      this.colors.pop();
    }
  }
}

function ident(x: string) {
  return x;
}
