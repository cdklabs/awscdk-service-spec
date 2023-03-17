export function parseArgv(
  argv: string[],
  namedArgs: string[],
): {
  args: Record<string, string>;
  options: Record<string, string | boolean>;
} {
  return {
    args: Object.fromEntries(
      argv
        .filter((a) => !a.startsWith('--'))
        .map(function (arg, idx) {
          return [namedArgs[idx] ?? idx, arg];
        }),
    ),
    options: Object.fromEntries(
      argv.filter((a) => a.startsWith('--')).map((a) => [a.split('=')[0].substring(2), a.split('=', 2)[1] ?? true]),
    ),
  };
}
