# 인수인계 — 현재 상태와 다음 작업

**행사일 2026-08-25** (코엑스 마곡) · **기능 프리즈 8/22**

새 세션에서 이어받을 때 이 문서부터 읽는다. 요구사항은 [SPEC.md](./SPEC.md)가 단일 출처다.

---

## 지금까지 된 것

### 프로젝트 기반
- Next.js 16.2.9 / React 19 / Tailwind v4 / three.js 셋업 완료, 빌드 통과
- `capsule-match` 프로젝트에서 **에셋 185개(13.6MB)** 이관 — 캐릭터 80종, 대학 로고 80종,
  카드 뒷면, 배경, 사자 영상. 참조 경로 전수 검증 완료
- 재사용 컴포넌트 6종 이관: `SpinningCard3D` `TicketIntro` `CodeInput` `UniversitySelect`
  `LoadingOverlay` `CornerGlow`
- **git 히스토리는 이어받지 않음** (원본에 평문 비밀값이 있어서)

### 개발 프로세스
- 브랜치·커밋·릴리스 전략 → [../CONTRIBUTING.md](../CONTRIBUTING.md)
- CI: PR마다 타입체크 · 린트 · 빌드 (Node 24)
- `main` 보호: PR 필수, squash 전용, force-push 금지, CI 통과 필수, 관리자 우회 허용

### 백엔드
- `supabase/schema.sql` 작성 완료 — 테이블 2개 (`tournament_state`, `votes`)
- `.env.local.example` 및 `.env.local` 생성 (값은 비어 있음)

---

## ⚠️ 먼저 해야 할 것 — 사람이 직접

**Supabase 프로젝트가 없으면 그다음이 전부 막힌다.**

