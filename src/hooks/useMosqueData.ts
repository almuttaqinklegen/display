import { useEffect, useMemo, useRef, useState } from "react";
import type { MosqueData } from "../types/mosque";

const STORAGE_KEY = "mosque-data-cache";
const SHEET_POLL_INTERVAL_MS = 10000;

const CSV_FINANCE_URL =
  import.meta.env.VITE_CSV_FINANCE_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTP-wLdSQ00FzYcwY_J34ks9BAN3ykr7oDVWB_TJAsQG3IoFlDZINSBb2X-3eTovj3vjBkvhFPVx5Dr/pub?output=csv";
const CSV_TPA_FINANCE_URL =
  import.meta.env.VITE_CSV_TPA_FINANCE_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT_wiygyYRZyItkMOBNOZ26599P7Phq6pGBhyMfAUah1vXTzlOGRBcXNEo1l4ga9lZcIvgqU3lLxfQd/pub?output=csv";
const CSV_KONSUMSI_FINANCE_URL =
  import.meta.env.VITE_CSV_KONSUMSI_FINANCE_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRUvB9JDHBFheh_0F4qBVIWkP_lph67ueHgFXIj2S4qESqliy1_aSk8kB1iKi8i11KHhRUEp5aUMWeg/pub?output=csv";
const CSV_KHATIB_URL =
  import.meta.env.VITE_CSV_KHATIB_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS2iHxTrrxzR6uJFu7FZXtrYOCpd2gAeCXpcKmAOQ9iWD4QY4AxcfWSq9Y06Ytj3f01x0XclFkbLGTI/pub?output=csv";
const CSV_AGENDA_URL =
  import.meta.env.VITE_CSV_AGENDA_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQTuMI_jA-0gv4bwlJ6Wf98gDIz65jEM8NJFfMTKvBkv0mabr7G5z1UJsnd4Sg0QlR6ZKBIpkhuKaHU/pub?output=csv";
const CSV_RUNNING_URL =
  import.meta.env.VITE_CSV_RUNNING_TEXT_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSHCr0CTsyu3PAsHtrxYSzRp1HZHjV6KkDaRboPtwB7Eo5tQo6yYRXN0QbZs5eshxy7-OQSB0bPWcvg/pub?output=csv";
const CSV_VIDEO_URL =
  import.meta.env.VITE_CSV_VIDEO_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_nvp32s-ZOWdwbo0bn6QDoiJSgWcHDYHJ8099AyvPL6oUyWQ1DjJBW51PXLIEU5Lz4FsCsmoxLhga/pub?output=csv";
const CSV_QUIET_MODE_URL =
  import.meta.env.VITE_CSV_QUIET_MODE_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQhk9ts1sftdkQl7aQQ8aDSrKsdWkPq9qyE1TmlWO00s9eSTNLGQWVjrRi7urPJr5sJ8jqq-gFi4fcd/pub?output=csv";
const CSV_EXTRA_SLIDE_URL =
  import.meta.env.VITE_CSV_EXTRA_SLIDE_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRnBNpnv7PGOpkCF31DGf-kXosqd2KxeWYzFw5qfrRKfuXqn2vTpBBAMbAXoKOjFea61UqgX4cCERJR/pub?output=csv";
const CSV_SLIDE_DURATION_URL =
  import.meta.env.VITE_CSV_SLIDE_DURATION_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQd8EgoNoXfSSnLCKAbmvtOuWdlSK-tDGKYY52Z-YmgNrfzqugROzsbvlDv_8LBckwK5ASdfrqSOueg/pub?output=csv";
const CSV_YOUTUBE_PAGE_MODE_URL =
  import.meta.env.VITE_CSV_YOUTUBE_PAGE_MODE_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTkrmoM-i2cEyni3c626AwhQQ_Nd-vpca2piLyf9zdF2rmvAiU158XLpXr9dgyDH2T55H6ib7fi9VV-/pub?output=csv";

const LOCAL_DATA: MosqueData = {
  finance: {
    income: [],
    expense: [],
    totalBalance: 0,
  },
  tpaFinance: {
    income: [],
    expense: [],
    totalBalance: 0,
  },
  konsumsiFinance: {
    income: [],
    expense: [],
    totalBalance: 0,
  },
  general: {
    khatib: "-",
    khatibDate: "",
    muazin: "-",
    muazinDate: "",
    agendas: [],
  },
  runningText: "Selamat datang di Masjid Al-Muttaqin",
  video: null,
  quietMinutes: 10,
  iqomahCountdownMinutes: 10,
  webcamMinutesAfterQuiet: 0,
  slideDurationsSeconds: [20, 20, 20, 20, 20, 20, 20],
  extraSlide: {
    enabled: false,
    note: "",
    imageUrl: "",
  },
  youtubeChannelPage: {
    enabled: false,
    url: "",
  },
};

