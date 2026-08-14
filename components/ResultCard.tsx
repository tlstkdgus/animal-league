'use client';

import Image from 'next/image';
import { useRef, useState, useEffect, useCallback } from 'react';

type Props = {
  universityName: string;
  characterName: string;
  characterImageUrl?: string | null;
  onShare?: () => void;
};

type Spark = {
  id: number;
  x: number; // card 기준 %
  y: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
};

const SPARK_COLORS = [
  'rgba(255,255,255,0.95)',
  'rgba(200,220,255,0.9)',
  'rgba(255,200,240,0.9)',
  'rgba(180,255,220,0.85)',
  'rgba(255,230,150,0.9)',
];

let sparkId = 0;

export default function ResultCard({ universityName, characterName, characterImageUrl, onShare }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 50 });
  const [sparks, setSparks] = useState<Spark[]>([]);
  const spawnTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorRef = useRef({ x: 50, y: 50 });

  // 기울기만 스프링 보간 — 목표값으로 매 프레임 부드럽게 따라감 (나간 방향 머물다 복귀)
  const targetRef = useRef({ rx: 0, ry: 0 });
  const animRef = useRef({ rx: 0, ry: 0 });
  const rafRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HOLD_MS = 300; // 마우스가 나간 뒤 그 각도로 머무는 시간

  const tick = useCallback(() => {
    const t = targetRef.current;
    const a = animRef.current;
    const k = 0.06; // 스프링 강도(작을수록 더 무겁게 트레일링)
    a.rx += (t.rx - a.rx) * k;
    a.ry += (t.ry - a.ry) * k;
    const card = cardRef.current;
    if (card) {
      card.style.setProperty('--rx', `${a.rx}deg`);
      card.style.setProperty('--ry', `${a.ry}deg`);
    }
    if (Math.abs(t.rx - a.rx) < 0.02 && Math.abs(t.ry - a.ry) < 0.02) {
      rafRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startTick = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const updateFromPoint = (clientX: number, clientY: number) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    // 다시 들어오면 복귀 hold 타이머 취소
    if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }

    // 커서 아래 지점이 눌리듯 뒤로 밀리게
    targetRef.current = { rx: (y - 0.5) * -32, ry: (x - 0.5) * 32 };
    startTick();

    // 하이라이트/반짝임은 즉시 반응 (스프링 없음)
    card.style.setProperty('--mx', `${x * 100}%`);
    card.style.setProperty('--my', `${y * 100}%`);
    cursorRef.current = { x: x * 100, y: y * 100 };
    setCursorPos({ x: x * 100, y: y * 100 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    updateFromPoint(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsHovered(true);
    const t = e.touches[0];
    if (t) updateFromPoint(t.clientX, t.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (t) updateFromPoint(t.clientX, t.clientY);
  };

  const handleTouchEnd = () => {
    // 나간 방향으로 잠깐 머물렀다가(HOLD_MS) 스프링으로 부드럽게 복귀
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      targetRef.current = { rx: 0, ry: 0 };
      startTick();
      leaveTimerRef.current = null;
    }, HOLD_MS);
    setIsHovered(false);
  };

  const spawnSparks = useCallback(() => {
    const { x, y } = cursorRef.current;
    const count = 2 + Math.floor(Math.random() * 2);
    const newSparks: Spark[] = Array.from({ length: count }, () => {
      const spread = 12;
      return {
        id: sparkId++,
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        size: 3 + Math.random() * 5,
        duration: 500 + Math.random() * 600,
        delay: Math.random() * 100,
        color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
      };
    });
    setSparks(prev => [...prev.slice(-24), ...newSparks]);
    // 수명 지난 spark 제거
    setTimeout(() => {
      setSparks(prev => prev.filter(s => !newSparks.find(n => n.id === s.id)));
    }, 1200);
  }, []);

  useEffect(() => {
    if (isHovered) {
      spawnTimer.current = setInterval(spawnSparks, 80);
    } else {
      if (spawnTimer.current) clearInterval(spawnTimer.current);
      setSparks([]);
    }
    return () => { if (spawnTimer.current) clearInterval(spawnTimer.current); };
  }, [isHovered, spawnSparks]);

  const handleMouseLeave = () => {
    // 나간 방향으로 잠깐 머물렀다가(HOLD_MS) 스프링으로 부드럽게 복귀
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      targetRef.current = { rx: 0, ry: 0 };
      startTick();
      leaveTimerRef.current = null;
    }, HOLD_MS);
    setIsHovered(false);
  };

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
  }, []);

  return (
    <div className="flex flex-col items-center mx-auto" style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 320 }}>
      <style>{`
        @media (max-width: 768px) {
          .result-card-wrap { max-width: 280px !important; }
        }
      `}</style>
      <div className="result-card-wrap" style={{ width: '100%', maxWidth: 320 }}>
        <div style={{ perspective: '900px' }} className="w-full">
        <div
          ref={cardRef}
          onMouseEnter={() => setIsHovered(true)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative w-full rounded-2xl overflow-hidden shadow-2xl"
          style={{
            aspectRatio: '2 / 3',
            transform: 'rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))',
            transformStyle: 'preserve-3d',
            willChange: 'transform',
            touchAction: 'none',
          }}
        >
          {/* 카드 이미지 */}
          {characterImageUrl ? (
            <Image src={characterImageUrl} alt={characterName} fill style={{ objectFit: 'cover' }} priority />
          ) : (
            <div className="w-full h-full bg-orange-50 flex items-center justify-center text-6xl">🎭</div>
          )}

          {/* holo-pattern — 커서 위치에서 마스크로 노출 */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'url(/holo-pattern.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: isHovered ? 0.85 : 0,
            maskImage: isHovered
              ? `radial-gradient(circle 110px at var(--mx, 50%) var(--my, 50%), black 0%, transparent 100%)`
              : 'none',
            WebkitMaskImage: isHovered
              ? `radial-gradient(circle 110px at var(--mx, 50%) var(--my, 50%), black 0%, transparent 100%)`
              : 'none',
            mixBlendMode: 'overlay',
            transition: 'opacity 0.2s',
          }} />

          {/* 소프트 하이라이트 */}
          {isHovered && (
            <div className="absolute inset-0 pointer-events-none" style={{
              background: `radial-gradient(ellipse 55% 45% at ${cursorPos.x}% ${cursorPos.y}%, rgba(255,255,255,0.12) 0%, transparent 70%)`,
            }} />
          )}

          {/* Stardust 파티클 */}
          {sparks.map(spark => (
            <div
              key={spark.id}
              className="absolute pointer-events-none"
              style={{
                left: `${spark.x}%`,
                top: `${spark.y}%`,
                width: spark.size,
                height: spark.size,
                borderRadius: '50%',
                background: spark.color,
                boxShadow: `0 0 ${spark.size * 2}px ${spark.color}`,
                transform: 'translate(-50%, -50%) scale(0)',
                animation: `stardust-pop ${spark.duration}ms ease-out ${spark.delay}ms forwards`,
                zIndex: 10,
              }}
            />
          ))}
        </div>
        </div>
      </div>

      {/* stardust 키프레임 */}
      <style>{`
        @keyframes stardust-pop {
          0%   { transform: translate(-50%, -50%) scale(0);   opacity: 1; }
          40%  { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -60%) scale(0);   opacity: 0; }
        }
      `}</style>

      <p style={{ fontSize: 24, fontWeight: 800, color: '#f0f0f0', marginTop: 24, marginBottom: 4 }}>{characterName}</p>

      {onShare && (
        <button
          onClick={onShare}
          className="w-full mt-5 border-2 border-[#FF6000] text-[#FF6000] font-bold py-4 rounded-2xl text-base active:scale-95 transition-all"
        >
          결과 공유하기
        </button>
      )}
    </div>
  );
}
