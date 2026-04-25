/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CSV_FINANCE_URL?: string;
  readonly VITE_CSV_TPA_FINANCE_URL?: string;
  readonly VITE_CSV_KONSUMSI_FINANCE_URL?: string;
  readonly VITE_CSV_KHATIB_URL?: string;
  readonly VITE_CSV_AGENDA_URL?: string;
  readonly VITE_CSV_RUNNING_TEXT_URL?: string;
  readonly VITE_CSV_VIDEO_URL?: string;
  readonly VITE_CSV_WEBCAM_STATUS_URL?: string;
  readonly VITE_CSV_BACKGROUND_URL?: string;
  readonly VITE_CSV_QUIET_MODE_URL?: string;
  readonly VITE_CSV_EXTRA_SLIDE_URL?: string;
  readonly VITE_CSV_SLIDE_DURATION_URL?: string;
  readonly VITE_CSV_YOUTUBE_PAGE_MODE_URL?: string;
  readonly VITE_YOUTUBE_API_KEY?: string;
  readonly VITE_FACEBOOK_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
