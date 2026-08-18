'use client';

// 화면 공용 조각 — 심사(judge)·스크린(viewer)이 함께 쓴다.
// admin 은 자기 사본을 갖고 있다 (화면 간 PR 을 섞지 않는 규칙 때문에 여기로 옮기는
// 리팩터는 별도 PR 로 미룸 — CONTRIBUTING "PR 단위").

import Image from 'next/image';
import universityLogos from '@/lib/universityLogos';
import type { Track } from '@/lib/tournament';

export const TRACK_COLORS: Record<Track, string> = {
  SJF: 'var(--track-sjf)',
  AAC: 'var(--track-aac)',
  LIKELION: 'var(--track-likelion)',
  OPEN: 'var(--track-open)',
};

export function TrackBadge({ track }: { track: Track }) {
  // 알약 배지 대신 도트 + 텍스트 — 배지가 화면마다 반복되면 스티커처럼 보인다
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold tracking-[0.08em]" style={{ color: TRACK_COLORS[track] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: TRACK_COLORS[track] }} aria-hidden />
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
  const logoPx = size === 'lg' ? 24 : size === 'md' ? 19 : 16;
  const textCls = size === 'lg' ? 'text-base lg:text-lg' : size === 'md' ? 'text-sm' : 'text-[13px]';

  return (
    // flex + max-w-full: inline-flex 는 부모보다 넓어질 수 있어 좁은 카드에서 밖으로 튀어나온다.
    // 학교명 span 의 min-w-0 이 핵심 — flex item 의 min-width:auto 기본값 때문에
    // 이게 없으면 truncate 가 무시되고 전체 폭이 내용만큼 벌어진다.
    <span className={`flex min-w-0 max-w-full items-center gap-1.5 text-white/65 ${textCls}`}>
      {logo && (
        <span
          className="relative shrink-0 overflow-hidden rounded-full bg-white/95"
          style={{ width: logoPx, height: logoPx }}
        >
          <Image src={logo} alt="" fill sizes={`${logoPx}px`} className="object-contain p-px" />
        </span>
      )}
      <span className="min-w-0 truncate break-keep">{school}</span>
      {track && (
        <span className={trackFrom2xl ? 'hidden 2xl:inline-flex' : 'inline-flex'}>
          <TrackBadge track={track} />
        </span>
      )}
    </span>
  );
}

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
    <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-white/5 ${className ?? ''}`}>
      {characterKey ? (
        <Image src={`/characters/${characterKey}.png`} alt="" fill sizes={sizes} className="object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-xs text-white/25">?</div>
      )}
    </div>
  );
}
