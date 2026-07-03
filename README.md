# 100만장+ 판매 스팀게임의 공통점 분석 (2020–2026)

> 오늘(2026-07-03) 기준 웹리서치로, 100만 장 이상 판매된 스팀게임들의 **공통점(성공 패턴)** 을 규명하는 프로젝트.
> 특히 *"이미 전 세계적으로 유명한 게임/개념에 하나 이상의 독창적·유저친화적 변주(twist)를 더한다"* 는 가설을
> **가정하지 않고 정량적으로 검증**한다. (예: 벅샷 룰렛 = 러시안 룰렛 + 샷건/로그라이크, MECCHA CHAMELEON = 숨바꼭질/프롭헌트 + 몸을 칠해 변장)

## 어떻게 분석하나 — 200+ 에이전트 Dynamic Workflow

분석은 `game-hits-analysis.workflow.js` 라는 **Dynamic Workflow** 스크립트로 실행된다. 스크립트는 200명 이상의 서브에이전트를 다음 5단계로 팬아웃한다.

| 단계 | 메커니즘 | 하는 일 |
|---|---|---|
| 1. Discovery | `parallel()` 멀티모달 스윕 (연도·소스·장르·자체발표·에디토리얼·어워드·지역 ~26앵글) × loop-until-dry | 1M+ 후보 게임 마스터 리스트 구축 후 상위 `MAX_GAMES`개로 정제 |
| 2. Research + Verify | `pipeline(games, research, verify)` — **게임 1개당 2 에이전트** | 게임별로 디자인-DNA 스키마를 채우고(Research), 판매량 ≥1M을 **적대적으로 검증**해 신뢰도 등급(A/B/C/D) 부여(Verify) |
| 3. Analysis | `parallel(dimensions)` (~17차원) | 전체 데이터셋을 차원별로 분석 (가설 검증, 베이스/변주 분류학, 가격·코옵·바이럴·팀규모·EA·아트 등) |
| 4. Synthesis | 완결성 비평가 + 레드팀 + 리포트 작성 | 누락 점검, 반박, 한국어 최종 리포트 생성 |

**200+ 팬아웃의 필연성:** 스팀은 실판매량을 공개하지 않아 모든 수치가 추정치다 → 게임마다 독립적으로 재검증해야 한다. 또한 "익숙한 베이스 + 변주" 판정은 게임마다 고정 루브릭으로 코딩해야 일관성이 확보된다. 두 작업 모두 게임 단위로 환원 불가능하므로 N개 게임 → 2N개 에이전트가 된다.

## 핵심 방법론 원칙

1. **판매량은 전부 추정치.** Gamalytic / VG Insights / SteamDB / SteamSpy는 리뷰 수 기반 Boxleiter, 소유자 샘플링, 동시접속 역산으로 추정한다. **개발사 자체 발표 마일스톤이 최고 신뢰 신호.**
2. **신뢰도 등급 필수.** 모든 게임에 Tier A/B/C/D. 헤드라인 통계는 **Tier A+B 코호트**로 산출하고 **Tier C 포함/제외 두 값(민감도)** 을 함께 보고.
3. **생존자 편향 전면 명시.** 승자만 보므로 변주가 성공을 *유발*한다고 증명할 수 없다 → 결론은 "승자들의 공통 특성"으로 프레이밍.
4. **가설을 반증 가능하게.** `fits = (base_familiarity_score≥3) AND twist_present AND (max twist_novelty≥3)` 고정 공식으로 기계적 판정. 유명 베이스가 없는 원조/무명 게임은 fits=false → 반례 성립.

## 산출물 (`report/`)

- **📊 라이브 대시보드** (Phase 1+2): https://claude.ai/code/artifact/b7864c77-5698-4ae5-98d9-6b0703e27bf4
- **Phase 1 (히트작 내부 분석):** `report/report.md` · `report/dataset.{json,csv}`(125종) · `report/{stats,dimensions,chart_data}.json`
- **Phase 2 (대조군 검증):** `report/control-study.md` · `report/comparison_stats.json`(2×2·게이트분해·특징랭킹) · `report/control_dataset.{json,csv}`(비히트 81종) · `report/recoded_hits_blind.json`(히트 blind 재코딩)
- `report/charts.html` — 대시보드 소스 · `scripts/*.js` — 워크플로 출력 → 산출물 변환(재현용)

## 핵심 결과 요약

- **Phase 1 (승자만):** 확정 히트 **111종** 중 **55%** 가 "익숙한 베이스 + 독창적 변주"에 부합. 단 "익숙한 베이스"의 71%는 현실 게임이 아니라 **이미 존재하는 비디오게임 장르**.
- **Phase 2 (대조군 81종 추가, 양쪽 blind 코딩):** **이 패턴은 히트를 판별하지 못한다.** 비히트작의 **84%**도 부합하고, "익숙한 베이스" 게이트는 히트 99% vs 대조군 99%로 **판별력 0**. 복합 위험차 +11pt는 실질성 문턱(15pt) 미달 → **결론 불가**(누출 통제 시 7pt).
- **실제(미약한) 판별자:** 협동(+25pt)·로그라이크 깊이(+17)·특정 변주. Phase 1의 "저가·소규모팀·오리지널" 서사는 대조군에서 **뒤집힌다**(생존편향 보정).
- **결론:** "익숙한 베이스 + 변주"는 성공 **레시피가 아니라 최소 진입 조건(바닥)** 이다. 상세는 `report/control-study.md`.

## 실행 방법

Workflow 샌드박스는 파일시스템/`require`가 없으므로, 계획상의 `schemas.js`/`prompts.js`/`merge.js` 모듈은 **하나의 자체완결(self-contained) 스크립트**의 섹션으로 통합되어 있다. 실행:

```
Workflow({ scriptPath: 'game-hits-analysis.workflow.js' })
```

스크립트는 `{ stats, dataset, dimensions, report_markdown, ... }` 를 반환하며, 호출측이 이를 `report/` 산출물로 기록한다. 동시성은 실행 호스트 코어 수에 따라 제한된다(이 환경 ~2). `MAX_GAMES`로 후보 수(따라서 에이전트 수·실행 시간)를 조절한다.

## 파일 구조

```
game-hits-analysis.workflow.js   # Phase 1: 히트작 발굴·검증·분석 (5단계)
control-study.workflow.js        # Phase 2: 대조군 발굴·blind 코딩·비교 (Phase 0–5)
scripts/                         # args 추출·주입, 결과 처리, 차트 데이터
report/                          # 실행 산출물 (dataset, reports, charts, comparison_stats)
README.md
```

## 한계

추정치 불확실성, 소유자≠판매(번들/무료/증정), 최신·영어권 언론 편향, 코딩 주관성. **생존자 편향은 Phase 2 대조군으로 직접 검증**했으나(그리고 패턴이 히트를 판별하지 못함을 확인), 대조군도 편의표본이며 여전히 관찰연구(연관≠인과)이고 표본이 미검정(대조군 81 < 히트 110, flop 밴드 n=6)이라 복합 판정은 결론 불가다. 코딩 잡음(불일치 42%)은 귀무 쪽 감쇠를 일으킨다. 각 리포트의 「한계」 절에 상세 기술. 모든 수치는 **2026년 7월 기준** 스냅샷.
