'use client';

// 시작용 확인 페이지 — 에셋과 컴포넌트가 제대로 넘어왔는지 눈으로 보는 용도.
// 실제 페이지를 만들 때 이 파일 내용을 갈아엎으면 된다.

import { useRef } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';

const SpinningCard3D = dynamic(() => import('@/components/SpinningCard3D'), { ssr: false });

// public/characters 에서 몇 장만 미리보기
const PREVIEW_CHARACTERS = ['01', '14', '27', '41', '52', '68'];

const COMPONENTS = [
  ['SpinningCard3D', 'three.js 3D 회전 카드 (앞/뒷면 텍스처, 기울기 ref로 제어)'],
  ['CardCarousel', '원호 배치 17장 캐러셀 — 드래그/휠 관성, 스냅, 선택 연출'],
  ['ResultCard', '홀로그램 결과 카드 — 커서 추적 틸트, holo 마스크, 파티클'],
  ['TicketIntro', '사자 영상이 들어간 인트로 화면'],
  ['CodeInput', '5칸 코드 입력 (붙여넣기 자동 분배, 흔들림 에러 연출)'],
  ['UniversitySelect', '학교 그리드/리스트 — 80종 로고 매핑 연동'],
  ['LoadingOverlay', '블러 로딩 오버레이'],
  ['CornerGlow', '모서리 글로우 배경 장식'],
];

export default function HomePage() {
  // SpinningCard3D 가 useFrame 안에서 직접 읽는 값
  const tiltRef = useRef<number>(0.12);
  const zTiltRef = useRef<number>(-0.35);

  return (
    <main style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
      <style>{`
        .wrap { max-width: 1000px; margin: 0 auto; padding: 64px 20px 80px; }
        .title { font-size: 32px; font-weight: 800; color: #fff; margin: 0 0 8px; letter-spacing: 0.02em; }
        .sub { font-size: 15px; color: rgba(255,255,255,0.5); margin: 0 0 48px; line-height: 1.6; }
        .section { font-size: 13px; font-weight: 700; color: #FF6000; letter-spacing: 0.08em;
          text-transform: uppercase; margin: 0 0 16px; }
        .card-stage { width: clamp(240px, 40vw, 320px); aspect-ratio: 3 / 4; margin: 0 auto 56px; }
        .chars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 56px; }
        @media (min-width: 700px) { .chars { grid-template-columns: repeat(6, 1fr); } }
        .char { position: relative; aspect-ratio: 2 / 3; border-radius: 10px; overflow: hidden;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); }
        .comp-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 56px; }
        .comp { display: flex; flex-direction: column; gap: 3px; padding: 14px 16px; border-radius: 12px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); }
        .comp b { font-size: 14px; color: #fff; font-weight: 700; font-family: var(--font-geist-mono), monospace; }
        .comp span { font-size: 13px; color: rgba(255,255,255,0.5); line-height: 1.5; }
        .stats { display: flex; gap: 10px; flex-wrap: wrap; }
        .stat { flex: 1; min-width: 130px; padding: 16px; border-radius: 12px; text-align: center;
          background: rgba(255,96,0,0.08); border: 1px solid rgba(255,96,0,0.25); }
        .stat b { display: block; font-size: 24px; font-weight: 800; color: #FF6000; }
        .stat span { font-size: 12px; color: rgba(255,255,255,0.5); }
      `}</style>

      <div className="wrap">
        <h1 className="title">character-cards</h1>
        <p className="sub">
          캐릭터 카드 에셋과 재사용 컴포넌트를 옮겨온 새 프로젝트예요.<br />
          이 페이지는 확인용이라 마음껏 갈아엎어도 됩니다.
        </p>

        <p className="section">3D 카드</p>
        <div className="card-stage">
          <SpinningCard3D tiltRef={tiltRef} zTiltRef={zTiltRef} />
        </div>

        <p className="section">캐릭터 미리보기</p>
        <div className="chars">
          {PREVIEW_CHARACTERS.map((n) => (
            <div key={n} className="char">
              <Image src={`/characters/char_${n}.png`} alt={`캐릭터 ${n}`} fill style={{ objectFit: 'cover' }} />
            </div>
          ))}
        </div>

        <p className="section">가져온 컴포넌트</p>
        <div className="comp-list">
          {COMPONENTS.map(([name, desc]) => (
            <div key={name} className="comp">
              <b>{name}</b>
              <span>{desc}</span>
            </div>
          ))}
        </div>

        <p className="section">에셋</p>
        <div className="stats">
          <div className="stat"><b>80</b><span>캐릭터 이미지</span></div>
          <div className="stat"><b>80</b><span>대학 로고</span></div>
          <div className="stat"><b>3</b><span>카드 뒷면</span></div>
          <div className="stat"><b>1</b><span>사자 영상</span></div>
        </div>
      </div>
    </main>
  );
}
