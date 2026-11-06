import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { guideTopics, type GuideTopic } from './guideTopics';

type GuidePage = {
  intro: string;
  flow: string[];
  sections: { title: string; body: string; bullets?: string[] }[];
  tip?: string;
};

const pages: Record<GuideTopic, GuidePage> = {
  start: {
    intro: 'WON 노트는 노트와 여러 업무 보드를 한 워크스페이스 트리에서 함께 관리합니다. 아래 순서대로 시작하면 기본 흐름을 빠르게 익힐 수 있습니다.',
    flow: ['새로 만들기', '항목 종류 선택', '내용 작성', '자동 저장'],
    sections: [
      { title: '1. 만들기', body: '왼쪽 워크스페이스 위의 “새로 만들기”를 누르고 원하는 항목을 선택합니다.', bullets: ['데이터 테이블', '노트 섹션 또는 노트 페이지', 'TO-DO 칸반보드', '일정 캘린더', '스티커 메모보드', '폴더'] },
      { title: '2. 정리하기', body: '폴더 행을 눌러 펼치고, 항목 오른쪽의 더보기 메뉴에서 하위 항목 생성·이동·이름 변경을 할 수 있습니다.' },
      { title: '3. 작업 이어가기', body: '열어 둔 노트는 위쪽 탭에서 전환합니다. 보드는 워크스페이스 트리에서 선택하면 열립니다.' },
    ],
    tip: '처음이라면 노트 섹션 하나를 만든 뒤 노트 페이지를 추가하고, 업무 목록은 칸반보드로 만들어 보세요.',
  },
  workspace: {
    intro: '워크스페이스 트리는 문서와 보드를 담는 왼쪽 탐색 영역입니다. 폴더를 이용해 프로젝트나 업무별로 계층을 구성할 수 있습니다.',
    flow: ['워크스페이스 트리', '폴더 / 노트 / 보드', '항목 선택', '탭 또는 보드 열기'],
    sections: [
      { title: '새 노트와 노트 섹션', body: '새 노트 섹션은 폴더 역할을 하며 첫 노트 페이지를 함께 만듭니다. 새 노트 페이지는 루트나 선택한 폴더 아래에 독립적으로 만들 수 있습니다.' },
      { title: '노트 작성', body: '노트 편집기는 홈·삽입·그리기 탭으로 나뉩니다. 홈에서 글꼴·크기·제목·목록·정렬을 편집하고, 삽입에서 링크·이미지·표·코드와 PPTX·MD·XLSX·CSV·PDF 파일 내용을 본문에 넣습니다. 그리기 탭에서는 펜·형광펜·부분 지우개를 사용하고, 선택 도구로 선을 이동하거나 Delete 키로 삭제합니다.' },
      { title: '댓글과 문서 이력', body: '노트 본문에서 마우스 오른쪽 버튼을 누르면 현재 위치에 댓글을 남기거나 문서 이력을 열 수 있습니다. 댓글은 우측 패널에서 확인하고, 이력에서 과거 내용을 비교하거나 복원합니다.' },
      { title: '탭과 항목 메뉴', body: '열린 노트는 노트 탭에서 전환·닫을 수 있습니다. 트리의 더보기 메뉴에는 이름 변경, 복제, 이동, 삭제와 유형별 동작이 있습니다.' },
      { title: '검색', body: '사이드바 검색창에서 트리 항목을 제목으로 찾습니다. 폴더 안의 일치 항목이 있으면 해당 경로도 탐색할 수 있습니다.' },
    ],
    tip: '폴더를 클릭하면 펼쳐지며 선택 상태가 됩니다. 선택한 폴더는 파일 메뉴에서 폴더 교환 파일로 내보낼 수 있습니다.',
  },
  table: {
    intro: '데이터 테이블은 열과 행으로 정보를 관리하며, 같은 데이터를 표·칸반·캘린더·메모 보기로 활용할 수 있습니다.',
    flow: ['테이블 만들기', '열 구성', '행 입력 / 가져오기', '보기 전환 및 필터'],
    sections: [
      { title: '열과 행 관리', body: '열에는 텍스트, 숫자, 선택, 상태, 날짜, 체크박스, 서식 있는 텍스트, 코드, 이미지 유형을 사용할 수 있습니다. 열 메뉴에서 속성과 표시 구성을 관리합니다.' },
      { title: '데이터 입력', body: '행 추가 버튼으로 새 항목을 만들거나 표 내용을 붙여넣습니다. 파일 메뉴의 통합 가져오기는 TXT·CSV·TSV·JSON·엑셀 데이터를 읽고, 열 매핑을 확인한 뒤 새 테이블 생성 또는 현재 데이터에 추가할 수 있습니다.' },
      { title: '검색과 보기', body: '표 보기에서는 정렬·검색·열 필터 등으로 데이터를 좁힙니다. 테이블 유형과 데이터에 따라 칸반, 캘린더, 스티커 메모 보기로 전환할 수 있습니다.' },
      { title: '행 상세 편집', body: '행을 열어 긴 본문, 서식 있는 내용, 이미지와 메모를 편집합니다. 현재 테이블은 CSV로 다운로드할 수 있고, 행 단위 데이터도 복사·내보내기 기능을 제공합니다.' },
    ],
    tip: '칸반으로 보려면 상태 또는 선택 열을 만들고 각 행의 값을 상태별로 지정하세요.',
  },
  kanban: {
    intro: '칸반보드는 각 행을 카드로 보여 주어 업무 진행 상태를 한눈에 파악하고, 드래그로 흐름을 바꾸는 보드입니다.',
    flow: ['할 일 카드', '상태 열', '카드 드래그', '진행 현황 확인'],
    sections: [
      { title: '보드 만들기', body: '새로 만들기에서 TO-DO 칸반보드를 선택합니다. 기본 보드에는 할 일, 진행 상태, 우선순위, 마감일, 담당자, 메모 열이 준비됩니다.' },
      { title: '카드 이동', body: '카드를 다른 상태 열로 드래그해 진행 상황을 바꿉니다. 보드의 추가·편집 기능으로 제목, 담당자, 날짜, 메모를 업데이트합니다.' },
      { title: '열과 카드 구성', body: '보드의 원본 데이터는 테이블입니다. 열과 상태 옵션을 편집하면 카드에 표시되는 정보와 그룹이 달라집니다. 표 보기로 전환해 모든 필드를 편집할 수도 있습니다.' },
    ],
    tip: '팀 작업에는 “할 일 → 진행 중 → 검토 → 완료”처럼 실제 업무 단계를 상태 옵션으로 구성해 보세요.',
  },
  calendar: {
    intro: '캘린더 보드는 일정 데이터를 월·주·일 단위로 확인하고 등록하는 테이블 기반 일정 관리 기능입니다.',
    flow: ['일정 캘린더', '일정 등록', '월 / 주 / 일 보기', '반복·교대 일정 관리'],
    sections: [
      { title: '일정 만들기', body: '새로 만들기에서 일정 캘린더를 선택합니다. 캘린더에서 날짜나 시간대를 선택해 제목, 기간, 시간, 장소, 설명과 분류를 입력합니다.' },
      { title: '일정 보기와 편집', body: '월간·주간·일간 화면에서 일정을 확인합니다. 일정 상세 화면에서 내용을 바꾸고 완료 상태나 알림을 관리할 수 있습니다.' },
      { title: '캘린더 매크로', body: '반복 일정 생성, 교대 근무표 배치, 일정 일괄 이동, 표 붙여넣기 등록, 과거 일정 정리와 표준 .ics 가져오기·내보내기를 지원합니다.' },
    ],
    tip: '반복 일정이나 교대 근무처럼 일정이 많을 때 캘린더 상단의 매크로 도구함을 이용하면 한 번에 등록할 수 있습니다.',
  },
  memo: {
    intro: '스티커 메모보드는 짧은 메모를 카드처럼 자유롭게 배치하고 크기를 조절하는 캔버스형 보드입니다.',
    flow: ['메모 추가', '내용 편집', '드래그 배치', '크기 조절 및 정리'],
    sections: [
      { title: '메모 만들기', body: '새로 만들기에서 스티커 메모보드를 선택합니다. 보드에서 메모를 추가하고 제목·본문·분류를 작성합니다.' },
      { title: '배치 변경', body: '메모를 드래그해 원하는 위치로 옮기고 가장자리를 끌어 크기를 조절합니다. 배치와 크기는 보드별 레이아웃으로 저장됩니다.' },
      { title: '보드 데이터', body: '메모 내용은 테이블의 행과 서식 있는 본문에 저장됩니다. 데이터 표 보기로 전환해 내용을 검색하거나 편집할 수 있습니다.' },
    ],
    tip: '주제나 우선순위별로 분류값을 활용하고, 관련 메모끼리 가까이 배치해 보세요.',
  },
  files: {
    intro: '파일 메뉴에서 문서 변환, 데이터 가져오기, 교환 파일 공유와 백업을 처리합니다.',
    flow: ['파일 메뉴', '가져오기 / 내보내기 선택', '형식과 범위 지정', '결과 확인'],
    sections: [
      { title: '노트에 파일 삽입', body: '기존 노트를 연 다음 삽입 탭에서 PPT, DOCX, MD, Excel, PDF를 선택합니다. 선택한 파일 내용이 현재 노트 본문에 추가됩니다. PPTX는 슬라이드 내용을, DOCX는 본문과 표를, MD는 서식을, XLSX는 편집 가능한 표를, PDF는 페이지 이미지와 추출 텍스트를 넣습니다. DOCX에 포함된 이미지는 현재 가져오지 않습니다. CSV·TSV도 Excel 버튼에서 표로 삽입할 수 있습니다. 구형 PPT/XLS는 먼저 PPTX/XLSX로 변환해야 합니다.' },
      { title: '새 노트로 파일 가져오기', body: '파일 메뉴 → 가져오기에서 PDF·PPT·PPTX·DOCX·MD·Excel/CSV 중 형식을 고르면 새 노트를 만들고 파일 내용을 채웁니다. 노트 제목은 원본 파일 이름을 사용합니다. PDF는 페이지 범위와 텍스트/원본 이미지 옵션을 확인한 뒤 가져옵니다. DOCX에 포함된 이미지는 현재 가져오지 않습니다.' },
      { title: 'PDF / PPTX / DOCX 내보내기', body: '노트를 선택하고 파일 → 내보내기에서 PDF, PPTX, Word DOCX 문서를 만들 수 있습니다. DOCX에는 노트의 문단 서식과 표를 내보내며, 이미지와 그리기 객체는 포함되지 않습니다. 폴더를 선택하면 WONNOTE 폴더 내보내기 항목으로 하위 문서를 묶어 내보냅니다.' },
      { title: 'WONNOTE 교환 파일', body: '노트나 테이블 메뉴에서 항목을 내보내면 받은 쪽에서 새 사본으로 가져옵니다. 폴더는 폴더 메뉴 또는 파일 메뉴에서 폴더 교환 파일로 내보내며, 하위 폴더·노트·테이블·첨부 이미지·일정 데이터를 포함합니다. 폴더 컨텍스트 메뉴의 가져오기는 선택한 폴더 안에 넣습니다.' },
      { title: '표·워크스페이스 데이터', body: '현재 테이블은 CSV로 저장할 수 있습니다. 통합 가져오기는 여러 텍스트/표 형식을 분석해 열 매핑 후 새 테이블 생성 또는 행 추가를 지원합니다. 데이터 병합·상세 백업에서 워크스페이스 JSON을 가져오거나 내보냅니다.' },
    ],
    tip: '교환 파일을 가져오면 기존 항목을 덮어쓰지 않고 새 ID의 사본으로 추가합니다. 대용량 PDF는 필요한 페이지 범위와 가져올 내용을 먼저 선택하세요.',
  },
  sync: {
    intro: 'WON 노트는 브라우저 IndexedDB에 먼저 저장하며, 서버 모드에서는 변경 내용을 서버에도 동기화합니다. 네트워크 연결과 Yjs 협업 서버 설정은 별도 항목이므로 각각 상태를 확인하세요.',
    flow: ['편집', '기기 내 자동 저장', '서버 모드에서 변경 동기화', '백업 / 복원'],
    sections: [
      { title: '자동 저장과 재접속', body: '노트 본문은 편집 중 기기 내 저장소에도 보존되고, 서버 모드의 노트·보드 변경은 잠시 입력이 멈춘 뒤 서버에 전송됩니다. 서버 저장에 실패해도 로컬 복사본은 유지되며, 연결이 복구된 뒤 다시 동기화해야 합니다. 탭을 닫기 전에 잠시 저장이 끝날 시간을 주세요.' },
      { title: 'Client 모드', body: '워크스페이스 데이터와 노트는 이 브라우저 프로필의 IndexedDB에 저장되며 다른 브라우저·PC와 자동 공유되지 않습니다. 브라우저 데이터 정리 전에 워크스페이스 백업을 내보내세요.' },
      { title: 'Server 모드', body: '설정에서 서버 API를 지정하면 워크스페이스가 서버 데이터베이스와 동기화됩니다. 다른 브라우저의 변경은 버전 확인 후 반영되므로 네트워크 상태와 상단 동기화 오류 안내를 확인하세요. 저장소의 로컬 캐시는 오프라인 중 편집을 보존하는 용도입니다.' },
      { title: '실시간 공동 편집', body: '문자 단위 커서·동시 편집은 일반 서버 저장과 별도입니다. 서버에서 Yjs WebSocket을 운영하고 클라이언트 빌드에 VITE_YJS_WS_URL을 지정해야 합니다. 에디터의 연결 상태에 “실시간 연결됨”이 표시되는지 확인하세요. 이 설정이 없으면 편집은 로컬 자동 저장과 서버 변경 동기화로 동작합니다.' },
      { title: '백업과 로컬 파일 연결', body: '파일 메뉴에서 워크스페이스 JSON 백업·복원을 수행합니다. 브라우저가 지원하면 user_data.json을 연결해 자동 저장하거나 직접 저장할 수 있고, 환경 설정 JSON은 테마·화면 설정 복원에 사용합니다.' },
    ],
    tip: '중요한 자료는 서버 동기화 여부와 관계없이 정기적으로 워크스페이스 백업 파일을 별도 위치에 보관하세요.',
  },
  tools: {
    intro: '상단 도구 메뉴에는 문서·개발 작업 보조 도구가 있고, 빠른 실행과 AI 도우미로 앱 기능을 탐색할 수 있습니다.',
    flow: ['도구 / 빠른 실행', '기능 선택', '내용 입력', '결과 확인 및 적용'],
    sections: [
      { title: '도구 메뉴', body: 'Pretty JSON, 소스 비교, Format Express, 암·복호화, Postman, 계산기를 제공합니다. 도구는 별도 창에서 열어 사용합니다.' },
      { title: '빠른 실행', body: '상단 빠른 실행 또는 Ctrl+K (Mac은 ⌘K)를 열어 명령과 기능을 검색합니다.' },
      { title: 'AI 어시스턴트', body: 'AI 어시스턴트는 워크스페이스나 선택한 표 데이터를 바탕으로 질의·요약·작업을 돕습니다. 제안된 변경은 화면의 내용을 확인한 뒤 적용하세요.' },
      { title: '화면 설정', body: '사이드바 설정에서 테마, 확대 수준, 성능 옵션, 서버 연결을 관리합니다. 화면이 느리면 성능 설정의 표시 옵션을 조정할 수 있습니다.' },
    ],
    tip: '표·노트 내용에 맞는 AI 작업은 해당 항목을 먼저 열고 어시스턴트를 실행하면 맥락을 더 잘 전달할 수 있습니다.',
  },
};

