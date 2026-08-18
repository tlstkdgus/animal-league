'use client';

// 심사(judge) 화면 — 명세 §6.2. 모바일 우선 (태블릿·폰).
//
// 입장: 심사 코드 → 명단에서 본인 이름 선택 (명단제, §3).
// live 경기가 있으면 심사 카드, 없으면 대기 화면. 3초 폴링.
// 폼은 경기가 바뀌면 자동 초기화된다 — JudgeForm 을 live.id 로 key 해서
// React 가 컴포넌트를 새로 마운트하게 한다 (§8 폼 초기화를 상태 정리 코드 없이 보장).

import { useCallback, useEffect, useRef, useState } from 'react';
import { CharacterArt, TrackBadge } from '@/components/ui';
import type { Match, Team, Side, Round } from '@/lib/tournament';

// ------------------------------------------------------------
// 타입 · API
// ------------------------------------------------------------

type PublicState = { teams: Team[]; matches: Match[]; rev: number };
type Identity = { code: string; name: string };

const STORAGE_KEY = 'al-judge';

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    const err = body?.error ?? { code: 'UNKNOWN', message: `요청 실패 (${res.status})` };
    throw new ApiError(res.status, err.code, err.message);
  }
  return body as T;
}

// ------------------------------------------------------------
// 입장 — 코드 → 이름 선택
// ------------------------------------------------------------

