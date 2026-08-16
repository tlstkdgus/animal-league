// 브래킷 로직 단위 테스트 — `npm test` (Node 24 내장 러너, 의존성 없음).
//
// 가드가 곧 당일 사고 방지선이라 정상 경로보다 거부 경로를 촘촘히 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  drawRound2,
  getMatch,
  liveMatch,
  matchesJudgeCode,
  reset,
  revealResult,
  setFinal,
  shuffle,
  startMatch,
  trackWarnings,
  updateTeam,
  winningTeamId,
  champion,
  canDrawRound2,
  canSetFinal,
  ROUND1_IDS,
  ROUND2_IDS,
  TournamentError,
  type MatchId,
  type Side,
  type TournamentState,
} from './tournament.ts';

// ------------------------------------------------------------
// 도우미
// ------------------------------------------------------------

/** 미리 정한 값을 차례로 뱉는 rng. 다 쓰면 0 으로 고정. */
function fixedRng(values: number[]) {
  let i = 0;
  return () => values[i++] ?? 0;
}

/** 8팀을 트랙별 2팀씩 인접 배치한 상태 (규정상 R1 대진 모양). */
function seeded(): TournamentState {
  const tracks = ['SJF', 'SJF', 'AAC', 'AAC', 'LIKELION', 'LIKELION', 'OPEN', 'OPEN'] as const;
  return createInitialState({
    teams: tracks.map((track, i) => ({
      character: `char_0${i + 1}`,
      school: `${i + 1}대`,
      team: `팀${i + 1}`,
      track,
    })),
  });
}

/** 경기를 시작하고 한쪽 승리로 공개까지. */
function play(state: TournamentState, matchId: MatchId, winner: Side): TournamentState {
  return revealResult(startMatch(state, matchId), matchId, winner);
}

/** R1 4경기를 전부 A 승으로 끝낸 상태 → 승자는 팀 0, 2, 4, 6. */
function afterRound1(): TournamentState {
  return ROUND1_IDS.reduce((s, id) => play(s, id, 'A'), seeded());
}

