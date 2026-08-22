'use client';

// 화면 공용 조각 — 심사(judge)·스크린(viewer)이 함께 쓴다.
// admin 은 자기 사본을 갖고 있다 (화면 간 PR 을 섞지 않는 규칙 때문에 여기로 옮기는
// 리팩터는 별도 PR 로 미룸 — CONTRIBUTING "PR 단위").

import Image from 'next/image';
import universityLogos from '@/lib/universityLogos';
import type { Track } from '@/lib/tournament';

/**
 * ANIMAL LEAGUE 워드마크 — 공식 로고 SVG (2026-08-19, Anton 폰트 조판을 대체).
 * path 에 fill 이 없어 루트의 currentColor 를 상속한다 — 색은 text-* 클래스로 정한다.
 * 크기는 높이(h-*)로만 잡는다 (비율 1256:204, w-auto).
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1256 204" fill="currentColor" role="img" aria-label="ANIMAL LEAGUE" className={className}>
      <path d="M91.69,5.92c-.11-1.08-1.27-1.72-2.24-1.23l-15.42,7.81c-3.93-.75-8.27-1.15-13.11-1.15-4.43,0-8.51.4-12.29,1.14l-15.39-7.8c-.97-.49-2.13.15-2.24,1.23L12.52,193.49c-.09.91.63,1.7,1.54,1.7h32.97c.81,0,1.48-.62,1.54-1.43l.87-11.03h23.82l.87,11.03c.06.8.73,1.43,1.54,1.43h32.97c.91,0,1.63-.79,1.54-1.7L91.69,5.92ZM51.72,153.68l8.55-108.68c.04-.56.51-.99,1.08-.99h0c.56,0,1.03.43,1.08.99l8.55,108.68h-19.25Z" />
      <path d="M176.49,104.23l-18.34-89.93c-.15-.72-.78-1.24-1.52-1.24h-33.51c-.85,0-1.55.69-1.55,1.55v179.04c0,.85.69,1.55,1.55,1.55h33.23c.85,0,1.55-.69,1.55-1.55v-89.63l18.34,89.93c.15.72.78,1.24,1.52,1.24h33.51c.85,0,1.55-.69,1.55-1.55V14.6c0-.85-.69-1.55-1.55-1.55h-33.23c-.85,0-1.55.69-1.55,1.55v89.63Z" />
      <rect x="227.52" y="13.06" width="35.89" height="182.13" rx="1.55" ry="1.55" />
      <path d="M350.54,124.16l-15.38-109.77c-.11-.76-.76-1.33-1.53-1.33h-53.75c-.85,0-1.55.69-1.55,1.55v179.04c0,.85.69,1.55,1.55,1.55h30.42c.85,0,1.55-.69,1.55-1.55V63.94l22.48,129.96c.13.74.77,1.28,1.52,1.28h29.39c.75,0,1.4-.54,1.52-1.28l22.48-129.96v129.7c0,.85.69,1.55,1.55,1.55h30.42c.85,0,1.55-.69,1.55-1.55V14.6c0-.85-.69-1.55-1.55-1.55h-53.75c-.77,0-1.42.57-1.53,1.33l-15.38,109.77Z" />
      <path d="M452.03,14.45l-17.64,179.04c-.09.91.63,1.7,1.54,1.7h32.97c.81,0,1.48-.62,1.54-1.43l.87-11.03h23.82l.87,11.03c.06.8.73,1.43,1.54,1.43h32.97c.91,0,1.63-.79,1.54-1.7l-17.64-179.04c-.08-.79-.74-1.4-1.54-1.4h-59.29c-.8,0-1.46.6-1.54,1.4ZM473.59,153.68l8.63-109.67h2l8.63,109.67h-19.25Z" />
      <path d="M579.64,13.06h-34.63c-.85,0-1.55.69-1.55,1.55v179.04c0,.85.69,1.55,1.55,1.55h72.36c.85,0,1.55-.69,1.55-1.55v-27.86c0-.85-.69-1.55-1.55-1.55h-36.18V14.6c0-.85-.69-1.55-1.55-1.55Z" />
      <path d="M716.37,13.06h-34.63c-.85,0-1.55.69-1.55,1.55v179.04c0,.85.69,1.55,1.55,1.55h72.36c.85,0,1.55-.69,1.55-1.55v-27.86c0-.85-.69-1.55-1.55-1.55h-36.18V14.6c0-.85-.69-1.55-1.55-1.55Z" />
      <path d="M767.57,13.06c-.85,0-1.55.69-1.55,1.55v179.04c0,.85.69,1.55,1.55,1.55h73.66c.85,0,1.55-.69,1.55-1.55v-27.86c0-.85-.69-1.55-1.55-1.55h-37.48v-44.63h35.1c.85,0,1.55-.69,1.55-1.55v-27.86c0-.85-.69-1.55-1.55-1.55h-35.1v-44.63h37.48c.85,0,1.55-.69,1.55-1.55V14.6c0-.85-.69-1.55-1.55-1.55h-73.66Z" />
      <path d="M867.93,14.45l-17.64,179.04c-.09.91.63,1.7,1.54,1.7h32.97c.81,0,1.48-.62,1.54-1.43l.87-11.03h23.82l.87,11.03c.06.8.73,1.43,1.54,1.43h32.97c.91,0,1.63-.79,1.54-1.7l-17.64-179.04c-.08-.79-.74-1.4-1.54-1.4h-59.29c-.8,0-1.46.6-1.54,1.4ZM889.49,153.68l8.63-109.67h2l8.63,109.67h-19.25Z" />
      <path d="M1047.96,89.17h-42.31c-.85,0-1.55.69-1.55,1.55v28.29c0,.85.69,1.55,1.55,1.55h8.4v26.08c0,9.96-1.95,16.75-9.73,16.75s-9.73-6.78-9.73-16.75V58.43c0-6.78,1.95-13.57,10.59-13.57,6.92,0,8.43,5.94,8.43,13.78v14.78c0,.85.69,1.55,1.55,1.55h33.22c.86,0,1.56-.71,1.55-1.56-.13-22.02-3-38.67-11.84-49.15l-4.17-18.46c-.24-1.06-1.46-1.55-2.37-.95l-12.34,8.22c-4.59-1.12-9.81-1.7-15.76-1.7-5.47,0-10.44.58-14.94,1.71l-12.31-8.27c-.9-.61-2.13-.12-2.37.95l-4.04,18.02c-7.94,8.56-11.96,21.5-11.96,38.7v78.45c0,37.53,12.97,55.97,39.78,55.97,12.65,0,22.22-4.62,28.89-14.17l5.9,9.11c1.36,2.09,3.68,3.36,6.17,3.36h9.37c.85,0,1.55-.69,1.55-1.55v-102.92c0-.85-.69-1.55-1.55-1.55Z" />
      <path d="M1116.31,144.93c0,9.33-.65,18.45-9.08,18.45s-9.08-9.33-9.08-18.45V14.6c0-.85-.69-1.55-1.55-1.55h-33.01c-.85,0-1.55.69-1.55,1.55v131.82c0,33.08,14.27,50.46,45.19,50.46s45.19-17.38,45.19-50.46V14.6c0-.85-.69-1.55-1.55-1.55h-33.01c-.85,0-1.55.69-1.55,1.55v130.33Z" />
      <path d="M1243.45,42.47V14.6c0-.85-.69-1.55-1.55-1.55h-73.66c-.85,0-1.55.69-1.55,1.55v179.04c0,.85.69,1.55,1.55,1.55h73.66c.85,0,1.55-.69,1.55-1.55v-27.86c0-.85-.69-1.55-1.55-1.55h-37.48v-44.63h35.1c.85,0,1.55-.69,1.55-1.55v-27.86c0-.85-.69-1.55-1.55-1.55h-35.1v-44.63h37.48c.85,0,1.55-.69,1.55-1.55Z" />
    </svg>
  );
}

export const TRACK_COLORS: Record<Track, string> = {
  SJF: 'var(--track-sjf)',
  AAC: 'var(--track-aac)',
  LIKELION: 'var(--track-likelion)',
  OPEN: 'var(--track-open)',
};

export function TrackBadge({ track }: { track: Track }) {
  // 알약 배지 대신 도트 + 텍스트 — 배지가 화면마다 반복되면 스티커처럼 보인다.
  // 2xl(프로젝터)에서 한 단계 확대 (8/22 무대 가독성 — 11px 는 홀 거리에서 장식이었다)
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold 2xl:text-[13px]"
      style={{ color: TRACK_COLORS[track] }}
    >
      <span className="h-1.5 w-1.5 rounded-full 2xl:h-2 2xl:w-2" style={{ background: TRACK_COLORS[track] }} aria-hidden />
      {track}
    </span>
  );
}

/**
 * 학교 로고 + 학교명 + 트랙 도트 — 학교가 이 대회 정체성의 절반이라 묻히면 안 된다.
 * 로고는 어두운 배경에서 뭉개지지 않게 흰 원형 칩에 담는다. 글씨가 좁아 잘려도
 * 로고가 학교를 말해준다. 로고 매핑이 없는 학교는 이름만 표시.
 */
