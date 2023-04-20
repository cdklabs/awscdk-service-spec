export class Reason {
  public static backwardsCompat() {
    return new Reason('Backwards compatibility');
  }

  public static other(reason: string) {
    return new Reason(reason);
  }

  private constructor(public readonly reason: string) {}
}
