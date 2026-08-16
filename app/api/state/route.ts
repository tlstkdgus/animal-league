// GET /api/state — 공개 스냅샷 (스크린·심사 화면 폴링용).
//
// judgeCode / adminPin / judges 는 toPublicState 가 벗겨낸다 (명세 §7).
// 참가자 수백 명이 3초 폴링하므로 CDN 캐시(s-maxage=2)로 원 서버 부하를 상수로 만든다.
// 클라이언트는 rev 가 낮은 스냅샷을 무시할 것 (명세 §4.1).

import { ensureState, toPublicState } from '@/lib/state';
import { handling, fail } from '@/lib/api';

// 키 없는 CI 빌드에서 프리렌더를 시도하다 터지지 않도록 항상 동적으로.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return handling(async () => {
    let row;
    try {
      row = await ensureState();
    } catch {
      // 스크린은 마지막 정상 스냅샷을 유지해야 한다 (명세 §7) — 503 으로 구분해 준다.
      return fail(503, 'STATE_UNAVAILABLE', '상태를 불러오지 못했습니다. 잠시 후 다시 시도됩니다.');
    }
    return Response.json(
      { ok: true, ...toPublicState(row) },
      { headers: { 'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=8' } },
    );
  });
}
