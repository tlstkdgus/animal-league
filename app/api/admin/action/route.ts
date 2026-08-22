// POST /api/admin/action — 상태 변경 액션 단일 진입점 (운영 화면 전용).
//
// 쿠키 세션 검증 후 lib/tournament.ts 의 순수 전이를 mutate() 로 감싼다.
// 가드 위반(TournamentError)은 409 + code 로 내려가 운영 화면이 문구를 띄운다.
// 응답에는 항상 최신 운영용 스냅샷을 실어 화면이 즉시 동기화되게 한다.

import { ensureState, mutate, deleteAllVotes, type StateRow } from '@/lib/state';
import { isAdminSession, setAdminCookie } from '@/lib/auth';
import { votesForMatch, upsertVote } from '@/lib/votes';
import {
  startMatch,
  setTimer,
  revealResult,
  announceResult,
  finalRevealOrder,
  drawRound2,
  shuffle,
  setFinal,
  updateTeam,
  setJudgeCode,
  setAdminPin,
  addJudge,
  removeJudge,
  reset,
  trackWarnings,
  findJudge,
  judgeSlug,
  type Team,
  type Track,
} from '@/lib/tournament';
import { handling, ok, fail, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

const TEAM_TEXT_MAX = 40;
const COMMENT_MAX = 500; // /api/vote 와 동일 컷

/** 운영 화면용 스냅샷. adminPin 은 표시할 일이 없으므로 여기서도 내려보내지 않는다. */
function adminView(row: StateRow) {
  const { teams, matches, judges, judgeCode } = row.data;
  return {
    teams,
    matches,
    judges,
    judgeCode,
    timer: row.data.timer ?? null,
    /** 서버 현재 시각 — 기기 시계 편차 보정용 (lib/clock.ts) */
    now: Date.now(),
    rev: row.rev,
    trackWarnings: trackWarnings(row.data),
  };
}

function asString(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new RangeError(`${label} 은 1~${max}자 문자열이어야 합니다.`);
  }
  return value.trim();
}

/** 팀 편집 patch — 알려진 키만 통과시키고 나머지는 버린다. */
function teamPatch(raw: unknown): Partial<Team> {
  if (typeof raw !== 'object' || raw === null) throw new RangeError('patch 가 없습니다.');
  const source = raw as Record<string, unknown>;
  const patch: Partial<Team> = {};

  if ('character' in source) {
    if (source.character !== null && typeof source.character !== 'string') {
      throw new RangeError('character 는 문자열 또는 null 이어야 합니다.');
    }
    patch.character = source.character as string | null;
  }
  if ('school' in source) {
    if (typeof source.school !== 'string' || source.school.length > TEAM_TEXT_MAX) {
      throw new RangeError(`school 은 ${TEAM_TEXT_MAX}자 이하 문자열이어야 합니다.`);
    }
    patch.school = source.school.trim();
  }
  if ('team' in source) {
    if (typeof source.team !== 'string' || source.team.length > TEAM_TEXT_MAX) {
      throw new RangeError(`team 은 ${TEAM_TEXT_MAX}자 이하 문자열이어야 합니다.`);
    }
    patch.team = source.team.trim();
  }
  if ('track' in source) {
    // 문자열이면 통과시키고 실제 검증은 updateTeam 의 INVALID_TRACK 가드가 한다
    patch.track = source.track as Track;
  }
  return patch;
}