interface ProductGuideModalProps {
  initialTopic: GuideTopic;
  onClose: () => void;
}

export const ProductGuideModal: React.FC<ProductGuideModalProps> = ({ initialTopic, onClose }) => {
  const [topic, setTopic] = useState<GuideTopic>(initialTopic);
  const page = pages[topic];
  const selected = useMemo(() => guideTopics.findIndex((item) => item.id === topic), [topic]);
  const currentTopic = guideTopics[selected];

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const changeTopic = (index: number) => setTopic(guideTopics[(index + guideTopics.length) % guideTopics.length].id);

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/55 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="product-guide-title" className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-[#fffdf9] shadow-2xl dark:border-stone-700 dark:bg-stone-950">
        <header className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-xl">🐝</div>
            <div><p className="text-[11px] font-semibold uppercase tracking-widest text-amber-600">WON NOTE GUIDE</p><h2 id="product-guide-title" className="text-lg font-bold text-stone-900 dark:text-stone-100">기능별 사용 가이드</h2></div>
          </div>
          <button type="button" aria-label="가이드 닫기" onClick={onClose} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"><X size={19} /></button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label="가이드 목차" className="flex gap-1 overflow-x-auto border-b border-stone-200 bg-stone-50 p-2 dark:border-stone-800 dark:bg-stone-900/60 md:block md:overflow-y-auto md:border-b-0 md:border-r">
            {guideTopics.map((item, index) => (
              <button key={item.id} type="button" onClick={() => setTopic(item.id)} aria-current={topic === item.id ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors md:mb-1 md:w-full ${topic === item.id ? 'bg-amber-400 font-bold text-stone-950' : 'text-stone-600 hover:bg-white dark:text-stone-300 dark:hover:bg-stone-800'}`}>
                <span>{item.icon}</span><span>{item.label}</span>
              </button>
            ))}
          </nav>

          <main className="min-h-0 overflow-y-auto px-5 py-6 sm:px-8">
            <div className="mx-auto max-w-4xl">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-semibold text-amber-600">{String(selected + 1).padStart(2, '0')} / {guideTopics.length}</p><h3 className="mt-1 text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50">{currentTopic.icon} {currentTopic.label}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600 dark:text-stone-300">{page.intro}</p></div>
                <BookOpen className="hidden h-8 w-8 text-amber-400/80 sm:block" />
              </div>

              <div className="my-6 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-amber-900/60 dark:from-amber-950/30 dark:to-stone-900">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">작업 흐름</p>
                <div className="flex flex-wrap items-center gap-2">
                  {page.flow.map((step, index) => <React.Fragment key={step}>
                    <div className="flex min-h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-stone-950">{index + 1}</span>{step}</div>
                    {index < page.flow.length - 1 && <ArrowRight className="h-4 w-4 text-amber-500" />}
                  </React.Fragment>)}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {page.sections.map((section, index) => <section key={section.title} className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/60">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100"><span className="text-[10px] text-amber-600">{String(index + 1).padStart(2, '0')}</span>{section.title}</h4>
                  <p className="mt-2 text-xs leading-5 text-stone-600 dark:text-stone-300">{section.body}</p>
                  {section.bullets && <ul className="mt-2 grid gap-1 sm:grid-cols-2">{section.bullets.map((bullet) => <li key={bullet} className="flex items-start gap-1.5 text-xs text-stone-600 dark:text-stone-300"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{bullet}</li>)}</ul>}
                </section>)}
              </div>

              {page.tip && <div className="mt-4 rounded-xl border border-blue-200/80 bg-blue-50/70 px-4 py-3 text-xs leading-5 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200"><strong className="mr-1">도움말</strong>{page.tip}</div>}

              <footer className="mt-6 flex items-center justify-between border-t border-stone-200 pt-4 dark:border-stone-800">
                <button type="button" onClick={() => changeTopic(selected - 1)} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"><ChevronLeft size={15} />이전</button>
                <div className="flex gap-1.5">{guideTopics.map((item, index) => <button key={item.id} type="button" aria-label={`${item.label} 가이드`} onClick={() => setTopic(item.id)} className={`h-1.5 rounded-full transition-all ${index === selected ? 'w-6 bg-amber-500' : 'w-1.5 bg-stone-300 dark:bg-stone-700'}`} />)}</div>
                <button type="button" onClick={() => changeTopic(selected + 1)} className="flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-stone-950 hover:bg-amber-300">다음<ChevronRight size={15} /></button>
              </footer>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