1. [supabase.com](https://supabase.com) → New project
2. 대시보드 **SQL Editor** 에 `supabase/schema.sql` 전체를 붙여넣고 Run
3. `.env.local` 채우기
   - `NEXT_PUBLIC_SUPABASE_URL` ← Settings → **Data API** 의 Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` ← Settings → **API Keys** 의 `service_role` (secret)

> 무료 티어는 **일주일간 요청이 없으면 프로젝트가 일시정지**된다.
> 행사 2~3일 전과 전날에 대시보드를 한 번씩 열어 깨워둘 것.

---

## 다음 작업 (순서대로)

### 1. 토너먼트 로직 — `lib/tournament.ts`
순수 함수만. DB·React 의존 없이 단위 테스트 가능하게.

- 초기 상태 팩토리 (8팀 빈 슬롯 + 7경기, SPEC §4.1 모양 그대로)
- Fisher–Yates 셔플 → R2 대진 추첨 (SPEC §2: 트랙 제약 불필요)
- 상태 전이와 **가드** (SPEC §8):
  - `startMatch` — 대진 미확정이면 거부, 기존 live 는 ready 로
  - `revealResult` — 제출 0건이어도 허용 (백업 모드)
  - `cancelResult` — done → live 롤백, winner 초기화
  - `drawRound2` — R1 4경기 done + R2 미추첨일 때만
  - `setFinal` — R2 2경기 done + 결선 미확정일 때만
  - `reset` — 전체 초기화

### 2. 서버 레이어 — `lib/supabaseAdmin.ts`, `lib/state.ts`, `lib/auth.ts`
- Supabase 서비스 롤 클라이언트. **모듈 최상단에서 throw 금지** (키 없이도 빌드돼야 함, CI가 검사)
- `ensureState()` — 행 없으면 초기 브래킷으로 생성
- `mutate(fn)` — 읽기 → 변형 → `UPDATE ... WHERE rev = <읽은 값>` → 0행이면 재시도 (최대 3회)
- PIN / 심사 코드 검증. 운영 세션은 파생 토큰 쿠키 방식
  (원본 `capsule-match` 의 `lib/adminAuth.ts` 패턴 참고 — 비밀번호 원문을 쿠키에 넣지 않음)

### 3. API 라우트
| 경로 | 인증 | 용도 |
|------|------|------|
| `GET /api/state` | 공개 | 스크린·심사용. **`judgeCode`/`adminPin` 반드시 제거 후 반환** |
| `POST /api/vote` | 심사 코드 | 제출 upsert (`match_id`+`judge_slug` 충돌 시 덮어쓰기) |
| `POST /api/admin/auth` | PIN | 로그인, 파생 토큰 쿠키 발급 |
| `POST /api/admin/action` | 쿠키 | 상태 변경 액션 단일 진입점 |
| `GET /api/admin/votes?matchId=` | 쿠키 | 집계 열람 |

`proxy.ts` 로 `/api/admin/*` 가드 (`/api/admin/auth` 는 제외).
**클라이언트 검증만으로 끝내지 말 것** — SPEC §7.

### 4. 화면 3개
독립적이라 병렬 진행 가능. 각각 별도 브랜치·PR.

- `app/page.tsx` → **스크린** (현재 임시 인덱스 페이지를 대체)
- `app/judge/page.tsx` → **심사**
- `app/admin/page.tsx` → **운영**

### 5. 검증
SPEC §8 체크리스트를 실제로 한 번씩 밟아본다. 특히 동표 경고, 백업 모드, 결과 취소.

### 6. 행사 준비
- 리허설 전 `v0.9.0-rehearsal` 태그
- 리허설 후 **전체 초기화** (리허설 데이터 제거)
- 전날 `v1.0.0` 태그
- 오프라인 폴백 경로(운영 노트북 로컬 실행) 리허설 때 검증

---

## 이미 내린 결정 (다시 논의하지 말 것)

| 결정 | 이유 |
|------|------|
| **Supabase** (Oracle VM 아님) | 11일 남았고 실사용은 하루. VM 은 OS·TLS·Postgres·백업을 전부 떠안아야 해서 마감을 위협 |
| **모든 접근을 서버 API 라우트 경유, anon 키 미사용** | 브라우저에 DB 키가 안 내려감 → 참가자가 대진·표를 직접 조작할 경로 차단 (SPEC §7) |
| **전역 상태를 `jsonb` 단일 문서로** | R2 추첨처럼 슬롯 여러 개가 동시에 바뀌는 동작이 있어, 정규화하면 중간 상태가 스크린에 노출됨 |
| **`rev` 낙관적 잠금** | 운영자 여러 명이 동시에 눌러도 덮어쓰기 사고 방지 |
| **초기 브래킷을 SQL 아닌 TS 에 정의** | 두 곳에 두면 반드시 어긋남 |
| **squash 머지 전용** | 당일 롤백 단위가 커밋 하나로 딱 떨어짐 |
| **CI Node 24** | 로컬과 동일하게 고정 |
| **`CardCarousel`·`ResultCard` 제거** | 이 앱이 안 쓰고 렌더할 화면이 없어 React 19 룰 수정을 검증할 수 없었음. 복구법은 README 에 기재 |

---

## 미결 사항 (사람이 정해야 함)

- **결과 취소 시 하위 대진 처리** — R2 추첨/결선 확정을 이미 한 뒤 R1 결과를 취소하면
  하위 대진을 무효화할지. SPEC §8 에 "정책 결정 필요"로 남아 있음.
  → 잠정: 하위 대진이 이미 확정됐으면 **취소를 막고 경고**하는 쪽이 안전
- **팀별 캐릭터 이미지 매핑** — `public/characters/char_01~80.png` 중 8팀에 무엇을 쓸지
- **브랜드 컬러 토큰 · 트랙별 컬러 4종** 실제 값
- **배포 대상** — Vercel 가정. 계정·프로젝트 연결 필요
- **실제 팀 명단 · 심사위원 명단** — 저장소에 커밋하지 말 것 (운영 화면에서 입력)

---

## 새 세션에서 시작하기

```bash
cd C:\Users\tlstk\Desktop\animal-league
git switch main && git pull
claude
```

첫 프롬프트 예시:

> `docs/HANDOFF.md` 와 `docs/SPEC.md` 읽고, 다음 작업부터 이어서 해줘.

`CONTRIBUTING.md` 의 브랜치·커밋 규칙을 따를 것. `main` 직접 커밋은 PR 없이 막혀 있다.
