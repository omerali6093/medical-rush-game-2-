import { useState, type ReactNode } from 'react';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../store/auth';
import type { Screen } from '../../types';
import { Btn, Panel } from '../ui/motion';
import { Input, Notice, useLoad } from '../ui/forms';

type Tab = 'overview' | 'missions' | 'quiz' | 'sponsors' | 'challenges';
const iso = (d: Date) => d.toISOString().slice(0, 16);
const pct = (n: number) => Math.round(n * 100) + '%';

function useAct(reload: () => void) {
  const [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const act = async (fn: () => Promise<unknown>, ok = 'Saved') => { setErr(''); setMsg(''); try { await fn(); setMsg(ok); reload(); } catch (e) { setErr(errMsg(e)); } };
  return { act, fb: <>{msg && <Notice kind="ok">{msg}</Notice>}{err && <Notice>{err}</Notice>}</> };
}
const Row = ({ children }: { children: ReactNode }) => <div className="arow">{children}</div>;

function Overview() {
  const o = useLoad<any>('/admin/reports/overview'), q = useLoad<{ questions: any[] }>('/admin/reports/questions'), c = useLoad<{ campaigns: any[] }>('/admin/reports/campaigns');
  return <>
    {o.error && <Notice>{o.error}</Notice>}
    {o.data && <div className="res"><div><b>{o.data.players}</b><small>PLAYERS</small></div><div><b>{o.data.completed}</b><small>VALIDATED RUNS</small></div><div><b>{pct(o.data.winRate)}</b><small>WIN RATE</small></div><div><b>{pct(o.data.quizAccuracy)}</b><small>QUIZ ACCURACY</small></div><div><b>{o.data.avgScore}</b><small>AVG SCORE</small></div><div><b>{o.data.rejected}</b><small>REJECTED RUNS</small></div></div>}
    <h3>Hardest questions</h3>{q.data?.questions.slice(0, 6).map(x => <Row key={x.id}><span>{x.question}</span><small>{pct(x.correctRate)} correct · {x.answered} answers · {x.avgSeconds}s</small></Row>)}
    <h3>Sponsored campaigns</h3>{c.data?.campaigns.map(x => <Row key={x.id}><span>{x.name} ({x.sponsor})</span><small>{x.status} · {x.runs} runs · {x.players} players · {x.brandedCollected} branded collected</small></Row>)}
  </>;
}

function Missions() {
  const { data, reload } = useLoad<{ missions: any[] }>('/admin/missions'), { act, fb } = useAct(reload), [ed, setEd] = useState<Record<string, any>>({});
  const val = (m: any, k: string, d: any) => ed[m._id]?.[k] ?? d;
  const set = (id: string, k: string, v: number) => setEd(p => ({ ...p, [id]: { ...p[id], [k]: v } }));
  return <>{fb}{data?.missions.map(m => (
    <div key={m._id} className="arow col"><b>L{m.level} · {m.title} <small>({m.status})</small></b>
      <div className="row">
        <Input label="Target" type="number" value={val(m, 'target', m.objective.target)} onChange={e => set(m._id, 'target', +e.target.value)} />
        <Input label="Time (s ≤180)" type="number" value={val(m, 'timeLimit', m.timeLimit)} onChange={e => set(m._id, 'timeLimit', +e.target.value)} />
        <Input label="XP" type="number" value={val(m, 'xp', m.reward.xp)} onChange={e => set(m._id, 'xp', +e.target.value)} />
        <Input label="Coins" type="number" value={val(m, 'coins', m.reward.coins)} onChange={e => set(m._id, 'coins', +e.target.value)} />
        <Btn className="btn" onClick={() => act(() => { const { xp, coins, ...rest } = ed[m._id] || {}; return api(`/admin/missions/${m._id}`, { method: 'PATCH', body: { ...rest, ...(xp !== undefined || coins !== undefined ? { reward: { ...(xp !== undefined ? { xp } : {}), ...(coins !== undefined ? { coins } : {}) } } : {}) } }); })}>Save</Btn></div></div>))}</>;
}

function Quiz() {
  const { data, reload } = useLoad<{ questions: any[] }>('/admin/questions'), { act, fb } = useAct(reload);
  const [f, setF] = useState({ scenario: '', question: '', a: '', b: '', c: '', correct: '0', explanation: '', difficulty: '1', topics: '' });
  const s = (k: string) => (e: any) => setF(p => ({ ...p, [k]: e.target.value }));
  return <>{fb}
    <div className="arow col"><b>New question (saved as draft; a different admin must approve it)</b>
      <Input label="Patient scenario" value={f.scenario} onChange={s('scenario')} /><Input label="Question" value={f.question} onChange={s('question')} />
      <div className="row"><Input label="Option A" value={f.a} onChange={s('a')} /><Input label="Option B" value={f.b} onChange={s('b')} /><Input label="Option C" value={f.c} onChange={s('c')} /></div>
      <div className="row"><label className="field"><span>Correct</span><select value={f.correct} onChange={s('correct')}><option value="0">A</option><option value="1">B</option><option value="2">C</option></select></label>
        <label className="field"><span>Difficulty</span><select value={f.difficulty} onChange={s('difficulty')}><option value="1">1 Student</option><option value="2">2 Resident</option><option value="3">3 Specialist</option></select></label><Input label="Topics (comma separated)" value={f.topics} onChange={s('topics')} /></div>
      <Input label="Explanation" value={f.explanation} onChange={s('explanation')} />
      <Btn className="btn" onClick={() => act(() => api('/admin/questions', { body: { scenario: f.scenario, question: f.question, options: [f.a, f.b, f.c], correctIndex: +f.correct, explanation: f.explanation, difficulty: +f.difficulty, topics: f.topics.split(',').map(t => t.trim()).filter(Boolean) } }), 'Draft created')}>Add draft</Btn></div>
    {data?.questions.map(q => <div key={q._id} className="arow col"><span>{q.question} <small className="dim">· {q.status}{q.sampleContent ? ' · SAMPLE content — needs clinical review' : ''} · d{q.difficulty}</small></span>
      <div className="row"><Btn className="btn ghost" onClick={() => act(() => api(`/admin/questions/${q._id}/review`, { body: { status: 'approved' } }), 'Approved')}>Approve</Btn><Btn className="btn ghost" onClick={() => act(() => api(`/admin/questions/${q._id}/review`, { body: { status: 'retired' } }), 'Retired')}>Retire</Btn></div></div>)}</>;
}

function Sponsors({ admin }: { admin: boolean }) {
  const orgs = useLoad<{ organizations: any[] }>('/admin/organizations'), assets = useLoad<{ assets: any[] }>('/admin/assets'), camps = useLoad<{ campaigns: any[] }>('/admin/campaigns');
  const reload = () => { orgs.reload(); assets.reload(); camps.reload(); }; const { act, fb } = useAct(reload);
  const [orgName, setOrgName] = useState(''), [orgId, setOrgId] = useState(''), [file, setFile] = useState<File | null>(null);
  const [c, setC] = useState({ name: '', sponsor: '', assetId: '', label: 'Sponsored dose', color: '#22e4ff', disclosure: '', start: iso(new Date()), end: iso(new Date(Date.now() + 30 * 864e5)) });
  const o = orgId || orgs.data?.organizations[0]?._id || '';
  const upload = () => act(async () => {
    if (!file) throw new Error('Choose a PNG, JPEG or WebP logo (max 256 KB)');
    const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('Could not read file')); r.readAsDataURL(file); });
    await api('/admin/assets', { body: { orgId: o, name: file.name.slice(0, 60), mime: file.type, dataBase64: b64 } });
  }, 'Logo uploaded (pending approval)');
  return <>{fb}
    {admin && <div className="arow"><Input label="New organization" value={orgName} onChange={e => setOrgName(e.target.value)} /><Btn className="btn" onClick={() => act(() => api('/admin/organizations', { body: { name: orgName } }), 'Organization created')}>Create</Btn></div>}
    <label className="field"><span>Organization</span><select value={o} onChange={e => setOrgId(e.target.value)}>{orgs.data?.organizations.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
    <div className="arow"><label className="field"><span>Logo (PNG/JPEG/WebP ≤256 KB)</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} /></label><Btn className="btn" onClick={upload}>Upload</Btn></div>
    {assets.data?.assets.map(a => <Row key={a._id}><span><img className="thumb" src={`/api/brand-assets/${a._id}`} alt="" /> {a.name} <small>({a.status})</small></span>
      {admin && a.status === 'pending' && <span><Btn className="btn ghost" onClick={() => act(() => api(`/admin/assets/${a._id}/review`, { body: { status: 'approved' } }), 'Logo approved')}>Approve</Btn> <Btn className="btn ghost" onClick={() => act(() => api(`/admin/assets/${a._id}/review`, { body: { status: 'rejected' } }), 'Logo rejected')}>Reject</Btn></span>}</Row>)}
    <div className="arow col"><b>New sponsored campaign</b>
      <div className="row"><Input label="Campaign name" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} /><Input label="Sponsor (company)" value={c.sponsor} onChange={e => setC({ ...c, sponsor: e.target.value })} /></div>
      <div className="row"><Input label="Starts" type="datetime-local" value={c.start} onChange={e => setC({ ...c, start: e.target.value })} /><Input label="Ends" type="datetime-local" value={c.end} onChange={e => setC({ ...c, end: e.target.value })} /></div>
      <div className="row"><label className="field"><span>Logo</span><select value={c.assetId} onChange={e => setC({ ...c, assetId: e.target.value })}><option value="">(none: initial only)</option>{assets.data?.assets.filter(a => a.org === o).map(a => <option key={a._id} value={a._id}>{a.name} ({a.status})</option>)}</select></label>
        <Input label="Collectible label" value={c.label} onChange={e => setC({ ...c, label: e.target.value })} /><Input label="Color" type="color" value={c.color} onChange={e => setC({ ...c, color: e.target.value })} /></div>
      <Input label="Sponsorship disclosure (shown to players)" value={c.disclosure} onChange={e => setC({ ...c, disclosure: e.target.value })} />
      <Btn className="btn" onClick={() => act(() => api('/admin/campaigns', { body: { orgId: o, name: c.name, sponsorName: c.sponsor, startsAt: new Date(c.start).toISOString(), endsAt: new Date(c.end).toISOString(), assetId: c.assetId || null, label: c.label, color: c.color, disclosure: c.disclosure } }), 'Campaign created (draft)')}>Create draft</Btn></div>
    {camps.data?.campaigns.map(x => <Row key={x._id}><span>{x.name} <small>({x.sponsorName} · {x.status})</small></span>
      <span>{x.status === 'draft' && <Btn className="btn ghost" onClick={() => act(() => api(`/admin/campaigns/${x._id}/status`, { body: { status: 'pending' } }), 'Submitted for approval')}>Submit</Btn>}
        {admin && x.status !== 'approved' && <Btn className="btn ghost" onClick={() => act(() => api(`/admin/campaigns/${x._id}/status`, { body: { status: 'approved' } }), 'Campaign live')}>Approve</Btn>}
        {x.status === 'approved' && <Btn className="btn ghost" onClick={() => act(() => api(`/admin/campaigns/${x._id}/status`, { body: { status: 'paused' } }), 'Paused')}>Pause</Btn>}</span></Row>)}</>;
}