export function SchoolTag({
  school,
  track,
  size = 'md',
  trackFrom2xl = false,
}: {
  school: string;
  track?: Track;
  size?: 'sm' | 'md' | 'lg';
  /** 브래킷 컴팩트 티어(xl)용 — 트랙 배지가 축소 불가라 좁은 카드에서 튀어나온다. 2xl 부터만 표시 */
  trackFrom2xl?: boolean;
}) {
  const logo = universityLogos[school];
  // 로고·텍스트는 2xl(프로젝터)에서 한 단계 확대 (8/22 무대 가독성)
  const logoCls =
    size === 'lg' ? 'h-6 w-6 2xl:h-8 2xl:w-8' : size === 'md' ? 'h-[19px] w-[19px] 2xl:h-6 2xl:w-6' : 'h-4 w-4 2xl:h-5 2xl:w-5';
  const textCls =
    size === 'lg' ? 'text-base lg:text-lg 2xl:text-2xl' : size === 'md' ? 'text-sm 2xl:text-base' : 'text-[13px] 2xl:text-[15px]';

  return (
    // flex + max-w-full: inline-flex 는 부모보다 넓어질 수 있어 좁은 카드에서 밖으로 튀어나온다.
    // 학교명 span 의 min-w-0 이 핵심 — flex item 의 min-width:auto 기본값 때문에
    // 이게 없으면 truncate 가 무시되고 전체 폭이 내용만큼 벌어진다.
    <span className={`flex min-w-0 max-w-full items-center gap-1.5 text-white/75 ${textCls}`}>
      {logo && (
        <span className={`relative shrink-0 overflow-hidden rounded-full bg-white/95 ${logoCls}`}>
          <Image src={logo} alt="" fill sizes="32px" className="object-contain p-px" />
        </span>
      )}
      {/* 말줄임 유지 (8/22 확정 — 줄바꿈 시도는 카드 높이가 들쭉해져 번복.
          로고가 학교를 대신 말해주고, 미관이 우선이라는 운영자 판단) */}
      <span className="min-w-0 truncate break-keep">{school}</span>
      {track && (
        <span className={trackFrom2xl ? 'hidden 2xl:inline-flex' : 'inline-flex'}>
          <TrackBadge track={track} />
        </span>
      )}
    </span>
  );
}

