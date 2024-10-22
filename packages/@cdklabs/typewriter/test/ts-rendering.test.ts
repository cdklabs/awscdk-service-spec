import { Module, TypeScriptRenderer } from '../src';

let scope: Module;

beforeEach(() => {
  scope = new Module('typewriter.test');
});

describe('eslint rules', () => {
  test('prettier/prettier is disabled by default', () => {
    const renderer = new TypeScriptRenderer();
    expect(renderer.render(scope)).toMatchInlineSnapshot(
      `"/* eslint-disable prettier/prettier, quote-props, quotes, comma-spacing, max-len */"`,
    );
  });

  test('prettier/prettier can be explicitly enabled', () => {
    const renderer = new TypeScriptRenderer({ eslintPrettier: true });
    expect(renderer.render(scope)).toMatchInlineSnapshot(
      `"/* eslint-disable quote-props, quotes, comma-spacing, max-len */"`,
    );
  });

  test('prettier/prettier can be explicitly disabled', () => {
    const renderer = new TypeScriptRenderer({ eslintPrettier: false });
    expect(renderer.render(scope)).toMatchInlineSnapshot(
      `"/* eslint-disable prettier/prettier, quote-props, quotes, comma-spacing, max-len */"`,
    );
  });

  test('@typescript-eslint/comma-dangle is enabled by default', () => {
    const renderer = new TypeScriptRenderer();
    expect(renderer.render(scope)).toMatchInlineSnapshot(
      `"/* eslint-disable prettier/prettier, quote-props, quotes, comma-spacing, max-len */"`,
    );
  });

  test('@typescript-eslint/comma-dangle can be explicitly disabled', () => {
    const renderer = new TypeScriptRenderer({ eslintCommaDangle: false });
    expect(renderer.render(scope)).toMatchInlineSnapshot(
      `"/* eslint-disable prettier/prettier, @typescript-eslint/comma-dangle, quote-props, quotes, comma-spacing, max-len */"`,
    );
  });

  test('@typescript-eslint/comma-dangle can be explicitly enabled', () => {
    const renderer = new TypeScriptRenderer({ eslintCommaDangle: true });
    expect(renderer.render(scope)).toMatchInlineSnapshot(
      `"/* eslint-disable prettier/prettier, quote-props, quotes, comma-spacing, max-len */"`,
    );
  });
});
