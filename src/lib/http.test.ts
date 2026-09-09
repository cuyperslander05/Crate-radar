import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.SQL_HOST ??= 'localhost';
process.env.SQL_USER ??= 'test';
process.env.SQL_PASSWORD ??= 'test';
process.env.SQL_DB_NAME ??= 'test';
process.env.FIREBASE_PROJECT_ID ??= 'test-project';

const { parseId, requireString, optionalHttpsUrl, requireSpotifyTrackUri, HttpError } =
  await import('./http.ts');

const rejects = (fn: () => unknown) => assert.throws(fn, HttpError);

describe('parseId', () => {
  test('accepts positive integers', () => {
    assert.equal(parseId('42'), 42);
  });

  test('rejects values that would reach the database as NaN', () => {
    for (const bad of ['abc', '', '0', '-1', '1.5', 'NaN', 'Infinity']) {
      rejects(() => parseId(bad));
    }
  });
});

describe('requireString', () => {
  test('trims and returns the value', () => {
    assert.equal(requireString('  hello  ', 'field'), 'hello');
  });

  test('rejects non-strings, blanks and over-long input', () => {
    rejects(() => requireString(123, 'field'));
    rejects(() => requireString('   ', 'field'));
    rejects(() => requireString('x'.repeat(201), 'field'));
  });
});

describe('optionalHttpsUrl', () => {
  test('accepts an https URL and allows absence', () => {
    assert.equal(
      optionalHttpsUrl('https://i.scdn.co/image/abc', 'albumArtUrl'),
      'https://i.scdn.co/image/abc'
    );
    assert.equal(optionalHttpsUrl(undefined, 'albumArtUrl'), null);
    assert.equal(optionalHttpsUrl('', 'albumArtUrl'), null);
  });

  test('rejects non-https schemes used as injection vectors', () => {
    rejects(() => optionalHttpsUrl('javascript:alert(1)', 'albumArtUrl'));
    rejects(() => optionalHttpsUrl('data:text/html;base64,PHN2Zz4=', 'albumArtUrl'));
    rejects(() => optionalHttpsUrl('http://insecure.example/x.png', 'albumArtUrl'));
    rejects(() => optionalHttpsUrl('not a url', 'albumArtUrl'));
  });
});

describe('requireSpotifyTrackUri', () => {
  test('accepts a well-formed track URI', () => {
    const uri = 'spotify:track:4cOdK2wGLETKBW3PvgPWqT';
    assert.equal(requireSpotifyTrackUri(uri), uri);
  });

  test('rejects other Spotify entity types and malformed ids', () => {
    rejects(() => requireSpotifyTrackUri('spotify:album:4cOdK2wGLETKBW3PvgPWqT'));
    rejects(() => requireSpotifyTrackUri('spotify:track:tooshort'));
    rejects(() => requireSpotifyTrackUri('spotify:track:4cOdK2wGLETKBW3PvgPWqT extra'));
    rejects(() => requireSpotifyTrackUri('https://open.spotify.com/track/abc'));
    rejects(() => requireSpotifyTrackUri(''));
  });
});
