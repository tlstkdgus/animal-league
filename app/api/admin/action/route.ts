// POST /api/admin/action — 상태 변경 액션 단일 진입점 (운영 화면 전용).
//
// 쿠키 세션 검증 후 lib/tournament.ts 의 순수 전이를 mutate() 로 감싼다.
// 가드 위반(TournamentError)은 409 + code 로 내려가 운영 화면이 문구를 띄운다.
// 응답에는 항상 최신 운영용 스냅샷을 실어 화면이 즉시 동기화되게 한다.

import { ensureState, mutate, deleteAllVotes, type StateRow } from '@/lib/state';
import { isAdminSession, setAdminCookie } from '@/lib/auth';
import { votesForMatch } from '@/lib/votes';
import {
  startMatch,
  revealResult,
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
  type Team,
  type Track,
} from '@/lib/tournament';
import { handling, ok, fail, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

const TEAM_TEXT_MAX = 40;

/** 운영 화면용 스냅샷. adminPin 은 표시할 일이 없으므로 여기서도 내려보내지 않는다. */
function adminView(row: StateRow) {
  const { teams, matches, judges, judgeCode } = row.data;
  return {
    teams,
    matches,
    judges,
    judgeCode,
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
          // 스크린 투표 오픈 연출용 익명 표 — 명의를 떼고 순서를 셔플해 공개 상태에 싣는다.
          // 제출 순서(ts)가 남으면 운영 화면을 본 사람이 명의를 역추적할 수 있어 순서도 지운다 (§3).
          const rows = await votesForMatch(matchId);
          const anonVotes = shuffle(rows.map((r) => r.winner));
          return ok({ state: adminView(await mutate((s) => revealResult(s, matchId, winner, anonVotes))) });
        }

        case 'drawRound2':
          return ok({ state: adminView(await mutate((s) => drawRound2(s))) });

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
