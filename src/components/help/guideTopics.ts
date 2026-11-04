export const guideTopics = [
  { id: 'start', label: '처음 시작하기', icon: '🚀' },
  { id: 'workspace', label: '워크스페이스와 노트', icon: '🗂️' },
  { id: 'table', label: '데이터 테이블', icon: '📋' },
  { id: 'kanban', label: 'TO-DO 칸반보드', icon: '🎯' },
  { id: 'calendar', label: '일정 캘린더', icon: '📅' },
  { id: 'memo', label: '스티커 메모보드', icon: '📌' },
  { id: 'files', label: '가져오기와 내보내기', icon: '📦' },
  { id: 'sync', label: '저장과 동기화', icon: '🔄' },
  { id: 'tools', label: '도구와 AI', icon: '🛠️' },
] as const;

export type GuideTopic = (typeof guideTopics)[number]['id'];
