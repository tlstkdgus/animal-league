// 토너먼트 브래킷 로직 — 순수 함수만.
//
// DB·React 에 의존하지 않는다. 서버의 mutate() 는 "읽기 → 변형 → rev 가드 쓰기 → 충돌 시 재시도"
// 순서로 도는데, 재시도 때 갓 읽은 상태에 같은 변형을 다시 적용해야 하므로
// 여기의 모든 전이는 입력을 건드리지 않고 새 상태를 돌려준다.
//
// 규칙 근거는 docs/SPEC.md §2 (행사 규정, 변경 불가) 와 §5 (상태 전이).

// ------------------------------------------------------------
// 타입
// ------------------------------------------------------------

export const TRACKS = ['SJF', 'AAC', 'LIKELION', 'OPEN'] as const;
export type Track = (typeof TRACKS)[number];

export const TEAM_COUNT = 8;

/** 캐릭터 이미지 키. `public/characters/<key>.png` 로 해석한다 (예: 'char_07'). */
export type CharacterKey = string;

export type Team = {
  character: CharacterKey | null;
  school: string;
  team: string;
  track: Track;
};

export type MatchId = 'R1-1' | 'R1-2' | 'R1-3' | 'R1-4' | 'R2-1' | 'R2-2' | 'F';
export type Round = 1 | 2 | 3;
export type MatchStatus = 'ready' | 'live' | 'done';

/** 경기 내 자리. 심사 제출(votes.winner)과 같은 표기를 쓴다. */
export type Side = 'A' | 'B';

export type Match = {
  id: MatchId;
  round: Round;
  /** 팀 인덱스(0~7). 상위 라운드는 추첨/확정 전까지 null. */
  a: number | null;
  b: number | null;
  status: MatchStatus;
  winner: Side | null;
};

/**
 * tournament_state.data 에 통째로 들어가는 jsonb 문서.
 *
 * rev 는 여기 없다. 낙관적 잠금은 tournament_state.rev **컬럼**이 담당하고,
 * 문서 안에도 두면 두 값이 반드시 어긋난다. API 응답에서만 합쳐 내려보낸다.
 */
export type TournamentState = {
  teams: Team[];
  matches: Match[];
  judgeCode: string;
  adminPin: string;
};

// ------------------------------------------------------------
// 에러
// ------------------------------------------------------------

export type TournamentErrorCode =
  | 'MATCH_NOT_FOUND'
  | 'BRACKET_UNRESOLVED'
  | 'ALREADY_DONE'
  | 'NOT_LIVE'
  | 'ROUND1_INCOMPLETE'
  | 'ROUND2_INCOMPLETE'
  | 'ALREADY_DRAWN'
  | 'FINAL_ALREADY_SET'
  | 'INVALID_TEAM_INDEX'
  | 'INVALID_TRACK'
  | 'INVALID_CODE';

/** 가드 위반. API 라우트에서 code 로 상태 코드를, message 로 운영 화면 문구를 만든다. */
export class TournamentError extends Error {
  readonly code: TournamentErrorCode;

  constructor(code: TournamentErrorCode, message: string) {
    super(message);
    this.name = 'TournamentError';
    this.code = code;
  }
}

// ------------------------------------------------------------
// 초기 상태
// ------------------------------------------------------------

const EMPTY_TEAM: Team = { character: null, school: '', team: '', track: 'SJF' };

/**
 * 8팀 빈 슬롯 + 7경기. SPEC §4.1 의 모양 그대로.
 *
 * R1 대진은 teams 배열의 인접 쌍으로 고정한다([0]-[1], [2]-[3], ...).
 * 같은 트랙끼리 붙이는 건 운영자가 팀 관리 화면에서 순서로 맞추고,
 * 어긋나면 trackWarnings() 가 경고한다 (SPEC §2 — R1 은 같은 트랙끼리).
 */
export function createInitialState(overrides?: Partial<TournamentState>): TournamentState {
  return {
    teams: Array.from({ length: TEAM_COUNT }, () => ({ ...EMPTY_TEAM })),
    matches: [
      { id: 'R1-1', round: 1, a: 0, b: 1, status: 'ready', winner: null },
      { id: 'R1-2', round: 1, a: 2, b: 3, status: 'ready', winner: null },
      { id: 'R1-3', round: 1, a: 4, b: 5, status: 'ready', winner: null },
      { id: 'R1-4', round: 1, a: 6, b: 7, status: 'ready', winner: null },
      { id: 'R2-1', round: 2, a: null, b: null, status: 'ready', winner: null },
      { id: 'R2-2', round: 2, a: null, b: null, status: 'ready', winner: null },
      { id: 'F', round: 3, a: null, b: null, status: 'ready', winner: null },
    ],
    judgeCode: 'ANIMAL',
    adminPin: '0825',
    ...overrides,
  };
}

export const ROUND1_IDS: MatchId[] = ['R1-1', 'R1-2', 'R1-3', 'R1-4'];
export const ROUND2_IDS: MatchId[] = ['R2-1', 'R2-2'];
export const FINAL_ID: MatchId = 'F';

