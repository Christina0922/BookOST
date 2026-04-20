# BookOST audio layer assets guide

BookOST는 단일 mp3 선택 대신 텍스트 기반으로 여러 레이어를 조합해 재생합니다.

디렉터리 구조:
- /audio/base      (ambient)
- /audio/rhythm    (beat/pulse)
- /audio/melodic   (theme)
- /audio/effect    (transition/hit)

예시 URL:
- apps/web/public/audio/base/tense_dark_1.mp3 -> /audio/base/tense_dark_1.mp3

동작 방식:
1) 텍스트에서 scene JSON(emotion, tempo, tone, setting...)을 생성합니다.
2) scene에 맞춰 각 layer 후보에서 파일을 선택합니다.
3) 브라우저에서 여러 layer를 합성해 1개의 재생 트랙으로 만듭니다.
4) layer 파일이 부족하면 fallback으로 /audio/{emotion}.mp3를 재생합니다.

fallback 파일:
- tense.mp3
- sad.mp3
- calm.mp3
- mysterious.mp3

메모:
- 같은 텍스트도 layer 랜덤 선택으로 조금씩 다르게 들릴 수 있습니다.
- 실제 mp3를 추가한 뒤 새로고침하면 바로 반영됩니다.