export async function POST(request: Request): Promise<Response> {
  return handling(async () => {
    const current = await ensureState();
    if (!(await isAdminSession(current.data))) {
      return fail(401, 'UNAUTHORIZED', '운영 세션이 없거나 만료됐습니다. 다시 로그인하세요.');
    }

    const body = await readJson(request);
    if (!body || typeof body.action !== 'string') {
      return fail(400, 'BAD_REQUEST', 'action 이 필요합니다.');
    }

    try {
      switch (body.action) {
        case 'startMatch': {
          const matchId = asString(body.matchId, 'matchId', 8);
          return ok({ state: adminView(await mutate((s) => startMatch(s, matchId))) });
        }

        case 'revealResult': {
          const matchId = asString(body.matchId, 'matchId', 8);
          if (body.winner !== 'A' && body.winner !== 'B') {
            return fail(400, 'BAD_WINNER', '승자는 A 또는 B 여야 합니다.');
          }
          const winner = body.winner;
          // 스크린 투표 오픈 연출용 표 — {진영, 명의} 쌍으로 싣는다 (§6.1 8/22 저녁:
          // 정지 화면 카드에 심사위원 이름 표기, §3 "명의를 떼고 공개" 번복 — 운영자 결정).
          // 제출 순서(ts)는 여전히 지운다: 셔플/연출 정렬이 순서를 새로 정한다.
          const rows = await votesForMatch(matchId);
          // 결선은 연출 정렬(패자 우선 번갈아 — 마지막 장이 승부 확정, §6.1 8/22), 나머지는 셔플
          const pairs = rows.map((r) => ({ w: r.winner, name: r.name }));
          const ordered = matchId === 'F' ? finalRevealOrder(pairs, winner, (p) => p.w) : shuffle(pairs);
          const anonVotes = ordered.map((p) => p.w);
          const names = ordered.map((p) => p.name);
          return ok({ state: adminView(await mutate((s) => revealResult(s, matchId, winner, anonVotes, names))) });
        }

        case 'announceResult': {
          // 2단계 공개의 2단계 (§6.1 8/22) — 카드 정지 화면에서 결과 화면으로
          const matchId = asString(body.matchId, 'matchId', 8);
          return ok({ state: adminView(await mutate((s) => announceResult(s, matchId))) });
        }

        case 'setTimer': {
          // 타이머 단계 전환/재시작 (§6.2 개정 8/19) — live 경기의 라운드 프리셋만 허용
          const label = asString(body.label, 'label', 20);
          return ok({ state: adminView(await mutate((s) => setTimer(s, label))) });
        }

        case 'drawRound2': {
          // pairs(선택): 수동 대진 (8/22 운영자 결정) — [[a,b],[c,d]] 팀 인덱스.
          // 검증은 drawRound2 가 한다 (R1 승자 4팀 정확히 한 번씩)
          const pairs = body.pairs;
          if (pairs !== undefined) {
            const okShape =
              Array.isArray(pairs) &&
              pairs.length === 2 &&
              pairs.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number'));
            if (!okShape) return fail(400, 'BAD_PAIRS', 'pairs 는 [[a,b],[c,d]] 숫자 배열이어야 합니다.');
            const typed = pairs as [[number, number], [number, number]];
            return ok({ state: adminView(await mutate((s) => drawRound2(s, Math.random, typed))) });
          }
          return ok({ state: adminView(await mutate((s) => drawRound2(s))) });
        }

        case 'setFinal':
          return ok({ state: adminView(await mutate((s) => setFinal(s))) });

        case 'updateTeam': {
          const index = body.index;
          if (typeof index !== 'number') return fail(400, 'BAD_REQUEST', 'index 가 필요합니다.');
          const patch = teamPatch(body.patch);
          return ok({ state: adminView(await mutate((s) => updateTeam(s, index, patch))) });
        }

        case 'setJudgeCode': {
          const code = asString(body.code, '심사 코드', 30);
          return ok({ state: adminView(await mutate((s) => setJudgeCode(s, code))) });
        }

        case 'setAdminPin': {
          const pin = asString(body.pin, 'PIN', 30);
          const row = await mutate((s) => setAdminPin(s, pin));
          // PIN 이 바뀌면 모든 세션이 무효화된다 — 바꾼 본인은 새 쿠키로 이어간다
          await setAdminCookie(row.data.adminPin);
          return ok({ state: adminView(row) });
        }

        case 'addJudge': {
          const name = asString(body.name, '이름', 30);
          return ok({ state: adminView(await mutate((s) => addJudge(s, name))) });
        }

        case 'removeJudge': {
          const name = asString(body.name, '이름', 30);
          return ok({ state: adminView(await mutate((s) => removeJudge(s, name))) });
        }

        case 'proxyVote': {
          // 운영 콘솔의 간사 대리 입력 — /api/vote 와 동일한 가드(명단제·live·승자)를
          // 그대로 적용하고, 심사 코드 검증만 운영 세션이 대신한다. 상태 전이는 없다
          // (표는 votes 테이블에만 쓰이므로 mutate() 를 거치지 않는다).
          const matchId = asString(body.matchId, 'matchId', 8);
          const name = asString(body.name, '이름', 30);
          const registered = findJudge(current.data, name);
          if (!registered) {
            return fail(403, 'JUDGE_NOT_LISTED', '심사위원 명단에 없는 이름입니다.');
          }
          const match = current.data.matches.find((m) => m.id === matchId);
          if (!match) return fail(400, 'MATCH_NOT_FOUND', `경기 ${matchId} 를 찾을 수 없습니다.`);
          if (match.status !== 'live') {
            return fail(409, 'MATCH_NOT_LIVE', '지금은 이 경기의 심사 시간이 아닙니다.');
          }
          if (body.winner !== 'A' && body.winner !== 'B') {
            return fail(400, 'BAD_WINNER', '승자는 A 또는 B 여야 합니다.');
          }
          const comment =
            typeof body.comment === 'string' ? body.comment.trim().slice(0, COMMENT_MAX) : '';
          await upsertVote({
            match_id: match.id,
            judge_slug: judgeSlug(registered),
            name: registered, // 명단 표기 그대로 — 대리 입력이어도 심사위원 명의 (§3)
            winner: body.winner,
            comment: comment.length > 0 ? comment : null,
            video_a: body.videoA === true,
            video_b: body.videoB === true,
            ts: Date.now(),
          });
          return ok({ state: adminView(current) });
        }

        case 'reset': {
          // votes 먼저 — 순서가 반대면 삭제 실패 시 리허설 표가 본 행사 집계에 섞인다 (SPEC §5)
          await deleteAllVotes();
          const clearTeams = body.clearTeams === true;
          return ok({ state: adminView(await mutate((s) => reset(s, { clearTeams }))) });
        }

        default:
          return fail(400, 'UNKNOWN_ACTION', `알 수 없는 액션: ${body.action}`);
      }
    } catch (err) {
      if (err instanceof RangeError) return fail(400, 'BAD_REQUEST', err.message);
      throw err; // TournamentError → handling() 이 409 로 변환
    }
  });
}
