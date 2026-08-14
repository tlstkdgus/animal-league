'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

const N = 17;
const STEP = 360 / N;   // ~21.2° per card
const RADIUS = 490;     // 원 반지름
const CENTER_Y = 880;   // 원의 중심 y (컨테이너 상단 기준 px)
const SIDE_SPREAD_DEG = 5;  // 가운데 바로 옆(±1) 카드를 같은 원호 위에서 더 벌리는 각도
const CARD_W = 180;
const CARD_H = 270;  // 카드 이미지 2:3 비율에 맞춤 (180 × 1.5)
const BORDER_RADIUS = 14;  // 가운데 카드 곡률 (주위 카드는 scale에 따라 비례 축소)
const DRAG_PX_PER_STEP = 60;  // 카드 한 칸 이동에 필요한 드래그 px
const SCROLL_PX_PER_STEP = 200; // 카드 한 칸 이동에 필요한 스크롤 px

interface Props {
  onComplete: () => void;
  isLoading: boolean;
}

type Particle = {
  id: number;
  tx: number;       // 도착 x (px)
  ty: number;       // 도착 y (px)
  size: number;
  delay: number;
  duration: number;
  color: string;
};

const PARTICLE_COLORS = [
  '#FFFFFF', '#FFE9B0', '#FFC24D', '#FF8A3D', '#FF6000', '#FFD27A',
];

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }).map((_, i) => {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 80 + Math.random() * 160;
    return {
      id: i,
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      size: 5 + Math.random() * 9,
      delay: Math.random() * 0.12,
      duration: 0.7 + Math.random() * 0.5,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    };
  });
}

