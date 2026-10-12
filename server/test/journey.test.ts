import './setup';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { connectDb, disconnectDb } from '../src/db';
import { seedAll } from '../src/seed';
import { advanceClock } from '../src/clock';
import { Mission, PlayerProgress, QuizQuestion, Transaction, User, GameSession } from '../src/models';
import { permutation } from '../src/services/quiz';
import { MissionMachine, type RunSummary } from '../../shared/mission';

let server: Server, base = '';
class Client {
  cookie = '';
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'pharma-rush', ...(this.cookie ? { cookie: this.cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0].startsWith('pr_session=;') ? '' : sc.split(';')[0];
    const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* binary */ }
    return { status: r.status, json, headers: r.headers, text };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown) => this.req('POST', p, b ?? {});
}
const signup = async (name: string, email = `${name.toLowerCase()}@clinic.test`) => {
  const c = new Client();
  const r = await c.post('/api/auth/signup', { email, password: 'Str0ngPass9', displayName: name, profession: 'doctor', acceptTerms: true });
  assert.equal(r.status, 201, JSON.stringify(r.json)); return c;
};

/** Plays a whole simulated run exactly like the game client: MissionMachine + checkpoint/attempt API calls + the fake clock. */
async function playRun(c: Client, missionId: string, o: { pillsPerSec: number; answer: 'correct' | 'wrong'; hitAt?: number[]; challengeId?: string; complete?: boolean }) {
  const st = await c.post('/api/game-sessions/start', { missionId, challengeId: o.challengeId });
  assert.equal(st.status, 201, JSON.stringify(st.json));
  const { sessionId, mission } = st.json, hits = [...(o.hitAt || [])];
  let ended: RunSummary | null = null, pendingQuiz = -1;
  const m = new MissionMachine({ timeLimit: mission.timeLimit, maxHealth: mission.maxHealth, target: mission.target, quizAt: mission.quizAt, requireFinalQuiz: mission.requireFinalQuiz }, { onQuiz: i => { pendingQuiz = i; }, onEnd: s => { ended = s; } });
  m.start(); let dist = 0, carry = 0; const answered: any[] = [];
  for (let guard = 0; guard < 5000 && m.state !== 'WON' && m.state !== 'LOST'; guard++) {
    if (m.state === 'QUIZ_PAUSED') {
      advanceClock(3000);
      const cp = await c.get(`/api/quiz/checkpoint?sessionId=${sessionId}&index=${pendingQuiz}`); assert.equal(cp.status, 200, JSON.stringify(cp.json));
      assert.equal(cp.json.checkpoint.correctIndex, undefined, 'answer must never be sent with the question');
      const sess: any = await GameSession.findById(sessionId), q: any = await QuizQuestion.findById(sess.quizPlan[pendingQuiz]);
      const right = permutation(sessionId, pendingQuiz, 3).indexOf(q.correctIndex);
      const sel = o.answer === 'correct' ? right : (right + 1) % 3;
      const at = await c.post('/api/quiz/attempts', { sessionId, checkpointIndex: pendingQuiz, selectedIndex: sel, responseMs: 3000 }); assert.equal(at.status, 201, JSON.stringify(at.json));
      answered.push(at.json); m.quizAnswered(at.json.correct); continue;
    }
    const dt = 0.5; advanceClock(dt * 1000); dist += 20 * dt; m.advance(dt, dist);
    carry += o.pillsPerSec * dt; while (carry >= 1) { m.collect(1, 2); carry -= 1; }
    while (hits.length && m.activeTime >= hits[0]) { hits.shift(); m.damage(); }
    m.resolve();
  }
  assert.ok(ended, 'run must end'); const summary = ended as RunSummary;
  if (o.complete === false) return { sessionId, summary, answered, m };
  const done = await c.post(`/api/game-sessions/${sessionId}/complete`, { outcome: summary.outcome, reason: summary.reason, stats: { activeSeconds: summary.activeSeconds, distance: summary.distance, pills: summary.pills, brandedPills: summary.brandedPills, bonusPoints: summary.bonusPoints, collisions: summary.collisions, hpRemaining: summary.hpRemaining } });
  return { sessionId, summary, answered, done, m };
}

