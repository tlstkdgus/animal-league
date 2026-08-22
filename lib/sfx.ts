// 스크린(viewer) 효과음 — Web Audio 원샷 재생.
//
// 브라우저 자동재생 정책 때문에 사용자 제스처 전에는 AudioContext 가 suspended 라
// 소리가 나지 않는다. armSfx() 가 첫 포인터/키 입력에서 컨텍스트를 깨운다 —
// 무대 운영 절차: 프로젝터 창을 띄운 뒤 화면을 한 번 클릭(또는 F 전체화면)하면 이후 자동.
// 실패는 전부 조용히 삼킨다 — 소리는 연출 보조일 뿐, 화면 동작을 막으면 안 된다.
//
// 샘플: public/sfx/card-place-*.ogg — Kenney Casino Audio, CC0 (public/sfx/LICENSE.txt).
// 행사장 네트워크 대비 셀프호스트 (폰트와 같은 이유, layout.tsx 참조).

const FLIP_SOURCES = [1, 2, 3, 4].map((n) => `/sfx/card-place-${n}.ogg`);
const SHUFFLE_SOURCE = '/sfx/card-shuffle.ogg';

let ctx: AudioContext | null = null;
let flipBuffers: AudioBuffer[] | null = null;
let shuffleBuffer: AudioBuffer | null = null;
let loadStarted = false;
let flipIdx = 0;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    if (typeof AudioContext === 'undefined') return null;
    ctx = new AudioContext();
  }
  return ctx;
}

async function load(c: AudioContext): Promise<void> {
  if (loadStarted) return;
  loadStarted = true;
  const decode = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return c.decodeAudioData(await res.arrayBuffer());
  };
  try {
    [flipBuffers, shuffleBuffer] = await Promise.all([
      Promise.all(FLIP_SOURCES.map(decode)),
      decode(SHUFFLE_SOURCE),
    ]);
  } catch {
    flipBuffers = null;
    shuffleBuffer = null;
    loadStarted = false; // 폴링 화면이라 다음 armSfx/재생 경로에서 재시도할 여지를 남긴다
  }
}

/**
 * 화면 마운트 시 1회 호출 — 버퍼 프리로드 + 제스처 언락 리스너 등록.
 * 반환된 정리 함수를 useEffect cleanup 으로 넘기면 된다.
 */
export function armSfx(): (() => void) | undefined {
  const c = context();
  if (!c) return undefined;
  void load(c);
  const unlock = () => {
    c.resume().catch(() => {}); // 이미 running 이면 no-op
  };
  addEventListener('pointerdown', unlock, { passive: true });
  addEventListener('keydown', unlock);
  return () => {
    removeEventListener('pointerdown', unlock);
    removeEventListener('keydown', unlock);
  };
}

/**
 * 카드 셔플 — R2 추첨의 셔플 구간(기본 2.2초, 애니메이션과 동일)을 채운다.
 * 샘플 길이와 무관하게 루프로 돌리고 끝에서 0.15초 페이드아웃 (루프 소스 정지 클릭음 방지).
 */
export function playShuffle(durationSec = 2.2): void {
  const c = context();
  if (!c || !shuffleBuffer || c.state !== 'running') return;
  try {
    const src = c.createBufferSource();
    src.buffer = shuffleBuffer;
    src.loop = true;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.5, c.currentTime);
    gain.gain.setValueAtTime(0.5, c.currentTime + durationSec - 0.15);
    gain.gain.linearRampToValueAtTime(0, c.currentTime + durationSec);
    src.connect(gain).connect(c.destination);
    src.start();
    src.stop(c.currentTime + durationSec);
  } catch {
    /* 소리 실패가 화면을 막으면 안 된다 */
  }
}

/** 카드 플립 1회 — 4개 샘플 라운드로빈 (같은 소리 연발로 기계적으로 들리는 것 방지). */
export function playFlip(): void {
  const c = context();
  if (!c || !flipBuffers || c.state !== 'running') return;
  try {
    const src = c.createBufferSource();
    src.buffer = flipBuffers[flipIdx++ % flipBuffers.length];
    const gain = c.createGain();
    gain.gain.value = 0.5;
    src.connect(gain).connect(c.destination);
    src.start();
  } catch {
    /* 소리 실패가 화면을 막으면 안 된다 */
  }
}