function Challenges({ admin }: { admin: boolean }) {
  const list = useLoad<{ challenges: any[] }>('/admin/challenges'), ms = useLoad<{ missions: any[] }>(admin ? '/admin/missions' : '/missions'), { act, fb } = useAct(list.reload);
  const [f, setF] = useState({ title: '', missionId: '', start: iso(new Date()), end: iso(new Date(Date.now() + 7 * 864e5)), max: '50', attempts: '3', minLevel: '1' });
  const missions = ms.data?.missions || [], mid = f.missionId || missions[0]?._id || missions[0]?.id || '';
  return <>{fb}
    <div className="arow col"><b>New doctor challenge (max 50 players)</b>
      <div className="row"><Input label="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /><label className="field"><span>Mission</span><select value={mid} onChange={e => setF({ ...f, missionId: e.target.value })}>{missions.map((m: any) => <option key={m._id || m.id} value={m._id || m.id}>L{m.level} {m.title}</option>)}</select></label></div>
      <div className="row"><Input label="Starts" type="datetime-local" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /><Input label="Ends" type="datetime-local" value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></div>
      <div className="row"><Input label="Max players (≤50)" type="number" value={f.max} onChange={e => setF({ ...f, max: e.target.value })} /><Input label="Attempts each" type="number" value={f.attempts} onChange={e => setF({ ...f, attempts: e.target.value })} /><Input label="Min level" type="number" value={f.minLevel} onChange={e => setF({ ...f, minLevel: e.target.value })} /></div>
      <Btn className="btn" onClick={() => act(() => api('/admin/challenges', { body: { title: f.title, missionId: mid, startsAt: new Date(f.start).toISOString(), endsAt: new Date(f.end).toISOString(), maxParticipants: +f.max, maxAttempts: +f.attempts, minLevel: +f.minLevel } }), 'Challenge created')}>Create</Btn></div>
    {list.data?.challenges.map(c => <Row key={c._id}><span>{c.title} <small>({c.status} · {c.participantCount}/{c.maxParticipants})</small></span>{c.status !== 'open' && c.status !== 'scheduled' && !c.finalized && <Btn className="btn ghost" onClick={() => act(() => api(`/admin/challenges/${c._id}/finalize`, { body: {} }), 'Final standings frozen')}>Finalize</Btn>}</Row>)}</>;
}

