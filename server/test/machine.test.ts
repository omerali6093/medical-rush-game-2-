import './setup';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionMachine, type MissionRules, type RunSummary } from '../../shared/mission';

const rules: MissionRules = { timeLimit: 180, maxHealth: 100, target: 10, quizAt: [60, 120, 180], requireFinalQuiz: false };
function make(r = rules) {
  const log = { quizzes: [] as number[], ended: null as RunSummary | null };
  const m = new MissionMachine(r, { onQuiz: i => log.quizzes.push(i), onEnd: s => { log.ended = s; } });
  m.start(); return { m, log };
}
const run = (m: MissionMachine, seconds: number, dt = 0.5) => { for (let t = 0; t < seconds; t += dt) { m.advance(dt, m.distance + 10 * dt); m.resolve(); } };

test('timer is frozen while a quiz is open and resumes afterwards', () => {
  const { m, log } = make(); run(m, 70);
  assert.equal(m.state, 'QUIZ_PAUSED'); assert.deepEqual(log.quizzes, [0]);
  const frozen = m.activeTime; run(m, 30); assert.equal(m.activeTime, frozen, 'no time passes while paused');
  m.quizAnswered(true); assert.equal(m.state, 'RUNNING'); run(m, 5); assert.ok(m.activeTime > frozen);
});
test('quizzes fire once each at ~1:00 and ~2:00; deadline ends the run after the final checkpoint', () => {
  const { m, log } = make();
  run(m, 70); m.quizAnswered(true); run(m, 70); m.quizAnswered(false); run(m, 70);
  assert.deepEqual(log.quizzes, [0, 1, 2]); assert.equal(m.state, 'QUIZ_PAUSED'); assert.equal(m.activeTime, 180);
  m.quizAnswered(true);
  assert.equal(m.state, 'LOST'); assert.equal(log.ended?.reason, 'timeout'); assert.equal(log.ended?.outcome, 'lost'); assert.equal(m.activeTime, 180, 'run is never extended past the deadline');
});
test('objective met before the deadline wins immediately with no further quiz', () => {
  const { m, log } = make(); run(m, 20); m.collect(10); m.resolve();
  assert.equal(m.state, 'WON'); assert.equal(log.ended?.outcome, 'won'); assert.deepEqual(log.quizzes, []);
});
test('zero health loses; health beats objective in the same frame', () => {
  const { m, log } = make(); run(m, 5);
  m.collect(10); for (let i = 0; i < 5; i++) m.damage(); m.resolve();
  assert.equal(m.state, 'LOST'); assert.equal(log.ended?.reason, 'health');
});
test('wrong quiz answers never kill; correct heals up to max', () => {
  const { m } = make(); m.damage(); m.damage(); m.damage(); m.damage(); run(m, 61);
  assert.equal(m.health, 20); m.quizAnswered(false); assert.equal(m.health, 10); assert.equal(m.state, 'RUNNING');
  const b = make(); b.m.damage(); run(b.m, 61); b.m.quizAnswered(true); assert.equal(b.m.health, 100);
});
test('requireFinalQuiz shows a quiz before finalising an early win', () => {
  const { m, log } = make({ ...rules, requireFinalQuiz: true }); run(m, 10); m.collect(10); m.resolve();
  assert.equal(m.state, 'QUIZ_PAUSED'); assert.deepEqual(log.quizzes, [2]); m.quizAnswered(true); assert.equal(m.state, 'WON');
});
test('actions are ignored outside RUNNING (no double timers / late pickups)', () => {
  const { m } = make(); assert.equal(m.start(), false); run(m, 61); const p = m.pills; m.collect(5); m.damage(); assert.equal(m.pills, p); assert.equal(m.collisions, 0);
});