function EntryGate({ notice, onEnter }: { notice: string; onEnter: (identity: Identity) => void }) {
  const [code, setCode] = useState('');
  const [roster, setRoster] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const checkCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<{ judges: string[] }>('/api/judge/auth', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setRoster(res.judges);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '확인에 실패했습니다. 다시 시도하세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md place-items-center px-6">
      <div className="w-full text-center">
        <p className="mb-1 text-xs font-bold tracking-[0.2em] text-(--orange)">ANIMAL LEAGUE</p>
        <h1 className="mb-8 text-2xl font-extrabold">심사위원 입장</h1>

        {notice && <p className="mb-4 rounded-xl bg-(--live)/10 px-4 py-3 text-sm text-(--live)">{notice}</p>}

        {roster === null ? (
          <form onSubmit={checkCode}>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="심사 코드"
              autoCapitalize="characters"
              autoComplete="off"
              className="mb-3 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-center text-lg font-bold tracking-[0.3em] outline-none focus:border-(--orange)"
            />
            {error && <p className="mb-3 text-sm text-(--live)">{error}</p>}
            <button
              disabled={busy || !code.trim()}
              className="w-full rounded-xl bg-(--orange) py-3.5 font-bold text-white disabled:opacity-40"
            >
              {busy ? '확인 중…' : '다음'}
            </button>
          </form>
        ) : roster.length === 0 ? (
          <p className="rounded-xl bg-white/5 px-4 py-6 text-sm leading-relaxed text-white/60">
            아직 심사위원 명단이 등록되지 않았습니다.
            <br />
            운영팀에 문의해 주세요.
          </p>
        ) : (
          <div>
            <p className="mb-4 text-sm text-white/55">본인 이름을 선택하세요</p>
            <div className="space-y-2">
              {roster.map((name) => (
                <button
                  key={name}
                  onClick={() => onEnter({ code, name })}
                  className="w-full rounded-xl border border-white/12 bg-(--surface) py-3.5 text-base font-bold transition-colors hover:border-(--orange) hover:bg-(--orange-glow)"
                >
                  {name}
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-white/35">명단에 이름이 없으면 운영팀에 문의하세요.</p>
          </div>
        )}
      </div>
    </main>
  );
}

// ------------------------------------------------------------
// 라운드 타이머 — 클라이언트 로컬 (기기 간 동기화 불필요, §6.2)
// ------------------------------------------------------------

const TIMER_PRESETS: Record<Round, { label: string; seconds: number }[]> = {
  1: [
    { label: '발표', seconds: 5 * 60 },
    { label: '공통 Q&A', seconds: 8 * 60 },
  ],
  2: [
    { label: '시연', seconds: 3 * 60 },
    { label: '기술 Q&A', seconds: 5 * 60 },
  ],
  3: [
    { label: '라스트 어필', seconds: 100 },
    { label: '심사 합의', seconds: 100 },
  ],
};

function Timer({ round }: { round: Round }) {
  const presets = TIMER_PRESETS[round];
  const [preset, setPreset] = useState(presets[0]);
  const [remaining, setRemaining] = useState(presets[0].seconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const pick = (p: (typeof presets)[number]) => {
    setPreset(p);
    setRemaining(p.seconds);
    setRunning(false);
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const warning = remaining <= 30 && remaining > 0;
  const finished = remaining === 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-(--surface) p-4 md:mx-auto md:w-full md:max-w-2xl md:p-5">
      <div className="mb-2 flex gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => pick(p)}
            className="flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors md:py-2 md:text-sm"
            style={
              preset.label === p.label
                ? { background: 'var(--orange)', color: '#fff' }
                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span
          className={`font-mono text-4xl font-extrabold tabular-nums md:text-5xl ${finished ? 'animate-pulse' : ''}`}
          style={{ color: warning || finished ? 'var(--live)' : undefined }}
        >
          {mm}:{ss}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setRunning((r) => !r && remaining > 0)}
            className="grid h-11 w-11 place-items-center rounded-full bg-(--orange) text-lg text-white disabled:opacity-30"
            disabled={remaining === 0}
            aria-label={running ? '일시정지' : '시작'}
          >
            {running ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => pick(preset)}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/8 text-lg text-white/70"
            aria-label="초기화"
          >
            ↺
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 심사 폼 — live 경기 (live.id 로 key 되어 경기가 바뀌면 전부 초기화)
// ------------------------------------------------------------

function JudgeForm({
  match,
  teams,
  identity,
  roster,
  onAuthLost,
}: {
  match: Match;
  teams: Team[];
  identity: Identity;
  roster: string[];
  onAuthLost: (notice: string) => void;
}) {
  const [winner, setWinner] = useState<Side | null>(null);
  const [comment, setComment] = useState('');
  const [videoA, setVideoA] = useState(false);
  const [videoB, setVideoB] = useState(false);
  const [proxyMode, setProxyMode] = useState(false);
  const [proxyName, setProxyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<string[]>([]); // 이번 경기에서 제출 완료된 명의들

  const submitAs = proxyMode && proxyName ? proxyName : identity.name;
  const isRound2 = match.round === 2;

  // 모바일: 가로형 행 카드 (스크롤 최소화) / md 이상: 세로형 대형 카드 — 태블릿·노트북에서
  // 좁은 띠로 보이던 것을 캐릭터 아트 중심의 큰 카드 두 장이 좌우로 서게 바꿨다.
  const sideCard = (side: Side) => {
    const index = side === 'A' ? match.a : match.b;
    const team = index !== null ? teams[index] : null;
    const selected = winner === side;
    return (
      <button
        key={side}
        onClick={() => setWinner(side)}
        className="relative w-full overflow-hidden rounded-2xl border-2 p-4 text-left transition-all md:p-6"
        style={{
          borderColor: selected ? 'var(--orange)' : 'rgba(255,255,255,0.1)',
          background: selected ? 'var(--orange-glow)' : 'var(--surface)',
          boxShadow: selected ? '0 0 24px rgba(255,96,0,0.25)' : 'none',
        }}
      >
        <div
          className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full border-2 text-sm font-bold md:h-9 md:w-9 md:text-base"
          style={
            selected
              ? { borderColor: 'var(--orange)', background: 'var(--orange)', color: '#fff' }
              : { borderColor: 'rgba(255,255,255,0.25)', color: 'transparent', background: 'rgba(0,0,0,0.35)' }
          }
        >
          ✓
        </div>
        <div className="flex items-center gap-4 md:flex-col md:items-stretch md:gap-4">
          <CharacterArt
            characterKey={team?.character ?? null}
            className="aspect-2/3 w-16 shrink-0 md:mx-auto md:w-full md:max-w-56"
            sizes="(min-width: 768px) 224px, 64px"
          />
          <div className="min-w-0 flex-1 md:text-center">
            <div className="mb-0.5 text-[11px] font-bold text-white/40 md:text-xs">{side}</div>
            <div className="truncate text-lg font-extrabold md:text-2xl">{team?.team || `팀 ${(index ?? 0) + 1}`}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-white/50 md:justify-center md:text-sm">
              <span className="truncate">{team?.school || '학교 미입력'}</span>
              {team && <TrackBadge track={team.track} />}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const submit = async () => {
    if (!winner || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/vote', {
        method: 'POST',
        body: JSON.stringify({
          code: identity.code,
          matchId: match.id,
          name: submitAs,
          winner,
          comment,
          videoA,
          videoB,
        }),
      });
      setSubmitted((prev) => (prev.includes(submitAs) ? prev : [...prev, submitAs]));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthLost('심사 코드가 변경되었습니다. 새 코드로 다시 입장하세요.');
      } else if (err instanceof ApiError && err.code === 'JUDGE_NOT_LISTED') {
        onAuthLost('명단에서 이름을 찾을 수 없습니다. 운영팀에 확인 후 다시 입장하세요.');
      } else if (err instanceof ApiError && err.code === 'MATCH_NOT_LIVE') {
        setError('결과가 공개되어 이 경기의 제출이 마감되었습니다.');
      } else {
        setError(err instanceof Error ? `저장에 실패했습니다: ${err.message} — 다시 시도하세요.` : '저장 실패');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="rounded-full bg-(--live) px-2.5 py-1 text-[11px] font-extrabold text-white">LIVE</span>
          <span className="ml-2 font-mono text-sm font-bold text-white/60">{match.id}</span>
        </div>
        <span className="text-xs text-white/40">
          {match.round === 3 ? '결선' : `라운드 ${match.round}`}
        </span>
      </div>

      <Timer round={match.round} />

      <p className="text-center text-sm font-bold text-white/70 md:text-base">진출할 팀을 선택하세요</p>
      <div className="space-y-3 md:grid md:grid-cols-[1fr_auto_1fr] md:items-stretch md:gap-5 md:space-y-0">
        {sideCard('A')}
        <div className="text-center text-xs font-extrabold text-white/25 md:grid md:place-items-center md:text-xl">
          VS
        </div>
        {sideCard('B')}
      </div>

      <div className="space-y-4 md:mx-auto md:w-full md:max-w-2xl">
      {isRound2 && (
        <div className="rounded-xl border border-white/10 bg-(--surface) p-3 text-sm">
          <p className="mb-2 text-xs leading-relaxed text-white/50">
            시연 장애로 <b>영상 대체 진행</b>한 팀 체크 — 실현 가능성(20점) 반영 근거로 기록됩니다 (규정 §2)
          </p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={videoA} onChange={(e) => setVideoA(e.target.checked)} />A 영상 대체
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={videoB} onChange={(e) => setVideoB(e.target.checked)} />B 영상 대체
            </label>
          </div>
        </div>
      )}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="코멘트 (선택)"
        maxLength={500}
        rows={3}
        className="w-full resize-none rounded-xl border border-white/12 bg-(--surface) px-4 py-3 text-sm outline-none focus:border-(--orange)"
      />

      <div className="rounded-xl border border-white/10 bg-(--surface) p-3">
        <label className="flex items-center justify-between text-sm">
          <span className="font-bold text-white/70">간사 대리 입력 모드</span>
          <input type="checkbox" checked={proxyMode} onChange={(e) => setProxyMode(e.target.checked)} />
        </label>
        {proxyMode && (
          <select
            value={proxyName}
            onChange={(e) => setProxyName(e.target.value)}
            className="mt-3 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none"
          >
            <option value="">제출 명의 선택…</option>
            {roster.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="rounded-xl bg-(--live)/10 px-4 py-3 text-sm text-(--live)">{error}</p>}
      {submitted.includes(submitAs) && !error && (
        <p className="rounded-xl bg-[rgba(52,199,89,0.1)] px-4 py-3 text-sm text-(--done)">
          ✓ <b>{submitAs}</b> 명의로 제출 완료 — 결과 공개 전까지 다시 제출하면 덮어씁니다.
        </p>
      )}

      <button
        disabled={!winner || busy || (proxyMode && !proxyName)}
        onClick={submit}
        className="w-full rounded-xl bg-(--orange) py-4 text-base font-extrabold text-white disabled:opacity-30"
      >
        {busy ? '제출 중…' : `${submitAs} 명의로 제출`}
      </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 대기 화면
// ------------------------------------------------------------

function WaitingScreen({ state }: { state: PublicState }) {
  // 다음 예정: 대진이 확정된 첫 ready 경기 (경기 순서 = 배열 순서)
  const next = state.matches.find((m) => m.status === 'ready' && m.a !== null && m.b !== null);
  const teamName = (index: number | null) =>
    index !== null ? state.teams[index]?.team || `팀 ${index + 1}` : '?';

  return (
    <div className="py-16 text-center">
      <div className="mb-3 text-4xl">🦁</div>
      <h2 className="mb-2 text-lg font-extrabold">대기 중입니다</h2>
      <p className="mb-8 text-sm text-white/50">운영팀이 경기를 시작하면 심사 카드가 자동으로 열립니다.</p>
      {next && (
        <div className="mx-auto max-w-xs rounded-2xl border border-white/10 bg-(--surface) px-5 py-4">
          <p className="mb-1 text-xs font-bold text-white/40">다음 예정 — {next.id}</p>
          <p className="text-sm font-bold">
            {teamName(next.a)} <span className="text-white/30">vs</span> {teamName(next.b)}
          </p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 메인
// ------------------------------------------------------------

export default function JudgePage() {
  const [identity, setIdentity] = useState<Identity | null | undefined>(undefined); // undefined = 복원 중
  const [roster, setRoster] = useState<string[]>([]);
  const [state, setState] = useState<PublicState | null>(null);
  const [notice, setNotice] = useState('');
  const revRef = useRef(0);

  // 저장된 입장 정보 복원 — 새로고침해도 코드 재입력 없이 이어간다 (행사 당일 리로드 대비)
  useEffect(() => {
    const restore = setTimeout(async () => {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (!saved) {
          setIdentity(null);
          return;
        }
        const parsed = JSON.parse(saved) as Identity;
        const res = await api<{ judges: string[] }>('/api/judge/auth', {
          method: 'POST',
          body: JSON.stringify({ code: parsed.code }),
        });
        if (res.judges.includes(parsed.name)) {
          setRoster(res.judges);
          setIdentity(parsed);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
          setIdentity(null);
        }
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
        setIdentity(null);
      }
    }, 0);
    return () => clearTimeout(restore);
  }, []);

  // 공개 상태 3초 폴링. 실패하면 마지막 정상 스냅샷 유지 (명세 §7)
  const poll = useCallback(async () => {
    try {
      // no-store: SWR 캐시 헤더를 브라우저가 존중해 낡은 스냅샷을 받는 것 방지 (viewer 와 동일)
      const res = await api<PublicState>('/api/state', { cache: 'no-store' });
      if (res.rev < revRef.current) return; // 낡은 스냅샷 무시 (§4.1)
      revRef.current = res.rev;
      setState({ teams: res.teams, matches: res.matches, rev: res.rev });
    } catch {
      /* 유지 */
    }
  }, []);

  useEffect(() => {
    if (!identity) return;
    const kickoff = setTimeout(poll, 0);
    const timer = setInterval(poll, 3000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [identity, poll]);

  const enter = (id: Identity) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(id));
    setNotice('');
    setIdentity(id);
    // 입장 직후 roster 가 비어 있으면 다시 받는다 (EntryGate 경유가 아닌 복원 경로 대비)
    api<{ judges: string[] }>('/api/judge/auth', { method: 'POST', body: JSON.stringify({ code: id.code }) })
      .then((res) => setRoster(res.judges))
      .catch(() => {});
  };

  const authLost = (message: string) => {
    sessionStorage.removeItem(STORAGE_KEY);
    setNotice(message);
    setIdentity(null);
  };

  if (identity === undefined) {
    return <main className="grid min-h-dvh place-items-center text-white/40">불러오는 중…</main>;
  }
  if (identity === null) {
    return <EntryGate notice={notice} onEnter={enter} />;
  }

  const live = state?.matches.find((m) => m.status === 'live') ?? null;

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-5 md:max-w-4xl md:px-8 md:pt-8">
      <header className="mb-5 flex items-center justify-between md:mb-8">
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-(--orange) md:text-xs">ANIMAL LEAGUE</p>
          <h1 className="text-lg font-extrabold md:text-2xl">심사</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/45">
          <b className="text-white/70">{identity.name}</b>
          <button
            onClick={() => authLost('')}
            className="rounded-lg border border-white/15 px-2.5 py-1.5 hover:bg-white/5"
          >
            나가기
          </button>
        </div>
      </header>

      {state === null ? (
        <p className="py-16 text-center text-white/40">상태를 불러오는 중…</p>
      ) : live ? (
        <JudgeForm
          key={live.id} // 경기가 바뀌면 폼 전체 초기화 (§8)
          match={live}
          teams={state.teams}
          identity={identity}
          roster={roster}
          onAuthLost={authLost}
        />
      ) : (
        <WaitingScreen state={state} />
      )}
    </main>
  );
}
