export class Reason {
  public static backwardsCompat(description?: string) {
    return new Reason(('[Backwards compatibility] ' + description).trim());
  }

  public static other(reason: string) {
    return new Reason(reason);
  }

  public static sourceIssue(description: string) {
    return new Reason('[Suspected Data Source Problem] ' + description);
  }

  private constructor(public readonly reason: string) {}
}
