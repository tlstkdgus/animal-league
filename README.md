# character-cards

캐릭터 카드 에셋과 재사용 컴포넌트를 모아둔 Next.js 프로젝트입니다.
`capsule-match` 프로젝트에서 에셋과 컴포넌트만 가져왔고, **git 히스토리는 이어받지 않았습니다.**

## 실행

```bash
npm install
npm run dev
```

http://localhost:3000 을 열면 확인용 인덱스 페이지가 보입니다.
`app/page.tsx` 는 에셋이 잘 넘어왔는지 보려고 만든 임시 페이지라 그대로 갈아엎어도 됩니다.

## 스택

Next.js 16.2.9 / React 19 / Tailwind CSS v4 / three.js (@react-three/fiber, drei)

> ⚠️ Next.js 16은 이전 버전과 규약이 다릅니다 (middleware → proxy 등).
> 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 해당 문서를 먼저 확인하세요. `AGENTS.md` 참고.

## 에셋 (`public/`)

| 경로 | 내용 |
|------|------|
| `characters/char_01~80.png` | 캐릭터 이미지 80종 |
| `char_00.png` | 사자 (시연용으로 쓰던 별도 캐릭터) |
| `logos/*.png` | 대학 로고 80종 — `lib/universityLogos.ts` 가 학교명으로 매핑 |
| `card-back-0624.png`, `card-back-Q.png`, `card-back-Q-ver2.png` | 카드 뒷면 |
| `holo-pattern.png` | `ResultCard` 홀로그램 오버레이 |
| `main.1_background_ver3.png`, `main.2_background_ver2.png`, `mo-background_ver2.png` | 메인 배경 (PC / 모바일) |
| `검표원 사자 배경보정.mp4`, `검표원_더미이미지0624.webp` | 사자 영상 + 포스터 이미지 |

## 컴포넌트 (`components/`)

| 컴포넌트 | 설명 | 쓰는 에셋 |
|----------|------|-----------|
| `SpinningCard3D` | three.js 3D 회전 카드. 기울기를 `tiltRef` / `zTiltRef` 로 받아 리렌더 없이 제어 | 카드 뒷면 2종 |
| `CardCarousel` | 원호 배치 17장 캐러셀. 드래그·휠 관성, 스냅, 선택 확인 팝업, 파티클 연출 | `card-back-0624.png` |
| `ResultCard` | 홀로그램 결과 카드. 커서 추적 틸트(스프링 보간), holo 마스크, stardust 파티클 | `holo-pattern.png` |
| `TicketIntro` | 사자 영상이 들어간 인트로 화면 | 사자 mp4 + webp |
| `CodeInput` | 5칸 코드 입력. 붙여넣기 자동 분배, 에러 시 흔들림 | — |
| `UniversitySelect` | 학교 그리드(PC) / 리스트(모바일) | `logos/*` |
| `LoadingOverlay` | 블러 로딩 오버레이 | — |
| `CornerGlow` | 모서리 글로우 배경 장식 | — |

`UniversitySelect` 는 `lib/types.ts` 의 최소 `University` 타입(`id`, `name`, `assigned_character_id`)만 씁니다.
원본의 DB 스키마는 가져오지 않았으니 새 데이터 소스에 맞춰 확장하세요.

## 가져오지 않은 것

Supabase 연동, 배정 로직, 관리자 페이지, 이벤트 로깅은 원본 서비스 전용이라 제외했습니다.
데이터가 필요해지면 `@supabase/supabase-js` 를 새로 붙이면 됩니다.
