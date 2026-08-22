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
const FAN_SOURCE = '/sfx/card-fan-1.ogg';
const CHIPS_SOURCES = [1, 2].map((n) => `/sfx/chips-collide-${n}.ogg`);
const HIT_SOURCE = '/sfx/hit-orchestra.ogg'; // Kenney jingles_HIT15 — 시네마틱 오케스트라 히트
const FANFARE_SOURCE = '/sfx/fanfare.mp3'; // Hyper Ultra Fanfare (CC0, 6.2초)

let ctx: AudioContext | null = null;
let flipBuffers: AudioBuffer[] | null = null;
let shuffleBuffer: AudioBuffer | null = null;
let fanBuffer: AudioBuffer | null = null;
let chipsBuffers: AudioBuffer[] | null = null;
let hitBuffer: AudioBuffer | null = null;
let fanfareBuffer: AudioBuffer | null = null;
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
    [flipBuffers, shuffleBuffer, fanBuffer, chipsBuffers, hitBuffer, fanfareBuffer] = await Promise.all([
      Promise.all(FLIP_SOURCES.map(decode)),
      decode(SHUFFLE_SOURCE),
      decode(FAN_SOURCE),
      Promise.all(CHIPS_SOURCES.map(decode)),
      decode(HIT_SOURCE),
      decode(FANFARE_SOURCE),
    ]);
  } catch {
    flipBuffers = null;
    shuffleBuffer = null;
    fanBuffer = null;
    chipsBuffers = null;
    hitBuffer = null;
    fanfareBuffer = null;
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

/** 덱 부채꼴 펼치기 — 공개 시퀀스 시작("투표를 공개합니다" + 뒷면 칩 등장)에 1회. */
export function playFan(): void {
  const c = context();
  if (!c || !fanBuffer || c.state !== 'running') return;
  try {
    const src = c.createBufferSource();
    src.buffer = fanBuffer;
    const gain = c.createGain();
    gain.gain.value = 0.35; // 도입부 — 멘트를 덮지 않게 낮게
    src.connect(gain).connect(c.destination);
    src.start();
  } catch {
    /* 소리 실패가 화면을 막으면 안 된다 */
  }
}

/**
 * 승자 발표 — 칩 무더기 클래터(두 샘플 70ms 레이어) + 상승 플링 2음.
 * 8/22 운영자 피드백("이겼을 때 소리 있어야")으로 클래터만으로는 약해서
 * 승리 문법(상승 음정)을 합성으로 얹었다 — 별도 팡파레 샘플 없이.
 */
export function playChips(): void {
  const c = context();
  if (!c || !chipsBuffers || c.state !== 'running') return;
  try {
    chipsBuffers.forEach((buf, i) => {
      const src = c.createBufferSource();
      src.buffer = buf;
      const gain = c.createGain();
      gain.gain.value = 0.65;
      src.connect(gain).connect(c.destination);
      src.start(c.currentTime + i * 0.07);
    });
    // 상승 플링 — E5 → B5, 사인 2음. 짧고 밝게 (0.35초 감쇠)
    [659.25, 987.77].forEach((freq, i) => {
      const t = c.currentTime + 0.05 + i * 0.11;
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {
    /* 소리 실패가 화면을 막으면 안 된다 */
  }
}

/**
 * 임팩트 붐 — 샘플 없이 합성 (서브 사인 드롭 + 로우패스 노이즈 버스트).
 * 카지노 팩에는 무대 임팩트급 소리가 없어서, 에셋 추가 대신 합성으로 해결했다.
 * volume: 우승 슬램 1.0, 대결 포커스(VS) 등장은 0.75 — 같은 소리의 강약 관계로
 * "경기 시작 < 우승"의 위계를 만든다 (별도 샘플 2종보다 통일감 우선).
 */
export function playImpact(volume = 1): void {
  const c = context();
  if (!c || c.state !== 'running') return;
  try {
    const t = c.currentTime;
    // 서브 붐 — 100Hz → 38Hz 드롭, 0.55초 감쇠
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const oscGain = c.createGain();
    oscGain.gain.setValueAtTime(0.7 * volume, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(oscGain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.6);
    // 타격감 — 0.2초 노이즈 버스트를 로우패스로 둔탁하게
    const noise = c.createBufferSource();
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.2), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    noise.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.5 * volume, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noise.connect(lp).connect(noiseGain).connect(c.destination);
    noise.start(t);
  } catch {
    /* 소리 실패가 화면을 막으면 안 된다 */
  }
}

/**
 * 대결 포커스(VS) 등장 — 오케스트라 히트 샘플 + 서브 드롭.
 * 합성 붐 단독에서 교체 (8/22 "찾아서 넣자"): 어택은 실제 오케스트라 히트가,
 * 무게감은 저역 사인 드롭이 담당한다. 샘플이 아직 로드 전이면 합성 붐 폴백.
 */
export function playVersus(): void {
  const c = context();
  if (!c || c.state !== 'running') return;
  if (!hitBuffer) {
    playImpact(0.75);
    return;
  }
  try {
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = hitBuffer;
    const gain = c.createGain();
    gain.gain.value = 0.8;
    src.connect(gain).connect(c.destination);
    src.start(t);
    // 저역 보강 — 히트 아래 깔리는 서브 드롭
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.35);
    const oscGain = c.createGain();
    oscGain.gain.setValueAtTime(0.4, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(oscGain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.55);
  } catch {
    /* 소리 실패가 화면을 막으면 안 된다 */
  }
}

/**
 * 우승 팡파레 — 큐시트의 "팡파레 BGM" 을 화면이 담당한다 (8/22 확인: 음향 콘솔
 * 목록에 없음). 우승 무대의 CHAMPION 레터 드롭(1.04초)에 맞춰 재생.
 */
export function playFanfare(): void {
  const c = context();
  if (!c || !fanfareBuffer || c.state !== 'running') return;
  try {
    const src = c.createBufferSource();
    src.buffer = fanfareBuffer;
    const gain = c.createGain();
    gain.gain.value = 0.9;
    src.connect(gain).connect(c.destination);
    src.start();
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
