# BookOST

**글(또는 스크린샷에서 읽은 글)을 보여주면 그 장면에 맞는 OST가 나오는** 크리에이터용 MVP입니다. 내부적으로는 텍스트를 분석해 음악 생성기에 넘길 설명을 만든 뒤 오디오를 만듭니다.

## 구조

- `services/api` — FastAPI, 단계별 파이프라인 (`bookost/pipeline/stages`)
- `apps/web` — Next.js 14 (App Router) UI: 입력, 재생, 다운로드, OST 카드

## 검증 (이 레포 기준)

| 항목 | 상태 |
| --- | --- |
| API 단위·스모크 테스트 (`pytest`) | `services/api`에서 `pip install -r requirements-dev.txt` 후 `pytest -q` 통과 |
| Web 프로덕션 빌드 | `apps/web`에서 `npm install` / `npm run build` 통과 (`next@14.2.35`, 보안 패치 반영) |
| 재현 설치 (CI와 동일) | Ubuntu에서 `npm ci` 가능 — `package-lock.json` 포함 |
| Docker API 이미지 | 로컬에 Docker가 있으면 `docker build -t bookost-api ./services/api` (CI에서 동일) |

Windows에서 한 번에 확인: `powershell -ExecutionPolicy Bypass -File scripts/verify.ps1`

## 로컬 실행

### API

```bash
cd services/api
python -m venv .venv
.\.venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env     # 필요 시 키 입력
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### API 테스트

```bash
cd services/api
pip install -r requirements-dev.txt
pytest -q
```

Python 3.13 이상에서는 표준 라이브러리 `audioop` 제거로 `pydub`가 실패할 수 있어, `requirements.txt`에 **`audioop-lts`** 조건부 의존성을 포함했습니다.

### Web

```bash
cd apps/web
npm install
copy .env.local.example .env.local
npm run dev
```

프로덕션 빌드가 Windows에서 `.next` 잠금(EBUSY)으로 실패하면:

```bash
npm run build:clean
```

브라우저에서 `http://localhost:3000` → **OST 만들기** 한 번으로 전체 파이프라인이 실행됩니다.

## 환경 변수

- `OPENAI_API_KEY` — 있으면 LLM 감정 분석, 없으면 규칙 기반
- `MUSIC_PROVIDER=mock|suno` — 기본 `mock`(순수 파형 WAV). `suno`는 **HTTP 어댑터 스텁**이며, 실제 Suno·유사 API의 공식 스펙(엔드포인트·필드명·인증)에 맞게 `bookost/music/suno_provider.py`를 조정해야 프로덕션 연동이 완료됩니다.
- S3 관련 변수 — 설정 시 업로드 후 presigned URL, 미설정 시 `PUBLIC_API_URL` 기준 로컬 스트리밍 URL

## Docker

```bash
docker compose up --build
```

## API 요약

- `GET /v1/health`
- `POST /v1/generate/` — 본 파이프라인 (JSON `text`)
- `POST /v1/generate/image` — `multipart/form-data`로 이미지 한 장(`file`). **이미지는 디스크에 저장하지 않고** 메모리에서만 OCR 후 동일 파이프라인 실행. 응답에 `ocr_text`로 인식 문자열 확인 가능.
- `GET /v1/audio/{job_id}` — 결과 WAV 스트리밍 (`?disposition=attachment` 로 다운로드 힌트)

### OCR (Tesseract)

로컬 개발 시 [Tesseract](https://github.com/tesseract-ocr/tesseract)를 설치하고 PATH에 두거나 `TESSERACT_CMD`로 실행 파일 경로를 지정하세요. 한국어 인식은 `kor` 언어 데이터가 필요합니다. Docker API 이미지에는 `tesseract-ocr` + `kor`/`eng` 패키지를 포함했습니다.

## 참고

- mp3 후처리는 **ffmpeg**가 필요합니다. Docker API 이미지에는 ffmpeg를 포함했습니다.
- Windows에서 로컬로 mp3를 다룰 경우 ffmpeg를 PATH에 두는 것이 안전합니다.
- `apps/web`에서 `npm install`이 `ENOTEMPTY` 등으로 실패하면, 다른 터미널에서 `node`/`next`가 잠금 중인지 확인한 뒤 `node_modules` 폴더를 삭제하고 다시 설치하세요.
