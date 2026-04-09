import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { enableCodexHooks } from './hooks.js';

describe('enableCodexHooks', () => {
  it('appends a features section when one does not exist', () => {
    assert.equal(
      enableCodexHooks('model = "gpt-5.4"\n'),
      'model = "gpt-5.4"\n\n[features]\ncodex_hooks = true\n',
    );
  });

  it('adds codex_hooks inside an existing features section', () => {
    assert.equal(
      enableCodexHooks('[features]\nmulti_agent = true\n'),
      '[features]\ncodex_hooks = true\nmulti_agent = true\n',
    );
  });

  it('flips codex_hooks from false to true', () => {
    assert.equal(
      enableCodexHooks('[features]\ncodex_hooks = false\n'),
      '[features]\ncodex_hooks = true\n',
    );
  });
});
