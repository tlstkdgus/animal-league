'use client';

// 스크린(viewer) 화면 — 명세 §6.1. 무대 프로젝터(1920×1080)와 참가자 폰이 대상.
//
// 레이아웃은 좌우 수렴형 대진표다 (아래→위 피라미드형과 실캡처 비교 후 결정, 2026-08-18):
// 왼쪽 R1 2경기 → 준결승, 오른쪽 R1 2경기 → 준결승, 중앙 결승.
// R2 는 랜덤 추첨이라 연결선이 고정이 아니다 — 추첨 전엔 점선(미정),
// 추첨 후엔 각 R1 승자가 실제로 배치된 준결승 쪽으로 실선이 이어진다.
//
// 입력 요소 없음. 3초 폴링 + rev 가드, 실패 시 마지막 정상 스냅샷 유지 (명세 §7).
// 결과 공개 연출은 직전 스냅샷과의 status diff 로 감지한 1회성 애니메이션 (~3초),
// prefers-reduced-motion 이면 정지 상태로 표시만 한다.

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { CharacterArt, SchoolTag } from '@/components/ui';
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
    // xl(1280~1535)은 컴팩트 밀도 — 카드 최소 폭이 열 폭을 넘으면 이웃 카드 위로 배어 나온다.
    // 2xl 부터 프로젝터용 크기로 확장.
    <div
      className={`flex items-center gap-2.5 rounded-lg px-2 transition-colors 2xl:gap-3.5 2xl:px-3 ${lg ? 'py-2.5 2xl:py-3' : 'py-2 2xl:py-2.5'} ${isLoser ? 'opacity-30' : ''}`}
      style={isWinner ? { background: 'var(--orange-glow)' } : undefined}
    >
      <CharacterArt
        characterKey={team?.character ?? null}
        className={lg ? 'aspect-2/3 w-11 2xl:w-16' : 'aspect-2/3 w-10 2xl:w-14'}
        sizes={lg ? '64px' : '56px'}
      />
      <div className="min-w-0 flex-1">
        {/* 팀명은 자르지 않는다 — 2줄 줄바꿈 + 길이 조건 스케일.
            짧은 이름은 프로젝터 가독성 우선으로 크게, 11자 이상(최대 20자)은 한 단계
            줄여서 2줄 안에 온전히 들어가게 한다. 자른 팀명은 무대에서 틀린 이름이다. */}
        <div
          className={`line-clamp-2 font-extrabold leading-tight tracking-tight ${nameSize(teamName(state, index), lg)}`}
        >
          {teamName(state, index)}
        </div>
        <div className="mt-1">
          {team && index !== null ? (
            <SchoolTag school={team.school || '학교 미입력'} track={team.track} size={lg ? 'md' : 'sm'} trackFrom2xl />
          ) : null}
        </div>
      </div>
      {isWinner && (
        <span className="shrink-0 rounded bg-(--orange) px-1.5 py-0.5 text-[11px] font-extrabold text-white">승</span>
      )}
    </div>
  );
}

/**
 * 팀명 길이 조건 글자 크기 — 20자(실운영 최대)가 2줄에 들어가는 값.
 * xl 은 컴팩트, 2xl 부터 프로젝터 크기.
 */
function nameSize(name: string, lg: boolean): string {
  if (lg) return name.length > 10 ? 'text-base 2xl:text-xl' : 'text-xl 2xl:text-[26px]';
  return name.length > 10 ? 'text-sm 2xl:text-[17px]' : 'text-lg 2xl:text-[22px]';
}

