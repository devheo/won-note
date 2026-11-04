# 노트·테이블 개별 전달

필요한 노트 또는 테이블 하나를 `.wonnote` 파일로 전달합니다. 파일에는 해당 항목의 데이터와 첨부 이미지가 들어갑니다. 전체 워크스페이스나 다른 노트는 포함하지 않습니다.

받는 쪽은 새 ID의 `원래 제목 (받은 사본)`으로 추가합니다. 노트·테이블·열·행·이미지·일정 ID를 다시 발급하므로 기존 데이터를 덮어쓰지 않습니다. 같은 파일을 두 번 가져오면 사본 두 개가 생깁니다. 새 SQLite 파일을 만드는 기능이 아니라, 받는 워크스페이스 또는 서버 DB에 별도 항목을 추가하는 기능입니다.

## 오프라인 앱에서 보내기

1. 노트를 우클릭하고 **내보내기 → 교환 파일 (.wonnote)**를 선택합니다.
2. 테이블은 우클릭하고 **교환 파일 내보내기 (.wonnote)**를 선택합니다.
3. 다운로드한 파일을 받는 사람에게 전달합니다.

텍스트·본문 서식·테이블 열 설정·행·행 상세 내용·스티커·분리 저장된 이미지가 포함됩니다. 앱에서 테이블을 내보내면 로컬 일정과 메모 보드 배치도 포함합니다. 폴더나 하위 항목은 함께 내보내지 않습니다. 외부 URL 이미지·링크 대상 문서·동영상 파일은 별도로 다운로드하지 않습니다.

## 받는 앱에서 가져오기

워크스페이스 목록 아래의 **교환 파일 가져오기 (.wonnote)**를 누르고 파일을 선택합니다. 제목·항목 종류·행 수·이미지 수를 확인한 뒤 **새 사본으로 가져오기**를 누릅니다. 최상위에 새 항목으로 추가됩니다.

오프라인 모드는 브라우저 DB에 저장합니다. 서버 모드는 개별 항목 가져오기 API를 사용하여 서버 DB에 추가합니다. 첨부 이미지는 파일에 포함되어 있으므로 보내는 PC의 이미지 저장소에 연결할 필요가 없습니다.

## 실행 중인 서버 DB로 가져오는 스크립트

받는 서버에 이 변경 사항과 의존성을 설치하고 서버를 실행한 상태에서 프로젝트 폴더에서 실행하세요. 서버의 SQLite 파일을 다른 프로세스에서 직접 수정하지 않습니다.

파일 내용을 미리 확인합니다. 이 명령은 DB를 변경하지 않습니다.

```powershell
npm run item:transfer -- inspect "share.wonnote"
```

새 항목으로 서버 DB에 저장합니다.

```powershell
npm run item:transfer -- import "share.wonnote" --server "http://localhost:3000"
```

서버의 특정 폴더 아래로 가져오려면 다음과 같이 지정합니다. 폴더가 없으면 가져오기를 중단합니다.

```powershell
npm run item:transfer -- import "share.wonnote" --server "http://localhost:3000" --parent "folder-id"
```

출력 JSON의 `id`가 새로 저장된 항목 ID입니다. 노트·테이블·이미지·일정은 하나의 DB 트랜잭션에서 저장합니다. 저장 실패, 잘못된 파일, 누락된 이미지, 잘못된 대상 폴더는 기존 데이터를 변경하지 않습니다.

## 스크립트로 하나만 내보내기

서버 항목 ID 목록을 확인한 뒤 하나를 내보냅니다.

```powershell
npm run item:transfer -- list --server "http://localhost:3000"
npm run item:transfer -- export --server "http://localhost:3000" --id "doc-id" --out "share.wonnote"
```

서버 없이 마지막으로 저장한 워크스페이스 JSON에서 내보낼 수도 있습니다. 분리된 이미지와 일정이 있다면 `--db`에 해당 JSON과 같은 시점의 DB를 지정합니다. DB는 읽기만 합니다.

```powershell
npm run item:transfer -- list --workspace "user_data.json"
npm run item:transfer -- export --workspace "user_data.json" --db "wonbee.sqlite" --id "table-id" --out "share.wonnote"
```

브라우저 오프라인 모드의 최신 데이터와 메모 보드 배치는 브라우저 저장소에 있으므로 이 경우에는 앱의 우클릭 내보내기를 사용하세요. JSON/SQLite 경로로는 브라우저에서만 저장한 배치를 읽을 수 없습니다.

기존 출력 파일은 보호합니다. 의도적으로 바꾸려면 `--force`를 추가합니다. 교환 파일은 최대 250MB이며 암호화되지 않습니다. 인증 프록시를 사용하는 서버는 환경 변수 `WONNOTE_TOKEN`의 값을 Bearer 토큰으로 전송할 수 있습니다.

## 검증 명령

```powershell
npm run test:exchange
npm run test:exchange-ui
```

첫 명령은 임시 DB·격리 서버에서 중복 가져오기, 기존 데이터 보존, 이미지, 일정의 행 연결, 손상 파일 거부와 CLI 왕복을 검사합니다. 두 번째 명령은 개발 서버가 실행된 상태에서 Chrome으로 오프라인 노트·테이블의 다운로드·가져오기를 검사합니다.