before(async () => {
  await connectDb(`mongodb://127.0.0.1:27017/pr-test-${Date.now()}`); await seedAll();
  server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(async () => { server.close(); await mongoose.connection.dropDatabase(); await disconnectDb(); });

const S: any = {};
test('auth: validation, signup, duplicate, login, logout, /me, protected routes', async () => {
  const bad = await new Client().post('/api/auth/signup', { email: 'x@y.test', password: 'short', displayName: 'Dr X', profession: 'doctor', acceptTerms: true });
  assert.equal(bad.status, 400);
  const noTerms = await new Client().post('/api/auth/signup', { email: 'x@y.test', password: 'Str0ngPass9', displayName: 'Dr X', profession: 'doctor', acceptTerms: false }); assert.equal(noTerms.status, 400);
  S.amara = await signup('Amara'); S.amaraEmail = 'amara@clinic.test';
  assert.equal((await new Client().post('/api/auth/signup', { email: 'amara@clinic.test', password: 'Str0ngPass9', displayName: 'Other', profession: 'doctor', acceptTerms: true })).status, 409);
  const me = await S.amara.get('/api/auth/me'); assert.equal(me.status, 200); assert.equal(me.json.user.email, 'amara@clinic.test'); assert.equal(me.json.progress.level, 1);
  assert.equal(JSON.stringify(me.json).includes('passwordHash'), false);
  assert.equal((await new Client().get('/api/missions')).status, 401);
  assert.equal((await new Client().post('/api/game-sessions/start', {})).status, 401);
  const noHeader = await fetch(base + '/api/auth/logout', { method: 'POST' }); assert.equal(noHeader.status, 403, 'CSRF header required');
  assert.equal((await new Client().post('/api/auth/login', { email: 'amara@clinic.test', password: 'wrong-pass-1' })).status, 401);
  const c2 = new Client(); assert.equal((await c2.post('/api/auth/login', { email: 'AMARA@clinic.test', password: 'Str0ngPass9' })).status, 200);
  await c2.post('/api/auth/logout'); assert.equal((await c2.get('/api/auth/me')).status, 401);
  const u: any = await User.findOne({ email: 'amara@clinic.test' }); assert.ok(u.passwordHash.startsWith('$2'), 'bcrypt hash');
});
test('auth: password reset invalidates old sessions', async () => {
  const c = await signup('Resetty'); const f = await new Client().post('/api/auth/forgot-password', { email: 'resetty@clinic.test' });
  assert.equal((await new Client().post('/api/auth/forgot-password', { email: 'nobody@clinic.test' })).json.message, f.json.message, 'no account enumeration');
  assert.equal((await new Client().post('/api/auth/reset-password', { token: f.json.devResetToken, password: 'N3wPassword77' })).status, 200);
  assert.equal((await c.get('/api/auth/me')).status, 401, 'old cookie revoked');
  assert.equal((await new Client().post('/api/auth/login', { email: 'resetty@clinic.test', password: 'N3wPassword77' })).status, 200);
  assert.equal((await new Client().post('/api/auth/reset-password', { token: f.json.devResetToken, password: 'An0therPass1' })).status, 400, 'token is single use');
});

test('missions: only level 1 unlocked; locked mission cannot start', async () => {
  const r = await S.amara.get('/api/missions'); assert.equal(r.status, 200);
  S.m = r.json.missions; assert.equal(S.m.length, 5);
  assert.deepEqual(S.m.map((m: any) => m.locked), [false, true, true, true, true]);
  assert.equal(S.m[0].timeLimit, 180);
  const locked = await S.amara.post('/api/game-sessions/start', { missionId: S.m[1].id }); assert.equal(locked.status, 403); assert.equal(locked.json.error.code, 'mission_locked');
});

test('quiz timing: a checkpoint cannot be fetched or answered before it is due, and answers are not leaked', async () => {
  const st = await S.amara.post('/api/game-sessions/start', { missionId: S.m[0].id }); S.early = st.json.sessionId;
  assert.equal((await S.amara.get(`/api/quiz/checkpoint?sessionId=${S.early}&index=0`)).status, 425);
  assert.equal((await S.amara.post('/api/quiz/attempts', { sessionId: S.early, checkpointIndex: 0, selectedIndex: 0, responseMs: 1000 })).status, 425);
  advanceClock(61_000);
  const cp = await S.amara.get(`/api/quiz/checkpoint?sessionId=${S.early}&index=0`); assert.equal(cp.status, 200); assert.equal(cp.json.checkpoint.options.length, 3);
  assert.equal((await S.amara.post('/api/quiz/attempts', { sessionId: S.early, checkpointIndex: 1, selectedIndex: 0, responseMs: 1000 })).status, 425, 'checkpoint 2 not due yet');
  const a1 = await S.amara.post('/api/quiz/attempts', { sessionId: S.early, checkpointIndex: 0, selectedIndex: 1, responseMs: 2000 });
  const a2 = await S.amara.post('/api/quiz/attempts', { sessionId: S.early, checkpointIndex: 0, selectedIndex: (a1.json.correctIndex), responseMs: 2000 });
  assert.equal(a2.json.replayed, true); assert.equal(a2.json.correct, a1.json.correct, 'second answer cannot change the recorded result');
});

test('win flow: timed run + 2 quizzes → validated rewards, level 2 unlocked, saved on the server', async () => {
  const r = await playRun(S.amara, S.m[0].id, { pillsPerSec: 200 / 150, answer: 'correct', hitAt: [30] });
  assert.equal(r.summary.outcome, 'won'); assert.equal(r.answered.length, 2, 'quizzes at ~1:00 and ~2:00; win at ~160s so no third quiz');
  const d = r.done!; assert.equal(d.status, 200, JSON.stringify(d.json)); const res = d.json;
  assert.equal(res.outcome, 'won'); assert.equal(res.qualifying, true); assert.ok(res.stars >= 1);
  assert.equal(res.quiz.correct, 2); assert.ok(res.xp > 0 && res.coins > 0); assert.equal(res.unlocked.level, 2);
  assert.ok(res.score > 0); S.win = res;
  const prog = await S.amara.get('/api/progress'); assert.equal(prog.json.progress.unlockedLevel, 2); assert.equal(prog.json.progress.xp, res.xp); assert.equal(prog.json.progress.coins, res.coins);
  const ms = (await S.amara.get('/api/missions')).json.missions; assert.equal(ms[0].completed, true); assert.equal(ms[1].locked, false); assert.equal(ms[2].locked, true);
  // "another device": brand-new client logs in and sees the same saved progress
  const dev2 = new Client(); await dev2.post('/api/auth/login', { email: 'amara@clinic.test', password: 'Str0ngPass9' });
  assert.equal((await dev2.get('/api/progress')).json.progress.unlockedLevel, 2);
});
test('rewards are idempotent: re-submitting the same run grants nothing twice', async () => {
  const before = (await PlayerProgress.findOne({ user: (await User.findOne({ email: 'amara@clinic.test' }))!._id }))!;
  const sid = (await GameSession.findOne({ status: 'completed' }))!._id;
  const again = await S.amara.post(`/api/game-sessions/${sid}/complete`, { outcome: 'won', stats: { activeSeconds: 1, distance: 1, pills: 999, brandedPills: 0, bonusPoints: 0, collisions: 0, hpRemaining: 100 } });
  assert.equal(again.status, 200); assert.equal(again.json.replayed, true); assert.equal(again.json.xp, S.win.xp, 'returns the originally validated result, ignores new claims');
  const after = (await PlayerProgress.findById(before._id))!; assert.equal(after.xp, before.xp); assert.equal(after.coins, before.coins);
  assert.equal(await Transaction.countDocuments({ user: before.user, kind: 'xp' }), 1);
  const [a, b] = await Promise.all([1, 2].map(() => S.amara.post(`/api/game-sessions/${sid}/complete`, { outcome: 'won', stats: { activeSeconds: 100, distance: 2000, pills: 200, brandedPills: 0, bonusPoints: 0, collisions: 0, hpRemaining: 100 } })));
  assert.deepEqual([a.status, b.status], [200, 200]);
});
test('a stranger cannot complete or read another player\'s session', async () => {
  const eve = await signup('Eve'); const sid = (await GameSession.findOne({ status: 'completed' }))!._id;
  assert.equal((await eve.post(`/api/game-sessions/${sid}/complete`, { outcome: 'won', stats: { activeSeconds: 100, distance: 100, pills: 40, brandedPills: 0, bonusPoints: 0, collisions: 0, hpRemaining: 100 } })).status, 404);
});

test('anti-cheat: impossible runs are rejected with no rewards and cannot unlock levels', async () => {
  const cheat = await signup('Cheater'); const mid = S.m[0].id;
  let st = await cheat.post('/api/game-sessions/start', { missionId: mid }); advanceClock(10_000);
  let r = await cheat.post(`/api/game-sessions/${st.json.sessionId}/complete`, { outcome: 'won', stats: { activeSeconds: 10, distance: 200, pills: 200, brandedPills: 0, bonusPoints: 0, collisions: 0, hpRemaining: 100 } });
  assert.equal(r.status, 422); assert.ok(r.json.error.details.includes('pill_rate_too_high'));
  st = await cheat.post('/api/game-sessions/start', { missionId: mid }); advanceClock(5_000);
  r = await cheat.post(`/api/game-sessions/${st.json.sessionId}/complete`, { outcome: 'won', stats: { activeSeconds: 170, distance: 3000, pills: 200, brandedPills: 0, bonusPoints: 0, collisions: 0, hpRemaining: 100 } });
  assert.equal(r.status, 422); assert.ok(r.json.error.details.includes('active_time_exceeds_wall_clock'));
  st = await cheat.post('/api/game-sessions/start', { missionId: mid }); advanceClock(100_000);
  r = await cheat.post(`/api/game-sessions/${st.json.sessionId}/complete`, { outcome: 'won', stats: { activeSeconds: 100, distance: 2000, pills: 5, brandedPills: 0, bonusPoints: 0, collisions: 0, hpRemaining: 100 } });
  assert.equal(r.status, 422); assert.ok(r.json.error.details.includes('objective_not_met'), 'a win needs the objective, not just a claim');
  st = await cheat.post('/api/game-sessions/start', { missionId: mid }); advanceClock(100_000);
  r = await cheat.post(`/api/game-sessions/${st.json.sessionId}/complete`, { outcome: 'won', score: 999999, xp: 99999, coins: 99999, stats: { activeSeconds: 100, distance: 2000, pills: 200, brandedPills: 0, bonusPoints: 0, collisions: 0, hpRemaining: 100 } });
  assert.equal(r.status, 200); assert.ok(r.json.xp <= 600 && r.json.score < 5000, 'client-sent score/xp/coins are ignored'); assert.equal(r.json.unlocked.level, 2);
  assert.equal((await cheat.get('/api/missions')).json.missions[2].locked, true);
  st = await cheat.post('/api/game-sessions/start', { missionId: mid }); advanceClock(400_000);
  assert.equal((await cheat.post(`/api/game-sessions/${st.json.sessionId}/complete`, { outcome: 'lost', stats: { activeSeconds: 10, distance: 100, pills: 1, brandedPills: 0, bonusPoints: 0, collisions: 0, hpRemaining: 0 } })).status, 410, 'overall session deadline enforced');
});

test('failure + retry: loss keeps completed levels, no unlock; a new run starts fresh and only one timer can be live', async () => {
  const p0 = (await S.amara.get('/api/progress')).json.progress;
  const lvl2 = S.m[1].id;
  const hp = await playRun(S.amara, lvl2, { pillsPerSec: 1, answer: 'wrong', hitAt: [10, 20, 30, 40, 50] });
  assert.equal(hp.summary.outcome, 'lost'); assert.equal(hp.summary.reason, 'health'); assert.equal(hp.answered.length, 0, 'no quiz after death');
  assert.equal(hp.done!.status, 200); assert.equal(hp.done!.json.outcome, 'lost'); assert.equal(hp.done!.json.unlocked, null); assert.equal(hp.done!.json.stars, 0);
  const to = await playRun(S.amara, lvl2, { pillsPerSec: 0.6, answer: 'wrong' });
  assert.equal(to.summary.reason, 'timeout'); assert.equal(to.answered.length, 3, 'final checkpoint shown at the 3:00 deadline'); assert.equal(to.summary.activeSeconds, 180);
  assert.equal(to.done!.json.outcome, 'lost'); assert.equal(to.done!.json.quiz.correct, 0);
  const p1 = (await S.amara.get('/api/progress')).json.progress;
  assert.equal(p1.unlockedLevel, 2); assert.equal(p1.missions[S.m[0].id].qualified, true, 'previous completion preserved'); assert.equal(p1.totals.runs, p0.totals.runs + 2);
  const s1 = await S.amara.post('/api/game-sessions/start', { missionId: lvl2 }), s2 = await S.amara.post('/api/game-sessions/start', { missionId: lvl2 });
  assert.notEqual(s1.json.sessionId, s2.json.sessionId);
  assert.equal(await GameSession.countDocuments({ _id: s1.json.sessionId, status: 'abandoned' }), 1, 'earlier timer abandoned');
  assert.equal((await S.amara.post(`/api/game-sessions/${s1.json.sessionId}/complete`, { outcome: 'lost', stats: { activeSeconds: 5, distance: 50, pills: 1, brandedPills: 0, bonusPoints: 0, collisions: 0, hpRemaining: 100 } })).status, 409);
  await GameSession.updateMany({ status: 'active' }, { status: 'abandoned' });
});
test('progression chain: winning level 2 unlocks level 3 and keeps level 1 + 2 completed', async () => {
  const w = await playRun(S.amara, S.m[1].id, { pillsPerSec: 260 / 120, answer: 'correct' });
  assert.equal(w.done!.json.outcome, 'won', JSON.stringify(w.done!.json)); assert.equal(w.done!.json.unlocked.level, 3);
  const ms = (await S.amara.get('/api/missions')).json.missions; assert.deepEqual(ms.map((m: any) => m.locked), [false, false, false, true, true]); assert.equal(ms[0].completed && ms[1].completed, true);
  const rep = await playRun(S.amara, S.m[0].id, { pillsPerSec: 200 / 150, answer: 'correct' }); assert.equal(rep.done!.json.unlocked, null, 'replaying does not re-unlock');
  assert.ok(rep.done!.json.xp < S.win.xp, 'repeat wins pay reduced rewards (anti-farming)');
});

test('dashboard + history + achievements + coin shop', async () => {
  const d = (await S.amara.get('/api/dashboard')).json;
  assert.ok(d.progress.totals.runs >= 5 && d.quiz.answered > 0 && d.recent.length > 0); assert.ok(d.progress.achievements.find((a: any) => a.key === 'first_win').earned);
  assert.ok(d.quiz.byTopic.length > 0);
  const h = (await S.amara.get('/api/game-sessions')).json.sessions; assert.ok(h.length >= 5 && h[0].mission);
  const bal = (await S.amara.get('/api/rewards/balance')).json; const coins = bal.coins; assert.ok(coins >= 0);
  const poor = await (await signup('Poor')).post('/api/rewards/spend', { itemId: 'skin_paramedic' }); assert.equal(poor.status, 402);
  await PlayerProgress.updateOne({ user: (await User.findOne({ email: 'amara@clinic.test' }))!._id }, { $set: { coins: 400 } });
  const [b1, b2] = await Promise.all([1, 2].map(() => S.amara.post('/api/rewards/spend', { itemId: 'skin_surgeon' })));
  assert.deepEqual([b1.status, b2.status].sort(), [200, 409], 'double-spend race: exactly one succeeds'); assert.equal((await S.amara.get('/api/rewards/balance')).json.coins, 250);
  assert.equal((await S.amara.post('/api/rewards/spend', { itemId: 'nope' })).status, 404);
});

test('quiz content workflow: only approved questions are served; edits go back to draft; self-approval blocked', async () => {
  const admin = new Client(); await User.create({ email: 'root@pr.test', passwordHash: await bcrypt.hash('Adm1nPassword', 10), displayName: 'Root', displayNameLower: 'root', role: 'admin' });
  await admin.post('/api/auth/login', { email: 'root@pr.test', password: 'Adm1nPassword' }); S.admin = admin;
  assert.equal((await S.amara.get('/api/admin/questions')).status, 403, 'players cannot reach admin APIs');
  const q = await admin.post('/api/admin/questions', { scenario: 'Test patient with a very specific scenario.', question: 'Pick option A?', options: ['A', 'B', 'C'], correctIndex: 0, explanation: 'Because A is correct in this test.', difficulty: 1, topics: ['test'] });
  assert.equal(q.status, 201); assert.equal(q.json.question.status, 'draft');
  assert.equal((await admin.post(`/api/admin/questions/${q.json.question._id}/review`, { status: 'approved' })).status, 403, 'author cannot approve own question');
  await QuizQuestion.updateMany({ sampleContent: true }, { $set: { status: 'draft' } });
  const p = await signup('Quizless'); const none = await p.post('/api/game-sessions/start', { missionId: S.m[0].id }); assert.equal(none.status, 503, 'no approved content => no run');
  await QuizQuestion.updateMany({ sampleContent: true }, { $set: { status: 'approved' } });
});

test('challenges: join rules, 50-player cap, attempts limit, validated ranking with documented tie-breakers, frozen results', async () => {
  const admin: Client = S.admin; const t0 = Date.now();
  const mk = await admin.post('/api/admin/challenges', { title: 'Clinic Cup', missionId: S.m[0].id, startsAt: new Date(t0 - 60_000).toISOString(), endsAt: new Date(t0 + 3 * 3600_000).toISOString(), maxParticipants: 50, maxAttempts: 2, minLevel: 1 });
  assert.equal(mk.status, 201); const cid = mk.json.challenge.id;
  assert.equal((await admin.post('/api/admin/challenges', { title: 'Too big', missionId: S.m[0].id, startsAt: new Date().toISOString(), endsAt: new Date(t0 + 1e7).toISOString(), maxParticipants: 51 })).status, 400, 'hard cap of 50');
  const bob = await signup('Bob'), cara = await signup('Cara'), dan = await signup('Dan');
  assert.equal((await bob.post('/api/game-sessions/start', { missionId: S.m[0].id, challengeId: cid })).status, 403, 'must join first');
  for (const c of [bob, cara, dan]) assert.equal((await c.post(`/api/challenges/${cid}/join`)).status, 200);
  assert.equal((await bob.post(`/api/challenges/${cid}/join`)).json.alreadyJoined, true);
  const bobWin = await playRun(bob, S.m[0].id, { pillsPerSec: 200 / 150, answer: 'correct', challengeId: cid });
  const caraWin = await playRun(cara, S.m[0].id, { pillsPerSec: 200 / 150, answer: 'correct', challengeId: cid });   // identical stats to Bob; Cara finishes later
  const danFast = await playRun(dan, S.m[0].id, { pillsPerSec: 200 / 100, answer: 'wrong', challengeId: cid });      // faster but 0 quiz points
  for (const r of [bobWin, caraWin, danFast]) assert.equal(r.done!.status, 200);
  const lb = (await bob.get(`/api/leaderboards/${cid}`)).json; const order = lb.standings.map((s: any) => s.displayName);
  assert.deepEqual(order, ['Bob', 'Cara', 'Dan'], 'quiz correctness outranks speed; exact tie broken by earlier validated finish');
  assert.equal(lb.me.rank, 1); assert.equal(JSON.stringify(lb).includes('@clinic.test'), false, 'no private data on the leaderboard'); assert.ok(lb.challenge.rules.length >= 5);
  const second = await playRun(bob, S.m[0].id, { pillsPerSec: 0.5, answer: 'wrong', challengeId: cid }); assert.equal(second.done!.json.outcome, 'lost');
  assert.equal((await bob.post('/api/game-sessions/start', { missionId: S.m[0].id, challengeId: cid })).status, 409, 'attempt limit (2 finished runs) enforced');
  assert.equal((await bob.get(`/api/leaderboards/${cid}`)).json.standings[0].displayName, 'Bob', 'best attempt counts, a worse retry cannot lower the rank');
  // cap test with a 2-seat challenge
  const small = (await admin.post('/api/admin/challenges', { title: 'Duo', missionId: S.m[0].id, startsAt: new Date(t0 - 1000).toISOString(), endsAt: new Date(t0 + 1e7).toISOString(), maxParticipants: 2 })).json.challenge.id;
  assert.equal((await bob.post(`/api/challenges/${small}/join`)).status, 200); assert.equal((await cara.post(`/api/challenges/${small}/join`)).status, 200);
  assert.equal((await dan.post(`/api/challenges/${small}/join`)).status, 409, 'full'); 
  const racers = await Promise.all(Array.from({ length: 6 }, (_, i) => signup(`Racer${i}`))); const duo = (await admin.post('/api/admin/challenges', { title: 'Race', missionId: S.m[0].id, startsAt: new Date(t0 - 1000).toISOString(), endsAt: new Date(t0 + 1e7).toISOString(), maxParticipants: 3 })).json.challenge.id;
  const joins = await Promise.all(racers.map(r => r.post(`/api/challenges/${duo}/join`))); assert.equal(joins.filter(j => j.status === 200).length, 3, 'concurrent joins never exceed the cap');
  const lvl = await signup('Newbie'); const gated = (await admin.post('/api/admin/challenges', { title: 'Pros', missionId: S.m[0].id, startsAt: new Date(t0 - 1000).toISOString(), endsAt: new Date(t0 + 1e7).toISOString(), minLevel: 3 })).json.challenge.id;
  assert.equal((await lvl.post(`/api/challenges/${gated}/join`)).status, 403);
  // closing: no attempts after the end, results freeze
  advanceClock(3 * 3600_000 + 10 * 60_000);
  assert.equal((await dan.post('/api/game-sessions/start', { missionId: S.m[0].id, challengeId: cid })).status, 409);
  const fin = (await bob.get(`/api/leaderboards/${cid}`)).json; assert.equal(fin.frozen, true); assert.deepEqual(fin.standings.map((s: any) => s.displayName), ['Bob', 'Cara', 'Dan']); assert.equal(fin.challenge.winners[0].displayName, 'Bob');
  const g = (await bob.get('/api/leaderboards/global?period=weekly')).json; assert.ok(g.entries.length >= 3 && g.entries[0].rank === 1);
});

test('sponsored collectibles: org admin drafts, platform admin approves; only approved logos are public; role limits', async () => {
  const admin: Client = S.admin;
  const org = (await admin.post('/api/admin/organizations', { name: 'Acme Pharma' })).json.organization;
  const oa = await signup('OrgBoss'); await User.updateOne({ email: 'orgboss@clinic.test' }, { role: 'org_admin', organization: org._id });
  const ooa = new Client(); await ooa.post('/api/auth/login', { email: 'orgboss@clinic.test', password: 'Str0ngPass9' });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  assert.equal((await ooa.post('/api/admin/assets', { orgId: org._id, name: 'evil', mime: 'image/png', dataBase64: Buffer.from('<svg onload=alert(1)>').toString('base64') })).status, 400, 'content must match type');
  const asset = (await ooa.post('/api/admin/assets', { orgId: org._id, name: 'Acme logo', mime: 'image/png', dataBase64: png.toString('base64') })).json.asset; assert.equal(asset.status, 'pending');
  assert.equal((await new Client().get(`/api/brand-assets/${asset.id}`)).status, 404, 'pending logo is not public');
  const other = await admin.post('/api/admin/organizations', { name: 'Other Co' });
  assert.equal((await ooa.post('/api/admin/campaigns', { orgId: other.json.organization._id, name: 'xx', sponsorName: 'xx', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 1e9).toISOString(), disclosure: 'Sponsored by Other Co' })).status, 403, 'org admins are scoped to their own org');
  const camp = (await ooa.post('/api/admin/campaigns', { orgId: org._id, name: 'Acme Launch', sponsorName: 'Acme Pharma', startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 864e5).toISOString(), assetId: asset.id, label: 'Acme dose', color: '#ff8800', disclosure: 'Sponsored content by Acme Pharma. Educational game only.' })).json.campaign;
  assert.equal((await ooa.post(`/api/admin/campaigns/${camp._id}/status`, { status: 'approved' })).status, 403, 'only platform admins approve');
  assert.equal((await admin.post(`/api/admin/campaigns/${camp._id}/status`, { status: 'approved' })).status, 409, 'logo must be approved first');
  assert.equal((await admin.post(`/api/admin/assets/${asset.id}/review`, { status: 'approved' })).status, 200);
  assert.equal((await admin.post(`/api/admin/campaigns/${camp._id}/status`, { status: 'approved' })).status, 200);
  const img = await new Client().get(`/api/brand-assets/${asset.id}`); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png'); assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  const brandRun = await playRun(S.amara, S.m[0].id, { pillsPerSec: 200 / 150, answer: 'correct', complete: false });
  const sess: any = await GameSession.findById(brandRun.sessionId); assert.ok(sess.campaign, 'campaign attached to the session');
  const brandInfo = (await S.amara.get(`/api/missions/${S.m[0].id}`)).json.brand; assert.equal(brandInfo.sponsor, 'Acme Pharma'); assert.ok(brandInfo.disclosure.includes('Sponsored')); assert.equal(brandInfo.logoUrl, `/api/brand-assets/${asset.id}`);
  const s = brandRun.summary; const ok = await S.amara.post(`/api/game-sessions/${brandRun.sessionId}/complete`, { outcome: s.outcome, stats: { activeSeconds: s.activeSeconds, distance: s.distance, pills: s.pills, brandedPills: s.pills, bonusPoints: s.bonusPoints, collisions: s.collisions, hpRemaining: s.hpRemaining } });
  assert.equal(ok.status, 200); assert.equal(ok.json.sponsor.name, 'Acme Pharma');
  const rep = (await ooa.get('/api/admin/reports/campaigns')).json.campaigns[0]; assert.equal(rep.runs, 1); assert.ok(rep.brandedCollected >= 200);
  assert.equal((await ooa.get('/api/admin/reports/overview')).status, 403);
  const ov = (await admin.get('/api/admin/reports/overview')).json; assert.ok(ov.players >= 5 && ov.completed > 5 && ov.rejected >= 3 && ov.quizAccuracy > 0);
  assert.equal((await admin.get('/api/admin/reports/questions')).status, 200); assert.ok((await admin.get('/api/admin/reports/audit')).json.log.length > 3);
});

test('admin mission management + account deletion', async () => {
  const admin: Client = S.admin;
  const upd = await admin.req('PATCH', `/api/admin/missions/${S.m[4].id}`, { target: 150, reward: { xp: 300 } }); assert.equal(upd.status, 200); assert.equal(upd.json.mission.objective.target, 150); assert.equal(upd.json.mission.reward.xp, 300); assert.equal(upd.json.mission.reward.coins, 80);
  const bad = await admin.req('PATCH', `/api/admin/missions/${S.m[4].id}`, { timeLimit: 999 }); assert.equal(bad.status, 400, 'time limit is capped at 3 minutes');
  const gone = await signup('Goner'); assert.equal((await gone.req('DELETE', '/api/me', { password: 'wrong' })).status, 403);
  assert.equal((await gone.req('DELETE', '/api/me', { password: 'Str0ngPass9' })).status, 200); assert.equal(await User.countDocuments({ email: 'goner@clinic.test' }), 0); assert.equal((await gone.get('/api/me')).status, 401);
  assert.equal(await Mission.countDocuments({}), 5);
});
