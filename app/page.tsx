'use client';

// 스크린(viewer) 화면 — 명세 §6.1. 무대 프로젝터(1920×1080)와 참가자 폰이 대상.
//
// 레이아웃은 좌우 수렴형 대진표다: 왼쪽 R1 2경기 → 준결승, 오른쪽 R1 2경기 → 준결승,
// 중앙 결승. R2 는 랜덤 추첨이라 연결선이 고정이 아니다 — 추첨 전엔 점선(미정),
// 추첨 후엔 각 R1 승자가 실제로 배치된 준결승 쪽으로 실선이 이어진다.
//
// 입력 요소 없음. 3초 폴링 + rev 가드, 실패 시 마지막 정상 스냅샷 유지 (명세 §7).
// 결과 공개 연출은 직전 스냅샷과의 status diff 로 감지한 1회성 애니메이션 (~3초),
// prefers-reduced-motion 이면 정지 상태로 표시만 한다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { CharacterArt, TrackBadge } from '@/components/ui';
import { winningTeamId, type Match, type Team } from '@/lib/tournament';

type PublicState = { teams: Team[]; matches: Match[]; rev: number };

// ------------------------------------------------------------
// 데이터 헬퍼
// ------------------------------------------------------------

function teamAt(state: PublicState, index: number | null): Team | null {
  return index === null ? null : (state.teams[index] ?? null);
}

function teamName(state: PublicState, index: number | null): string {
  if (index === null) return '진출팀 대기';
  return state.teams[index]?.team || `팀 ${index + 1}`;
}

const byId = (state: PublicState, id: string) => state.matches.find((m) => m.id === id)!;

/**
 * 준결승의 상·하 피더(R1 경기). 추첨 후에는 승자가 a/b 슬롯에 실제로 배치된
 * R1 경기를 찾아 잇고, 추첨 전에는 기본 배치(왼쪽 R1-1·2 / 오른쪽 R1-3·4)를 쓴다.
 */
function feedersOf(state: PublicState, semi: Match, fallback: [string, string]): [Match, Match] {
  const r1 = state.matches.filter((m) => m.round === 1);
  if (semi.a !== null && semi.b !== null) {
    const top = r1.find((m) => winningTeamId(m) === semi.a);
    const bottom = r1.find((m) => winningTeamId(m) === semi.b);
    if (top && bottom) return [top, bottom];
  }
  return [byId(state, fallback[0]), byId(state, fallback[1])];
}

// ------------------------------------------------------------
// 경기 카드
// ------------------------------------------------------------