/**
 * 카드 에셋(640×960)은 곡률 36px 이 이미지에 구워져 있다 — 폭의 5.7%, 높이의 3.8%.
 * 컨테이너가 고정 px 곡률이면 크기에 따라 에셋과 어긋난다 (디자이너 피드백 8/18:
 * "카드 에셋과 박스의 곡률이 다르게 보임"). % 곡률로 어떤 크기에서도 일치시킨다.
 * 사용처는 전부 aspect-2/3 전제 — 가로/세로 % 가 이 비율로 계산되어 있다.
 */
export const CARD_RADIUS = '5.7% / 3.8%';

/**
 * 테두리 있는 카드 상자용 곡률 — 바깥 radius = 카드 곡률 + 테두리 두께.
 * CSS 는 overflow 클리핑의 안쪽 곡선을 (바깥 radius − border 폭)으로 만들기 때문에,
 * 이렇게 줘야 안쪽 곡선이 정확히 CARD_RADIUS 가 되어 에셋의 베이크 곡률과
 * 갭 없이 밀착한다. 바깥 radius 에 CARD_RADIUS 를 그대로 쓰면 안쪽이
 * (곡률 − 테두리)로 좁아져 카드 모서리와 부딪힌다 (8/22).
 */
export const cardRadiusWithBorder = (borderPx: number) =>
  `calc(5.7% + ${borderPx}px) / calc(3.8% + ${borderPx}px)`;

export function CharacterArt({
  characterKey,
  className,
  sizes = '160px',
}: {
  characterKey: string | null;
  className?: string;
  sizes?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden border border-white/10 bg-white/5 ${className ?? ''}`}
      style={{ borderRadius: CARD_RADIUS }}
    >
      {characterKey ? (
        <Image src={`/characters/${characterKey}.png`} alt="" fill sizes={sizes} className="object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-xs text-white/25">?</div>
      )}
    </div>
  );
}
