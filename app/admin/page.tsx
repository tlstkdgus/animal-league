'use client';

// 운영(admin) 화면 — 명세 §6.3.
//
// PIN 입장 → 탭 3개 (경기 진행 / 팀 관리 / 설정).
// 모든 쓰기는 POST /api/admin/action 단일 진입점을 거치고,
// 응답의 최신 스냅샷으로 화면을 즉시 동기화한다. 폴링(4초)은 보조 수단.
// 결과 공개·추첨·초기화처럼 되돌릴 수 없는 액션은 반드시 확인 다이얼로그를 거친다 (결과 취소 없음 결정).

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import universityLogos from '@/lib/universityLogos';
import type { Match, Team, Track, Side } from '@/lib/tournament';
import { TRACKS } from '@/lib/tournament';

// ------------------------------------------------------------
// 타입 · API 헬퍼
// ------------------------------------------------------------

type AdminState = {
  teams: Team[];
  matches: Match[];
  judges: string[];
  judgeCode: string;
  rev: number;
  trackWarnings: string[];
};

type VoteRow = {
  judge_slug: string;
  name: string;
  winner: Side;
  comment: string | null;
  video_a: boolean;
  video_b: boolean;
  ts: number;
};

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function api<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    const err = body?.error ?? { code: 'UNKNOWN', message: `요청 실패 (${res.status})` };
    throw new ApiError(res.status, err.code, err.message);
  }
  return body as T;
}

const action = (payload: Record<string, unknown>) =>
  api<{ state: AdminState }>('/api/admin/action', { method: 'POST', body: JSON.stringify(payload) });

// ------------------------------------------------------------
// 공용 조각
// ------------------------------------------------------------

const TRACK_COLORS: Record<Track, string> = {
  SJF: 'var(--track-sjf)',
  AAC: 'var(--track-aac)',
  LIKELION: 'var(--track-likelion)',
  OPEN: 'var(--track-open)',
};

function TrackBadge({ track }: { track: Track }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide"
      style={{ background: `color-mix(in srgb, ${TRACK_COLORS[track]} 22%, transparent)`, color: TRACK_COLORS[track] }}
    >
      {track}
    </span>
  );
}

function CharacterThumb({ characterKey, size = 40 }: { characterKey: string | null; size?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5"
      style={{ width: size, height: size * 1.4 }}
    >
      {characterKey ? (
        <Image src={`/characters/${characterKey}.png`} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[10px] text-white/30">?</div>
      )}
    </div>
  );
}

/** 확인 다이얼로그. requireText 를 주면 그 문구를 그대로 입력해야 확정된다 (초기화용). */
type Confirm = {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  requireText?: string;
  onConfirm: () => void;
};

