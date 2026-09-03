export interface PerformanceOptions {
  // 1. 셀별 이미지 자동 탐지 및 Base64 파싱 최적화
  // 전용 이미지 열이 아닌 일반 텍스트 셀에서는 무거운 이미지 감지 로직 제거
  skipImageDetectionOnPlainText: boolean;

  // 2. 셀 텍스트 툴팁 최적화
  // 리치 텍스트 열에만 한정하여 호버 팝오버 렌더링 (일반 텍스트는 브라우저 기본 title 또는 단순 표시)
  tooltipOnlyRichText: boolean;

  // 3. OneNote 스타일 스티커 실시간 집계 최적화
  // 스티커 필터 버튼의 실시간 전수 카운트 뱃지 제거 및 스티커 필터 클릭 시에만 계산
  lazyStickerCount: boolean;

  // 4. 검색 디바운스 지연 시간 (ms, 기본 180ms, 150~200ms)
  searchDebounceMs: number;

  // 5. 검색 대상 열 선택 모드
  // 'all': 전체 열 대상 검색 (기본)
  // 'primary': 대표 열만 검색
  searchTargetMode: 'all' | 'primary';

  // 대표 열 ID (기본은 첫 번째 텍스트 계열 열 또는 사용자 지정 열)
  primarySearchColId?: string | null;
}

export const DEFAULT_PERFORMANCE_OPTIONS: PerformanceOptions = {
  skipImageDetectionOnPlainText: true, // 기본 활성화 (속도 대폭 향상)
  tooltipOnlyRichText: true,           // 기본 활성화 (DOM 낭비 방지)
  lazyStickerCount: true,              // 기본 활성화 (매 렌더링 전수 조사 방지)
  searchDebounceMs: 180,               // 180ms 디바운스로 부드러운 타이핑
  searchTargetMode: 'all',             // 기본값은 전체 열 검색
  primarySearchColId: null,
};

const STORAGE_KEY = 'wonbee_performance_options';

export const loadPerformanceOptions = (): PerformanceOptions => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_PERFORMANCE_OPTIONS, ...parsed };
    }
  } catch {
    // fallback
  }
  return DEFAULT_PERFORMANCE_OPTIONS;
};

export const savePerformanceOptions = (options: PerformanceOptions): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // ignore
  }
};
