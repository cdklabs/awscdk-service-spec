import { Module, TypeScriptRenderer } from '../src';
import { EsLintRules } from '../src/eslint-rules';

let scope: Module;

beforeEach(() => {
  scope = new Module('typewriter.test');
});

describe('eslint rules', () => {
  test('prettier/prettier and max-len are disabled by default', () => {
    const renderer = new TypeScriptRenderer();
    expect(renderer.render(scope)).toMatchInlineSnapshot(`"/* eslint-disable prettier/prettier, max-len*/"`);
  });

  test('max-len can be explicitly disabled without disabling prettier/prettier', () => {
    const renderer = new TypeScriptRenderer({ disabledEsLintRules: [EsLintRules.MAX_LEN] });
    expect(renderer.render(scope)).toMatchInlineSnapshot(`"/* eslint-disable max-len*/"`);
  });

  test('A single eslint rule can be disabled', () => {
    const renderer = new TypeScriptRenderer({ disabledEsLintRules: [EsLintRules.COMMA_DANGLE] });
    expect(renderer.render(scope)).toMatchInlineSnapshot(`"/* eslint-disable @typescript-eslint/comma-dangle*/"`);
  });

  test('many eslint rules can be disabled', () => {
    const renderer = new TypeScriptRenderer({
      disabledEsLintRules: [
        EsLintRules.COMMA_DANGLE,
        EsLintRules.COMMA_SPACING,
        EsLintRules.MAX_LEN,
        EsLintRules.PRETTIER_PRETTIER,
        EsLintRules.QUOTES,
        EsLintRules.QUOTE_PROPS,
      ],
    });
    expect(renderer.render(scope)).toMatchInlineSnapshot(
      `"/* eslint-disable @typescript-eslint/comma-dangle, comma-spacing, max-len, prettier/prettier, quotes, quote-props*/"`,
    );
  });

  test('all eslint rules can be enabled', () => {
    const renderer = new TypeScriptRenderer({
      disabledEsLintRules: [],
    });
    expect(renderer.render(scope)).toMatchInlineSnapshot(`""`);
  });
});