// ------------------------------------------------------------
// 조회 헬퍼 (읽기 전용)
// ------------------------------------------------------------

export function getMatch(state: TournamentState, matchId: string): Match {
  const match = state.matches.find((m) => m.id === matchId);
  if (!match) throw new TournamentError('MATCH_NOT_FOUND', `경기 ${matchId} 를 찾을 수 없습니다.`);
  return match;
}

/** 진행 중인 경기. SPEC §4.1 — live 는 동시에 1경기만이라 배열이 아닌 단일 값. */
export function liveMatch(state: TournamentState): Match | null {
  return state.matches.find((m) => m.status === 'live') ?? null;
}

/** 대진이 확정됐는지. 미확정 경기는 시작할 수 없다 (SPEC §8). */
export function isResolved(match: Match): boolean {
  return match.a !== null && match.b !== null;
}

/** 승자의 팀 인덱스. 아직 공개 전이면 null. */
export function winningTeamId(match: Match): number | null {
  if (match.winner === null) return null;
  return match.winner === 'A' ? match.a : match.b;
}

export function teamAt(state: TournamentState, index: number | null): Team | null {
  if (index === null) return null;
  return state.teams[index] ?? null;
}

/** 결선이 끝났으면 우승팀 인덱스. 스크린의 우승 연출 트리거 (SPEC §6.1). */
export function champion(state: TournamentState): number | null {
  const final = getMatch(state, FINAL_ID);
  if (final.status !== 'done') return null;
  return winningTeamId(final);
}

/**
 * R1 대진 중 트랙이 어긋난 인접 쌍의 경기 ID.
 * 막지는 않고 운영 화면에 경고만 띄운다 — 규정상 R1 은 같은 트랙끼리다 (SPEC §2).
 */
export function trackWarnings(state: TournamentState): MatchId[] {
  return state.matches
    .filter((m) => m.round === 1)
    .filter((m) => {
      const a = teamAt(state, m.a);
      const b = teamAt(state, m.b);
      return a !== null && b !== null && a.track !== b.track;
    })
    .map((m) => m.id);
}

export function canDrawRound2(state: TournamentState): boolean {
  const r1Done = ROUND1_IDS.every((id) => getMatch(state, id).status === 'done');
  const r2Empty = ROUND2_IDS.every((id) => !isResolved(getMatch(state, id)));
  return r1Done && r2Empty;
}

export function canSetFinal(state: TournamentState): boolean {
  const r2Done = ROUND2_IDS.every((id) => getMatch(state, id).status === 'done');
  return r2Done && !isResolved(getMatch(state, FINAL_ID));
}

// ------------------------------------------------------------
// 셔플
// ------------------------------------------------------------

/** 0 이상 1 미만. 테스트에서 결정적 시퀀스를 주입하려고 분리해 뒀다. */
export type Rng = () => number;

/** Fisher–Yates. 입력 배열은 그대로 두고 새 배열을 돌려준다. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ------------------------------------------------------------
// 상태 전이
//
// 전부 새 상태를 돌려준다. 결과 취소(done → live 롤백)는 만들지 않기로 했으므로
// done 은 종착 상태다 — 공개 버튼 쪽에서 확인 다이얼로그로 오조작을 막는다.
// ------------------------------------------------------------

function replaceMatch(state: TournamentState, id: MatchId, patch: Partial<Match>): TournamentState {
  return {
    ...state,
    matches: state.matches.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  };
}

/**
 * 경기 시작. 대진 미확정이면 거부하고, 기존 live 경기는 ready 로 되돌린다
 * (SPEC §4.1 — live 는 동시에 1경기).
 */
export function startMatch(state: TournamentState, matchId: string): TournamentState {
  const target = getMatch(state, matchId);

  if (target.status === 'done') {
    throw new TournamentError('ALREADY_DONE', `${target.id} 은 이미 결과가 공개된 경기입니다.`);
  }
  if (!isResolved(target)) {
    throw new TournamentError('BRACKET_UNRESOLVED', `${target.id} 은 대진이 아직 확정되지 않았습니다.`);
  }

  return {
    ...state,
    matches: state.matches.map((m) => {
      if (m.id === target.id) return { ...m, status: 'live' as const };
      if (m.status === 'live') return { ...m, status: 'ready' as const };
      return m;
    }),
  };
}

/**
 * 승자 지정 + 결과 공개. 이 액션이 곧 현장 발표다 (SPEC §2).
 *
 * 심사 제출이 0건이어도 통과시킨다 — 현장 네트워크가 죽어도 운영자 입력만으로
 * 브래킷이 굴러가야 하는 백업 모드가 최소 보장선이다 (SPEC §5).
 * 그래서 표 집계는 여기서 보지 않는다. 동표 경고도 운영 화면의 몫이다 (SPEC §3).
 */
export function revealResult(state: TournamentState, matchId: string, winner: Side): TournamentState {
  const target = getMatch(state, matchId);

  if (target.status === 'done') {
    throw new TournamentError('ALREADY_DONE', `${target.id} 은 이미 결과가 공개됐습니다.`);
  }
  if (target.status !== 'live') {
    throw new TournamentError('NOT_LIVE', `${target.id} 을 먼저 시작해야 결과를 공개할 수 있습니다.`);
  }

  return replaceMatch(state, target.id, { status: 'done', winner });
}