type CsvRow = Record<string, string>;
type CsvParsed = { headers: string[]; rows: CsvRow[] };

const EMPTY_ROW: CsvRow = {};

function withCacheBuster(url: string): string {
  const token = Date.now().toString();

  try {
    const parsed = new URL(url);
    parsed.searchParams.set("_ts", token);
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}_ts=${token}`;
  }
}

async function fetchCsvText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(withCacheBuster(url), {
    cache: "no-store",
    signal,
    headers: {
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Gagal memuat CSV: ${url}`);
  }

  return response.text();
}

function parseCsv(content: string): CsvParsed {
  const raw = content.replace(/^\uFEFF/, "");
  const rows: string[][] = [];

  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      currentRow.push(currentCell.trim());
      currentCell = "";

      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0].map((header) => header.toUpperCase().trim());
  const mappedRows = rows.slice(1).map((line) => {
    return headers.reduce<CsvRow>((acc, key, idx) => {
      acc[key] = line[idx] ?? "";
      return acc;
    }, {});
  });

  return { headers, rows: mappedRows };
}

function normalizeHeaderKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getField(row: CsvRow, keys: string[]): string {
  const normalizedTargetKeys = new Set(keys.map((key) => normalizeHeaderKey(key)));

  for (const [key, rawValue] of Object.entries(row)) {
    if (!normalizedTargetKeys.has(normalizeHeaderKey(key))) {
      continue;
    }

    if (rawValue && rawValue.trim()) {
      return rawValue.trim();
    }
  }

  for (const key of keys) {
    const value = row[key.toUpperCase()];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function parseTimestamp(value: string): number {
  const text = value.trim();
  if (!text) {
    return 0;
  }

  const cleaned = text.replace(/\s+/g, " ").trim();
  const [datePart = "", timePart = "00:00:00"] = cleaned.split(" ");
  const dateParts = datePart.split(/[\/-]/).map((part) => part.trim());

  if (dateParts.length === 3) {
    let [p1 = "", p2 = "", p3 = ""] = dateParts;
    const n1 = Number(p1);
    const n2 = Number(p2);
    const n3 = Number(p3);

    if (Number.isFinite(n1) && Number.isFinite(n2) && Number.isFinite(n3)) {
      let year = p3;
      let month = p2;
      let day = p1;

      if (p1.length === 4) {
        year = p1;
        month = p2;
        day = p3;
      }

      if (n2 > 12 && n1 <= 12 && p1.length !== 4) {
        month = p1;
        day = p2;
      }

      const normalized = `${year.padStart(4, "20")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${timePart}`;
      const rebuilt = Date.parse(normalized);
      if (Number.isFinite(rebuilt)) {
        return rebuilt;
      }
    }
  }

  const native = Date.parse(text);
  return Number.isFinite(native) ? native : 0;
}

function pickLatestNonEmptyRow(rows: CsvRow[], keys: string[]): CsvRow | null {
  let bestRow: CsvRow | null = null;
  let bestTimestamp = -1;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!getField(row, keys)) {
      continue;
    }

    const timestamp = parseTimestamp(getField(row, ["TIMESTAMP"]));
    if (timestamp > bestTimestamp) {
      bestTimestamp = timestamp;
      bestRow = row;
    }

    if (bestTimestamp <= 0) {
      return row;
    }
  }

  if (bestRow) {
    return bestRow;
  }

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (getField(rows[index], keys)) {
      return rows[index];
    }
  }

  return null;
}

function parseAmount(value: string): number {
  const normalized = value.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBooleanSwitch(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["on", "true", "1", "ya", "aktif", "start", "tampil"].includes(normalized)) {
    return true;
  }
  if (["off", "false", "0", "tidak", "nonaktif", "stop", "sembunyi", "hide"].includes(normalized)) {
    return false;
  }

  return null;
}