export default function CardCarousel({ onComplete, isLoading }: Props) {
  const [rotation, setRotation] = useState(0);   // 실수, 무제한
  const [isDragging, setIsDragging] = useState(false);
  const [picked, setPicked] = useState(false);
  const [pickedCard, setPickedCard] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const pendingTarget = useRef<number>(0);
  const [particles, setParticles] = useState<Particle[]>([]);

  const dragStartX = useRef<number | null>(null);
  const dragStartRot = useRef(0);
  const didDrag = useRef(false);
  const lastMoveTime = useRef(0);  // 클릭으로 카드를 가운데로 끌어온 마지막 시각
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const rotRef = useRef(0);       // 소스 오브 트루스
  const velRef = useRef(0);       // 현재 속도 (deg/frame)
  const rafRef = useRef<number | null>(null);
  const isAnimating = useRef(false);
  const introActive = useRef(false);

  // 진입 인트로 애니메이션 즉시 중단 (사용자 조작 시)
  const cancelIntro = useCallback(() => {
    if (!introActive.current) return;
    introActive.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    isAnimating.current = false;
    const snapped = Math.round(rotRef.current / STEP) * STEP;
    rotRef.current = snapped;
    setRotation(snapped);
  }, []);

  const startRAF = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;

      // 감쇠: 프레임레이트 독립적 마찰
      velRef.current *= Math.pow(0.88, dt / 16);
      rotRef.current += velRef.current * (dt / 16);
      setRotation(rotRef.current);

      if (Math.abs(velRef.current) > 0.05) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // 가장 가까운 카드로 스냅
        const snapped = Math.round(rotRef.current / STEP) * STEP;
        rotRef.current = snapped;
        setRotation(snapped);
        setIsScrolling(false);
        isAnimating.current = false;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // 진입 인트로: 모바일은 CSS 페이드인, PC는 +1/3 바퀴 → 0 회전
  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches) {
      introActive.current = false;
      isAnimating.current = false;
      return;
    }
    const startDeg = STEP * Math.round(N / 3);
    rotRef.current = startDeg;
    setRotation(startDeg);
    introActive.current = true;
    isAnimating.current = true;
    const duration = 2100;
    const start = performance.now();
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const tick = (now: number) => {
      if (!introActive.current) return;
      const p = Math.min((now - start) / duration, 1);
      rotRef.current = startDeg * (1 - ease(p));
      setRotation(rotRef.current);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rotRef.current = 0;
        setRotation(0);
        introActive.current = false;
        isAnimating.current = false;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // 스크롤로 회전 (스크롤 다운 = 반시계, 스크롤 업 = 시계)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (picked) return;
      e.preventDefault();
      cancelIntro();
      setIsScrolling(true);
      // deltaY → 속도 누적 (감도 조절: 0.04)
      velRef.current -= e.deltaY * 0.04;
      // RAF가 안 돌고 있으면 시작
      if (!isAnimating.current) {
        rotRef.current = rotRef.current; // sync (rotRef already correct)
        startRAF();
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [picked, startRAF, cancelIntro]);

  // 현재 앞에 있는 카드 (각도 0에 가장 가까운 카드)
  const frontCard = ((Math.round(-rotation / STEP) % N) + N) % N;

  const onPointerDown = useCallback((clientX: number) => {
    if (picked) return;
    cancelIntro();
    dragStartX.current = clientX;
    dragStartRot.current = rotRef.current;
    didDrag.current = false;
    setIsDragging(true);
  }, [picked, cancelIntro]);

  const onPointerMove = useCallback((clientX: number) => {
    if (dragStartX.current === null || picked) return;
    const delta = clientX - dragStartX.current;
    if (Math.abs(delta) > 5) didDrag.current = true;
    const next = dragStartRot.current + (delta / DRAG_PX_PER_STEP) * STEP;
    rotRef.current = next;
    setRotation(next);
  }, [picked]);

  const onPointerUp = useCallback(() => {
    if (dragStartX.current === null) return;
    dragStartX.current = null;
    setIsDragging(false);
    // 가장 가까운 카드로 스냅
    const snapped = Math.round(rotRef.current / STEP) * STEP;
    rotRef.current = snapped;
    setRotation(snapped);
  }, []);

  const handleCardClick = (i: number) => {
    if (didDrag.current || picked || isLoading) return;
    if (i === frontCard) return;  // 앞 카드 클릭해도 선택 안 됨 — 버튼으로만 선택 가능
    // 진행 중인 관성 애니메이션 중단
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    isAnimating.current = false;
    velRef.current = 0;
    // 비중심 카드 클릭 시 해당 카드를 앞으로 당기기 (rotRef도 함께 동기화)
    const visualAngle = ((i * STEP + rotRef.current) % 360 + 360) % 360;
    const short = visualAngle > 180 ? visualAngle - 360 : visualAngle;
    const next = rotRef.current - short;
    rotRef.current = next;
    setRotation(next);
    lastMoveTime.current = Date.now();  // 방금 가운데로 끌어옴 → 더블클릭 선택 방지
  };

  const getStyle = (i: number): React.CSSProperties => {
    const visualAngleDeg = i * STEP + rotation;

    // -180..180 정규화
    const norm = ((visualAngleDeg % 360) + 360) % 360;
    const aBase = norm > 180 ? norm - 360 : norm;

    // 중앙↔양옆 사이만 벌리고, 그 바깥 카드들끼리는 원래 간격 유지.
    // 옆 카드 묶음 전체를 같은 각도만큼 바깥으로 밀되, 0→±STEP 구간만
    // 부드럽게 차올라(회전 중 끊김 없음) ±STEP부터는 일정하게 적용.
    const offset = Math.sign(aBase) * SIDE_SPREAD_DEG * Math.min(1, Math.abs(aBase) / STEP);
    const a = aBase + offset;

    const aRad = (a * Math.PI) / 180;
    const cosA = Math.cos(aRad);

    // 원 위에 카드 배치 (x·y·기울기 모두 같은 원호를 따름)
    const R_center = RADIUS + CARD_H / 2;
    const cx = Math.sin(aRad) * R_center;
    const cy = CENTER_Y - Math.cos(aRad) * R_center;

    const zIndex = Math.round(50 + 50 * cosA);

    const isPickedCard = picked && pickedCard === i;
    const isFront = i === frontCard && !picked;

    // 선택되지 않은 나머지 카드는 사라짐
    const fadedOut = picked && !isPickedCard;

    const scale = isPickedCard ? 1.18 : isFront ? 1.08 : 0.82;
    // 바닥 고정 스케일: 카드가 커질 때 하단이 움직이지 않도록 위로만 늘어남
    const bottomAnchorOffset = isFront ? CARD_H * (scale - 1) : 0;
    const ty = isPickedCard ? 110 : cy - CARD_H / 2 - bottomAnchorOffset;

    const dimFilter = !picked && !isFront ? 'brightness(0.4) blur(1px)' : 'none';

    return {
      position: 'absolute',
      left: '50%',
      top: 0,
      width: CARD_W,
      height: CARD_H,
      borderRadius: BORDER_RADIUS,
      transform: `translate(calc(-50% + ${fadedOut ? cx : isPickedCard ? 0 : cx}px), ${ty}px) rotate(${isPickedCard ? 0 : a}deg) scale(${fadedOut ? 0.6 : scale})`,
      opacity: fadedOut ? 0 : 1,
      filter: dimFilter,
      zIndex: isPickedCard ? 200 : zIndex,
      boxShadow: isPickedCard
        ? '0 18px 50px rgba(0,0,0,0.35), 0 0 0 2px rgba(255,255,255,0.25), 0 0 70px 10px rgba(255,96,0,0.55)'
        : isFront
        ? '0 0 0 3px #FF6000, 0 0 28px rgba(255,96,0,0.55), 0 14px 36px rgba(0,0,0,0.3)'
        : '0 8px 20px rgba(0,0,0,0.3)',
      transition: (isDragging || isScrolling)
        ? 'none'
        : isPickedCard
        ? 'transform 0.65s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.5s ease, opacity 0.4s ease'
        : 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease, opacity 0.5s ease',
      cursor: 'pointer',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      willChange: 'transform',
    };
  };

  // 선택된 카드 중심 좌표 (오버레이 정렬용)
  const BURST_TOP = 110 + (CARD_H * 1.18) / 2;

  // 선택 요청 → 확인 팝업 먼저 띄움 (실수 방지)
  const requestSelect = useCallback(() => {
    if (isLoading || picked || confirming) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    isAnimating.current = false;
    velRef.current = 0;
    const snapped = Math.round(rotRef.current / STEP) * STEP;
    rotRef.current = snapped;
    setRotation(snapped);
    pendingTarget.current = frontCard;  // 확정 시점 카드 고정
    setConfirming(true);
  }, [isLoading, picked, confirming, frontCard]);

  // 확인 팝업에서 "선택" 누름 → 실제 선택 확정
  const confirmSelect = useCallback(() => {
    setConfirming(false);
    setPicked(true);
    setPickedCard(pendingTarget.current);
    setParticles(makeParticles(28));
    setTimeout(() => onComplete(), 1700);
  }, [onComplete]);

  const handleFrontCardDoubleClick = useCallback((i: number) => {
    if (i !== frontCard) return;
    // 마우스(PC)에서만 동작 — 터치/모바일 제외
    if (!window.matchMedia('(pointer: fine)').matches) return;
    // 방금 클릭으로 가운데에 끌려온 카드는 제외 — 처음부터 가운데 있던 카드만 선택
    if (Date.now() - lastMoveTime.current < 400) return;
    requestSelect();
  }, [frontCard, requestSelect]);

  const moveCard = useCallback((dir: 1 | -1) => {
    if (picked || isLoading) return;
    introActive.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    isAnimating.current = false;
    velRef.current = 0;
    const next = Math.round(rotRef.current / STEP) * STEP + STEP * dir;
    rotRef.current = next;
    setRotation(next);
  }, [picked, isLoading]);

  return (
    <div className="flex flex-col items-center w-full select-none">
      <style>{`
        @keyframes burst-glow {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          35%  { opacity: 1; }
          100% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes burst-ring {
          0%   { opacity: 0.9; transform: translate(-50%, -50%) scale(0.2); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.6); }
        }
        @keyframes burst-spark {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0); }
          15%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { opacity: 0; transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1.1); }
        }
        .carousel-arrow { display: none; }
        .carousel-hint-img { display: none; }
        .carousel-container { overflow: hidden; }
        @keyframes carousel-mo-fadein { from { opacity: 0; } to { opacity: 1; } }
        @media (max-width: 768px) {
          .carousel-container { animation: carousel-mo-fadein 0.8s ease both; }
        }
        /* 더블클릭 선택 힌트 — 마우스(PC)에서만 노출 */
        .dblclick-hint { display: none; }
        @media (pointer: fine) {
          .dblclick-hint {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            position: absolute;
            left: 50%;
            top: 56px;
            transform: translateX(-50%);
            color: #ff6000;
            font-size: 16px;
            font-weight: 600;
            letter-spacing: 0.02em;
            white-space: nowrap;
            z-index: 215;
            pointer-events: none;
            animation: dblclick-hint-in 0.4s ease both;
          }
        }
        @keyframes confirm-fade {
          from { opacity: 0; } to { opacity: 1; }
        }
        /* 확인 팝업 텍스트 — 기본(모바일) 크기, PC에서 확대 */
        .confirm-title { font-size: 19px; }
        .confirm-desc  { font-size: 13px; }
        .confirm-btn   { font-size: 15px; }
        @media (min-width: 769px) {
          .confirm-title { font-size: 24px; }
          .confirm-desc  { font-size: 15px; }
          .confirm-btn   { font-size: 17px; padding: 16px 0; }
        }
        @keyframes confirm-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dblclick-hint-in {
          from { opacity: 0; transform: translate(-50%, -4px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @media (max-width: 768px) {
          .carousel-container { overflow: visible; }
          .carousel-hint-img { display: flex; }
          .carousel-arrow {
            display: flex;
            align-items: center;
            justify-content: center;
            position: absolute;
            top: 40%;
            transform: translateY(-50%);
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            color: rgba(255,255,255,0.7);
            font-size: 20px;
            cursor: pointer;
            z-index: 220;
            transition: background 0.15s;
          }
          .carousel-arrow:active { background: rgba(255,96,0,0.25); }
          .carousel-arrow-left { left: 8px; }
          .carousel-arrow-right { right: 8px; }
        }
        /* PC: 화살표 숨김 */
        @media (min-width: 769px) {
          .carousel-arrow { display: none !important; }
        }

        /* 스크롤 힌트 애니메이션 (PC only) */
        @keyframes scroll-hint-wheel {
          0%   { transform: translateY(0);   opacity: 0; }
          12%  { transform: translateY(0);   opacity: 1; }
          58%  { transform: translateY(6px); opacity: 1; }
          72%  { transform: translateY(6px); opacity: 0; }
          73%  { transform: translateY(0);   opacity: 0; }
          100% { transform: translateY(0);   opacity: 0; }
        }
        @keyframes scroll-hint-fade {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
        .scroll-hint {
          display: none;
        }
        @media (min-width: 769px) {
          .scroll-hint {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            position: fixed;
            bottom: 148px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 210;
            pointer-events: none;
          }
          .scroll-hint-mouse {
            width: 24px;
            height: 38px;
            border: 2px solid rgba(255,255,255,0.35);
            border-radius: 12px;
            position: relative;
            display: flex;
            justify-content: center;
            padding-top: 6px;
          }
          .scroll-hint-wheel {
            width: 3px;
            height: 7px;
            background: rgba(255,255,255,0.6);
            border-radius: 2px;
            animation: scroll-hint-wheel 2s ease-in-out infinite;
          }
          .scroll-hint-label {
            font-size: 14px;
            font-weight: 500;
            color: rgba(255,255,255,0.7);
            letter-spacing: 0.02em;
            white-space: nowrap;
          }
        }
        /* 선택 버튼 — 화면 하단 고정 (다른 페이지 버튼과 동일 위치) */
        .pick-cta {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          justify-content: center;
          padding: 40px 16px 18px;
          z-index: 200;
          pointer-events: none;
          background: linear-gradient(to top, #0e0e0e 35%, rgba(14,14,14,0) 100%);
        }
        .pick-cta > button {
          pointer-events: auto;
          max-width: 448px;
        }
        /* PC: 메인 페이지 버튼과 동일하게 바닥에서 52px */
        @media (min-width: 769px) {
          .pick-cta { padding-bottom: 52px; }
        }
        @keyframes card-shine {
          0%   { transform: translateX(-120%) rotate(8deg); opacity: 0; }
          25%  { opacity: 0.9; }
          60%  { transform: translateX(120%) rotate(8deg); opacity: 0; }
          100% { transform: translateX(120%) rotate(8deg); opacity: 0; }
        }
      `}</style>

      <div
        ref={containerRef}
        className="relative w-full carousel-container"
        style={{ height: 620, touchAction: 'pan-y' }}
        onMouseDown={e => onPointerDown(e.clientX)}
        onMouseMove={e => { if (dragStartX.current !== null) onPointerMove(e.clientX); }}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={e => onPointerDown(e.touches[0].clientX)}
        onTouchMove={e => { e.preventDefault(); onPointerMove(e.touches[0].clientX); }}
        onTouchEnd={onPointerUp}
      >
        {/* 선택 카드 뒤 빛 글로우 (카드보다 아래) */}
        {picked && (
          <div style={{
            position: 'absolute', left: '50%', top: BURST_TOP,
            width: 420, height: 420, zIndex: 190, pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(255,150,50,0.55) 0%, rgba(255,96,0,0.25) 35%, transparent 70%)',
            animation: 'burst-glow 0.8s ease-out both',
          }} />
        )}

        {Array.from({ length: N }).map((_, i) => (
          <div key={i} style={getStyle(i)} onClick={() => handleCardClick(i)} onDoubleClick={() => handleFrontCardDoubleClick(i)}>
            <CardFace isPicked={picked && pickedCard === i} />
          </div>
        ))}


        {/* 빛 폭발 — 확산 링 + 스파클 (카드 위) */}
        {picked && (
          <div style={{
            position: 'absolute', left: '50%', top: BURST_TOP,
            width: 0, height: 0, zIndex: 210, pointerEvents: 'none',
          }}>
            {/* 확산 링 2겹 */}
            <div style={{
              position: 'absolute', left: '50%', top: '50%',
              width: 220, height: 220, borderRadius: '50%',
              border: '2px solid rgba(255,200,120,0.8)',
              animation: 'burst-ring 0.9s ease-out both',
            }} />
            <div style={{
              position: 'absolute', left: '50%', top: '50%',
              width: 220, height: 220, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.6)',
              animation: 'burst-ring 1.1s ease-out 0.12s both',
            }} />
            {/* 스파클 */}
            {particles.map(p => (
              <div key={p.id} style={{
                position: 'absolute', left: '50%', top: '50%',
                width: p.size, height: p.size, borderRadius: '50%',
                background: p.color,
                boxShadow: `0 0 ${p.size}px ${p.color}`,
                ['--tx' as string]: `${p.tx}px`,
                ['--ty' as string]: `${p.ty}px`,
                animation: `burst-spark ${p.duration}s ease-out ${p.delay}s both`,
              }} />
            ))}
          </div>
        )}

        {/* 모바일 좌우 화살표 */}
        {!picked && (
          <>
            <button className="carousel-arrow carousel-arrow-left" onClick={() => moveCard(1)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: 'relative', left: -1 }}>
                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="carousel-arrow carousel-arrow-right" onClick={() => moveCard(-1)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: 'relative', left: 1 }}>
                <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </>
        )}

        {/* 하단 블러 오버레이 */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 140, pointerEvents: 'none', zIndex: 150,
          backdropFilter: 'blur(1px)',
          WebkitBackdropFilter: 'blur(1px)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 60%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 60%)',
        }} />

        {/* 하단 페이드아웃 그라디언트 */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 140, pointerEvents: 'none', zIndex: 151,
          background: 'linear-gradient(to top, rgba(14,14,14,1) 0%, rgba(14,14,14,0.839) 6.49%, rgba(14,14,14,0.700) 13.72%, rgba(14,14,14,0.579) 20.3%, rgba(14,14,14,0.476) 26.3%, rgba(14,14,14,0.388) 31.79%, rgba(14,14,14,0.314) 36.84%, rgba(14,14,14,0.251) 41.48%, rgba(14,14,14,0.199) 45.76%, rgba(14,14,14,0.156) 49.71%, rgba(14,14,14,0.121) 53.36%, rgba(14,14,14,0.092) 56.71%, rgba(14,14,14,0.069) 59.81%, rgba(14,14,14,0.051) 62.65%, rgba(14,14,14,0.037) 65.27%, rgba(14,14,14,0.026) 67.66%, rgba(14,14,14,0.018) 69.85%, rgba(14,14,14,0.012) 71.83%, rgba(14,14,14,0.008) 73.63%, rgba(14,14,14,0.005) 75.25%, rgba(14,14,14,0.003) 76.7%, rgba(14,14,14,0.0016) 77.98%, rgba(14,14,14,0) 83%)',
        }} />

      </div>

      {/* 스크롤 힌트 — PC only, 카드 선택 전 */}
      {!picked && (
        <div className="scroll-hint">
          <div className="scroll-hint-mouse">
            <div className="scroll-hint-wheel" />
          </div>
          <span className="scroll-hint-label">마우스 스크롤로 카드를 이동할 수 있어요</span>
        </div>
      )}

      {/* 선택 버튼 — portal로 body에 직접 띄워 캐러셀 축소(transform) 영역을 벗어남 */}
      {mounted && !picked && createPortal(
        <div className="pick-cta">
          <button
            onClick={requestSelect}
            disabled={isLoading}
            style={{
              width: '100%',
              background: '#FF6000', color: '#fff',
              fontWeight: 800, fontSize: 16,
              padding: '17px 10px', borderRadius: 14,
              border: 'none', cursor: isLoading ? 'wait' : 'pointer',
              opacity: isLoading ? 0.5 : 1,
              letterSpacing: '0.03em',
              textShadow: '0px 2px 4px rgba(214,81,0,0.25)',
              boxShadow: '0 6px 18px rgba(255,96,0,0.18)',
              transition: 'opacity 0.2s',
            }}
          >
            이 카드로 정하기
          </button>
        </div>,
        document.body
      )}

      {/* 선택 확인 팝업 */}
      {mounted && confirming && createPortal(
        <div
          onClick={() => setConfirming(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            animation: 'confirm-fade 0.18s ease both',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 360,
              background: '#1a1a1a',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
              padding: '28px 22px 22px',
              textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              animation: 'confirm-pop 0.22s cubic-bezier(0.34,1.4,0.64,1) both',
            }}
          >
            <p className="confirm-title" style={{ fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>
              이 파트너와 함께할까요?
            </p>
            <p className="confirm-desc" style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 22px', lineHeight: 1.55 }}>
              이번 해커톤을 같이 보낼 파트너예요.<br />한 번 정하면 바꾸지 않고 쭉 가요.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="confirm-btn confirm-cancel"
                onClick={() => setConfirming(false)}
                style={{
                  flex: 1, padding: '14px 0', borderRadius: 12,
                  background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)',
                  border: 'none',
                  fontWeight: 700, cursor: 'pointer',
                }}
              >
                다시 고를래요
              </button>
              <button
                className="confirm-btn confirm-ok"
                onClick={confirmSelect}
                style={{
                  flex: 1, padding: '14px 0', borderRadius: 12,
                  background: '#FF6000', color: '#fff', border: 'none',
                  fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(255,96,0,0.25)',
                }}
              >
                함께할래요!
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function CardFace({ isPicked }: { isPicked: boolean }) {
  return (
    <div className="w-full h-full relative overflow-hidden" style={{ borderRadius: BORDER_RADIUS }}>
      <Image
        src="/card-back-0624.png"
        alt="카드"
        fill
        sizes="200px"
        style={{ objectFit: 'cover' }}
        draggable={false}
        priority
        unoptimized
      />

      {/* 샤인 스윕 */}
      {isPicked && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: '60%',
          background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.65) 50%, transparent 100%)',
          animation: 'card-shine 1.4s ease-in-out 0.25s both',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}