/**
 * 라운드 2 대진 추첨. R1 승자 4팀을 셔플해 R2 두 경기에 채운다.
 *
 * R1 승자는 트랙별로 1팀씩이므로 무작위로 짝지으면 자동으로 트랙 간 매칭이 된다
 * — 별도 제약을 걸지 않는다 (SPEC §2).
 */
export function drawRound2(state: TournamentState, rng: Rng = Math.random): TournamentState {
  const pending = ROUND1_IDS.filter((id) => getMatch(state, id).status !== 'done');
  if (pending.length > 0) {
    throw new TournamentError(
      'ROUND1_INCOMPLETE',
      `라운드 1 이 끝나야 추첨할 수 있습니다. 남은 경기: ${pending.join(', ')}`,
    );
  }
  if (ROUND2_IDS.some((id) => isResolved(getMatch(state, id)))) {
    throw new TournamentError('ALREADY_DRAWN', '라운드 2 대진은 이미 추첨됐습니다.');
  }

  const winners = shuffle(
    ROUND1_IDS.map((id) => winningTeamId(getMatch(state, id)) as number),
    rng,
  );

  return {
    ...state,
    matches: state.matches.map((m) => {
      if (m.id === 'R2-1') return { ...m, a: winners[0], b: winners[1] };
      if (m.id === 'R2-2') return { ...m, a: winners[2], b: winners[3] };
      return m;
    }),
  };
}

/** 결선 대진 확정. R2 두 경기의 승자가 그대로 올라간다 (추첨 없음). */
export function setFinal(state: TournamentState): TournamentState {
  const pending = ROUND2_IDS.filter((id) => getMatch(state, id).status !== 'done');
  if (pending.length > 0) {
    throw new TournamentError(
      'ROUND2_INCOMPLETE',
      `라운드 2 가 끝나야 결선을 확정할 수 있습니다. 남은 경기: ${pending.join(', ')}`,
    );
  }
  if (isResolved(getMatch(state, FINAL_ID))) {
    throw new TournamentError('FINAL_ALREADY_SET', '결선 대진은 이미 확정됐습니다.');
  }

  return replaceMatch(state, FINAL_ID, {
    a: winningTeamId(getMatch(state, 'R2-1')),
    b: winningTeamId(getMatch(state, 'R2-2')),
  });
}

// ------------------------------------------------------------
// 팀 · 설정
// ------------------------------------------------------------

/**
 * 팀 정보 수정. 경기 중에도 오탈자를 고칠 수 있어야 하므로 진행 상태로 막지 않는다.
 * 대진은 인덱스로 잡혀 있어 내용을 바꿔도 브래킷은 흔들리지 않는다.
 */
export function updateTeam(state: TournamentState, index: number, patch: Partial<Team>): TournamentState {
  if (!Number.isInteger(index) || index < 0 || index >= TEAM_COUNT) {
    throw new TournamentError('INVALID_TEAM_INDEX', `팀 인덱스는 0~${TEAM_COUNT - 1} 여야 합니다.`);
  }
  if (patch.track !== undefined && !TRACKS.includes(patch.track)) {
    throw new TournamentError('INVALID_TRACK', `트랙은 ${TRACKS.join(' / ')} 중 하나여야 합니다.`);
  }

  return {
    ...state,
    teams: state.teams.map((t, i) => (i === index ? { ...t, ...patch } : t)),
  };
}

function requireCode(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TournamentError('INVALID_CODE', `${label} 는 비워 둘 수 없습니다.`);
  }
  return trimmed;
}

export function setJudgeCode(state: TournamentState, code: string): TournamentState {
  return { ...state, judgeCode: requireCode(code, '심사 코드') };
}

export function setAdminPin(state: TournamentState, pin: string): TournamentState {
  return { ...state, adminPin: requireCode(pin, '운영 PIN') };
}

/** 심사 코드 대조. 대소문자·앞뒤 공백 무시 (SPEC §6.2). */
export function matchesJudgeCode(state: TournamentState, input: string): boolean {
  return input.trim().toLowerCase() === state.judgeCode.trim().toLowerCase();
}

// ------------------------------------------------------------
// 초기화
// ------------------------------------------------------------

/**
 * 브래킷 전체 초기화. 리허설 데이터를 지우고 본 행사에 들어갈 때 쓴다 (SPEC §5).
 * vote 레코드 삭제는 서버 레이어의 몫이다.
 *
 * 심사 코드와 운영 PIN 은 항상 유지한다 — 초기화하면 운영자가 자기 화면에서 잠긴다.
 * 팀 명단은 기본적으로 남기고, 리허설용 더미였다면 clearTeams 로 비운다.
 */
export function reset(state: TournamentState, opts?: { clearTeams?: boolean }): TournamentState {
  const fresh = createInitialState({ judgeCode: state.judgeCode, adminPin: state.adminPin });
  if (opts?.clearTeams) return fresh;
  return { ...fresh, teams: state.teams.map((t) => ({ ...t })) };
}
