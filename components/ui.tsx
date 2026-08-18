'use client';

// 화면 공용 조각 — 심사(judge)·스크린(viewer)이 함께 쓴다.
// admin 은 자기 사본을 갖고 있다 (화면 간 PR 을 섞지 않는 규칙 때문에 여기로 옮기는
// 리팩터는 별도 PR 로 미룸 — CONTRIBUTING "PR 단위").

import Image from 'next/image';
import type { Track } from '@/lib/tournament';

export const TRACK_COLORS: Record<Track, string> = {
  SJF: 'var(--track-sjf)',
  AAC: 'var(--track-aac)',
  LIKELION: 'var(--track-likelion)',
  OPEN: 'var(--track-open)',
};

export function TrackBadge({ track }: { track: Track }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide"
      style={{ background: `color-mix(in srgb, ${TRACK_COLORS[track]} 22%, transparent)`, color: TRACK_COLORS[track] }}
    >
      {track}
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
