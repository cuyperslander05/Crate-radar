import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { projectPosition, type PositionAnchor } from '../lib/playback.ts';

const anchor = (over: Partial<PositionAnchor> = {}): PositionAnchor => ({
  positionMs: 1000,
  at: 10_000,
  isPaused: false,
  ...over,
});

describe('projectPosition', () => {
  test('advances with elapsed wall-clock time while playing', () => {
    // The bug this guards: player_state_changed never fires as a track plays,
    // so without extrapolation the readout froze at its starting value.
    assert.equal(projectPosition(anchor(), 10_000, 200_000), 1000);
    assert.equal(projectPosition(anchor(), 12_500, 200_000), 3500);
    assert.equal(projectPosition(anchor(), 40_000, 200_000), 31_000);
  });

  test('stays fixed while paused', () => {
    const paused = anchor({ isPaused: true });
    assert.equal(projectPosition(paused, 10_000, 200_000), 1000);
    assert.equal(projectPosition(paused, 99_000, 200_000), 1000);
  });

  test('never runs past the track duration', () => {
    assert.equal(projectPosition(anchor({ positionMs: 0, at: 0 }), 500_000, 200_000), 200_000);
  });

  test('is unbounded when the duration is not known yet', () => {
    assert.equal(projectPosition(anchor({ positionMs: 0, at: 0 }), 5_000, 0), 5_000);
  });

  test('does not go backwards if the clock jumps back', () => {
    assert.equal(projectPosition(anchor(), 9_000, 200_000), 1000);
  });
});