function expectError(code: string, fn: () => unknown) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof TournamentError, `TournamentError 가 아님: ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

// ------------------------------------------------------------
// 초기 상태
// ------------------------------------------------------------

test('초기 상태는 8팀 7경기, R1 대진은 인접 쌍', () => {
  const s = createInitialState();

  assert.equal(s.teams.length, 8);
  assert.equal(s.matches.length, 7);
  assert.deepEqual(
    s.matches.map((m) => m.id),
    ['R1-1', 'R1-2', 'R1-3', 'R1-4', 'R2-1', 'R2-2', 'F'],
  );
  assert.deepEqual(
    s.matches.filter((m) => m.round === 1).map((m) => [m.a, m.b]),
    [[0, 1], [2, 3], [4, 5], [6, 7]],
  );

  // 상위 라운드는 추첨/확정 전까지 빈 슬롯
  for (const id of [...ROUND2_IDS, 'F'] as MatchId[]) {
    const m = getMatch(s, id);
    assert.equal(m.a, null);
    assert.equal(m.b, null);
  }
  assert.ok(s.matches.every((m) => m.status === 'ready' && m.winner === null));
});

test('팀 슬롯은 서로 다른 객체 — 하나를 고쳐도 나머지가 따라 바뀌지 않는다', () => {
  const s = createInitialState();
  const next = updateTeam(s, 0, { team: '가' });

  assert.equal(next.teams[0].team, '가');
  assert.equal(next.teams[1].team, '');
});

// ------------------------------------------------------------
// 경기 시작
// ------------------------------------------------------------

test('경기 시작하면 live 로 바뀐다', () => {
  const s = startMatch(seeded(), 'R1-1');

  assert.equal(getMatch(s, 'R1-1').status, 'live');
  assert.equal(liveMatch(s)?.id, 'R1-1');
});

test('다른 경기를 시작하면 기존 live 는 ready 로 되돌아간다', () => {
  const s = startMatch(startMatch(seeded(), 'R1-1'), 'R1-2');

  assert.equal(getMatch(s, 'R1-1').status, 'ready');
  assert.equal(getMatch(s, 'R1-2').status, 'live');
  assert.equal(s.matches.filter((m) => m.status === 'live').length, 1);
});

test('대진 미확정 경기는 시작할 수 없다', () => {
  expectError('BRACKET_UNRESOLVED', () => startMatch(seeded(), 'R2-1'));
  expectError('BRACKET_UNRESOLVED', () => startMatch(seeded(), 'F'));
});

test('이미 공개된 경기는 다시 시작할 수 없다', () => {
  const s = play(seeded(), 'R1-1', 'A');
  expectError('ALREADY_DONE', () => startMatch(s, 'R1-1'));
});

test('없는 경기 ID 는 거부', () => {
  expectError('MATCH_NOT_FOUND', () => startMatch(seeded(), 'R3-9'));
});

test('전이는 입력 상태를 건드리지 않는다 — mutate 재시도가 같은 변형을 다시 적용할 수 있어야 한다', () => {
  const before = seeded();
  const snapshot = structuredClone(before);

  startMatch(before, 'R1-1');
  play(before, 'R1-2', 'B');
  updateTeam(before, 3, { team: '바뀜' });

  assert.deepEqual(before, snapshot);
});

// ------------------------------------------------------------
// 결과 공개
// ------------------------------------------------------------

test('결과 공개하면 done + 승자 기록', () => {
  const s = play(seeded(), 'R1-2', 'B');
  const m = getMatch(s, 'R1-2');

  assert.equal(m.status, 'done');
  assert.equal(m.winner, 'B');
  assert.equal(winningTeamId(m), 3);
  assert.equal(liveMatch(s), null);
});

test('심사 제출이 0건이어도 공개된다 — 백업 모드 (SPEC §5)', () => {
  // 이 모듈은 표를 아예 보지 않는다. 시작 → 공개만으로 끝나는 것 자체가 보장선.
  const s = play(seeded(), 'R1-1', 'A');
  assert.equal(getMatch(s, 'R1-1').status, 'done');
});

test('시작하지 않은 경기는 공개할 수 없다', () => {
  expectError('NOT_LIVE', () => revealResult(seeded(), 'R1-1', 'A'));
});

test('결과 취소는 없다 — done 은 종착 상태라 재공개도 거부', () => {
  const s = play(seeded(), 'R1-1', 'A');
  expectError('ALREADY_DONE', () => revealResult(s, 'R1-1', 'B'));
});

// ------------------------------------------------------------
// 라운드 2 추첨
// ------------------------------------------------------------

test('R1 이 끝나기 전에는 추첨할 수 없다', () => {
  let s = seeded();
  assert.equal(canDrawRound2(s), false);
  expectError('ROUND1_INCOMPLETE', () => drawRound2(s));

  s = play(s, 'R1-1', 'A');
  s = play(s, 'R1-2', 'A');
  s = play(s, 'R1-3', 'A');
  assert.equal(canDrawRound2(s), false);
  expectError('ROUND1_INCOMPLETE', () => drawRound2(s));
});

test('추첨은 R1 승자 4팀을 빠짐없이 한 번씩 배치한다', () => {
  const s = drawRound2(afterRound1(), fixedRng([0.9, 0.1, 0.5]));
  const placed = ROUND2_IDS.flatMap((id) => {
    const m = getMatch(s, id);
    return [m.a, m.b];
  });

  assert.equal(canDrawRound2(afterRound1()), true);
  assert.deepEqual([...placed].sort(), [0, 2, 4, 6]);
});

test('추첨 결과는 rng 에 따라 달라진다 — 고정 순서가 아니다', () => {
  const base = afterRound1();
  const layout = (rng: () => number) =>
    ROUND2_IDS.flatMap((id) => {
      const m = getMatch(drawRound2(base, rng), id);
      return [m.a, m.b];
    });

  assert.notDeepEqual(layout(fixedRng([0, 0, 0])), layout(fixedRng([0.99, 0.99, 0.99])));
});

test('추첨은 두 번 할 수 없다', () => {
  const s = drawRound2(afterRound1());
  assert.equal(canDrawRound2(s), false);
  expectError('ALREADY_DRAWN', () => drawRound2(s));
});

test('추첨 뒤에는 R2 경기를 시작할 수 있다', () => {
  const s = startMatch(drawRound2(afterRound1()), 'R2-1');
  assert.equal(getMatch(s, 'R2-1').status, 'live');
});

// ------------------------------------------------------------
// 결선
// ------------------------------------------------------------

test('R2 가 끝나야 결선을 확정할 수 있다', () => {
  const s = drawRound2(afterRound1());
  assert.equal(canSetFinal(s), false);
  expectError('ROUND2_INCOMPLETE', () => setFinal(s));

  const half = play(s, 'R2-1', 'A');
  expectError('ROUND2_INCOMPLETE', () => setFinal(half));
});

test('결선 대진은 R2 두 경기의 승자 (추첨 없음)', () => {
  let s = drawRound2(afterRound1(), fixedRng([0.4, 0.7, 0.2]));
  s = play(s, 'R2-1', 'B');
  s = play(s, 'R2-2', 'A');

  assert.equal(canSetFinal(s), true);
  const withFinal = setFinal(s);
  const f = getMatch(withFinal, 'F');

  assert.equal(f.a, getMatch(s, 'R2-1').b);
  assert.equal(f.b, getMatch(s, 'R2-2').a);
  assert.equal(canSetFinal(withFinal), false);
  expectError('FINAL_ALREADY_SET', () => setFinal(withFinal));
});

test('결선 공개 전까지 우승팀은 없다', () => {
  let s = drawRound2(afterRound1());
  s = play(s, 'R2-1', 'A');
  s = play(s, 'R2-2', 'A');
  s = setFinal(s);

  assert.equal(champion(s), null);

  const done = play(s, 'F', 'B');
  assert.equal(champion(done), getMatch(done, 'F').b);
});

// ------------------------------------------------------------
// 셔플
// ------------------------------------------------------------

test('셔플은 입력을 건드리지 않고 원소를 보존한다', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(input, fixedRng([0.3, 0.8, 0.1, 0.6, 0.4, 0.9, 0.2]));

  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...out].sort((x, y) => x - y), input);
});

test('셔플은 네 원소의 순열을 골고루 만든다', () => {
  // Fisher–Yates 가 제자리에서 인덱스를 잘못 다루면 특정 순열이 아예 안 나온다.
  let seed = 12345;
  const lcg = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const seen = new Set<string>();
  for (let i = 0; i < 400; i += 1) seen.add(shuffle([0, 1, 2, 3], lcg).join(''));

  assert.equal(seen.size, 24);
});

// ------------------------------------------------------------
// 팀 관리 · 설정
// ------------------------------------------------------------

test('팀 인덱스와 트랙을 검증한다', () => {
  const s = seeded();

  expectError('INVALID_TEAM_INDEX', () => updateTeam(s, 8, { team: '가' }));
  expectError('INVALID_TEAM_INDEX', () => updateTeam(s, -1, { team: '가' }));
  // @ts-expect-error 런타임 방어 — API 로 들어온 문자열은 타입이 지켜주지 않는다
  expectError('INVALID_TRACK', () => updateTeam(s, 0, { track: 'SJFF' }));
});

test('R1 인접 쌍의 트랙이 어긋나면 경고한다 (막지는 않는다)', () => {
  assert.deepEqual(trackWarnings(seeded()), []);

  const mixed = updateTeam(seeded(), 1, { track: 'OPEN' });
  assert.deepEqual(trackWarnings(mixed), ['R1-1']);
});

test('심사 코드는 대소문자·앞뒤 공백을 무시하고 대조한다', () => {
  const s = createInitialState({ judgeCode: 'Animal' });

  assert.equal(matchesJudgeCode(s, 'animal'), true);
  assert.equal(matchesJudgeCode(s, '  ANIMAL '), true);
  assert.equal(matchesJudgeCode(s, 'anima'), false);
});

// ------------------------------------------------------------
// 초기화
// ------------------------------------------------------------

test('초기화는 진행 상황만 지우고 코드·PIN 은 유지한다', () => {
  let s = createInitialState({ judgeCode: 'ZEBRA', adminPin: '9999', teams: seeded().teams });
  s = play(s, 'R1-1', 'A');
  s = play(s, 'R1-2', 'A');
  s = startMatch(s, 'R1-3');

  const cleared = reset(s);

  assert.equal(cleared.judgeCode, 'ZEBRA');
  assert.equal(cleared.adminPin, '9999');
  assert.deepEqual(cleared.teams, s.teams);
  assert.ok(cleared.matches.every((m) => m.status === 'ready' && m.winner === null));
  assert.equal(getMatch(cleared, 'R2-1').a, null);
});

test('리허설 더미 팀은 clearTeams 로 비운다', () => {
  const cleared = reset(seeded(), { clearTeams: true });

  assert.ok(cleared.teams.every((t) => t.team === '' && t.school === '' && t.character === null));
  assert.equal(cleared.teams.length, 8);
});