/** Admin portal foundation: role-gated on the server too (every call below is authorized by the API, not by this UI). */
export default function Admin({ go }: { go: (s: Screen) => void }) {
  const { user } = useAuth(); const admin = user?.role === 'admin';
  const tabs: [Tab, string][] = admin ? [['overview', 'Reports'], ['missions', 'Missions'], ['quiz', 'Quiz content'], ['sponsors', 'Sponsors'], ['challenges', 'Challenges']] : [['sponsors', 'Sponsors'], ['challenges', 'Challenges']];
  const [tab, setTab] = useState<Tab>(tabs[0][0]);
  return (
    <Panel id="admin" top>
      <h2>🛠 Admin portal <small className="dim">· {user?.role}</small></h2>
      <div className="tabs wrap">{tabs.map(([k, l]) => <Btn key={k} className={`btn ${tab === k ? 'on' : 'ghost'}`} onClick={() => setTab(k)}>{l}</Btn>)}</div>
      <div className="card glass admin">
        {tab === 'overview' && <Overview />}{tab === 'missions' && <Missions />}{tab === 'quiz' && <Quiz />}{tab === 'sponsors' && <Sponsors admin={admin} />}{tab === 'challenges' && <Challenges admin={admin} />}
      </div>
      <Btn className="btn ghost" onClick={() => go('home')}>← Back</Btn>
    </Panel>
  );
}