function TeamRow({
  state,
  index,
  match,
  side,
  size,
}: {
  state: PublicState;
  index: number | null;
  match: Match;
  side: 'A' | 'B';
  size: 'md' | 'lg';
}) {
  const team = teamAt(state, index);
  const isWinner = match.status === 'done' && match.winner === side;
  const isLoser = match.status === 'done' && match.winner !== side;
  const lg = size === 'lg';

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${isLoser ? 'opacity-35' : ''}`}
      style={isWinner ? { background: 'var(--orange-glow)' } : undefined}
    >
      <CharacterArt
        characterKey={team?.character ?? null}
        className={lg ? 'aspect-2/3 w-12' : 'aspect-2/3 w-9'}
        sizes={lg ? '48px' : '36px'}
      />
      <div className="min-w-0 flex-1">
        <div className={`truncate font-extrabold ${lg ? 'text-xl' : 'text-base'}`}>
          {teamName(state, index)}
        </div>
        <div className={`flex items-center gap-1.5 text-white/50 ${lg ? 'text-sm' : 'text-xs'}`}>
          <span className="truncate">{team?.school || (index === null ? '' : '학교 미입력')}</span>
          {team && index !== null && <TrackBadge track={team.track} />}
        </div>
      </div>
      {isWinner && (
        <span className="shrink-0 rounded-full bg-(--orange) px-2 py-0.5 text-[11px] font-extrabold text-white">
          승
        </span>
      )}
    </div>
  );
}

function MatchCard({
  state,
  match,
  size = 'md',
  revealing,
  undrawnLabel,
}: {
  state: PublicState;
  match: Match;
  size?: 'md' | 'lg';
  revealing: boolean;
  undrawnLabel?: string;
}) {
  const live = match.status === 'live';
  const unresolved = match.a === null || match.b === null;

  return (
    <div
      className={`viewer-card relative rounded-2xl border-2 bg-(--surface) p-2 ${live ? 'card-live' : ''} ${revealing ? 'card-reveal' : ''}`}
      style={{
        borderColor: live ? 'var(--live)' : match.status === 'done' ? 'rgba(255,96,0,0.4)' : 'var(--border)',
      }}
    >
      <div className="mb-1 flex items-center justify-between px-2 pt-1">
        <span className="font-mono text-xs font-bold text-white/40">{match.id}</span>
        {live && (
          <span className="live-pulse rounded-full bg-(--live) px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white">
            LIVE
          </span>
        )}
      </div>
      {unresolved && undrawnLabel ? (
        <div className="grid h-24 place-items-center text-sm font-bold text-white/30">{undrawnLabel}</div>
      ) : (
        <>
          <TeamRow state={state} index={match.a} match={match} side="A" size={size} />
          <div className="my-0.5 text-center text-[10px] font-extrabold text-white/20">VS</div>
          <TeamRow state={state} index={match.b} match={match} side="B" size={size} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 대진표 (lg 이상 — 프로젝터)
// ------------------------------------------------------------

/** 피더 2장과 준결승을 잇는 엘보 연결선. drawn=false 면 점선. */
function Connector({ mirrored, drawn }: { mirrored?: boolean; drawn: boolean }) {
  const border = drawn ? 'rgba(255,96,0,0.55)' : 'rgba(255,255,255,0.16)';
  const style = drawn ? 'solid' : 'dashed';
  const sideBorder = mirrored ? 'borderLeft' : 'borderRight';
  const corner = mirrored ? { top: 'borderTopLeftRadius', bottom: 'borderBottomLeftRadius' } : { top: 'borderTopRightRadius', bottom: 'borderBottomRightRadius' };

  return (
    <div className="relative w-7 shrink-0 self-stretch" aria-hidden>
      {/* 위 카드 중심(25%) → 세로 중앙 */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: '25%',
          height: '25%',
          [sideBorder]: `2px ${style} ${border}`,
          borderTop: `2px ${style} ${border}`,
          [corner.top]: mirrored ? 0 : 10,
        } as React.CSSProperties}
      />
      {/* 아래 카드 중심(75%) → 세로 중앙 */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: '50%',
          height: '25%',
          [sideBorder]: `2px ${style} ${border}`,
          borderBottom: `2px ${style} ${border}`,
          [corner.bottom]: mirrored ? 0 : 10,
        } as React.CSSProperties}
      />
    </div>
  );
}

/** 준결승 → 결승 한 줄 연결선. */
function FinalConnector({ drawn }: { drawn: boolean }) {
  return (
    <div className="relative w-7 shrink-0 self-stretch" aria-hidden>
      <div
        className="absolute left-0 right-0 top-1/2"
        style={{ borderTop: `2px ${drawn ? 'solid' : 'dashed'} ${drawn ? 'rgba(255,96,0,0.55)' : 'rgba(255,255,255,0.16)'}` }}
      />
    </div>
  );
}

function BracketSide({
  state,
  semi,
  fallback,
  mirrored,
  revealingId,
}: {
  state: PublicState;
  semi: Match;
  fallback: [string, string];
  mirrored?: boolean;
  revealingId: string | null;
}) {
  const [top, bottom] = feedersOf(state, semi, fallback);
  const drawn = semi.a !== null && semi.b !== null;

  const pair = (
    <div className="flex min-w-0 flex-1 flex-col justify-around gap-4">
      <MatchCard state={state} match={top} revealing={revealingId === top.id} />
      <MatchCard state={state} match={bottom} revealing={revealingId === bottom.id} />
    </div>
  );
  const semiCard = (
    <div className="grid min-w-0 flex-1 content-center">
      <MatchCard state={state} match={semi} revealing={revealingId === semi.id} undrawnLabel="추첨 대기" />
    </div>
  );

  return (
    <div className="flex min-w-0 flex-[3] items-stretch">
      {mirrored ? semiCard : pair}
      <Connector mirrored={mirrored} drawn={drawn} />
      {mirrored ? pair : semiCard}
    </div>
  );
}

// ------------------------------------------------------------
// 우승 연출
// ------------------------------------------------------------

function ChampionTakeover({ state, final }: { state: PublicState; final: Match }) {
  const index = winningTeamId(final);
  const team = teamAt(state, index);
  if (index === null) return null;

  return (
    <div className="champion fixed inset-0 z-50 grid place-items-center overflow-hidden bg-(--bg)">
      <div className="champion-glow absolute h-[120vmin] w-[120vmin] rounded-full" aria-hidden />
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        <p className="champion-rise font-display mb-6 text-2xl tracking-[0.35em] text-(--orange) md:text-4xl">
          CHAMPION
        </p>
        <div className="champion-rise" style={{ animationDelay: '0.25s' }}>
          <CharacterArt
            characterKey={team?.character ?? null}
            className="champion-float aspect-2/3 w-48 shadow-[0_0_80px_rgba(255,96,0,0.35)] md:w-72"
            sizes="(min-width: 768px) 288px, 192px"
          />
        </div>
        <h2 className="champion-rise mt-8 text-4xl font-extrabold md:text-6xl" style={{ animationDelay: '0.5s' }}>
          {teamName(state, index)}
        </h2>
        <div
          className="champion-rise mt-3 flex items-center gap-3 text-lg text-white/60 md:text-2xl"
          style={{ animationDelay: '0.65s' }}
        >
          <span>{team?.school}</span>
          {team && <TrackBadge track={team.track} />}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 메인
// ------------------------------------------------------------

export default function ViewerPage() {
  const [state, setState] = useState<PublicState | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const revRef = useRef(0);
  const prevStatusRef = useRef<Record<string, string>>({});

  const poll = useCallback(async () => {
    try {
      // no-store: s-maxage/SWR 헤더는 CDN 용인데 브라우저도 존중해서 폴링이 낡은
      // 캐시를 물고 늘어진다. 브라우저 캐시만 우회 (CDN 캐시는 그대로 동작)
      const res = await fetch('/api/state', { cache: 'no-store' });
      const body = await res.json();
      if (!body?.ok || body.rev < revRef.current) return; // 실패·낡은 스냅샷 → 마지막 정상 유지
      revRef.current = body.rev;

      // 결과 공개 감지 — 직전 스냅샷에서 done 이 아니었던 경기가 done 이 되면 1회성 연출
      const next: PublicState = { teams: body.teams, matches: body.matches, rev: body.rev };
      const prev = prevStatusRef.current;
      const justDone = next.matches.find((m) => m.status === 'done' && prev[m.id] && prev[m.id] !== 'done');
      prevStatusRef.current = Object.fromEntries(next.matches.map((m) => [m.id, m.status]));
      if (justDone) {
        setRevealingId(justDone.id);
        setTimeout(() => setRevealingId(null), 3000);
      }
      setState(next);
    } catch {
      /* 마지막 정상 스냅샷 유지 */
    }
  }, []);

  useEffect(() => {
    const kickoff = setTimeout(poll, 0);
    const timer = setInterval(poll, 3000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [poll]);

  if (state === null) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="font-display text-xl tracking-[0.3em] text-white/30">ANIMAL LEAGUE</p>
      </main>
    );
  }

  const live = state.matches.find((m) => m.status === 'live') ?? null;
  const final = byId(state, 'F');
  const semi1 = byId(state, 'R2-1');
  const semi2 = byId(state, 'R2-2');
  const champion = final.status === 'done';

  return (
    <main className="flex min-h-dvh flex-col px-4 pb-4 pt-6 lg:px-8">
      <style>{`
        .font-display { font-family: var(--font-anton), var(--font-suit), sans-serif; }
        .live-pulse { animation: livePulse 1.2s ease-in-out infinite; }
        @keyframes livePulse { 50% { opacity: 0.45; } }
        .card-live { box-shadow: 0 0 28px rgba(255,59,48,0.25); }
        .card-reveal { animation: reveal 3s ease-out 1; }
        @keyframes reveal {
          0% { transform: scale(1); box-shadow: 0 0 0 rgba(255,96,0,0); }
          12% { transform: scale(1.05); box-shadow: 0 0 60px rgba(255,96,0,0.7); }
          40% { transform: scale(1.02); box-shadow: 0 0 40px rgba(255,96,0,0.45); }
          100% { transform: scale(1); box-shadow: 0 0 0 rgba(255,96,0,0); }
        }
        .champion-glow {
          background: radial-gradient(circle, rgba(255,96,0,0.28) 0%, rgba(255,96,0,0.08) 40%, transparent 70%);
          animation: glowBreathe 4s ease-in-out infinite;
        }
        @keyframes glowBreathe { 50% { opacity: 0.6; transform: scale(1.08); } }
        .champion-rise { animation: rise 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        @keyframes rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
        .champion-float { animation: floaty 5s ease-in-out infinite; }
        @keyframes floaty { 50% { transform: translateY(-12px); } }
        @media (prefers-reduced-motion: reduce) {
          .live-pulse, .card-reveal, .champion-glow, .champion-rise, .champion-float { animation: none; }
        }
      `}</style>

      <header className="mb-4 text-center">
        <h1 className="font-display text-3xl tracking-[0.18em] text-(--orange) lg:text-5xl">ANIMAL LEAGUE</h1>
        <p className="mt-1 text-sm font-bold tracking-[0.4em] text-white/50 lg:text-base">본선 토너먼트</p>
      </header>

      {/* 라이브 배너 */}
      <div className="mx-auto mb-5 w-full max-w-3xl">
        {live ? (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-(--live)/50 bg-(--live)/10 px-5 py-3">
            <span className="live-pulse rounded-full bg-(--live) px-2.5 py-1 text-xs font-extrabold tracking-wider text-white">
              LIVE
            </span>
            <span className="truncate text-base font-extrabold lg:text-xl">
              {teamName(state, live.a)} <span className="mx-1 text-white/35">vs</span> {teamName(state, live.b)}
            </span>
            <span className="hidden font-mono text-sm text-white/40 sm:inline">{live.id}</span>
          </div>
        ) : (
          <p className="rounded-2xl border border-white/8 bg-white/4 px-5 py-3 text-center text-sm font-bold text-white/45">
            다음 경기를 준비 중입니다
          </p>
        )}
      </div>

      {/* 대진표 — lg 이상: 좌우 수렴형 */}
      <div className="hidden flex-1 items-center lg:flex">
        <div className="flex w-full items-stretch gap-0">
          <BracketSide state={state} semi={semi1} fallback={['R1-1', 'R1-2']} revealingId={revealingId} />
          <FinalConnector drawn={final.a !== null} />
          <div className="grid min-w-0 flex-[2.4] content-center gap-2 px-1">
            <p className="font-display text-center text-lg tracking-[0.3em] text-white/40">FINAL</p>
            <MatchCard state={state} match={final} size="lg" revealing={revealingId === 'F'} undrawnLabel="결선 대진 확정 전" />
          </div>
          <FinalConnector drawn={final.b !== null} />
          <BracketSide state={state} semi={semi2} fallback={['R1-3', 'R1-4']} mirrored revealingId={revealingId} />
        </div>
      </div>

      {/* 모바일 — 세로 스택 */}
      <div className="mx-auto w-full max-w-md space-y-6 lg:hidden">
        {[
          { label: '라운드 1', matches: state.matches.filter((m) => m.round === 1), undrawn: undefined },
          { label: '라운드 2', matches: [semi1, semi2], undrawn: '추첨 대기' },
          { label: '결선', matches: [final], undrawn: '결선 대진 확정 전' },
        ].map((group) => (
          <section key={group.label}>
            <h2 className="mb-2 text-xs font-extrabold tracking-[0.25em] text-white/40">{group.label}</h2>
            <div className="space-y-3">
              {group.matches.map((m) => (
                <MatchCard key={m.id} state={state} match={m} revealing={revealingId === m.id} undrawnLabel={group.undrawn} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-5 text-center text-xs text-white/30">
        각 경기 종료 후 즉시 발표 · 부스 투표 8/28(목) 23:59까지
      </footer>

      {champion && <ChampionTakeover state={state} final={final} />}
    </main>
  );
}