function VsDivider() {
  return (
    <div className="flex items-center gap-2 px-3" aria-hidden>
      <div className="h-px flex-1 bg-white/6" />
      <span className="text-[9px] font-extrabold tracking-widest text-white/20">VS</span>
      <div className="h-px flex-1 bg-white/6" />
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
      className={`viewer-card relative rounded-xl border p-1.5 ${live ? 'card-live' : ''} ${revealing ? 'card-reveal' : ''}`}
      style={{
        borderColor: live
          ? 'var(--live)'
          : match.status === 'done'
            ? 'rgba(255,96,0,0.30)'
            : 'rgba(255,255,255,0.08)',
        background: 'linear-gradient(180deg, var(--surface2) 0%, var(--surface) 100%)',
      }}
    >
      <div className="flex items-center justify-between px-3 pb-0.5 pt-1.5">
        <span className="font-mono text-[11px] font-bold tracking-wider text-white/30">{match.id}</span>
        {live && (
          <span className="live-pulse rounded bg-(--live) px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.15em] text-white">
            LIVE
          </span>
        )}
      </div>
      {unresolved && undrawnLabel ? (
        <div className="m-2 grid h-24 place-items-center rounded-lg border border-dashed border-white/10 text-sm font-bold text-white/25">
          {undrawnLabel}
        </div>
      ) : (
        <>
          <TeamRow state={state} index={match.a} match={match} side="A" size={size} />
          <VsDivider />
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
  const border = drawn ? 'rgba(255,96,0,0.55)' : 'rgba(255,255,255,0.14)';
  const style = drawn ? 'solid' : 'dashed';
  const sideBorder = mirrored ? 'borderLeft' : 'borderRight';
  const corner = mirrored
    ? { top: 'borderTopLeftRadius', bottom: 'borderBottomLeftRadius' }
    : { top: 'borderTopRightRadius', bottom: 'borderBottomRightRadius' };

  return (
    <div className="relative w-5 shrink-0 self-stretch 2xl:w-8" aria-hidden>
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
    <div className="relative w-5 shrink-0 self-stretch 2xl:w-8" aria-hidden>
      <div
        className="absolute left-0 right-0 top-1/2"
        style={{
          borderTop: `2px ${drawn ? 'solid' : 'dashed'} ${drawn ? 'rgba(255,96,0,0.55)' : 'rgba(255,255,255,0.14)'}`,
        }}
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
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-12">
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
// 대결 포커스 (live) · 투표 오픈 시퀀스 (공개 직후)
// ------------------------------------------------------------

const SIDE_COLORS: Record<'A' | 'B', string> = { A: 'var(--orange)', B: '#4FA8F6' };

/** 투표 칩 오픈 간격 — 칩 애니메이션·카운터·시퀀스 전체 길이가 이 값 하나를 공유한다. */
const CHIP_INTERVAL_MS = 1600;

function TeamHero({
  state,
  index,
  dimmed,
  winner,
  compact,
}: {
  state: PublicState;
  index: number | null;
  dimmed?: boolean;
  winner?: boolean;
  compact?: boolean;
}) {
  const team = teamAt(state, index);
  return (
    <div
      className={`flex flex-col items-center text-center transition-all duration-700 ${dimmed ? 'opacity-25 grayscale' : ''} ${winner ? 'scale-105' : ''}`}
    >
      <CharacterArt
        characterKey={team?.character ?? null}
        className={`aspect-2/3 ${compact ? 'w-36 lg:w-44' : 'w-44 lg:w-60'} ${winner ? 'shadow-[0_0_70px_rgba(255,96,0,0.4)]' : ''}`}
        sizes="(min-width: 1024px) 240px, 176px"
      />
      <p
        className={`mt-5 max-w-full font-extrabold leading-tight tracking-tight ${compact ? 'text-2xl lg:text-3xl' : 'text-3xl lg:text-5xl'}`}
        style={{ textWrap: 'balance' }}
      >
        {teamName(state, index)}
      </p>
      <div className="mt-2.5">
        {team && index !== null && <SchoolTag school={team.school} track={team.track} size="lg" />}
      </div>
      {winner && (
        <span className="champion-rise mt-4 rounded-lg bg-(--orange) px-4 py-1.5 text-lg font-extrabold text-white">
          진출 확정
        </span>
      )}
    </div>
  );
}

/** live 경기 포커스 — 대진표 대신 해당 대결을 크게 (§6.1). */
function FocusLive({ state, match }: { state: PublicState; match: Match }) {
  return (
    <div data-view="focus" className="grid flex-1 place-items-center py-6">
      <div className="grid w-full max-w-6xl grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_auto_1fr] lg:gap-12">
        <TeamHero state={state} index={match.a} />
        <div className="flex flex-col items-center gap-3">
          <span className="live-pulse rounded bg-(--live) px-3 py-1 text-sm font-extrabold tracking-[0.2em] text-white">
            LIVE
          </span>
          <span className="font-display text-6xl tracking-wide text-white/85 lg:text-8xl">VS</span>
          <span className="font-mono text-xs font-bold tracking-[0.2em] text-white/35">
            {match.id} · {match.round === 3 ? 'FINAL' : `ROUND ${match.round}`}
          </span>
        </div>
        <TeamHero state={state} index={match.b} />
      </div>
    </div>
  );
}

/**
 * 결과 공개 시퀀스 — "투표를 공개합니다" → 익명 표가 하나씩 오픈 → 승자 발표.
 * 표가 없으면(백업 모드) 오픈 단계를 건너뛰고 바로 발표한다.
 * 타이밍은 부모(ViewerPage)가 시퀀스 전체 길이로 관리하고, 여기서는 승자 단계 전환만 다룬다.
 */
function RevealSequence({ state, match }: { state: PublicState; match: Match }) {
  const votes = match.votes ?? [];
  const [showWinner, setShowWinner] = useState(votes.length === 0);

  useEffect(() => {
    if (votes.length === 0) return;
    const timer = setTimeout(() => setShowWinner(true), votes.length * CHIP_INTERVAL_MS + 800);
    return () => clearTimeout(timer);
  }, [votes.length]);

  const tally = (side: 'A' | 'B') => votes.filter((v) => v === side).length;
  const chipCharacter = (side: 'A' | 'B') => teamAt(state, side === 'A' ? match.a : match.b)?.character ?? null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6 lg:gap-10">
      <p className="champion-rise text-2xl font-extrabold tracking-tight lg:text-4xl">
        {votes.length > 0 ? '투표를 공개합니다' : '결과를 발표합니다'}
      </p>

      <div className="grid w-full max-w-6xl grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_auto_1fr] lg:gap-12">
        <TeamHero state={state} index={match.a} compact dimmed={showWinner && match.winner !== 'A'} winner={showWinner && match.winner === 'A'} />
        <div className="flex flex-col items-center gap-2">
          {votes.length > 0 && (
            <div className="flex items-center gap-5 font-mono text-5xl font-extrabold tabular-nums lg:text-6xl">
              <span style={{ color: SIDE_COLORS.A }}>{showWinner ? tally('A') : <LiveTally votes={votes} side="A" />}</span>
              <span className="text-2xl text-white/25">:</span>
              <span style={{ color: SIDE_COLORS.B }}>{showWinner ? tally('B') : <LiveTally votes={votes} side="B" />}</span>
            </div>
          )}
          {!showWinner && votes.length === 0 && <span className="font-display text-6xl text-white/85">VS</span>}
        </div>
        <TeamHero state={state} index={match.b} compact dimmed={showWinner && match.winner !== 'B'} winner={showWinner && match.winner === 'B'} />
      </div>

      {votes.length > 0 && (
        <div className="flex flex-wrap items-end justify-center gap-3.5">
          {/* 표받은 팀의 캐릭터 카드가 열린다 — A/B 글자는 어느 팀인지 한 번 더 생각하게 만든다 */}
          {votes.map((side, i) => (
            <div
              key={i}
              className="vote-chip relative aspect-2/3 w-16 overflow-hidden rounded-lg border-2 bg-white/5 lg:w-20"
              style={{
                animationDelay: `${(i * CHIP_INTERVAL_MS) / 1000}s`,
                borderColor: SIDE_COLORS[side],
                boxShadow: `0 0 18px color-mix(in srgb, ${SIDE_COLORS[side]} 35%, transparent)`,
              }}
            >
              {chipCharacter(side) ? (
                <Image src={`/characters/${chipCharacter(side)}.png`} alt="" fill sizes="80px" className="object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center text-xl font-extrabold" style={{ color: SIDE_COLORS[side] }}>
                  {side}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 오픈된 칩 수를 따라 올라가는 카운터 — 칩 오픈 타이밍(1초 간격)과 동기화. */
function LiveTally({ votes, side }: { votes: ('A' | 'B')[]; side: 'A' | 'B' }) {
  const [opened, setOpened] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setOpened((n) => Math.min(n + 1, votes.length)), CHIP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [votes.length]);
  return <>{votes.slice(0, opened).filter((v) => v === side).length}</>;
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
        <h2
          className="champion-rise mt-8 max-w-full text-4xl font-extrabold tracking-tight md:text-6xl"
          style={{ animationDelay: '0.5s', textWrap: 'balance' }}
        >
          {teamName(state, index)}
        </h2>
        <div className="champion-rise mt-4" style={{ animationDelay: '0.65s' }}>
          {team && <SchoolTag school={team.school} track={team.track} size="lg" />}
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
  // 결과 공개 시퀀스 — 공개 순간의 경기 스냅샷을 고정해서 재생 (폴링 갱신에 흔들리지 않게)
  const [sequence, setSequence] = useState<Match | null>(null);
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
        // 시퀀스 길이 = 표 오픈(CHIP_INTERVAL_MS/장) + 카운트 여운 + 승자 발표 홀드
        const voteCount = justDone.votes?.length ?? 0;
        const total = (voteCount > 0 ? voteCount * CHIP_INTERVAL_MS + 800 : 0) + 4200;
        setSequence(justDone);
        setTimeout(() => setSequence(null), total);
        // 시퀀스가 끝나고 브래킷으로 돌아왔을 때 해당 카드에 잔광
        setRevealingId(justDone.id);
        setTimeout(() => setRevealingId(null), total + 3000);
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
    <main className="flex min-h-dvh flex-col px-5 pb-3 pt-5 lg:px-10">
      <style>{`
        .font-display { font-family: var(--font-anton), var(--font-pretendard), sans-serif; }
        .live-pulse { animation: livePulse 1.2s ease-in-out infinite; }
        @keyframes livePulse { 50% { opacity: 0.45; } }
        .card-live { box-shadow: 0 0 28px rgba(255,59,48,0.22); }
        .card-reveal { animation: reveal 3s ease-out 1; }
        @keyframes reveal {
          0% { transform: scale(1); box-shadow: 0 0 0 rgba(255,96,0,0); }
          12% { transform: scale(1.04); box-shadow: 0 0 60px rgba(255,96,0,0.65); }
          40% { transform: scale(1.015); box-shadow: 0 0 40px rgba(255,96,0,0.4); }
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
        .vote-chip { animation: chipOpen 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
        @keyframes chipOpen {
          from { opacity: 0; transform: translateY(34px) rotateY(90deg); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .live-pulse, .card-reveal, .champion-glow, .champion-rise, .champion-float, .vote-chip { animation: none; }
        }
      `}</style>

      {/* 헤더 — 좌: 대회 아이덴티티 / 우: 라이브 상태. 배너 행을 없애 브래킷에 세로를 넘긴다 */}
      <header className="mb-2 flex flex-col gap-3 lg:mb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold tracking-[0.3em] text-white/35 lg:text-[11px]">
            2026 LIKELION UNIV. 14TH HACKATHON
          </p>
          <h1 className="font-display mt-1 text-4xl leading-none tracking-[0.06em] text-(--orange) lg:text-6xl">
            ANIMAL LEAGUE
          </h1>
          <p className="mt-2 text-[13px] font-bold tracking-[0.35em] text-white/55 lg:text-sm">
            본선 토너먼트 · 8.25 COEX MAGOK
          </p>
        </div>

        {live ? (
          <div className="flex items-center gap-4 rounded-xl border border-(--live)/40 bg-(--live)/8 px-5 py-3.5">
            <span className="live-pulse rounded bg-(--live) px-2 py-1 text-xs font-extrabold tracking-[0.15em] text-white">
              LIVE
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold tracking-tight lg:text-2xl">
                {teamName(state, live.a)} <span className="mx-1 font-bold text-white/30">vs</span>{' '}
                {teamName(state, live.b)}
              </p>
              <p className="font-mono text-[11px] font-bold tracking-wider text-white/35">
                {live.id} · {live.round === 3 ? 'FINAL' : `ROUND ${live.round}`}
              </p>
            </div>
          </div>
        ) : sequence ? null : (
          <p className="text-sm font-bold tracking-[0.2em] text-white/30">다음 경기를 준비 중입니다</p>
        )}
      </header>

      {/* 본문 우선순위: 공개 시퀀스 > live 대결 포커스 > 대진표 (§6.1) */}
      {sequence ? (
        <RevealSequence state={state} match={sequence} />
      ) : live ? (
        <FocusLive state={state} match={live} />
      ) : (
        <>
      {/* 대진표 — xl(1280px) 이상만 좌우 수렴형. 1024~1279 는 5열이 물리적으로 좁아
          내용이 카드 밖으로 밀린다 (실사용 노트북 제보로 lg → xl 상향) */}
      <div className="hidden flex-1 items-center py-2 xl:flex">
        <div className="flex w-full items-stretch gap-0">
          <BracketSide state={state} semi={semi1} fallback={['R1-1', 'R1-2']} revealingId={revealingId} />
          <FinalConnector drawn={final.a !== null} />
          <div className="grid min-w-0 flex-[2.2] content-center gap-3 px-1 2xl:flex-[2.6]">
            <p className="font-display text-center text-xl tracking-[0.4em] text-white/35">FINAL</p>
            <div className="rounded-2xl border border-(--orange)/25 p-1.5">
              <MatchCard
                state={state}
                match={final}
                size="lg"
                revealing={revealingId === 'F'}
                undrawnLabel="결선 대진 확정 전"
              />
            </div>
          </div>
          <FinalConnector drawn={final.b !== null} />
          <BracketSide state={state} semi={semi2} fallback={['R1-3', 'R1-4']} mirrored revealingId={revealingId} />
        </div>
      </div>

      {/* 세로 스택 — xl 미만 (폰 + 좁은 노트북/태블릿) */}
      <div className="mx-auto w-full max-w-md space-y-7 pt-4 xl:hidden">
        {[
          { label: 'ROUND 1', matches: state.matches.filter((m) => m.round === 1), undrawn: undefined },
          { label: 'ROUND 2', matches: [semi1, semi2], undrawn: '추첨 대기' },
          { label: 'FINAL', matches: [final], undrawn: '결선 대진 확정 전' },
        ].map((group) => (
          <section key={group.label}>
            <h2 className="font-display mb-2.5 text-sm tracking-[0.3em] text-white/35">{group.label}</h2>
            <div className="space-y-3">
              {group.matches.map((m) => (
                <MatchCard
                  key={m.id}
                  state={state}
                  match={m}
                  revealing={revealingId === m.id}
                  undrawnLabel={group.undrawn}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
        </>
      )}

      <footer className="mt-4 flex items-center justify-between text-[11px] tracking-wide text-white/22">
        <span>각 경기 종료 후 즉시 발표</span>
        <span>부스 투표 8/28(목) 23:59까지</span>
      </footer>

      {/* 우승 테이크오버는 결선 공개 시퀀스가 끝난 뒤에 등장 */}
      {champion && !sequence && <ChampionTakeover state={state} final={final} />}
    </main>
  );
}
