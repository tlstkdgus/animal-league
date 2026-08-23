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
// 카드 믹싱 (Pixabay freesound_community, 4.6초) — 운영자 직접 선곡 (8/23).
// 종전 card-shuffle.ogg 루프를 대체 — 실제 카드 리플 소리라 루프 없이 원샷.
const SHUFFLE_SOURCE = '/sfx/freesound_community-card-mixing-48088.mp3';
// 칩 클래터(chips-collide-*)+플링·덱 부채꼴(card-fan-1)은 8/23 제거 — 클래터는
// 결과 화면 무음화, 부채꼴은 첫 플립 드럼과 겹침. 공개 화면 소리는 플립 드럼뿐.
// 에셋 파일은 Kenney 팩 일부라 public/sfx 에 남긴다.
// 칼 스윙 (Pixabay Dragon Studio, 2.2초) — 운영자 직접 선곡 (8/23), VS 등장용.
// 종전 hit-orchestra.ogg(Kenney jingles HIT15) 를 대체.
const HIT_SOURCE = '/sfx/dragon-studio-sword-slice-2-393845.mp3';
// 팡파레(fanfare.mp3)·우승 슬램 소리는 8/24 제거 — 파일은 유지 (재도입 시 #52·#79).
// 팡파레는 **음향 콘솔 담당으로 확정** (8/24 운영자 — 8/22 "화면 담당" 폐기,
// 음향팀 큐시트에 결선 팡파레 큐 필요. 운영 안내 아티팩트 v7 반영).
// 시네마틱 탐 히트 (Pixabay fronbondi_skegs, 1.68초) — 운영자 선곡 (8/23),
// **투표 공개의 표 카드 플립**용 ("드럼 히트를 심사위원들 투표 공개할 때" —
// 슬램 아님). 카드 놓기 폴리를 이 자리에서만 대체, 추첨 카드 플립은 종전 유지.
const DRUM_SOURCE = '/sfx/fronbondi_skegs-drum-huge-cinematic-tom-hit-283585.mp3';

let ctx: AudioContext | null = null;
let flipBuffers: AudioBuffer[] | null = null;
let shuffleBuffer: AudioBuffer | null = null;
let hitBuffer: AudioBuffer | null = null;
let drumBuffer: AudioBuffer | null = null;
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
    [flipBuffers, shuffleBuffer, hitBuffer, drumBuffer] = await Promise.all([
      Promise.all(FLIP_SOURCES.map(decode)),
      decode(SHUFFLE_SOURCE),
      decode(HIT_SOURCE),
      decode(DRUM_SOURCE),
    ]);
  } catch {
    flipBuffers = null;
    shuffleBuffer = null;
    hitBuffer = null;
    drumBuffer = null;
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
 * 카드 셔플 — R2 추첨의 셔플(2.4초)~배치(1초) 구간을 채운다 (기본 3.4초).
 * 샘플(4.6초 원샷)이 구간보다 길어서 끝 0.3초 페이드아웃으로 잘라 정지 클릭음을 막는다.
 */
export function playShuffle(durationSec = 3.4): void {
  const c = context();
  if (!c || !shuffleBuffer || c.state !== 'running') return;
  try {
    const src = c.createBufferSource();
    src.buffer = shuffleBuffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.6, c.currentTime);
    gain.gain.setValueAtTime(0.6, c.currentTime + durationSec - 0.3);
    gain.gain.linearRampToValueAtTime(0, c.currentTime + durationSec);
    src.connect(gain).connect(c.destination);
    src.start();
    src.stop(c.currentTime + durationSec);
  } catch {
    /* 소리 실패가 화면을 막으면 안 된다 */
  }
}

/**
 * 임팩트 붐 — 샘플 없이 합성 (서브 사인 드롭 + 로우패스 노이즈 버스트).
 * 우승 슬램 배선은 8/24 제거 — 지금은 VS 칼 스윙 로드 전 폴백으로만 쓰인다.
 */
function playImpact(volume = 1): void {
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
 * 대결 포커스(VS) 등장 — 칼 스윙 샘플 + 서브 드롭 (8/23 운영자 선곡으로
 * 오케스트라 히트에서 교체 — "칼소리는 VS 나올 때"). 어택은 칼 스윙이,
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
 * 표 카드 플립 — 시네마틱 탐 히트 샘플 (8/23 운영자 선곡: "드럼 히트를 심사위원들
 * 투표 공개할 때"). 투표 공개 화면의 카드가 한 장씩 뒤집히는 순간마다 1회 —
 * 1.6초 간격 연타라 꼬리(1.68초)가 살짝 겹치는 건 의도된 리듬. 샘플이 아직
 * 로드 전이면 종전 카드 놓기 폴리 폴백. 추첨 카드 플립은 playFlip 그대로.
 */
export function playDrum(): void {
  const c = context();
  if (!c || c.state !== 'running') return;
  if (!drumBuffer) {
    playFlip();
    return;
  }
  try {
    const src = c.createBufferSource();
    src.buffer = drumBuffer;
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
