export {};

declare global {
  interface Window {
    wonNoteElectron?: {
      isElectron: true;
      platform: string;
      notify: (title: string, body?: string) => Promise<void>;
    };
  }
}