function parseQuietMinutes(row: CsvRow): number {
  const keyedValue = getField(row, [
    "WAKTU TENANG",
    "DURASI TENANG",
    "MENIT TENANG",
    "IQOMAH",
    "DURASI",
    "MENIT",
    "MINUTES",
  ]);
  if (!keyedValue.trim()) {
    return LOCAL_DATA.quietMinutes;
  }
  const numeric = Number((keyedValue || "").replace(/[^0-9]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) {
    return LOCAL_DATA.quietMinutes;
  }
  return Math.min(120, Math.max(0, numeric));
}

function parseWebcamMinutesAfterQuiet(row: CsvRow): number {
  const keyedValue = getField(row, [
    "DURASI WEBCAM",
    "DURASI TAMPIL",
    "WAKTU TAMPIL",
    "WAKTU TAMPIL WEBCAM",
    "MENIT TAMPIL",
    "WEBCAM MENIT",
    "MENIT WEBCAM",
    "WEBCAM_DURATION",
  ]);
  const numeric = Number((keyedValue || "").replace(/[^0-9]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.min(120, Math.max(1, numeric));
}

function parseIqomahCountdownMinutes(row: CsvRow): number {
  const keyedValue = getField(row, [
    "HITUNG MUNDUR",
    "HITUNGMUNDUR",
    "HITUNG MUNDUR IQOMAH",
    "COUNTDOWN",
    "IQOMAH COUNTDOWN",
    "COUNTDOWN IQOMAH",
    "DURASI HITUNG MUNDUR",
    "MENIT HITUNG MUNDUR",
  ]);
  const numeric = Number((keyedValue || "").replace(/[^0-9]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return LOCAL_DATA.iqomahCountdownMinutes;
  }
  return Math.min(120, Math.max(1, numeric));
}

function clampSlideSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 20;
  }
  return Math.min(300, Math.max(5, Math.round(value)));
}

function parseSlideDurations(rows: CsvRow[]): number[] {
  const durations = [20, 20, 20, 20, 20, 20, 20];

  rows.forEach((row) => {
    for (let index = 1; index <= 7; index += 1) {
      const directValue = getField(row, [
        `SLIDE ${index}`,
        `SLIDE${index}`,
        `DURASI ${index}`,
        `DETIK ${index}`,
        `WAKTU ${index}`,
      ]);
      if (directValue) {
        const numeric = Number(directValue.replace(/[^0-9]/g, ""));
        if (Number.isFinite(numeric) && numeric > 0) {
          durations[index - 1] = clampSlideSeconds(numeric);
        }
      }
    }

    const rowSlideNo = Number(getField(row, ["SLIDE", "NO", "NOMOR", "URUTAN"]).replace(/[^0-9]/g, ""));
    const rowDuration = Number(getField(row, ["DURASI", "DETIK", "WAKTU", "SECONDS"]).replace(/[^0-9]/g, ""));
    if (rowSlideNo >= 1 && rowSlideNo <= 7 && Number.isFinite(rowDuration) && rowDuration > 0) {
      durations[rowSlideNo - 1] = clampSlideSeconds(rowDuration);
    }
  });

  return durations;
}

function classifyFinanceType(value: string): "income" | "expense" | "unknown" {
  const normalized = value.toUpperCase().trim();
  if (["PEMASUKAN", "KAS MASUK", "MASUK", "INCOME"].some((item) => normalized.includes(item))) {
    return "income";
  }
  if (["PENGELUARAN", "KAS KELUAR", "KELUAR", "EXPENSE"].some((item) => normalized.includes(item))) {
    return "expense";
  }
  return "unknown";
}

function mapFinanceRows(rows: CsvRow[]) {
  const income = rows
    .filter((row) => classifyFinanceType(getField(row, ["JENIS"])) === "income")
    .map((row) => ({
      Tanggal: getField(row, ["TANGGAL"]),
      Keterangan: getField(row, ["KETERANGAN"]),
      Jumlah: String(parseAmount(getField(row, ["JUMLAH"]))),
    }));

  const expense = rows
    .filter((row) => classifyFinanceType(getField(row, ["JENIS"])) === "expense")
    .map((row) => ({
      Tanggal: getField(row, ["TANGGAL"]),
      Keterangan: getField(row, ["KETERANGAN"]),
      Jumlah: String(parseAmount(getField(row, ["JUMLAH"]))),
    }));

  const totalBalance =
    income.reduce((sum, item) => sum + safeNumber(item.Jumlah), 0)
    - expense.reduce((sum, item) => sum + safeNumber(item.Jumlah), 0);

  return { income, expense, totalBalance };
}

function extractYoutubeId(url: string): string {
  const liveStreamChannelMatch = url.match(/youtube\.com\/embed\/live_stream\?[^#]*channel=([a-zA-Z0-9_-]+)/i);
  if (liveStreamChannelMatch?.[1]) {
    return "";
  }

  const shortMatch = url.match(/youtu\.be\/([^?&/]+)/i);
  if (shortMatch?.[1]) {
    return shortMatch[1];
  }

  const watchMatch = url.match(/[?&]v=([^?&/]+)/i);
  if (watchMatch?.[1]) {
    return watchMatch[1];
  }

  const embedMatch = url.match(/youtube\.com\/embed\/([^?&/]+)/i);
  if (embedMatch?.[1]) {
    if (embedMatch[1].toLowerCase() === "live_stream") {
      return "";
    }
    return embedMatch[1];
  }

  const liveMatch = url.match(/youtube\.com\/live\/([^?&/]+)/i);
  if (liveMatch?.[1]) {
    return liveMatch[1];
  }

  const shortsMatch = url.match(/youtube\.com\/shorts\/([^?&/]+)/i);
  if (shortsMatch?.[1]) {
    return shortsMatch[1];
  }

  return "";
}

function extractYoutubeChannelId(url: string): string {
  const embedLiveChannelMatch = url.match(/youtube\.com\/embed\/live_stream\?[^#]*channel=([a-zA-Z0-9_-]+)/i);
  if (embedLiveChannelMatch?.[1]) {
    return embedLiveChannelMatch[1];
  }

  const channelLiveMatch = url.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)\/live/i);
  if (channelLiveMatch?.[1]) {
    return channelLiveMatch[1];
  }

  return "";
}

function extractFacebookId(url: string): string {
  const shareVideoMatch = url.match(/facebook\.com\/share\/v\/([a-zA-Z0-9_-]+)/i);
  if (shareVideoMatch?.[1]) {
    return shareVideoMatch[1];
  }

  const shareReelMatch = url.match(/facebook\.com\/share\/r\/([a-zA-Z0-9_-]+)/i);
  if (shareReelMatch?.[1]) {
    return shareReelMatch[1];
  }

  const reelsMatch = url.match(/facebook\.com\/reel\/([0-9]+)/i);
  if (reelsMatch?.[1]) {
    return reelsMatch[1];
  }

  const watchMatch = url.match(/facebook\.com\/watch\/\?v=([a-zA-Z0-9_-]+)/i);
  if (watchMatch?.[1]) {
    return watchMatch[1];
  }

  const videosMatch = url.match(/facebook\.com\/.+\/videos\/(?:[^/]+\/)?([0-9]+)/i);
  if (videosMatch?.[1]) {
    return videosMatch[1];
  }

  return "";
}

function extractTwitchIdentity(url: string): string {
  const parsed = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/i);
  if (parsed?.[1]) {
    return parsed[1].toLowerCase();
  }
  return "";
}

function extractFirstUrl(value: string): string {
  const text = value.trim();
  if (!text) {
    return "";
  }

  const urlMatch = text.match(/https?:\/\/[^\s"')]+/i);
  if (urlMatch?.[0]) {
    return urlMatch[0].trim();
  }

  if (/\b(?:www\.)?(?:youtube\.com|youtu\.be|facebook\.com|fb\.watch|twitch\.tv)\//i.test(text)) {
    return text.startsWith("http") ? text : `https://${text.replace(/^\/+/, "")}`;
  }

  return text;
}

function normalizeImageUrl(value: string): string {
  const raw = value.trim();
  if (!raw) {
    return "";
  }

  const imageFormulaMatch = raw.match(/^=IMAGE\("([^"]+)"\)/i);
  const hyperlinkFormulaMatch = raw.match(/^=HYPERLINK\("([^"]+)"/i);
  const extracted = imageFormulaMatch?.[1] || hyperlinkFormulaMatch?.[1] || extractFirstUrl(raw);
  if (!extracted) {
    return "";
  }

  const normalized = extracted.startsWith("www.") ? `https://${extracted}` : extracted;
  return normalized;
}

function detectVideoPlatform(url: string): "youtube" | "facebook" | "twitch" | "unknown" {
  const value = url.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) {
    return "youtube";
  }
  if (value.includes("facebook.com") || value.includes("fb.watch") || value.includes("m.facebook.com")) {
    return "facebook";
  }
  if (value.includes("twitch.tv")) {
    return "twitch";
  }
  return "unknown";
}

function detectVideoKind(row: CsvRow, url: string): "live" | "video" | "unknown" {
  const combined = [
    getField(row, ["JENIS", "TYPE", "KATEGORI"]),
    getField(row, ["KETERANGAN", "CATATAN"]),
    url,
  ]
    .join(" ")
    .toUpperCase();

  if (combined.includes("LIVE") || combined.includes("STREAM")) {
    return "live";
  }

  if (/twitch\.tv\/[a-zA-Z0-9_]+/i.test(url) && !/\/videos\/\d+/i.test(url)) {
    return "live";
  }

  if (combined.trim()) {
    return "video";
  }

  return "unknown";
}

function normalizeVideoUrl(url: string): string {
  const cleaned = extractFirstUrl(url);
  const platform = detectVideoPlatform(cleaned);
  if (platform === "youtube") {
    const channelId = extractYoutubeChannelId(cleaned);
    if (channelId) {
      // Keep channel-live links stable so YouTube serves current live stream of that channel.
      return `https://www.youtube.com/channel/${channelId}/live`;
    }

    const id = extractYoutubeId(cleaned);
    return id ? `https://www.youtube.com/watch?v=${id}` : cleaned;
  }

  if (platform === "facebook") {
    // Keep share links intact because Facebook resolves them server-side.
    return cleaned.replace("m.facebook.com", "www.facebook.com");
  }

  if (platform === "twitch") {
    const normalizedHost = cleaned.replace("m.twitch.tv", "www.twitch.tv");
    try {
      const parsed = new URL(normalizedHost);
      parsed.searchParams.delete("sr");
      return parsed.toString();
    } catch {
      return normalizedHost;
    }
  }

  return cleaned;
}

function normalizeYoutubePageUrl(url: string): string {
  const cleaned = extractFirstUrl(url);
  if (!cleaned) {
    return "";
  }

  try {
    const parsed = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("youtube.com") && host !== "youtu.be") {
      return cleaned;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) {
      return cleaned;
    }

    if (parts[0].startsWith("@")) {
      return `https://www.youtube.com/${parts[0]}/live`;
    }

    if (parts[0] === "channel" && parts[1]) {
      return `https://www.youtube.com/channel/${parts[1]}/live`;
    }

    if ((parts[0] === "c" || parts[0] === "user") && parts[1]) {
      return `https://www.youtube.com/${parts[0]}/${parts[1]}/live`;
    }

    return cleaned;
  } catch {
    return cleaned;
  }
}

function safeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeData(input: unknown): MosqueData {
  if (!input || typeof input !== "object") {
    return LOCAL_DATA;
  }

  const raw = input as Partial<MosqueData>;
  const income = raw.finance?.income ?? LOCAL_DATA.finance.income;
  const expense = raw.finance?.expense ?? LOCAL_DATA.finance.expense;
  const totalBalance =
    raw.finance?.totalBalance ??
    income.reduce((sum, item) => sum + safeNumber(item.Jumlah), 0) -
      expense.reduce((sum, item) => sum + safeNumber(item.Jumlah), 0);

  return {
    finance: {
      income,
      expense,
      totalBalance: safeNumber(totalBalance),
    },
    tpaFinance: {
      income: raw.tpaFinance?.income ?? LOCAL_DATA.tpaFinance.income,
      expense: raw.tpaFinance?.expense ?? LOCAL_DATA.tpaFinance.expense,
      totalBalance: safeNumber(raw.tpaFinance?.totalBalance ?? LOCAL_DATA.tpaFinance.totalBalance),
    },
    konsumsiFinance: {
      income: raw.konsumsiFinance?.income ?? LOCAL_DATA.konsumsiFinance.income,
      expense: raw.konsumsiFinance?.expense ?? LOCAL_DATA.konsumsiFinance.expense,
      totalBalance: safeNumber(raw.konsumsiFinance?.totalBalance ?? LOCAL_DATA.konsumsiFinance.totalBalance),
    },
    general: {
      khatib: raw.general?.khatib ?? LOCAL_DATA.general.khatib,
      khatibDate: raw.general?.khatibDate ?? LOCAL_DATA.general.khatibDate,
      muazin: raw.general?.muazin ?? LOCAL_DATA.general.muazin,
      muazinDate: raw.general?.muazinDate ?? LOCAL_DATA.general.muazinDate,
      agendas: raw.general?.agendas ?? LOCAL_DATA.general.agendas,
    },
    runningText: raw.runningText ?? LOCAL_DATA.runningText,
    video: raw.video ?? LOCAL_DATA.video,
    quietMinutes: safeNumber(raw.quietMinutes ?? LOCAL_DATA.quietMinutes),
    iqomahCountdownMinutes: safeNumber(raw.iqomahCountdownMinutes ?? LOCAL_DATA.iqomahCountdownMinutes),
    webcamMinutesAfterQuiet: safeNumber(raw.webcamMinutesAfterQuiet ?? LOCAL_DATA.webcamMinutesAfterQuiet),
    slideDurationsSeconds:
      Array.isArray(raw.slideDurationsSeconds) && raw.slideDurationsSeconds.length > 0
          ? raw.slideDurationsSeconds.map((value) => clampSlideSeconds(safeNumber(value))).slice(0, 7)
        : LOCAL_DATA.slideDurationsSeconds,
    extraSlide: {
      enabled: Boolean(raw.extraSlide?.enabled),
      note: raw.extraSlide?.note ?? "",
      imageUrl: raw.extraSlide?.imageUrl ?? "",
    },
    youtubeChannelPage: {
      enabled: Boolean(raw.youtubeChannelPage?.enabled),
      url: raw.youtubeChannelPage?.url ?? "",
    },
  };
}

function hasDataChanged(prev: MosqueData, next: MosqueData): boolean {
  return JSON.stringify(prev) !== JSON.stringify(next);
}

export function useMosqueData() {
  const [data, setData] = useState<MosqueData>(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) {
      return LOCAL_DATA;
    }

    try {
      return normalizeData(JSON.parse(cached));
    } catch {
      return LOCAL_DATA;
    }
  });

  const [lastChangedAt, setLastChangedAt] = useState<string | null>(null);
  const latestDataRef = useRef(data);
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    let mounted = true;
    let controller: AbortController | null = null;

    const load = async () => {
      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;

      try {
        controller?.abort();
        controller = new AbortController();

        const [financeResult, tpaFinanceResult, konsumsiFinanceResult, khatibResult, agendaResult, runningResult, videoResult, quietResult, extraResult, slideDurationResult, youtubePageResult] =
          await Promise.allSettled([
            fetchCsvText(CSV_FINANCE_URL, controller.signal),
            fetchCsvText(CSV_TPA_FINANCE_URL, controller.signal),
            fetchCsvText(CSV_KONSUMSI_FINANCE_URL, controller.signal),
            fetchCsvText(CSV_KHATIB_URL, controller.signal),
            fetchCsvText(CSV_AGENDA_URL, controller.signal),
            fetchCsvText(CSV_RUNNING_URL, controller.signal),
            fetchCsvText(CSV_VIDEO_URL, controller.signal),
            fetchCsvText(CSV_QUIET_MODE_URL, controller.signal),
            fetchCsvText(CSV_EXTRA_SLIDE_URL, controller.signal),
            fetchCsvText(CSV_SLIDE_DURATION_URL, controller.signal),
            fetchCsvText(CSV_YOUTUBE_PAGE_MODE_URL, controller.signal),
          ]);

        const parseRows = (result: PromiseSettledResult<string>): CsvRow[] => {
          if (result.status !== "fulfilled") {
            return [];
          }
          return parseCsv(result.value).rows;
        };

        const financeRows = parseRows(financeResult);
        const tpaFinanceRows = parseRows(tpaFinanceResult);
        const konsumsiFinanceRows = parseRows(konsumsiFinanceResult);
        const khatibRows = parseRows(khatibResult);
        const agendaRows = parseRows(agendaResult);
        const runningRows = parseRows(runningResult);
        const videoRows = parseRows(videoResult);
        const quietRows = parseRows(quietResult);
        const extraRows = parseRows(extraResult);
        const slideDurationRows = parseRows(slideDurationResult);
        const youtubePageRows = parseRows(youtubePageResult);

        if (
          financeRows.length === 0
          && tpaFinanceRows.length === 0
          && konsumsiFinanceRows.length === 0
          && khatibRows.length === 0
          && agendaRows.length === 0
          && runningRows.length === 0
          && videoRows.length === 0
          && quietRows.length === 0
          && extraRows.length === 0
          && slideDurationRows.length === 0
          && youtubePageRows.length === 0
        ) {
          throw new Error("Semua sumber CSV gagal dimuat");
        }

        const previous = latestDataRef.current;
        const parsedFinance = mapFinanceRows(financeRows);
        const parsedTpaFinance = mapFinanceRows(tpaFinanceRows);
        const parsedKonsumsiFinance = mapFinanceRows(konsumsiFinanceRows);

        const latestKhatibRow = pickLatestNonEmptyRow(khatibRows, ["KHATIB", "NAMA KHATIB"]);
        const latestMuazinRow = pickLatestNonEmptyRow(khatibRows, ["MUADZIN", "MUAZIN", "NAMA MUADZIN"]);
        const agendas = agendaRows
          .filter((row) => getField(row, ["AGENDA", "NAMA AGENDA", "KEGIATAN", "JUDUL", "ACARA", "KETERANGAN AGENDA", "KETERANGAN"]))
          .map((row) => ({
            Hari: getField(row, ["HARI", "HARI AGENDA"]),
            Tanggal: getField(row, ["TANGGAL", "TGL", "TANGGAL AGENDA"]),
            Agenda: getField(row, ["AGENDA", "NAMA AGENDA", "KEGIATAN", "JUDUL", "ACARA", "KETERANGAN AGENDA", "KETERANGAN"]),
            Waktu: getField(row, ["WAKTU", "JAM", "WAKTU AGENDA", "JAM AGENDA"]),
            Tempat: getField(row, ["TEMPAT", "LOKASI", "LOKASI AGENDA", "KETERANGAN", "KETERANGAN AGENDA"]),
          }));

        const latestRunning = pickLatestNonEmptyRow(runningRows, ["TEXT", "RUNNING TEXT", "RUNNING_TEXT", "PESAN"]);

        const latestVideo = pickLatestNonEmptyRow(videoRows, ["TAUTAN", "URL", "LINK"]);
        const rawVideoUrl = getField(latestVideo ?? EMPTY_ROW, ["TAUTAN", "URL", "LINK"]);
        const videoUrl = normalizeVideoUrl(rawVideoUrl);
        const videoTime = getField(latestVideo ?? EMPTY_ROW, ["TIMESTAMP"]);
        const videoPlatform = detectVideoPlatform(videoUrl);
        const providerId =
          videoPlatform === "youtube"
            ? extractYoutubeId(videoUrl)
            : videoPlatform === "facebook"
              ? extractFacebookId(videoUrl)
              : videoPlatform === "twitch"
                ? extractTwitchIdentity(videoUrl)
              : "";
        const providerIdentity =
          videoPlatform === "youtube" && !providerId
            ? extractYoutubeChannelId(videoUrl)
            : providerId;
        const videoIdentity = rawVideoUrl || videoUrl || providerId;
        const videoId = `${videoTime || "no-time"}-${videoIdentity}`;

        const latestQuietRow =
          pickLatestNonEmptyRow(quietRows, [
            "WAKTU TENANG",
            "DURASI TENANG",
            "MENIT TENANG",
            "DURASI",
            "MENIT",
            "DURASI WEBCAM",
            "DURASI TAMPIL",
            "WAKTU TAMPIL",
            "WAKTU TAMPIL WEBCAM",
              "HITUNG MUNDUR",
              "HITUNG MUNDUR IQOMAH",
              "COUNTDOWN IQOMAH",
            "STATUS",
            "AKTIF",
            "MODE",
          ])
          ?? [...quietRows].reverse().find((row) => Object.values(row).some((value) => value.trim()))
          ?? null;
        const quietSwitch = parseBooleanSwitch(getField(latestQuietRow ?? EMPTY_ROW, ["STATUS", "AKTIF", "MODE", "ONOFF"]));
        const quietMinutes = quietSwitch === false ? 0 : parseQuietMinutes(latestQuietRow ?? EMPTY_ROW);

        const latestExtraStatusRow =
          pickLatestNonEmptyRow(extraRows, ["STATUS", "AKTIF", "MODE", "ONOFF"])
          ?? [...extraRows].reverse().find((row) => Object.values(row).some((value) => value.trim()))
          ?? null;
        const latestExtraContentRow =
          pickLatestNonEmptyRow(extraRows, [
            "NOTE",
            "CATATAN",
            "PESAN",
            "TEXT",
            "GAMBAR",
            "IMAGE",
            "IMAGE URL",
            "URL IMAGE",
            "URL GAMBAR",
            "LINK GAMBAR",
            "FOTO",
            "PHOTO",
            "URL",
            "LINK",
          ])
          ?? latestExtraStatusRow;

        const extraSwitch = parseBooleanSwitch(getField(latestExtraStatusRow ?? EMPTY_ROW, ["STATUS", "AKTIF", "MODE", "ONOFF"]));
        const extraNote = getField(latestExtraContentRow ?? EMPTY_ROW, ["NOTE", "CATATAN", "PESAN", "TEXT"]);
        const rawExtraImage = getField(latestExtraContentRow ?? EMPTY_ROW, [
          "GAMBAR",
          "IMAGE",
          "IMAGE URL",
          "URL IMAGE",
          "URL GAMBAR",
          "LINK GAMBAR",
          "FOTO",
          "PHOTO",
          "URL",
          "LINK",
        ]);
        const extraImageUrl = normalizeImageUrl(rawExtraImage);

        const latestYoutubePageStatusRow =
          pickLatestNonEmptyRow(youtubePageRows, ["STATUS", "AKTIF", "MODE", "ONOFF"])
          ?? [...youtubePageRows].reverse().find((row) => Object.values(row).some((value) => value.trim()))
          ?? null;
        const latestYoutubePageUrlRow =
          pickLatestNonEmptyRow(youtubePageRows, ["TAUTAN", "URL", "LINK", "AKUN", "YOUTUBE", "CHANNEL"])
          ?? latestYoutubePageStatusRow;
        const youtubePageSwitch = parseBooleanSwitch(getField(latestYoutubePageStatusRow ?? EMPTY_ROW, ["STATUS", "AKTIF", "MODE", "ONOFF"]));
        const youtubePageRawUrl = getField(latestYoutubePageUrlRow ?? EMPTY_ROW, ["TAUTAN", "URL", "LINK", "AKUN", "YOUTUBE", "CHANNEL"]);
        const youtubePageUrl = normalizeYoutubePageUrl(youtubePageRawUrl);

        const nextData = normalizeData({
          finance: {
            income: financeRows.length > 0 ? parsedFinance.income : previous.finance.income,
            expense: financeRows.length > 0 ? parsedFinance.expense : previous.finance.expense,
            totalBalance: financeRows.length > 0 ? parsedFinance.totalBalance : previous.finance.totalBalance,
          },
          tpaFinance: {
            income: tpaFinanceRows.length > 0 ? parsedTpaFinance.income : previous.tpaFinance.income,
            expense: tpaFinanceRows.length > 0 ? parsedTpaFinance.expense : previous.tpaFinance.expense,
            totalBalance: tpaFinanceRows.length > 0 ? parsedTpaFinance.totalBalance : previous.tpaFinance.totalBalance,
          },
          konsumsiFinance: {
            income: konsumsiFinanceRows.length > 0 ? parsedKonsumsiFinance.income : previous.konsumsiFinance.income,
            expense: konsumsiFinanceRows.length > 0 ? parsedKonsumsiFinance.expense : previous.konsumsiFinance.expense,
            totalBalance: konsumsiFinanceRows.length > 0 ? parsedKonsumsiFinance.totalBalance : previous.konsumsiFinance.totalBalance,
          },
          general: {
            khatib: getField(latestKhatibRow ?? EMPTY_ROW, ["KHATIB", "NAMA KHATIB"]) || previous.general.khatib,
            khatibDate: getField(latestKhatibRow ?? EMPTY_ROW, ["TANGGAL", "TANGGAL JUMAT", "JUMAT", "TGL KHATIB"])
              || previous.general.khatibDate,
            muazin: getField(latestMuazinRow ?? EMPTY_ROW, ["MUADZIN", "MUAZIN", "NAMA MUADZIN"]) || previous.general.muazin,
            muazinDate: getField(latestMuazinRow ?? EMPTY_ROW, ["TANGGAL", "TANGGAL JUMAT", "JUMAT", "TGL MUADZIN"])
              || previous.general.muazinDate,
            agendas: agendas.length > 0 ? agendas : previous.general.agendas,
          },
          runningText:
            getField(latestRunning ?? EMPTY_ROW, ["TEXT", "RUNNING TEXT", "RUNNING_TEXT", "PESAN"]) || previous.runningText,
          video: videoUrl
            ? {
                id: videoId,
                url: videoUrl,
                enabled: true,
                platform: videoPlatform,
                kind: detectVideoKind(latestVideo ?? EMPTY_ROW, videoUrl),
                providerId: providerIdentity || undefined,
              }
            : previous.video,
          quietMinutes: latestQuietRow ? quietMinutes : previous.quietMinutes,
          iqomahCountdownMinutes: latestQuietRow
            ? parseIqomahCountdownMinutes(latestQuietRow)
            : previous.iqomahCountdownMinutes,
          webcamMinutesAfterQuiet: latestQuietRow
            ? parseWebcamMinutesAfterQuiet(latestQuietRow)
            : previous.webcamMinutesAfterQuiet,
          slideDurationsSeconds:
            slideDurationRows.length > 0 ? parseSlideDurations(slideDurationRows) : previous.slideDurationsSeconds,
          extraSlide: {
            enabled: extraSwitch ?? previous.extraSlide.enabled,
            note: latestExtraContentRow ? extraNote : previous.extraSlide.note,
            imageUrl: latestExtraContentRow ? extraImageUrl : previous.extraSlide.imageUrl,
          },
          youtubeChannelPage: {
            enabled: youtubePageSwitch ?? previous.youtubeChannelPage.enabled,
            url: latestYoutubePageUrlRow ? youtubePageUrl : previous.youtubeChannelPage.url,
          },
        });

        if (!mounted) {
          return;
        }

        // Ignore stale async responses so old snapshots do not override newer data.
        if (requestId !== latestRequestIdRef.current) {
          return;
        }

        const changed = hasDataChanged(previous, nextData);
        if (changed) {
          setData(nextData);
          setLastChangedAt(new Date().toISOString());
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    };

    load();
    const poll = window.setInterval(load, SHEET_POLL_INTERVAL_MS);

    const refreshOnFocus = () => {
      if (!document.hidden) {
        load();
      }
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      mounted = false;
      controller?.abort();
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, []);

  return useMemo(
    () => ({
      finance: data.finance,
      tpaFinance: data.tpaFinance,
      konsumsiFinance: data.konsumsiFinance,
      general: data.general,
      runningText: data.runningText,
      video: data.video,
      quietMinutes: data.quietMinutes,
      iqomahCountdownMinutes: data.iqomahCountdownMinutes,
      webcamMinutesAfterQuiet: data.webcamMinutesAfterQuiet,
      slideDurationsSeconds: data.slideDurationsSeconds,
      extraSlide: data.extraSlide,
      youtubeChannelPage: data.youtubeChannelPage,
      lastChangedAt,
    }),
    [data, lastChangedAt],
  );
}