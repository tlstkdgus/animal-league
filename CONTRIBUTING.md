# 브랜치 · 커밋 전략

**8/25 본선 당일 하루짜리 운영 도구**라는 성격에 맞춘 전략이다.
원칙은 두 가지 — *`main`은 언제나 배포 가능해야 하고, 당일에는 되돌릴 수단이 있어야 한다.*

---

## 브랜치

`main` 하나를 기준으로 하는 트렁크 기반. 장수 브랜치(develop 등)는 만들지 않는다.

| 브랜치 | 용도 | 수명 |
|--------|------|------|
| `main` | 항상 배포 가능한 상태 | 영구 |
| `feat/<slug>` | 기능 추가 | 1~2일 |
| `fix/<slug>` | 버그 수정 | 몇 시간 |
| `chore/<slug>` `docs/<slug>` `refactor/<slug>` | 잡무 · 문서 · 리팩터 | 짧게 |
| `hotfix/<slug>` | **행사 당일 긴급 수정** | 즉시 |

```bash
git switch -c feat/judge-screen      # 좋음
git switch -c feat/screens           # 나쁨 — 범위가 뭉뚱그려짐
```

**브랜치는 짧게 유지한다.** 하루 넘게 살아있으면 쪼갤 신호다.
화면 3개(viewer / judge / admin)는 서로 독립적이라 병렬로 진행해도 충돌이 거의 없다.

### main 직접 커밋

원칙적으로 금지하고 PR로 올린다. 예외는 오탈자·README 수정 정도.

---

## 커밋 메시지

[Conventional Commits](https://www.conventionalcommits.org/). 이전 프로젝트에서 쓰던 습관을 그대로 잇는다.

```
<type>(<scope>): <제목>

- 본문은 불릿으로. 무엇을 왜 바꿨는지.
- 어떻게 바꿨는지는 코드가 말하므로 생략.

Co-Authored-By: ...
```

**type** — `feat` `fix` `refactor` `perf` `style` `chore` `docs` `test` `security`

**scope** — 이 프로젝트는 화면·계층이 뚜렷하므로 붙이면 로그가 훨씬 읽힌다.
`viewer` `judge` `admin` `api` `db` `logic` `ui`

**제목** — 영문 소문자, 명령형, 72자 이내. 마침표 없음.

```
feat(judge): add proxy-submission mode for the secretary
fix(admin): block match start when the bracket slot is unresolved
security(api): validate admin PIN server-side on every write
```

**본문** — 한 줄로 설명되면 생략. 여러 갈래면 불릿.
행사 규정에서 비롯된 결정은 근거를 남긴다 (예: `명세 §2 — R1은 같은 트랙끼리`).

---

## 병합

**Squash merge만 사용한다.** `main` 히스토리는 PR 하나당 커밋 하나가 되어,
당일에 문제가 생겼을 때 되돌릴 단위가 명확해진다.

```bash
gh pr create --fill
gh pr merge --squash --delete-branch
```

리뷰어가 없더라도 PR을 거치는 이유는 세 가지다.
CI가 타입체크·빌드·린트를 막아주고, 머지 전에 diff를 스스로 한 번 읽게 되고,
되돌릴 단위가 커밋 하나로 딱 떨어진다.

---

## 태그와 프리즈

당일에 "어제까지 되던 버전"으로 돌아갈 수 있어야 한다.

| 시점 | 태그 | 의미 |
|------|------|------|
| 리허설 직전 | `v0.9.0-rehearsal` | 리허설에 쓴 빌드 |
| 행사 전날 | `v1.0.0` | **당일 운영에 쓸 고정 빌드** |
| 당일 긴급 수정 | `v1.0.1` | hotfix 반영본 |

```bash
git tag -a v1.0.0 -m "본선 당일 운영 빌드"
git push origin v1.0.0
```

**기능 프리즈: 8/22.** 이후로는 `fix/`와 `hotfix/`만 받는다.
새 기능은 아무리 좋아 보여도 다음으로 미룬다 — 당일에 터지는 건 대개 마지막에 넣은 것이다.

### 당일 긴급 수정

```bash
git switch -c hotfix/reveal-button --detach v1.0.0
# 고치고
git commit -m "fix(admin): ..."
# 검증 후 배포, 그 다음에 main으로 병합
```

당일에는 PR·CI를 기다릴 여유가 없을 수 있다. **그때는 절차보다 서비스가 우선이다.**
`main`에 직접 밀어도 되고, 대신 끝나고 반드시 정리한다.

---

## 커밋하지 말아야 할 것

이전 프로젝트에서 학교 코드 80개가 평문으로 공개 저장소에 올라간 적이 있다. 같은 실수를 반복하지 않는다.

- `.env*` — Supabase 키, 운영 PIN, 심사 코드
- `*.local.json` — 로컬 전용 설정
- 실제 팀 명단·심사위원 실명이 담긴 시드 데이터

운영 PIN과 심사 코드는 **DB에 저장하고 운영 화면에서 바꾼다.** 코드에 상수로 박지 않는다.
