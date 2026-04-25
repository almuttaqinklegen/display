export type MoneyItem = {
  Tanggal: string;
  Keterangan: string;
  Jumlah: string;
};

export type AgendaItem = {
  Hari?: string;
  Tanggal?: string;
  Agenda: string;
  Waktu?: string;
  Tempat?: string;
};

export type FinanceData = {
  income: MoneyItem[];
  expense: MoneyItem[];
  totalBalance: number;
};

export type GeneralData = {
  khatib: string;
  khatibDate?: string;
  muazin: string;
  muazinDate?: string;
  agendas: AgendaItem[];
};

export type VideoData = {
  id: string;
  url: string;
  enabled: boolean;
  platform?: "youtube" | "facebook" | "twitch" | "unknown";
  kind?: "live" | "video" | "unknown";
  providerId?: string;
};

export type ExtraSlideData = {
  enabled: boolean;
  note: string;
  imageUrl?: string;
};

export type YoutubeChannelPageData = {
  enabled: boolean;
  url: string;
};

export type MosqueData = {
  finance: FinanceData;
  tpaFinance: FinanceData;
  konsumsiFinance: FinanceData;
  general: GeneralData;
  runningText: string;
  video: VideoData | null;
  quietMinutes: number;
  iqomahCountdownMinutes: number;
  webcamMinutesAfterQuiet: number;
  slideDurationsSeconds: number[];
  extraSlide: ExtraSlideData;
  youtubeChannelPage: YoutubeChannelPageData;
};
