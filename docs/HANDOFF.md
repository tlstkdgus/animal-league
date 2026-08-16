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
- `.env.local` 값 채워짐 (URL + service_role 키)

### 토너먼트 로직 (2026-08-16)
- `lib/tournament.ts` — 순수 함수 완성. 초기 브래킷 팩토리, Fisher–Yates 추첨,
  상태 전이 전부 (`startMatch` `revealResult` `drawRound2` `setFinal` `updateTeam`
  `setJudgeCode` `setAdminPin` `reset`) + 가드 (`TournamentError` 코드 기반)
- `lib/tournament.test.ts` — 단위 테스트 27개, `npm test` (Node 24 내장 러너, 의존성 없음)
- CI 에 Test 단계 추가

---

## ⚠️ 사람이 직접 확인할 것

- Supabase 프로젝트 생성 + `.env.local` 채우기 — **완료**
- **`supabase/schema.sql` 을 SQL Editor 에서 Run 했는지 확인** (안 했으면 서버 레이어가 첫 호출에서 실패)

> 무료 티어는 **일주일간 요청이 없으면 프로젝트가 일시정지**된다.
> 행사 2~3일 전과 전날에 대시보드를 한 번씩 열어 깨워둘 것.

---

## 다음 작업 (순서대로)

### 1. ~~토너먼트 로직~~ — 완료 (`lib/tournament.ts` + 테스트 27개)

### 2. ~~서버 레이어~~ — 완료 (`lib/supabaseAdmin.ts` `lib/state.ts` `lib/auth.ts`)
- 실제 Supabase 에 스모크 테스트 통과 (초기 행 생성 · 비밀값 제거 · rev 잠금 · 초기화)
- 운영 세션: PIN 을 서비스 롤 키로 HMAC 한 파생 토큰 쿠키(`al_admin`, 18h).
  PIN 변경 시 기존 세션 자동 무효화. 심사 코드는 세션 없이 제출마다 대조
- `schema.sql` Supabase 적용 확인됨 (2026-08-16)

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
| **결과 취소 없음** (2026-08-16) | `done` 은 종착 상태. 공개가 곧 현장 발표라 롤백해도 발표를 못 되돌리고, 하위 대진 무효화 정책 문제도 함께 사라짐. 대신 공개 버튼에 확인 다이얼로그 필수. 최후 수단은 전체 초기화 |
| **팀 캐릭터는 학교별 매핑** (2026-08-16) | 각 학교에 맞는 캐릭터 이미지를 팀에 매핑. `Team.character` 에 이미지 키(`char_NN`) 저장. 필요한 이미지는 담당자가 추가 예정 |

---

## 미결 사항 (사람이 정해야 함)

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
