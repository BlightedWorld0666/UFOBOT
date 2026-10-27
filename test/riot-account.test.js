import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupRiotAccount } from '../src/riot-account.js';
import { guideFor, riotLookupExplanation, riotKeySummary } from '../src/bot-guide.js';

const base = { riotId: 'Player#NA1', region: 'americas', apiKey: 'test-placeholder' };

test('no Riot key does not make an outbound request', async () => {
  const result = await lookupRiotAccount({
    ...base, apiKey: '', request: () => { throw Error('unexpected request'); }
  });
  assert.equal(result.status, 'not_configured');
});

test('valid account lookup only proves an ID exists', async () => {
  let url;
  let providedKey;
  const result = await lookupRiotAccount({
    ...base,
    request: async (u, options) => {
      url = u; providedKey = options.headers['X-Riot-Token'];
      return { status: 200, ok: true, json: async () => ({ gameName: 'Player', tagLine: 'NA1', puuid: 'sample-puuid' }) };
    }
  });
  assert.equal(url, 'https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Player/NA1');
  assert.equal(providedKey, 'test-placeholder');
  assert.deepEqual(result, { status: 'found', id: 'Player#NA1', puuid: 'sample-puuid' });
  assert.equal('rank' in result, false);
  assert.equal('ownershipVerified' in result, false);
});

test('encodes ID portions safely and rejects unsupported routing region', async () => {
  let called = false;
  const response = await lookupRiotAccount({ ...base, region: 'invalid', request: () => { called = true; } });
  assert.equal(response.status, 'invalid_input');
  assert.equal(called, false);
  const encoded = await lookupRiotAccount({ ...base, riotId: 'A B#EU1', request: async u => {
    assert.match(u, /A%20B\/EU1$/);
    return { status: 404, ok: false };
  } });
  assert.equal(encoded.status, 'not_found');
});

test('reports expiry, authorization, quota and upstream failures without secrets', async () => {
  const cases = [
    [401, 'key_expired_or_invalid'], [403, 'access_denied'],
    [404, 'not_found'], [429, 'rate_limited'],
    [502, 'service_unavailable'], [400, 'lookup_error']
  ];
  for (const [code, status] of cases) {
    const result = await lookupRiotAccount({
      ...base,
      request: async () => ({ status: code, ok: false })
    });
    assert.equal(result.status, status);
    assert.equal(JSON.stringify(result).includes(base.apiKey), false);
    assert.equal(JSON.stringify(result).includes(base.riotId), false);
  }
});

test('network failures and malformed responses remain non-throwing', async () => {
  const disconnected = await lookupRiotAccount({
    ...base, request: async () => { throw Error('secret leak test-placeholder'); }
  });
  assert.deepEqual(disconnected, { status: 'network_error' });
  const malformed = await lookupRiotAccount({
    ...base, request: async () => ({ status: 200, ok: true, json: async () => ({ foo: 3 }) })
  });
  assert.equal(malformed.status, 'invalid_response');
});

test('guide covers community commands, deletion and explicit trust boundaries', () => {
  assert.match(guideFor('identity').description, /NOT prove account ownership/);
  assert.match(guideFor('staff').description, /never Riot OAuth/);
  assert.match(guideFor('progress').fields.map(x => x.value).join(' '), /reset-profile/);
  assert.equal(guideFor('not-a-topic'), guideFor('overview'));
  assert.match(riotLookupExplanation('key_expired_or_invalid'), /expired/);
  assert.match(riotKeySummary(true), /NOT verified/);
});
