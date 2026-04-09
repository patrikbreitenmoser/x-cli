import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toToon } from './output.js';

describe('toToon', () => {
  it('renders flat scalar objects', () => {
    assert.equal(
      toToon({ status: 'active', count: 2 }),
      'status: "active"\ncount: 2',
    );
  });

  it('renders record arrays with a compact header', () => {
    assert.equal(
      toToon({
        tweets: [
          { id: '1', author: 'alice' },
          { id: '2', author: 'bob' },
        ],
      }),
      'tweets[2]{id,author}:\n  "1","alice"\n  "2","bob"',
    );
  });

  it('renders nested objects and primitive arrays', () => {
    assert.equal(
      toToon({
        sync: { tweets: 'never' },
        help: ['Run `x-cli tweets`'],
      }),
      'sync:\n  tweets: "never"\nhelp[1]:\n  "Run `x-cli tweets`"',
    );
  });
});
