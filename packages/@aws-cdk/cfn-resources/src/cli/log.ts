export function debug(...messages: Array<string | number | object>) {
  if (process.env.DEBUG) {
    console.debug(...messages);
  }
}
