export const FILE_LIMITS = {
  exchangeBytes: 250 * 1024 * 1024,
  pdfBytes: 250 * 1024 * 1024,
} as const;

export const ZOOM_LIMITS = {
  min: 60,
  max: 250,
  step: 10,
  default: 100,
} as const;
