# lib/ — Tesseract.js 벤더링 가이드

확장이 OCR을 수행하려면 다음 파일이 이 디렉터리에 있어야 합니다. PoC라 바이너리를 저장소에 커밋하지 않습니다. 한 번만 받아두면 됩니다.

필요한 파일:

```
lib/
├── tesseract.min.js        # Tesseract v5 메인 번들
├── worker.min.js           # worker 번들
├── tesseract-core.wasm.js  # wasm core loader
├── eng.traineddata         # 영어 언어 데이터
└── kor.traineddata         # 한국어 언어 데이터 (eng+kor 동시 지원)
```

## 받는 방법 (npm 사용 — 가장 빠름)

```bash
cd /Users/1004276/Downloads/phisinggpt
npm init -y
npm install tesseract.js@^5
cp node_modules/tesseract.js/dist/tesseract.min.js          lib/
cp node_modules/tesseract.js/dist/worker.min.js             lib/
cp node_modules/tesseract.js-core/tesseract-core.wasm.js    lib/
# 언어 데이터
curl -L -o lib/eng.traineddata \
  https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata
curl -L -o lib/kor.traineddata \
  https://github.com/tesseract-ocr/tessdata/raw/main/kor.traineddata
```

## 받는 방법 (CDN 다운로드)

```bash
cd /Users/1004276/Downloads/phisinggpt/lib
curl -L -O https://unpkg.com/tesseract.js@5/dist/tesseract.min.js
curl -L -O https://unpkg.com/tesseract.js@5/dist/worker.min.js
curl -L -O https://unpkg.com/tesseract.js-core@5/tesseract-core.wasm.js
curl -L -O https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata
curl -L -O https://github.com/tesseract-ocr/tessdata/raw/main/kor.traineddata
```

## 검증

`chrome://extensions` 에서 확장 재로드 후 `offscreen.html` 의 콘솔에서:

```
> Tesseract
< {createWorker: ƒ, ...}
```

가 떠야 정상입니다.

## 파일이 없을 때

OCR 호출은 빈 문자열을 반환하며, `chrome.runtime.sendMessage({type:"diagnostics"})` 에서 `ocrAvailable: false` 로 명확히 노출됩니다. 시스템 프롬프트가 "OCR 데이터 없음은 피싱 신호가 아니다"로 잡고 있어 검사 자체는 동작하지만, 이미지 기반 피싱(브랜드 로고만 있는 페이지 등)을 놓칠 수 있습니다.