function ConfirmDialog({ confirm, onClose }: { confirm: Confirm; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const blocked = confirm.requireText !== undefined && typed !== confirm.requireText;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[var(--surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-bold">{confirm.title}</h3>
        <p className="mb-5 whitespace-pre-line text-sm leading-relaxed text-white/60">{confirm.body}</p>
        {confirm.requireText !== undefined && (
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`"${confirm.requireText}" 입력`}
            className="mb-4 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--orange)]"
          />
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-white/60 hover:bg-white/5">
            취소
          </button>
          <button
            disabled={blocked}
            onClick={() => {
              confirm.onConfirm();
              onClose();
            }}
            className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-30"
            style={{ background: confirm.danger ? 'var(--live)' : 'var(--orange)', color: '#fff' }}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// PIN 입장
// ------------------------------------------------------------

function PinGate({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/auth', { method: 'POST', body: JSON.stringify({ pin }) });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-xs text-center">
        <p className="mb-1 text-xs font-bold tracking-[0.2em] text-[var(--orange)]">ANIMAL LEAGUE</p>
        <h1 className="mb-8 text-2xl font-extrabold">운영 콘솔</h1>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="운영 PIN"
          className="mb-3 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-lg tracking-[0.4em] outline-none focus:border-[var(--orange)]"
        />
        {error && <p className="mb-3 text-sm text-[var(--live)]">{error}</p>}
        <button
          disabled={busy || !pin}
          className="w-full rounded-xl bg-[var(--orange)] py-3 font-bold text-white disabled:opacity-40"
        >
          {busy ? '확인 중…' : '입장'}
        </button>
      </form>
    </main>
  );
}

// ------------------------------------------------------------
// 경기 진행 탭
// ------------------------------------------------------------

function teamLabel(team: Team | null, index: number | null): string {
  if (index === null) return '진출팀 대기';
  return team?.team || `팀 ${index + 1}`;
}

function TeamLine({ state, index, dimmed }: { state: AdminState; index: number | null; dimmed?: boolean }) {
  const team = index !== null ? state.teams[index] : null;
  return (
    <div className={`flex items-center gap-3 ${dimmed ? 'opacity-35' : ''}`}>
      <CharacterThumb characterKey={team?.character ?? null} size={34} />
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{teamLabel(team, index)}</div>
        <div className="flex items-center gap-2 text-xs text-white/45">
          <span className="truncate">{team?.school || (index === null ? '—' : '학교 미입력')}</span>
          {team && <TrackBadge track={team.track} />}
        </div>
      </div>
    </div>
  );
}

function VotesPanel({
  match,
  state,
  onReveal,
}: {
  match: Match;
  state: AdminState;
  onReveal: (side: Side, tallyText: string) => void;
}) {
  const [votes, setVotes] = useState<VoteRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ votes: VoteRow[] }>(`/api/admin/votes?matchId=${match.id}`);
      setVotes(res.votes);
      setFailed(false);
    } catch {
      setFailed(true); // 마지막 정상 집계 유지 (명세 §7)
    }
  }, [match.id]);

  useEffect(() => {
    // 첫 호출도 타이머로 미룬다 — react-hooks/set-state-in-effect (effect 본문 직접 setState 금지)
    const kickoff = setTimeout(load, 0);
    const timer = setInterval(load, 4000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [load]);

  const tally = {
    A: votes?.filter((v) => v.winner === 'A').length ?? 0,
    B: votes?.filter((v) => v.winner === 'B').length ?? 0,
  };
  const total = tally.A + tally.B;
  const tie = total > 0 && tally.A === tally.B;
  const isRound2 = match.round === 2;
  const tallyText = `현재 집계 A ${tally.A}표 · B ${tally.B}표${total === 0 ? ' (제출 없음 — 백업 모드)' : ''}`;

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-white/50">
          실시간 집계 {votes === null ? '(불러오는 중…)' : `— 제출 ${votes.length}건`}
          {failed && <span className="ml-2 text-[var(--live)]">갱신 실패, 마지막 값 표시 중</span>}
        </span>
        <button onClick={load} className="rounded-md px-2 py-1 text-xs text-white/50 hover:bg-white/10">
          ↻ 새로고침
        </button>
      </div>

      {tie && (
        <div className="mb-2 rounded-lg border border-[var(--live)]/40 bg-[var(--live)]/10 px-3 py-2 text-xs font-bold text-[var(--live)]">
          ⚠ 동표 — 시스템은 자동 결정하지 않습니다. 사전 합의된 규칙으로 수동 결정하세요 (명세 §3).
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        {(['A', 'B'] as const).map((side) => {
          const index = side === 'A' ? match.a : match.b;
          const leading = total > 0 && tally[side] > tally[side === 'A' ? 'B' : 'A'];
          return (
            <div
              key={side}
              className="rounded-lg border p-2 text-center"
              style={{
                borderColor: leading ? 'var(--orange)' : 'rgba(255,255,255,0.1)',
                background: leading ? 'var(--orange-glow)' : 'transparent',
              }}
            >
              <div className="truncate text-xs text-white/60">
                {side} · {teamLabel(state.teams[index ?? -1] ?? null, index)}
              </div>
              <div className="text-xl font-extrabold" style={{ color: leading ? 'var(--orange)' : undefined }}>
                {tally[side]}
              </div>
              <button
                onClick={() => onReveal(side, tallyText)}
                className="mt-1 w-full rounded-md bg-[var(--orange)] py-1.5 text-xs font-bold text-white hover:opacity-90"
              >
                이 팀 승리로 공개
              </button>
            </div>
          );
        })}
      </div>

      {votes && votes.length > 0 && (
        <ul className="space-y-1.5">
          {votes.map((v) => (
            <li key={v.judge_slug} className="rounded-lg bg-white/5 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <b>{v.name}</b>
                <span className="font-bold text-[var(--orange)]">→ {v.winner}</span>
                {isRound2 && v.video_a && <span className="text-white/50">A 영상대체</span>}
                {isRound2 && v.video_b && <span className="text-white/50">B 영상대체</span>}
              </div>
              {v.comment && <p className="mt-1 text-white/55">{v.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STATUS_LABEL = { ready: '대기', live: 'LIVE', done: '종료' } as const;

function MatchCard({
  match,
  state,
  busy,
  onStart,
  onReveal,
}: {
  match: Match;
  state: AdminState;
  busy: boolean;
  onStart: () => void;
  onReveal: (side: Side, tallyText: string) => void;
}) {
  const resolved = match.a !== null && match.b !== null;
  const winnerIndex = match.winner === 'A' ? match.a : match.winner === 'B' ? match.b : null;

  return (
    <div
      className="rounded-2xl border bg-[var(--surface)] p-4"
      style={{
        borderColor:
          match.status === 'live' ? 'var(--live)' : match.status === 'done' ? 'rgba(52,199,89,0.35)' : 'var(--border)',
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-white/70">{match.id}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${match.status === 'live' ? 'animate-pulse' : ''}`}
          style={{
            background:
              match.status === 'live' ? 'var(--live)' : match.status === 'done' ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.07)',
            color: match.status === 'live' ? '#fff' : match.status === 'done' ? 'var(--done)' : 'rgba(255,255,255,0.5)',
          }}
        >
          {STATUS_LABEL[match.status]}
        </span>
      </div>

      <div className="space-y-2">
        <TeamLine state={state} index={match.a} dimmed={match.status === 'done' && match.winner !== 'A'} />
        <TeamLine state={state} index={match.b} dimmed={match.status === 'done' && match.winner !== 'B'} />
      </div>

      {match.status === 'ready' && (
        <button
          disabled={!resolved || busy}
          onClick={onStart}
          className="mt-3 w-full rounded-lg border border-[var(--orange)]/50 py-2 text-sm font-bold text-[var(--orange)] hover:bg-[var(--orange-glow)] disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/25"
        >
          {resolved ? '경기 시작' : '대진 미확정'}
        </button>
      )}

      {match.status === 'live' && <VotesPanel match={match} state={state} onReveal={onReveal} />}

      {match.status === 'done' && winnerIndex !== null && (
        <div className="mt-3 rounded-lg bg-[rgba(52,199,89,0.1)] px-3 py-2 text-sm font-bold text-[var(--done)]">
          🏆 {teamLabel(state.teams[winnerIndex] ?? null, winnerIndex)} 진출
        </div>
      )}
    </div>
  );
}

function MatchesTab({
  state,
  busy,
  run,
  askConfirm,
}: {
  state: AdminState;
  busy: boolean;
  run: (payload: Record<string, unknown>) => void;
  askConfirm: (c: Confirm) => void;
}) {
  const r1 = state.matches.filter((m) => m.round === 1);
  const r2 = state.matches.filter((m) => m.round === 2);
  const final = state.matches.find((m) => m.round === 3);

  const canDraw = r1.every((m) => m.status === 'done') && r2.every((m) => m.a === null && m.b === null);
  const canFinal = r2.every((m) => m.status === 'done') && final !== undefined && final.a === null && final.b === null;
  const live = state.matches.find((m) => m.status === 'live');

  const startWithGuard = (match: Match) => {
    if (live && live.id !== match.id) {
      askConfirm({
        title: `${match.id} 경기 시작`,
        body: `${live.id} 가 진행 중입니다.\n이 경기를 시작하면 ${live.id} 는 대기로 돌아갑니다 (제출된 표는 유지).`,
        confirmLabel: '시작',
        onConfirm: () => run({ action: 'startMatch', matchId: match.id }),
      });
    } else {
      run({ action: 'startMatch', matchId: match.id });
    }
  };

  const revealWithConfirm = (match: Match) => (side: Side, tallyText: string) => {
    const index = side === 'A' ? match.a : match.b;
    const name = teamLabel(state.teams[index ?? -1] ?? null, index);
    askConfirm({
      title: '결과 공개',
      body: `「${name}」 승리로 공개합니다.\n${tallyText}\n\n공개 즉시 스크린에 발표되며 되돌릴 수 없습니다.`,
      confirmLabel: '공개 (되돌릴 수 없음)',
      danger: true,
      onConfirm: () => run({ action: 'revealResult', matchId: match.id, winner: side }),
    });
  };

  const section = (title: string, extra?: React.ReactNode) => (
    <div className="mb-3 mt-7 flex items-center justify-between first:mt-0">
      <h2 className="text-sm font-extrabold tracking-widest text-white/50">{title}</h2>
      {extra}
    </div>
  );

  return (
    <div>
      {state.trackWarnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          ⚠ 트랙 불일치: {state.trackWarnings.join(', ')} — 라운드 1 은 같은 트랙끼리입니다 (규정 §2). 팀 관리에서 순서를
          조정하세요.
        </div>
      )}

      {section('라운드 1 — 같은 트랙 1:1')}
      <div className="grid gap-3 sm:grid-cols-2">
        {r1.map((m) => (
          <MatchCard key={m.id} match={m} state={state} busy={busy} onStart={() => startWithGuard(m)} onReveal={revealWithConfirm(m)} />
        ))}
      </div>

      {section(
        '라운드 2 — 트랙 간 랜덤',
        <button
          disabled={!canDraw || busy}
          onClick={() =>
            askConfirm({
              title: '라운드 2 대진 추첨',
              body: 'R1 승자 4팀을 무작위로 짝짓습니다.\n추첨은 한 번만 가능하며 다시 섞을 수 없습니다.',
              confirmLabel: '추첨',
              onConfirm: () => run({ action: 'drawRound2' }),
            })
          }
          className="rounded-lg bg-[var(--orange)] px-4 py-1.5 text-sm font-bold text-white disabled:opacity-25"
        >
          🎲 대진 추첨
        </button>,
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {r2.map((m) => (
          <MatchCard key={m.id} match={m} state={state} busy={busy} onStart={() => startWithGuard(m)} onReveal={revealWithConfirm(m)} />
        ))}
      </div>

      {section(
        '결선',
        <button
          disabled={!canFinal || busy}
          onClick={() =>
            askConfirm({
              title: '결선 대진 확정',
              body: 'R2 두 경기의 승자로 결선 대진을 확정합니다.',
              confirmLabel: '확정',
              onConfirm: () => run({ action: 'setFinal' }),
            })
          }
          className="rounded-lg bg-[var(--orange)] px-4 py-1.5 text-sm font-bold text-white disabled:opacity-25"
        >
          결선 확정
        </button>,
      )}
      {final && (
        <MatchCard match={final} state={state} busy={busy} onStart={() => startWithGuard(final)} onReveal={revealWithConfirm(final)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 팀 관리 탭
// ------------------------------------------------------------

function CharacterPicker({
  current,
  usedBy,
  onPick,
  onClose,
}: {
  current: string | null;
  usedBy: Map<string, number>;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const keys = Array.from({ length: 80 }, (_, i) => `char_${String(i + 1).padStart(2, '0')}`);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[80dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[var(--surface)] p-4 xl:max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-bold text-white/70">캐릭터 선택 — 학교에 맞는 캐릭터를 고르세요</h3>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 xl:grid-cols-10">
          {keys.map((key) => {
            const owner = usedBy.get(key);
            return (
              <button
                key={key}
                onClick={() => onPick(key)}
                className="relative aspect-[2/3] overflow-hidden rounded-lg border transition-transform hover:scale-105"
                style={{ borderColor: key === current ? 'var(--orange)' : 'rgba(255,255,255,0.1)' }}
                title={owner !== undefined ? `팀 ${owner + 1} 사용 중` : key}
              >
                <Image src={`/characters/${key}.png`} alt={key} fill sizes="90px" className="object-cover" />
                {owner !== undefined && (
                  <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] font-bold text-[var(--orange)]">
                    팀{owner + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamsTab({
  state,
  busy,
  run,
}: {
  state: AdminState;
  busy: boolean;
  run: (payload: Record<string, unknown>) => void;
}) {
  // 행별 임시 편집본. 저장 전까지 폴링이 덮어쓰지 않도록 draft 를 우선한다.
  const [drafts, setDrafts] = useState<Record<number, Partial<Team>>>({});
  const [picking, setPicking] = useState<number | null>(null);

  const value = (i: number): Team => ({ ...state.teams[i], ...drafts[i] });
  const edit = (i: number, patch: Partial<Team>) =>
    setDrafts((d) => ({ ...d, [i]: { ...d[i], ...patch } }));
  const dirty = (i: number) => drafts[i] !== undefined;

  const save = (i: number) => {
    const patch = drafts[i];
    if (!patch) return;
    run({ action: 'updateTeam', index: i, patch });
    setDrafts((d) => {
      const next = { ...d };
      delete next[i];
      return next;
    });
  };

  const usedBy = new Map<string, number>();
  state.teams.forEach((t, i) => {
    const key = drafts[i]?.character ?? t.character;
    if (key) usedBy.set(key, i);
  });

  return (
    <div>
      <p className="mb-4 rounded-xl bg-white/5 px-4 py-3 text-xs leading-relaxed text-white/50">
        팀 순서가 곧 R1 대진입니다: 1–2 / 3–4 / 5–6 / 7–8 이 각각 맞붙습니다.
        <b className="text-white/70"> 같은 트랙 2팀을 인접하게</b> 배치하세요 (규정 §2). 캐릭터는 학교에 맞춰 선택.
      </p>

      <datalist id="schools">
        {Object.keys(universityLogos).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="space-y-2">
        {state.teams.map((_, i) => {
          const t = value(i);
          const logo = universityLogos[t.school];
          return (
            <div key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[var(--surface)] p-3">
              <span className="w-6 text-center font-mono text-sm text-white/40">{i + 1}</span>
              <button onClick={() => setPicking(i)} title="캐릭터 선택">
                <CharacterThumb characterKey={t.character} size={40} />
              </button>
              <div className="relative">
                <input
                  list="schools"
                  value={t.school}
                  onChange={(e) => edit(i, { school: e.target.value })}
                  placeholder="학교"
                  maxLength={40}
                  className="w-44 rounded-lg border border-white/15 bg-black/30 px-3 py-2 pr-8 text-sm outline-none focus:border-[var(--orange)] xl:w-64"
                />
                {logo && (
                  <span className="absolute right-2 top-1/2 h-5 w-5 -translate-y-1/2">
                    <Image src={logo} alt="" fill sizes="20px" className="object-contain" />
                  </span>
                )}
              </div>
              <input
                value={t.team}
                onChange={(e) => edit(i, { team: e.target.value })}
                placeholder="팀명"
                maxLength={40}
                className="w-40 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--orange)]"
              />
              <select
                value={t.track}
                onChange={(e) => edit(i, { track: e.target.value as Track })}
                className="rounded-lg border border-white/15 bg-black/30 px-2 py-2 text-sm outline-none"
                style={{ color: TRACK_COLORS[t.track] }}
              >
                {TRACKS.map((track) => (
                  <option key={track} value={track}>
                    {track}
                  </option>
                ))}
              </select>
              <button
                disabled={!dirty(i) || busy}
                onClick={() => save(i)}
                className="rounded-lg bg-[var(--orange)] px-4 py-2 text-sm font-bold text-white disabled:opacity-20"
              >
                저장
              </button>
            </div>
          );
        })}
      </div>

      {picking !== null && (
        <CharacterPicker
          current={value(picking).character}
          usedBy={usedBy}
          onPick={(key) => {
            edit(picking, { character: key });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 설정 탭
// ------------------------------------------------------------

function SettingsTab({
  state,
  busy,
  run,
  askConfirm,
}: {
  state: AdminState;
  busy: boolean;
  run: (payload: Record<string, unknown>) => void;
  askConfirm: (c: Confirm) => void;
}) {
  const [judgeCode, setJudgeCode] = useState(state.judgeCode);
  const [pin, setPin] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [clearTeams, setClearTeams] = useState(false);

  const card = 'rounded-2xl border border-white/10 bg-[var(--surface)] p-5';
  const input =
    'rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--orange)]';
  const btn = 'rounded-lg bg-[var(--orange)] px-4 py-2 text-sm font-bold text-white disabled:opacity-25';

  return (
    <div className="space-y-4 xl:max-w-2xl">
      <div className={card}>
        <h2 className="mb-1 font-bold">심사위원 명단</h2>
        <p className="mb-3 text-xs text-white/45">
          명단에 없는 명의의 제출은 서버가 거부합니다. 동명이인은 구분자를 붙여 등록하세요 (예: 김OO A).
        </p>
        <div className="mb-3 flex gap-2">
          <input
            value={judgeName}
            onChange={(e) => setJudgeName(e.target.value)}
            placeholder="심사위원 이름"
            maxLength={30}
            className={`${input} flex-1`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && judgeName.trim()) {
                run({ action: 'addJudge', name: judgeName });
                setJudgeName('');
              }
            }}
          />
          <button
            disabled={busy || !judgeName.trim()}
            onClick={() => {
              run({ action: 'addJudge', name: judgeName });
              setJudgeName('');
            }}
            className={btn}
          >
            추가
          </button>
        </div>
        {state.judges.length === 0 ? (
          <p className="text-sm text-white/35">아직 등록된 심사위원이 없습니다. 등록 전에는 어떤 제출도 받지 않습니다.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {state.judges.map((name) => (
              <li key={name} className="flex items-center gap-2 rounded-full bg-white/8 py-1 pl-3 pr-1 text-sm">
                {name}
                <button
                  onClick={() =>
                    askConfirm({
                      title: '심사위원 삭제',
                      body: `"${name}" 을 명단에서 삭제합니다. 이미 제출한 표는 유지됩니다.`,
                      confirmLabel: '삭제',
                      danger: true,
                      onConfirm: () => run({ action: 'removeJudge', name }),
                    })
                  }
                  className="grid h-6 w-6 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={card}>
        <h2 className="mb-3 font-bold">심사 코드</h2>
        <div className="flex gap-2">
          <input value={judgeCode} onChange={(e) => setJudgeCode(e.target.value)} maxLength={30} className={`${input} flex-1`} />
          <button
            disabled={busy || !judgeCode.trim() || judgeCode.trim() === state.judgeCode}
            onClick={() => run({ action: 'setJudgeCode', code: judgeCode })}
            className={btn}
          >
            변경
          </button>
        </div>
        <p className="mt-2 text-xs text-white/45">현재: <b className="text-white/70">{state.judgeCode}</b> · 대소문자 무시 비교</p>
      </div>

      <div className={card}>
        <h2 className="mb-3 font-bold">운영 PIN</h2>
        <div className="flex gap-2">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="새 PIN (6자리 이상 권장)"
            maxLength={30}
            className={`${input} flex-1`}
          />
          <button
            disabled={busy || pin.trim().length === 0}
            onClick={() =>
              askConfirm({
                title: '운영 PIN 변경',
                body: '변경 즉시 다른 운영자의 세션이 전부 무효화됩니다 (본인 세션은 유지).\n행사 전에 저장소 초기값에서 반드시 바꿔두세요.',
                confirmLabel: '변경',
                onConfirm: () => {
                  run({ action: 'setAdminPin', pin });
                  setPin('');
                },
              })
            }
            className={btn}
          >
            변경
          </button>
        </div>
      </div>

      <div className={`${card} border-[var(--live)]/30`}>
        <h2 className="mb-1 font-bold text-[var(--live)]">전체 초기화</h2>
        <p className="mb-3 text-xs leading-relaxed text-white/45">
          모든 경기 진행 상황과 심사 제출 기록을 삭제합니다. 리허설 후 본 행사 전에 사용하세요.
          <br />
          심사 코드 · PIN · 심사위원 명단은 유지됩니다.
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm text-white/60">
          <input type="checkbox" checked={clearTeams} onChange={(e) => setClearTeams(e.target.checked)} />
          팀 명단도 비우기 (리허설용 더미였을 때)
        </label>
        <button
          disabled={busy}
          onClick={() =>
            askConfirm({
              title: '전체 초기화',
              body: '브래킷 진행 상황과 모든 심사 제출이 삭제됩니다.\n되돌릴 수 없습니다. 확인 문구를 입력하세요.',
              confirmLabel: '초기화 실행',
              danger: true,
              requireText: '초기화',
              onConfirm: () => run({ action: 'reset', clearTeams }),
            })
          }
          className="rounded-lg bg-[var(--live)] px-4 py-2 text-sm font-bold text-white disabled:opacity-25"
        >
          전체 초기화
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 메인
// ------------------------------------------------------------

const TABS = [
  { key: 'matches', label: '경기 진행' },
  { key: 'teams', label: '팀 관리' },
  { key: 'settings', label: '설정' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = 확인 중
  const [state, setState] = useState<AdminState | null>(null);
  const [tab, setTab] = useState<TabKey>('matches');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const revRef = useRef(0);

  const apply = useCallback((next: AdminState) => {
    if (next.rev < revRef.current) return; // 낡은 스냅샷 무시 (명세 §4.1)
    revRef.current = next.rev;
    setState(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api<{ state: AdminState }>('/api/admin/state');
      apply(res.state);
      setAuthed(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setAuthed(false);
      // 그 외(네트워크 등)는 마지막 정상 스냅샷 유지
    }
  }, [apply]);

  useEffect(() => {
    const kickoff = setTimeout(load, 0);
    return () => clearTimeout(kickoff);
  }, [load]);

  // 폴링 4초 — 다른 운영자·심사 제출 반영. 액션 응답이 1차, 폴링은 보조.
  useEffect(() => {
    if (!authed) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [authed, load]);

  const run = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setError('');
      try {
        const res = await action(payload);
        apply(res.state);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setAuthed(false);
        } else {
          setError(err instanceof Error ? err.message : '요청에 실패했습니다.');
        }
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  if (authed === null) {
    return <main className="grid min-h-dvh place-items-center text-white/40">불러오는 중…</main>;
  }
  if (!authed) {
    return <PinGate onSuccess={load} />;
  }
  if (!state) {
    return <main className="grid min-h-dvh place-items-center text-white/40">상태를 불러오는 중…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 xl:max-w-6xl xl:px-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] text-[var(--orange)]">ANIMAL LEAGUE</p>
          <h1 className="text-xl font-extrabold xl:text-2xl">운영 콘솔</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span>rev {state.rev}</span>
          <button
            onClick={async () => {
              await api('/api/admin/auth', { method: 'DELETE' }).catch(() => {});
              setAuthed(false);
            }}
            className="rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/5"
          >
            로그아웃
          </button>
        </div>
      </header>

      {error && (
        <div
          className="mb-4 flex items-center justify-between rounded-xl border border-[var(--live)]/40 bg-[var(--live)]/10 px-4 py-3 text-sm text-[var(--live)]"
          role="alert"
        >
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-3 font-bold">
            ×
          </button>
        </div>
      )}

      <nav className="mb-6 flex gap-1 rounded-xl bg-white/5 p-1 xl:max-w-xl">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 rounded-lg py-2 text-sm font-bold transition-colors"
            style={
              tab === t.key
                ? { background: 'var(--orange)', color: '#fff' }
                : { color: 'rgba(255,255,255,0.5)' }
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'matches' && <MatchesTab state={state} busy={busy} run={run} askConfirm={setConfirm} />}
      {tab === 'teams' && <TeamsTab state={state} busy={busy} run={run} />}
      {tab === 'settings' && <SettingsTab key={state.judgeCode} state={state} busy={busy} run={run} askConfirm={setConfirm} />}

      {confirm && <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />}
    </main>
  );
}
