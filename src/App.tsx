import { useEffect, useMemo, useRef, useState } from "react";
import { addMinutes, differenceInSeconds, format } from "date-fns";
import { id } from "date-fns/locale";
import ReactPlayer from "react-player";
import { Icons } from "./components/Icons";
import { useMosqueData } from "./hooks/useMosqueData";
import { cn } from "./utils/cn";
import { getNextPrayer, getPrayerTimes } from "./utils/prayer";

const PLAYED_VIDEOS_KEY = "played-video-ids";
const BLOCKED_VIDEOS_KEY = "blocked-video-ids";
const DISPLAY_ZOOM_KEY = "display-zoom-level";
const LIVE_RETRY_DELAY_MS = 15000;
const DEFAULT_RETRY_DELAY_MS = 12000;
const MAX_EMBED_RETRIES = 3;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.05;
const DESIGN_WIDTH = 2560;
const DESIGN_HEIGHT = 1440;
const FIT_SAFE_FACTOR = 0.998;
const SAFE_VIEWPORT_PADDING = 2;
const WEBCAM_STATUS_POLL_MS = 5000;
const BACKGROUND_POLL_MS = 10000;
const WEBCAM_DEVICE_ID_KEY = "preferred-webcam-device-id";
const FULLSCREEN_AUTO_RETRY_MS = 1500;
const FULLSCREEN_AUTO_MAX_ATTEMPTS = 20;
const MANUAL_WEBCAM_NO_TIMESTAMP_TTL_MS = 15000;
const INITIAL_QUIET_MINUTES = 3;
const WEBCAM_STATUS_CSV_URL =
  import.meta.env.VITE_CSV_WEBCAM_STATUS_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLt3yM_oK16CCrGL0MblzsVFJ1XODRjO3BVFdrrm1McaGp9OGPy3r9wySskZTYg_GHjA1kv1hdcx-g/pub?output=csv";
const BACKGROUND_CSV_URL =
  import.meta.env.VITE_CSV_BACKGROUND_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3HWGBCOostmd6Vsi8WKYVePiKqK-iYh1bKA_yHCuXe-rHPZOssothYdZN_TggcmVFk7TuIP9u2B68/pub?output=csv";
const CSV_LAPORAN_KEUANGAN_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSj53euGcFoC_pwWNugNjUM2o8e74s922W5Yjx4RcH0Dr3gLGEGD_PzDxq9ycXPJcblAunsoH2y1gi0/pub?output=csv";
const CSV_PERINCIAN_PENGELUARAN_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQVl-aTPsB-q-ftkgNkNgbIqORmgAfo2o0eTGruLqinIu_HYwWMqSqgzMMqDVTj0pld-mfGCClDHuWo/pub?output=csv";
const CSV_KAS_RENOVASI_SUMMARY_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR1mG4l54_pu6uKZAqj79DWIhtnlle9rJrn3KAnGX5ygw0v7L0jWaEMeyXVE3BIGb17DWGNLmIRwnez/pub?output=csv";

const CSV_KAS_RENOVASI_DETAIL_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFkv7lsIC6b4WY2jhaoe8PN3hhClg7gGExPugJLXB9RX4-Rfgd1l9yT-buqSX6sRbQuT3gplLtryC/pub?output=csv";
const SALDO_AWAL_DEFAULT = 6825500;
const FINANCE_NOTICE_TEXT = "UNTUK PENGELUARAN BIAYA LISTRIK & AIR SUDAH DITANGGUNG JAMAAH";

type YoutubeVideoStatus = {
  embeddable: boolean;
  liveBroadcastContent: "live" | "upcoming" | "none";
};

type WebcamCommand = "start" | "stop";

type WebcamCommandRecord = {
  command: WebcamCommand;
  signal: string;
  timestamp: number;
};

type QuietPhase = "initial_quiet" | "iqomah_countdown" | "post_iqomah_quiet";

type QuietWindowInfo = {
  prayer: { name: string; time: Date; formatted: string };
  phase: QuietPhase;
  phaseEnd: Date;
  countdownEnd: Date;
  secondQuietEnd: Date;
};

type ReportTxn = {
  tanggal: string;
  keterangan: string;
  jumlah: number;
  namaKas: string;
};

type LaporanSummary = {
  saldoAwal: number;
  totalKasMasuk: number;
  totalKasKeluar: number;
  rincianMasuk: {
    infakHarian: number;
    infakJumat: number;
    kasMasukKonsumsi: number;
  };
  rincianKeluar: {
    kasUtama: number;
    kasKeluarKonsumsi: number;
    kasKegiatanTpa: number;
    kasKebersihan: number;
    kasAkomodasiUstadz: number;
    kasKhatibJumat: number;
  };
  totalSaldo: number;
};

type RenovasiDetailItem = {
  timestamp: string;
  jenis: string;
  tanggal: string;
  keterangan: string;
  nominal: number;
};

function isFullscreenActive(): boolean {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
}

async function requestBestEffortFullscreen(target?: HTMLElement | null): Promise<boolean> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void>;
    webkitFullscreenElement?: Element | null;
  };

  if (document.fullscreenElement || doc.webkitFullscreenElement) {
    return true;
  }

  const htmlTarget = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  const fullscreenTarget = (target ?? htmlTarget) as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };

  try {
    if (htmlTarget.requestFullscreen) {
      await htmlTarget.requestFullscreen();
      return true;
    }
    if (htmlTarget.webkitRequestFullscreen) {
      await htmlTarget.webkitRequestFullscreen();
      return true;
    }
    if (fullscreenTarget.requestFullscreen) {
      await fullscreenTarget.requestFullscreen();
      return true;
    }
    if (fullscreenTarget.webkitRequestFullscreen) {
      await fullscreenTarget.webkitRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function getSafeViewportSize(): { width: number; height: number } {
  const doc = document.documentElement;
  const vv = window.visualViewport;

  const widths = [window.innerWidth, doc.clientWidth, vv?.width ?? 0].filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  const heights = [window.innerHeight, doc.clientHeight, vv?.height ?? 0].filter(
    (value) => Number.isFinite(value) && value > 0,
  );

  // Some TV browsers report one smaller metric; use the largest valid viewport value.
  const width = widths.length > 0 ? Math.max(...widths) : DESIGN_WIDTH;
  const height = heights.length > 0 ? Math.max(...heights) : DESIGN_HEIGHT;

  return { width, height };
}

function dateOnly(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "-";
  }

  // Keep display clean when Sheet date field accidentally contains full timestamp.
  return trimmed.split(" ")[0];
}

function fridayLabel(value?: string): string {
  const day = dateOnly(value || "");
  return day === "-" ? "Jumat: -" : `Jumat: ${day}`;
}

function formatClockCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getPrayerCalmDurationMinutes(prayerName: string, prayerTime: Date, baseMinutes: number): number {
  const safeBase = Math.max(0, baseMinutes);
  const isFridayDhuhr = prayerName.trim().toLowerCase() === "dzuhur" && prayerTime.getDay() === 5;
  return isFridayDhuhr ? safeBase + 10 : safeBase;
}

function isWithinRange(now: Date, start: Date, end: Date): boolean {
  const nowMs = now.getTime();
  return nowMs >= start.getTime() && nowMs < end.getTime();
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

  return "";
}

function buildFacebookEmbedUrl(url: string): string {
  const params = new URLSearchParams({
    href: url,
    autoplay: "true",
    mute: "1",
    show_text: "false",
    width: "1280",
  });
  return `https://www.facebook.com/plugins/video.php?${params.toString()}`;
}

function getTwitchParents(): string[] {
  const hostname = window.location.hostname || "localhost";
  const parents = new Set<string>([hostname]);

  if (hostname !== "localhost") {
    parents.add("localhost");
    parents.add("127.0.0.1");
  }

  return Array.from(parents);
}

function buildTwitchEmbedUrl(url: string, muted = true): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const params = new URLSearchParams();

    if (pathParts[0]?.toLowerCase() === "videos" && pathParts[1]) {
      const rawId = pathParts[1].replace(/[^a-zA-Z0-9]/g, "");
      params.set("video", rawId.startsWith("v") ? rawId : `v${rawId}`);
    } else if (pathParts[0]) {
      params.set("channel", pathParts[0].toLowerCase());
    }

    // Keep embed valid on random subdomains (arena / kiosk hosts).
    getTwitchParents().forEach((parentHost) => params.append("parent", parentHost));
    params.set("autoplay", "true");
    params.set("muted", muted ? "true" : "false");

    return `https://player.twitch.tv/?${params.toString()}`;
  } catch {
    return url;
  }
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let cell = "";
  let line: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      line.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      line.push(cell.trim());
      cell = "";
      if (line.some((value) => value.length > 0)) {
        rows.push(line);
      }
      line = [];
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || line.length > 0) {
    line.push(cell.trim());
    if (line.some((value) => value.length > 0)) {
      rows.push(line);
    }
  }

  return rows;
}

function toHeaderRows(content: string): Array<Record<string, string>> {
  const rows = parseCsvRows(content.replace(/^\uFEFF/, ""));
  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((item) => item.trim());
  return rows.slice(1).map((row) => {
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = (row[index] || "").trim();
      return acc;
    }, {});
  });
}

function normalizeKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getByAliases(row: Record<string, string>, aliases: string[]): string {
  const targets = new Set(aliases.map((alias) => normalizeKey(alias)));
  for (const [key, value] of Object.entries(row)) {
    if (targets.has(normalizeKey(key)) && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeKasName(value: string): string {
  // Remove punctuation so variants like JUM'AT, JUMAT, or smart quotes map to the same key.
  return value.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function parseRupiah(value: string): number {
  const cleaned = value.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(/,/g, ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseReportTransactions(content: string): ReportTxn[] {
  const rows = toHeaderRows(content);
  return rows
    .map((row) => {
      const namaKas = normalizeKasName(getByAliases(row, ["NAMA KAS", "KAS", "JENIS KAS", "KATEGORI", "POS", "JENIS"]));
      const jumlah = parseRupiah(getByAliases(row, ["JUMLAH", "NOMINAL", "RUPIAH", "TOTAL"]));
      return {
        tanggal: getByAliases(row, ["TANGGAL", "TGL", "DATE"]),
        keterangan: getByAliases(row, ["KETERANGAN", "URAIAN", "DESKRIPSI", "NAMA", "CATATAN"]),
        jumlah,
        namaKas,
      } satisfies ReportTxn;
    })
    .filter((item) => item.namaKas || item.keterangan || item.jumlah !== 0);
}

function extractManualSaldoAwal(content: string): number | null {
  const rows = toHeaderRows(content);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const raw = getByAliases(row, [
      "TOTAL SALDO AWAL",
      "SALDO AWAL",
      "SALDOAWAL",
      "SALDO_AWAL",
      "AWAL",
      "TOTAL SALDOAWAL",
    ]);
    if (!raw) {
      continue;
    }
    const parsed = parseRupiah(raw);
    if (parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parseLaporanSummaryFromHorizontalCsv(content: string): LaporanSummary | null {
  const rows = toHeaderRows(content);
  if (!rows.length) return null;

  const latest = rows[rows.length - 1];

  const saldoAwal = parseRupiah(getByAliases(latest, ["TOTAL SALDO AWAL", "SALDO AWAL"]));
  const infakHarian = parseRupiah(getByAliases(latest, ["INFAQ HARIAN", "INFAK HARIAN"]));
  const infakJumat = parseRupiah(getByAliases(latest, ["INFAQ JUM'AT", "INFAQ JUMAT", "INFAK JUMAT"]));
  const kasMasukKonsumsi = parseRupiah(getByAliases(latest, ["KAS MASUK KONSUMSI"]));

  const kasUtama = parseRupiah(getByAliases(latest, ["KAS UTAMA", "KAS KELUAR UTAMA"]));
  const kasKeluarKonsumsi = parseRupiah(getByAliases(latest, ["KAS KELUAR KONSUMSI", "KAS KONSUMSI"]));
  const kasKegiatanTpa = parseRupiah(getByAliases(latest, ["KAS KEGIATAN TPA", "KAS KELUAR KEGIATAN TPA"]));
  const kasKebersihan = parseRupiah(getByAliases(latest, ["KAS KEBERSIHAN", "KAS KELUAR KEBERSIHAN"]));
  const kasAkomodasiUstadz = parseRupiah(
    getByAliases(latest, ["KAS AKOMODASI USTADZ", "KAS AKOMODASI USTAZ"])
  );
  const kasKhatibJumat = parseRupiah(
    getByAliases(latest, ["KAS KHATIB JUM'AT", "KAS KHATIB JUMAT", "KAS KHOTIB JUM'AT", "KAS KHOTIB JUMAT"])
  );

  const totalKasMasukRaw = parseRupiah(getByAliases(latest, ["TOTAL KAS MASUK"]));
  const totalKasKeluarRaw = parseRupiah(getByAliases(latest, ["TOTAL KAS KELUAR"]));
  const totalSaldoRaw = parseRupiah(getByAliases(latest, ["TOTAL SALDO AKHIR", "TOTAL SALDO", "SALDO AKHIR"]));

  const totalKasMasuk = totalKasMasukRaw || (infakHarian + infakJumat + kasMasukKonsumsi);
  const totalKasKeluar =
    totalKasKeluarRaw ||
    (kasUtama + kasKeluarKonsumsi + kasKegiatanTpa + kasKebersihan + kasAkomodasiUstadz + kasKhatibJumat);

  return {
    saldoAwal: saldoAwal || SALDO_AWAL_DEFAULT,
    totalKasMasuk,
    totalKasKeluar,
    rincianMasuk: { infakHarian, infakJumat, kasMasukKonsumsi },
    rincianKeluar: {
      kasUtama,
      kasKeluarKonsumsi,
      kasKegiatanTpa,
      kasKebersihan,
      kasAkomodasiUstadz,
      kasKhatibJumat,
    },
    totalSaldo: totalSaldoRaw || ((saldoAwal || SALDO_AWAL_DEFAULT) + totalKasMasuk - totalKasKeluar),
  };
}

function latestAmountByKasName(items: ReportTxn[], aliases: string[]): number {
  const targetNames = aliases.map((alias) => normalizeKasName(alias));
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (targetNames.includes(items[index].namaKas)) {
      return items[index].jumlah;
    }
  }
  return 0;
}

function buildLaporanSummary(items: ReportTxn[], saldoAwalManual = SALDO_AWAL_DEFAULT): LaporanSummary {
  const infakHarian = latestAmountByKasName(items, ["INFAQ HARIAN", "INFAK HARIAN"]);
  const infakJumat = latestAmountByKasName(items, ["INFAQ JUM'AT", "INFAQ JUMAT", "INFAK JUMAT"]);
  const kasMasukKonsumsi = latestAmountByKasName(items, ["KAS MASUK KONSUMSI"]);

  const kasUtama = latestAmountByKasName(items, ["KAS UTAMA", "KAS KELUAR UTAMA"]);
  const kasKeluarKonsumsi = latestAmountByKasName(items, ["KAS KELUAR KONSUMSI", "KAS KONSUMSI"]);
  const kasKegiatanTpa = latestAmountByKasName(items, ["KAS KEGIATAN TPA", "KAS KELUAR KEGIATAN TPA"]);
  const kasKebersihan = latestAmountByKasName(items, ["KAS KEBERSIHAN", "KAS KELUAR KEBERSIHAN"]);
  const kasAkomodasiUstadz = latestAmountByKasName(items, ["KAS AKOMODASI USTADZ", "KAS AKOMODASI USTAZ", "KAS KELUAR AKOMODASI USTADZ", "KAS KELUAR AKOMODASI USTAZ"]);
  const kasKhatibJumat = latestAmountByKasName(items, [
    "KAS KHATIB JUM'AT",
    "KAS KHATIB JUMAT",
    "KHATIB JUM'AT",
    "KHATIB JUMAT",
    "KAS KHOTIB JUM'AT",
    "KAS KHOTIB JUMAT",
    "KHOTIB JUM'AT",
    "KHOTIB JUMAT",
    "KAS KELUAR KHATIB JUM'AT",
    "KAS KELUAR KHATIB JUMAT",
    "KAS KELUAR KHOTIB JUM'AT",
    "KAS KELUAR KHOTIB JUMAT",
  ]);

  const totalKasMasuk = infakHarian + infakJumat + kasMasukKonsumsi;
  const totalKasKeluar = kasUtama + kasKeluarKonsumsi + kasKegiatanTpa + kasKebersihan + kasAkomodasiUstadz + kasKhatibJumat;

  const runningSaldo = saldoAwalManual + totalKasMasuk - totalKasKeluar;

  return {
    saldoAwal: saldoAwalManual,
    totalKasMasuk,
    totalKasKeluar,
    rincianMasuk: { infakHarian, infakJumat, kasMasukKonsumsi },
    rincianKeluar: {
      kasUtama,
      kasKeluarKonsumsi,
      kasKegiatanTpa,
      kasKebersihan,
      kasAkomodasiUstadz,
      kasKhatibJumat,
    },
    totalSaldo: runningSaldo,
  };
}

function latestTransactionsByKas(items: ReportTxn[], aliases: string[], limit = 3): ReportTxn[] {
  const targetNames = aliases.map((alias) => normalizeKasName(alias));
  return items
    .filter((item) => targetNames.includes(item.namaKas))
    .slice(-Math.max(1, limit))
    .reverse();
}

function parseCommandTimestamp(value: string): number {
  const text = value.trim();
  if (!text) {
    return 0;
  }

  const ymdWithTime = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (ymdWithTime) {
    const [, year, month, day, hours = "0", minutes = "0", seconds = "0"] = ymdWithTime;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
    ).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const dmyWithTime = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dmyWithTime) {
    const [, day, month, yearRaw, hours = "0", minutes = "0", seconds = "0"] = dmyWithTime;
    const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
    const parsed = new Date(year, Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds)).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const fallback = Date.parse(text);
  return Number.isFinite(fallback) ? fallback : 0;
}

function parseCommandValue(value: string): WebcamCommand | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  // Prioritize explicit stop to avoid accidental "start" matches from words like "restart".
  if (/\bstop\b/.test(normalized) || normalized === "0" || normalized === "off") {
    return "stop";
  }
  if (/\bstart\b/.test(normalized) || normalized === "1" || normalized === "on") {
    return "start";
  }

  return null;
}

function parseWebcamCommandCsv(content: string): WebcamCommandRecord | null {
  const rows = parseCsvRows(content.replace(/^\uFEFF/, ""));
  if (rows.length === 0) {
    return null;
  }

  const headers = rows[0].map((header) => header.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const statusIndex = headers.findIndex((header) => header === "STATUS" || header === "COMMAND" || header === "STATE");
  const textIndex = headers.findIndex((header) => header === "TEXT" || header === "PESAN");
  const timestampIndex = headers.findIndex((header) =>
    ["TIMESTAMP", "UPDATEDATETIME", "UPDATEDATA", "WAKTU", "TANGGAL"].includes(header),
  );
  const candidateIndex = statusIndex >= 0 ? statusIndex : textIndex >= 0 ? textIndex : 0;

  const candidates: WebcamCommandRecord[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const rawValue = (rows[i][candidateIndex] || "").trim();
    const command = parseCommandValue(rawValue);
    if (!command) {
      continue;
    }

    const timestampRaw = timestampIndex >= 0 ? (rows[i][timestampIndex] || "").trim() : "";
    const timestamp = parseCommandTimestamp(timestampRaw);
    candidates.push({
      command,
      timestamp,
      signal: `${timestampRaw}|${rawValue.toLowerCase()}|${i}`,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  const withTimestamp = candidates.filter((item) => item.timestamp > 0);
  if (withTimestamp.length > 0) {
    return withTimestamp.reduce((latest, item) => {
      if (item.timestamp > latest.timestamp) {
        return item;
      }
      return latest;
    });
  }

  return candidates[candidates.length - 1];
}

type BackgroundConfig = {
  url: string | null;
  opacityPercent: number | null;
};

function parseOpacityPercent(raw: string): number | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.min(100, Math.max(0, numeric));
}

function parseBackgroundConfigCsv(content: string): BackgroundConfig {
  const rows = parseCsvRows(content.replace(/^\uFEFF/, ""));
  if (rows.length === 0) {
    return { url: null, opacityPercent: null };
  }

  const normalizeBackgroundUrl = (raw: string): string | null => {
    const cleaned = raw.trim().replace(/^"|"$/g, "");
    if (!cleaned) {
      return null;
    }

    // Support Google Sheets formula cell: =IMAGE("https://...")
    const imageFormulaMatch = cleaned.match(/=\s*image\s*\(\s*"([^"]+)"/i);
    const hyperlinkFormulaMatch = cleaned.match(/=\s*hyperlink\s*\(\s*"([^"]+)"/i);
    const fromFormula = imageFormulaMatch?.[1] || hyperlinkFormulaMatch?.[1] || cleaned;
    const withProtocol = fromFormula.startsWith("//") ? `https:${fromFormula}` : fromFormula;
    const maybeProtocol = /^www\./i.test(withProtocol) ? `https://${withProtocol}` : withProtocol;

    const driveFileMatch = maybeProtocol.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (driveFileMatch?.[1]) {
      return `https://drive.google.com/uc?export=view&id=${driveFileMatch[1]}`;
    }

    const driveOpenMatch = maybeProtocol.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (/drive\.google\.com\//i.test(maybeProtocol) && driveOpenMatch?.[1]) {
      return `https://drive.google.com/uc?export=view&id=${driveOpenMatch[1]}`;
    }

    const ucMatch = maybeProtocol.match(/drive\.google\.com\/uc\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i);
    if (ucMatch?.[1]) {
      return `https://drive.google.com/uc?export=view&id=${ucMatch[1]}`;
    }

    if (/^https?:\/\//i.test(maybeProtocol)) {
      return maybeProtocol;
    }

    const inlineUrlMatch = maybeProtocol.match(/https?:\/\/[^\s"')]+/i);
    if (inlineUrlMatch?.[0]) {
      return inlineUrlMatch[0];
    }

    return null;
  };

  const headers = rows[0].map((header) => header.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const urlIndex = headers.findIndex((header) =>
    ["URL", "LINK", "BACKGROUND", "BACKGROUNDURL", "GAMBAR", "IMAGE", "IMAGEURL"].includes(header),
  );
  const opacityIndex = headers.findIndex((header) => ["OPACITY", "TRANSPARANSI", "ALPHA", "BACKGROUNDOPACITY"].includes(header));
  const dataRows = (urlIndex >= 0 || opacityIndex >= 0) ? rows.slice(1) : rows;
  let foundUrl: string | null = null;
  let foundOpacity: number | null = null;

  for (let i = dataRows.length - 1; i >= 0; i -= 1) {
    const row = dataRows[i];
    const values = urlIndex >= 0 ? [row[urlIndex] || ""] : row;

    if (foundOpacity === null) {
      const opacityCandidates = opacityIndex >= 0 ? [row[opacityIndex] || ""] : row;
      for (const value of opacityCandidates) {
        const parsedOpacity = parseOpacityPercent(value || "");
        if (parsedOpacity !== null) {
          foundOpacity = parsedOpacity;
          break;
        }
      }
    }

    if (!foundUrl) {
      for (const value of values) {
        const normalized = normalizeBackgroundUrl(value || "");
        if (normalized) {
          foundUrl = normalized;
          break;
        }
      }
    }

    if (foundUrl && foundOpacity !== null) {
      break;
    }
  }

  return { url: foundUrl, opacityPercent: foundOpacity };
}

async function pickCameraDeviceId(savedDeviceId: string): Promise<string> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return savedDeviceId;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    if (!cameras.length) {
      return "";
    }

    if (savedDeviceId && cameras.some((device) => device.deviceId === savedDeviceId)) {
      return savedDeviceId;
    }

    const nonVirtual = cameras.filter((device) => !/virtual|obs|screen|ndi|capture|droidcam|ip camera/i.test(device.label));
    const usbPreferred = nonVirtual.find((device) => /usb|webcam|hd camera|uvc/i.test(device.label));

    return (usbPreferred || nonVirtual[0] || cameras[0]).deviceId || "";
  } catch {
    return savedDeviceId;
  }
}

async function checkYoutubeVideoStatus(videoUrl: string): Promise<YoutubeVideoStatus | null> {
  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
  const videoId = extractYoutubeId(videoUrl);

  if (!apiKey || !videoId) {
    return null;
  }

  const endpoint = `https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      items?: Array<{
        status?: { embeddable?: boolean };
        snippet?: { liveBroadcastContent?: "live" | "upcoming" | "none" };
      }>;
    };

    const item = payload.items?.[0];
    if (!item) {
      return null;
    }

    return {
      embeddable: Boolean(item.status?.embeddable),
      liveBroadcastContent: item.snippet?.liveBroadcastContent ?? "none",
    };
  } catch {
    return null;
  }
}

export default function App() {
  const {
    general,
    runningText,
    video,
    quietMinutes,
    iqomahCountdownMinutes,
    webcamMinutesAfterQuiet,
    slideDurationsSeconds,
    extraSlide,
    youtubeChannelPage,
    lastChangedAt,
  } = useMosqueData();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamPollAbortRef = useRef<AbortController | null>(null);
  const webcamLastAppliedRef = useRef<WebcamCommandRecord | null>(null);
  const webcamPendingRef = useRef<(WebcamCommandRecord & { seen: number }) | null>(null);
  const webcamManualExpiryRef = useRef<number>(0);
  const lastFinanceSignatureRef = useRef<string>("");
  const [now, setNow] = useState(new Date());
  const [slideIndex, setSlideIndex] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [videoRetryTick, setVideoRetryTick] = useState(0);
  const [videoErrorNotice, setVideoErrorNotice] = useState<string | null>(null);
  const [videoErrorCountById, setVideoErrorCountById] = useState<Record<string, number>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [displayZoom, setDisplayZoom] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(DISPLAY_ZOOM_KEY);
      if (!raw) {
        return 1;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        return 1;
      }
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parsed));
    } catch {
      return 1;
    }
  });
  const [playedVideoIds, setPlayedVideoIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(PLAYED_VIDEOS_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(parsed.filter((item) => typeof item === "string"));
    } catch {
      return new Set();
    }
  });
  const [blockedVideoIds, setBlockedVideoIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(BLOCKED_VIDEOS_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(parsed.filter((item) => typeof item === "string"));
    } catch {
      return new Set();
    }
  });
  const isTvBrowser = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes("qjy") || ua.includes("coocaa") || ua.includes("smart-tv") || ua.includes("smarttv");
  }, []);
  const [webcamCommand, setWebcamCommand] = useState<WebcamCommand>("stop");
  const [autoWebcamActive, setAutoWebcamActive] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [webcamRetryTick, setWebcamRetryTick] = useState(0);
  const [backgroundUrl, setBackgroundUrl] = useState<string>("/masjid-bg.png");
  const [backgroundOpacity, setBackgroundOpacity] = useState<number>(0.2);
  const [laporanSummary, setLaporanSummary] = useState<LaporanSummary>(() => buildLaporanSummary([], SALDO_AWAL_DEFAULT));
  const [perincianItems, setPerincianItems] = useState<ReportTxn[]>([]);

  const youtubePageModeUrl = useMemo(() => {
    if (!youtubeChannelPage.url) {
      return "";
    }
    return youtubeChannelPage.url;
  }, [youtubeChannelPage.url]);
  const youtubePageModeActive = Boolean(youtubeChannelPage.enabled && youtubePageModeUrl);

  const webcamDurationEnabled = webcamMinutesAfterQuiet > 0;
  const manualWebcamActive = webcamCommand === "start";
  const webcamActive =
    !youtubePageModeActive &&
    (manualWebcamActive || (webcamDurationEnabled && autoWebcamActive));

  useEffect(() => {
    if (webcamDurationEnabled) {
      return;
    }

    // Keep manual START command working even when scheduled webcam duration is 0.
    if (autoWebcamActive) {
      setAutoWebcamActive(false);
    }
  }, [webcamDurationEnabled, autoWebcamActive]);

  useEffect(() => {
    // Prevent stale low zoom from old sessions on TV browsers.
    if (isTvBrowser && displayZoom < 1) {
      setDisplayZoom(1);
    }
  }, [isTvBrowser, displayZoom]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const slideCount = extraSlide.enabled ? 7 : 6;

  useEffect(() => {
    if (slideIndex >= slideCount) {
      setSlideIndex(0);
    }
  }, [slideCount, slideIndex]);

  const activeSlideDurationSeconds = useMemo(() => {
    return slideDurationsSeconds[slideIndex] || 20;
  }, [slideDurationsSeconds, slideIndex]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSlideIndex((prev) => (prev + 1) % slideCount);
    }, Math.max(5, activeSlideDurationSeconds) * 1000);

    return () => window.clearTimeout(timeout);
  }, [slideCount, activeSlideDurationSeconds, slideIndex]);

  useEffect(() => {
    localStorage.setItem(PLAYED_VIDEOS_KEY, JSON.stringify(Array.from(playedVideoIds)));
  }, [playedVideoIds]);

  useEffect(() => {
    localStorage.setItem(BLOCKED_VIDEOS_KEY, JSON.stringify(Array.from(blockedVideoIds)));
  }, [blockedVideoIds]);

  useEffect(() => {
    localStorage.setItem(DISPLAY_ZOOM_KEY, String(displayZoom));
  }, [displayZoom]);

  useEffect(() => {
    const updateFullscreenState = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    };

    updateFullscreenState();

    document.addEventListener("fullscreenchange", updateFullscreenState);
    document.addEventListener("webkitfullscreenchange", updateFullscreenState as EventListener);

    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
      document.removeEventListener("webkitfullscreenchange", updateFullscreenState as EventListener);
    };
  }, []);

  useEffect(() => {
    // Browser policy may block fullscreen on load, so we try once on load and once on first interaction.
    let detached = false;
    let retryAttempts = 0;

    const tryEnterFullscreen = async () => {
      if (detached) {
        return;
      }
      await requestBestEffortFullscreen(stageRef.current);
    };

    const delayed = window.setTimeout(() => {
      void tryEnterFullscreen();
    }, 350);

    const retryInterval = window.setInterval(() => {
      if (detached || isFullscreenActive()) {
        window.clearInterval(retryInterval);
        return;
      }

      retryAttempts += 1;
      void tryEnterFullscreen();
      if (retryAttempts >= FULLSCREEN_AUTO_MAX_ATTEMPTS) {
        window.clearInterval(retryInterval);
      }
    }, FULLSCREEN_AUTO_RETRY_MS);

    const handleFirstGesture = () => {
      void tryEnterFullscreen();
      detachGestureListeners();
    };

    const detachGestureListeners = () => {
      window.removeEventListener("click", handleFirstGesture);
      window.removeEventListener("keydown", handleFirstGesture);
      window.removeEventListener("touchstart", handleFirstGesture);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void tryEnterFullscreen();
      }
    };

    window.addEventListener("click", handleFirstGesture, { once: true });
    window.addEventListener("keydown", handleFirstGesture, { once: true });
    window.addEventListener("touchstart", handleFirstGesture, { once: true });
    window.addEventListener("pageshow", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      detached = true;
      window.clearTimeout(delayed);
      window.clearInterval(retryInterval);
      detachGestureListeners();
      window.removeEventListener("pageshow", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const applyWebcamCommand = (record: WebcamCommandRecord) => {
      webcamLastAppliedRef.current = record;
      webcamPendingRef.current = null;
      webcamManualExpiryRef.current =
        record.command === "start" && record.timestamp <= 0
          ? Date.now() + MANUAL_WEBCAM_NO_TIMESTAMP_TTL_MS
          : 0;
      setWebcamCommand((prev) => (prev === record.command ? prev : record.command));
    };

    const loadWebcamCommand = async () => {
      try {
        const controller = new AbortController();
        webcamPollAbortRef.current?.abort();
        webcamPollAbortRef.current = controller;
        const separator = WEBCAM_STATUS_CSV_URL.includes("?") ? "&" : "?";
        const response = await fetch(`${WEBCAM_STATUS_CSV_URL}${separator}_ts=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Cache-Control": "no-cache, no-store, max-age=0",
            Pragma: "no-cache",
          },
        });

        if (!response.ok) {
          return;
        }

        const csv = await response.text();
        const commandRecord = parseWebcamCommandCsv(csv);
        if (!isMounted) {
          return;
        }

        if (!commandRecord) {
          webcamPendingRef.current = null;
          webcamManualExpiryRef.current = 0;
          setWebcamCommand("stop");
          return;
        }

        const lastApplied = webcamLastAppliedRef.current;
        if (lastApplied) {
          if (commandRecord.signal === lastApplied.signal) {
            return;
          }

          // Ignore stale cache snapshots when we have reliable command timestamps.
          if (commandRecord.timestamp > 0 && lastApplied.timestamp > 0 && commandRecord.timestamp < lastApplied.timestamp) {
            return;
          }
        }

        if (commandRecord.timestamp > 0) {
          applyWebcamCommand(commandRecord);
          return;
        }

        // For sheets without timestamp, require 2 identical polls before switching.
        const pending = webcamPendingRef.current;
        if (!pending || pending.signal !== commandRecord.signal) {
          webcamPendingRef.current = { ...commandRecord, seen: 1 };
          return;
        }

        const nextSeen = pending.seen + 1;
        if (nextSeen >= 2) {
          applyWebcamCommand(commandRecord);
          return;
        }

        webcamPendingRef.current = { ...commandRecord, seen: nextSeen };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    };

    void loadWebcamCommand();
    const interval = window.setInterval(() => {
      void loadWebcamCommand();
    }, WEBCAM_STATUS_POLL_MS);

    return () => {
      isMounted = false;
      webcamPollAbortRef.current?.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (webcamCommand !== "start") {
      return;
    }

    const interval = window.setInterval(() => {
      if (webcamManualExpiryRef.current > 0 && Date.now() >= webcamManualExpiryRef.current) {
        webcamManualExpiryRef.current = 0;
        setWebcamCommand("stop");
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [webcamCommand]);

  useEffect(() => {
    let mounted = true;
    let controller: AbortController | null = null;

    const loadBackground = async () => {
      try {
        controller?.abort();
        controller = new AbortController();
        const separator = BACKGROUND_CSV_URL.includes("?") ? "&" : "?";
        const response = await fetch(`${BACKGROUND_CSV_URL}${separator}_ts=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Cache-Control": "no-cache, no-store, max-age=0",
            Pragma: "no-cache",
          },
        });

        if (!response.ok) {
          return;
        }

        const csv = await response.text();
        const nextConfig = parseBackgroundConfigCsv(csv);
        if (!mounted) {
          return;
        }

        const nextUrl = nextConfig.url;
        if (nextUrl) {
          setBackgroundUrl((prev) => (prev === nextUrl ? prev : nextUrl));
        }

        if (nextConfig.opacityPercent !== null) {
          const normalizedOpacity = Math.min(1, Math.max(0, nextConfig.opacityPercent / 100));
          setBackgroundOpacity((prev) => (Math.abs(prev - normalizedOpacity) < 0.001 ? prev : normalizedOpacity));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    };

    void loadBackground();
    const interval = window.setInterval(() => {
      void loadBackground();
    }, BACKGROUND_POLL_MS);

    return () => {
      mounted = false;
      controller?.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let controller: AbortController | null = null;

    const loadFinanceSlides = async () => {
      try {
        controller?.abort();
        controller = new AbortController();

        const [laporanResponse, perincianResponse] = await Promise.all([
          fetch(`${CSV_LAPORAN_KEUANGAN_URL}&_ts=${Date.now()}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(`${CSV_PERINCIAN_PENGELUARAN_URL}&_ts=${Date.now()}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        if (!laporanResponse.ok || !perincianResponse.ok) {
          return;
        }

        const [laporanCsv, perincianCsv] = await Promise.all([
          laporanResponse.text(),
          perincianResponse.text(),
        ]);

      if (!mounted) return;

const parsedHorizontal = parseLaporanSummaryFromHorizontalCsv(laporanCsv);

if (parsedHorizontal) {
  setLaporanSummary(parsedHorizontal);
} else {
  const laporanTransactions = parseReportTransactions(laporanCsv);
  const saldoAwalManual = extractManualSaldoAwal(laporanCsv);
  setLaporanSummary(
    buildLaporanSummary(laporanTransactions, saldoAwalManual ?? SALDO_AWAL_DEFAULT),
  );
}

setPerincianItems(parseReportTransactions(perincianCsv));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    };

    void loadFinanceSlides();
    const interval = window.setInterval(() => {
      void loadFinanceSlides();
    }, 10000);

    return () => {
      mounted = false;
      controller?.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (webcamActive) {
      return;
    }

    if (webcamStream) {
      webcamStream.getTracks().forEach((track) => track.stop());
      setWebcamStream(null);
    }
    setWebcamError(null);
  }, [webcamActive, webcamStream]);

  useEffect(() => {
    let cancelled = false;

    const ensureWebcam = async () => {
      if (!webcamActive) {
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setWebcamError("Browser tidak mendukung webcam otomatis.");
        return;
      }

      if (webcamStream && webcamStream.active) {
        setWebcamError(null);
        return;
      }

      try {
        let preferredDeviceId = "";
        try {
          preferredDeviceId = localStorage.getItem(WEBCAM_DEVICE_ID_KEY) || "";
        } catch {
          preferredDeviceId = "";
        }

        const selectedDeviceId = await pickCameraDeviceId(preferredDeviceId);

        const firstAttemptConstraints: MediaStreamConstraints = {
          audio: false,
          video: {
            deviceId: selectedDeviceId ? { ideal: selectedDeviceId } : undefined,
            width: { ideal: 2560 },
            height: { ideal: 1440 },
            frameRate: { ideal: 30 },
          },
        };

        let stream = await navigator.mediaDevices.getUserMedia(firstAttemptConstraints);

        if (!stream.getVideoTracks().length) {
          throw new Error("No video track");
        }

        if (selectedDeviceId) {
          localStorage.setItem(WEBCAM_DEVICE_ID_KEY, selectedDeviceId);
        }

        if (!preferredDeviceId) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cams = devices.filter((device) => device.kind === "videoinput");
            const usbLike = cams.find((device) => /usb|webcam|hd camera|uvc/i.test(device.label));
            const selected = usbLike || cams[cams.length - 1] || null;
            if (selected?.deviceId) {
              localStorage.setItem(WEBCAM_DEVICE_ID_KEY, selected.deviceId);
            }
          } catch {
            // Keep running with current stream when device listing is not available.
          }
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        setWebcamStream(stream);
        setWebcamError(null);
      } catch {
        setWebcamError("Izin webcam belum aktif. Izinkan sekali pada browser agar mode kamera bisa otomatis.");
      }
    };

    void ensureWebcam();

    return () => {
      cancelled = true;
    };
  }, [webcamActive, webcamStream, webcamRetryTick]);

  useEffect(() => {
    if (!webcamVideoRef.current || !webcamStream) {
      return;
    }

    webcamVideoRef.current.srcObject = webcamStream;
    const playResult = webcamVideoRef.current.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {
        setWebcamError("Autoplay webcam diblokir browser. Klik layar sekali untuk memulai kamera.");
      });
    }
  }, [webcamStream, webcamActive]);

  useEffect(() => {
    if (!webcamActive || !webcamStream) {
      return;
    }

    const videoTrack = webcamStream.getVideoTracks()[0];
    if (!videoTrack) {
      return;
    }

    const handleEnded = () => {
      setWebcamRetryTick((tick) => tick + 1);
    };

    videoTrack.addEventListener("ended", handleEnded);

    return () => {
      videoTrack.removeEventListener("ended", handleEnded);
    };
  }, [webcamActive, webcamStream]);

  useEffect(() => {
    if (!webcamActive || !videoPlaying) {
      return;
    }

    // Webcam command has highest priority from Sheet.
    stopVideoPlayback(false);
  }, [webcamActive, videoPlaying]);

  useEffect(() => {
    if (!webcamActive || isFullscreen) {
      return;
    }

    // Best-effort auto fullscreen for TV display mode.
    void requestBestEffortFullscreen(document.documentElement);
  }, [webcamActive, isFullscreen]);

  useEffect(() => {
    return () => {
      webcamStream?.getTracks().forEach((track) => track.stop());
    };
  }, [webcamStream]);

  useEffect(() => {
    if (youtubePageModeActive || webcamActive || !video?.enabled || !video.url || playedVideoIds.has(video.id) || blockedVideoIds.has(video.id) || videoPlaying) {
      return;
    }

    // Always prioritize the newest unplayed link from Sheet.
    setActiveVideoId(video.id);
    setVideoMuted(true);
    setVideoErrorNotice(null);
    setVideoPlaying(true);
  }, [video, playedVideoIds, blockedVideoIds, videoPlaying, videoRetryTick, webcamActive, youtubePageModeActive]);

  useEffect(() => {
    if (youtubePageModeActive || webcamActive || !video?.enabled || !video.url || !videoPlaying || !activeVideoId) {
      return;
    }

    if (video.id === activeVideoId) {
      return;
    }

    if (playedVideoIds.has(video.id) || blockedVideoIds.has(video.id)) {
      return;
    }

    // New link from Sheet should instantly replace currently playing media.
    setActiveVideoId(video.id);
    setVideoMuted(true);
    setVideoErrorNotice(null);
  }, [video, videoPlaying, activeVideoId, playedVideoIds, blockedVideoIds, webcamActive, youtubePageModeActive]);

  useEffect(() => {
    if (!youtubePageModeActive || !videoPlaying) {
      return;
    }

    stopVideoPlayback(false);
  }, [youtubePageModeActive, videoPlaying]);

  const prayers = useMemo(() => getPrayerTimes(now), [now]);
  const nextPrayer = useMemo(() => getNextPrayer(now), [now]);
  const perincianSlide3 = useMemo(
    () => ({
      kasUtama: latestTransactionsByKas(perincianItems, ["KAS UTAMA", "KAS KELUAR UTAMA"], 2),
      kasKonsumsi: latestTransactionsByKas(perincianItems, ["KAS KONSUMSI", "KAS KELUAR KONSUMSI"], 2),
      kasKegiatanTpa: latestTransactionsByKas(perincianItems, ["KAS KEGIATAN TPA", "KAS KELUAR KEGIATAN TPA"], 2),
    }),
    [perincianItems],
  );
  const perincianSlide4 = useMemo(
    () => ({
      kasKebersihan: latestTransactionsByKas(perincianItems, ["KAS KEBERSIHAN", "KAS KELUAR KEBERSIHAN"], 2),
      kasAkomodasiUstadz: latestTransactionsByKas(perincianItems, ["KAS AKOMODASI USTADZ", "KAS AKOMODASI USTAZ", "KAS KELUAR AKOMODASI USTADZ", "KAS KELUAR AKOMODASI USTAZ"], 2),
      kasKhatibJumat: latestTransactionsByKas(perincianItems, [
        "KAS KHATIB JUM'AT",
        "KAS KHATIB JUMAT",
        "KAS KHOTIB JUM'AT",
        "KAS KHOTIB JUMAT",
        "KAS KELUAR KHATIB JUM'AT",
        "KAS KELUAR KHATIB JUMAT",
        "KAS KELUAR KHOTIB JUM'AT",
        "KAS KELUAR KHOTIB JUMAT",
      ], 2),
    }),
    [perincianItems],
  );

  const calmDurationMinutes = Math.max(0, quietMinutes);
  const iqomahCountdownDurationMinutes = Math.max(0, iqomahCountdownMinutes);

  const quietWindowInfo = useMemo(() => {
    for (const prayer of prayers.list) {
      const prayerCalmMinutes = getPrayerCalmDurationMinutes(prayer.name, prayer.time, calmDurationMinutes);
      const effectiveIqomahCountdownMinutes = iqomahCountdownDurationMinutes;

      const start = prayer.time;
      const initialQuietEnd = addMinutes(start, INITIAL_QUIET_MINUTES);
      const countdownEnd = addMinutes(initialQuietEnd, Math.max(0, effectiveIqomahCountdownMinutes));
      const secondQuietEnd = addMinutes(countdownEnd, Math.max(0, prayerCalmMinutes));

      if (isWithinRange(now, start, initialQuietEnd)) {
        return {
          prayer,
          phase: "initial_quiet",
          phaseEnd: initialQuietEnd,
          countdownEnd,
          secondQuietEnd,
        } satisfies QuietWindowInfo;
      }

      if (effectiveIqomahCountdownMinutes > 0 && isWithinRange(now, initialQuietEnd, countdownEnd)) {
        return {
          prayer,
          phase: "iqomah_countdown",
          phaseEnd: countdownEnd,
          countdownEnd,
          secondQuietEnd,
        } satisfies QuietWindowInfo;
      }

      if (prayerCalmMinutes > 0 && isWithinRange(now, countdownEnd, secondQuietEnd)) {
        return {
          prayer,
          phase: "post_iqomah_quiet",
          phaseEnd: secondQuietEnd,
          countdownEnd,
          secondQuietEnd,
        } satisfies QuietWindowInfo;
      }
    }

    return null;
  }, [prayers, now, calmDurationMinutes, iqomahCountdownDurationMinutes]);

  const currentPrayer = quietWindowInfo?.prayer || null;
  const silentMode = quietWindowInfo?.phase === "initial_quiet" || quietWindowInfo?.phase === "post_iqomah_quiet";

  const iqomahCountdownSeconds = useMemo(() => {
    if (!quietWindowInfo || quietWindowInfo.phase !== "iqomah_countdown") {
      return 0;
    }
    return Math.max(0, differenceInSeconds(quietWindowInfo.phaseEnd, now));
  }, [quietWindowInfo, now]);

  const hideIqomahCountdown = useMemo(() => {
    if (!quietWindowInfo) {
      return false;
    }
    const prayerName = quietWindowInfo.prayer.name.trim().toLowerCase();
    return prayerName === "dzuhur" && now.getDay() === 5;
  }, [quietWindowInfo, now]);

  const autoWebcamWindowActive = useMemo(() => {
    const durationMinutes = Math.max(0, webcamMinutesAfterQuiet);
    if (durationMinutes <= 0) {
      return false;
    }

    return prayers.list.some((prayer) => {
      const prayerName = prayer.name.trim().toLowerCase();
      if (prayerName !== "subuh" && prayerName !== "maghrib" && prayerName !== "isya") {
        return false;
      }

      const prayerCalmMinutes = getPrayerCalmDurationMinutes(prayer.name, prayer.time, calmDurationMinutes);
      const effectiveIqomahCountdownMinutes = iqomahCountdownDurationMinutes;
      const initialQuietEnd = addMinutes(prayer.time, INITIAL_QUIET_MINUTES);
      const countdownEnd = addMinutes(initialQuietEnd, Math.max(0, effectiveIqomahCountdownMinutes));
      const secondQuietEnd = addMinutes(countdownEnd, Math.max(0, prayerCalmMinutes));
      const webcamStart = secondQuietEnd;
      const webcamEnd = addMinutes(webcamStart, durationMinutes);
      return isWithinRange(now, webcamStart, webcamEnd);
    });
  }, [prayers, now, calmDurationMinutes, iqomahCountdownDurationMinutes, webcamMinutesAfterQuiet]);

  useEffect(() => {
    setAutoWebcamActive(autoWebcamWindowActive);
  }, [autoWebcamWindowActive]);

  const countdownToNext = differenceInSeconds(nextPrayer.time, now);
  const countdownFormatted =
    countdownToNext > 0
      ? `${Math.floor(countdownToNext / 3600)}:${String(Math.floor((countdownToNext % 3600) / 60)).padStart(2, "0")}:${String(countdownToNext % 60).padStart(2, "0")}`
      : "0:00:00";

  const markVideoPlayed = (videoId: string | null) => {
    if (!videoId) {
      return;
    }

    setPlayedVideoIds((prev) => {
      const next = new Set(prev);
      next.add(videoId);
      return next;
    });
  };

  const stopVideoPlayback = (markPlayed = true) => {
    if (markPlayed) {
      markVideoPlayed(activeVideoId);
    }
    setVideoPlaying(false);
    setVideoMuted(true);
    setActiveVideoId(null);
    setVideoErrorNotice(null);
  };

  const handleVideoReady = () => {
    if (!activeVideoId) {
      return;
    }

    setVideoErrorCountById((prev) => {
      if (!(activeVideoId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[activeVideoId];
      return next;
    });
    setVideoErrorNotice(null);
  };

  const handleVideoError = async () => {
    if (!activeVideoId) {
      return;
    }

    const failingVideoId = activeVideoId;
    const currentVideo = video && video.id === activeVideoId ? video : null;
    const nextErrorCount = (videoErrorCountById[failingVideoId] ?? 0) + 1;
    setVideoErrorCountById((prev) => ({ ...prev, [failingVideoId]: nextErrorCount }));

    setVideoPlaying(false);
    setVideoMuted(true);
    setActiveVideoId(null);

    if (currentVideo?.platform === "youtube") {
      const status = await checkYoutubeVideoStatus(currentVideo.url);
      if (status?.embeddable === false) {
        setBlockedVideoIds((prev) => {
          const next = new Set(prev);
          next.add(failingVideoId);
          return next;
        });
        setVideoErrorNotice(
          "Live YouTube terbaru menolak embed. Aktifkan opsi Allow embedding pada YouTube Live Control Room, lalu kirim link live baru ke Sheet.",
        );
        return;
      }

      if (status?.liveBroadcastContent === "upcoming") {
        setVideoErrorNotice("Live YouTube terdeteksi belum mulai. Sistem akan mencoba ulang otomatis.");
        window.setTimeout(() => {
          setVideoRetryTick((tick) => tick + 1);
        }, LIVE_RETRY_DELAY_MS);
        return;
      }
    }

    if (nextErrorCount >= MAX_EMBED_RETRIES) {
      setBlockedVideoIds((prev) => {
        const next = new Set(prev);
        next.add(failingVideoId);
        return next;
      });
      setVideoErrorNotice("Link video terbaru gagal diputar berulang kali. Periksa format link, hak embed, lalu update link baru di Sheet.");
      return;
    }

    const retryDelay = currentVideo?.kind === "live" ? LIVE_RETRY_DELAY_MS : DEFAULT_RETRY_DELAY_MS;
    setVideoErrorNotice("Video belum dapat diputar. Sistem akan mencoba ulang otomatis.");
    window.setTimeout(() => {
      setVideoRetryTick((tick) => tick + 1);
    }, retryDelay);
  };

  const formattedLastUpdate = useMemo(() => {
    if (!lastChangedAt) {
      return "";
    }
    return format(new Date(lastChangedAt), "HH:mm:ss");
  }, [lastChangedAt]);

  const zoomOut = () => {
    setDisplayZoom((prev) => Math.max(MIN_ZOOM, Number((prev - ZOOM_STEP).toFixed(2))));
  };

  const zoomIn = () => {
    setDisplayZoom((prev) => Math.min(MAX_ZOOM, Number((prev + ZOOM_STEP).toFixed(2))));
  };

  const toggleFullscreen = async () => {
    try {
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void>;
        webkitFullscreenElement?: Element | null;
      };
      const htmlTarget = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      const stageTarget = (stageRef.current ?? document.documentElement) as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      const active = document.fullscreenElement || doc.webkitFullscreenElement;

      if (!active) {
        if (htmlTarget.requestFullscreen) {
          await htmlTarget.requestFullscreen();
          return;
        }
        if (htmlTarget.webkitRequestFullscreen) {
          await htmlTarget.webkitRequestFullscreen();
          return;
        }
        if (stageTarget.requestFullscreen) {
          await stageTarget.requestFullscreen();
          return;
        }
        if (stageTarget.webkitRequestFullscreen) {
          await stageTarget.webkitRequestFullscreen();
        }
        return;
      }

      if (document.exitFullscreen) {
        await document.exitFullscreen();
        return;
      }
      if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch {
      // Ignore browser API errors to avoid interrupting display flow.
    }
  };

  const viewport = getSafeViewportSize();
  const safeWidth = Math.max(320, viewport.width - SAFE_VIEWPORT_PADDING * 2);
  const safeHeight = Math.max(240, viewport.height - SAFE_VIEWPORT_PADDING * 2);
  const baseScaleX = (safeWidth / DESIGN_WIDTH) * displayZoom * FIT_SAFE_FACTOR;
  const baseScaleY = (safeHeight / DESIGN_HEIGHT) * displayZoom * FIT_SAFE_FACTOR;

  // QJY TV browser needs stretch-fit to avoid side black bars caused by persistent browser chrome.
  const effectiveScaleX = isTvBrowser ? Math.max(0.3, baseScaleX) : Math.max(0.3, Math.min(baseScaleX, baseScaleY));
  const effectiveScaleY = isTvBrowser ? Math.max(0.3, baseScaleY) : Math.max(0.3, Math.min(baseScaleX, baseScaleY));
  const scaledWidth = DESIGN_WIDTH * effectiveScaleX;
  const scaledHeight = DESIGN_HEIGHT * effectiveScaleY;
  const stageFrameStyle = {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    transform: `scale(${effectiveScaleX}, ${effectiveScaleY})`,
    WebkitTransform: `scale(${effectiveScaleX}, ${effectiveScaleY})`,
    transformOrigin: "top left",
    WebkitTransformOrigin: "top left",
  };
  const handleVideoEnded = () => stopVideoPlayback(true);
  const fullSlideTitle =
    slideIndex === 1
      ? "LAPORAN KAS MASUK MINGGUAN"
      : slideIndex === 2
        ? "LAPORAN KAS KELUAR MINGGUAN"
        : slideIndex === 3 || slideIndex === 4
        ? "PERINCIAN PENGELUARAN"
        : slideIndex === 5
          ? "AGENDA MASJID"
          : "INFO TAMBAHAN";

  const agendaItems = useMemo(() => {
    return [...general.agendas].slice(-4).reverse();
  }, [general.agendas]);

  const unifiedFinanceAgendaTextClass = "text-[3.8rem]";

  const renderRealtime = (withDate = true, compact = false) => (
    <div className={cn("rounded-2xl bg-[#062c24]/90 text-right shadow-xl", compact ? "px-5 py-3" : "px-6 py-4")}>
      <div className={cn("font-black leading-none", compact ? "text-[5.2rem]" : "text-[7.2rem]")}>{format(now, "HH:mm:ss")}</div>
      {withDate && (
        <div className={cn("mt-1 font-semibold opacity-90", compact ? "text-[1.85rem]" : "text-[2.5rem]")}>{format(now, "EEEE, dd MMMM yyyy", { locale: id })}</div>
      )}
    </div>
  );

  const renderPerincianBlock = (title: string, items: ReportTxn[], rowCount = 2) => {
    const rows = [...items];
    while (rows.length < rowCount) {
      rows.push({
        tanggal: "-",
        keterangan: "-",
        jumlah: 0,
        namaKas: "",
      });
    }

    return (
      <div className="flex h-full min-h-0 flex-col rounded-xl bg-white p-3 text-black shadow-md">
        <div className="mb-2 inline-block bg-[#003b34] px-4 py-1 text-[2.55rem] font-black text-white">{title}</div>
        <div className={cn("grid min-h-0 flex-1 gap-1", rowCount === 2 ? "grid-rows-2" : "grid-rows-3")}>
          {rows.slice(0, rowCount).map((item, index) => {
            const isEmpty = item.keterangan === "-" && item.tanggal === "-";
            return (
              <div
                key={`${title}-${index}`}
                className="grid grid-cols-[360px_1fr_250px] items-center gap-3 border-b border-zinc-400 py-1 text-[3.1rem] font-black"
              >
                <div>{dateOnly(item.tanggal)}</div>
                <div className="truncate">{(item.keterangan || "-").toUpperCase()}</div>
                <div className={cn("text-right", isEmpty ? "text-zinc-500" : "text-red-500")}>
                  {isEmpty ? "-" : item.jumlah.toLocaleString("id-ID")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFinanceNotice = (large = false) => (
    <div className={cn("overflow-hidden bg-[#006b5f] font-black text-white", large ? "py-1 text-[3.6rem]" : "py-1 text-[2rem]")}>
      <div className={cn("animate-marquee-notice whitespace-nowrap", large ? "px-5" : "px-3")}>{FINANCE_NOTICE_TEXT}</div>
    </div>
  );

  const renderAmountLine = (
    label: string,
    value: number,
    valueClassName: string,
    textClassName = "text-[3.8rem]",
    withDivider = false,
  ) => (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_2.8rem_17rem] items-center gap-2 py-1.5 leading-tight font-black",
        withDivider && "border-b border-zinc-300",
        textClassName,
      )}
    >
      <span className="truncate">• {label}</span>
      <span className="text-center">:</span>
      <span className={cn("truncate text-right", valueClassName)}>{value.toLocaleString("id-ID")}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-black font-sans text-white">
      <div className="flex h-full w-full items-start justify-center">
        <div
          style={{
            width: scaledWidth,
            height: scaledHeight,
          }}
        >
        <div
          ref={stageRef}
          className="relative overflow-hidden bg-[#062c24]"
          style={stageFrameStyle}
        >
          {youtubePageModeActive ? (
            <div className="relative h-full w-full bg-black">
              <ReactPlayer
                src={youtubePageModeUrl}
                playing
                muted
                controls
                width="100%"
                height="100%"
                playsInline
                onError={() => setVideoErrorNotice("Halaman/live YouTube dari mode akun tidak dapat diputar. Coba ganti tautan akun/channel di CSV.")}
              />
              <div className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 rounded-xl bg-black/60 px-5 py-2 text-xl font-bold text-white">
                MODE AKUN YOUTUBE AKTIF
              </div>
            </div>
          ) : webcamActive ? (
            <div className="relative h-full w-full bg-black">
              <video
                ref={webcamVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute top-1/2 left-1/2"
                style={{
                  minWidth: "100%",
                  minHeight: "100%",
                  width: "auto",
                  height: "auto",
                  transform: "translate(-50%, -50%)",
                  objectFit: "cover",
                  backgroundColor: "#000",
                }}
              />
              {webcamError && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-xl bg-black/75 px-6 py-4 text-2xl font-bold text-white">
                  {webcamError}
                </div>
              )}
            </div>
          ) : silentMode && !videoPlaying ? (
            <div className="flex h-full flex-col items-center justify-center px-8">
              <div className="mb-6 text-center text-5xl font-black tracking-wide text-[#00ff88]">WAKTU SHOLAT</div>
              <div className="mb-10 text-[8rem] leading-none font-black">{format(now, "HH:mm:ss")}</div>
              <div className="mb-6 grid w-full grid-cols-5 gap-4">
                {prayers.list.map((prayer) => (
                  <div
                    key={prayer.name}
                    className={cn(
                      "rounded-3xl border border-white/20 px-4 py-5 text-center transition",
                      prayer.name === currentPrayer?.name ? "bg-white text-[#062c24]" : "bg-white/5",
                    )}
                  >
                    <div className="text-2xl font-bold">{prayer.name.toUpperCase()}</div>
                    <div className="text-4xl font-black">{prayer.formatted}</div>
                  </div>
                ))}
              </div>
              {!hideIqomahCountdown && iqomahCountdownSeconds > 0 && (
                <div className="text-center">
                  <div className="text-[2.8rem] font-black uppercase tracking-wide text-emerald-200">WAKTU IQOMAH</div>
                  <div className="mt-1 text-[7rem] leading-none font-black text-[#00ff88]">{formatClockCountdown(iqomahCountdownSeconds)}</div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div
                className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url('${backgroundUrl}')`,
                  opacity: backgroundOpacity,
                }}
              />

              <div className="relative z-10 flex h-full flex-col">
                {videoPlaying && video && activeVideoId === video.id && (
                  <div className="absolute inset-0 z-50 bg-black">
                    {video.platform === "facebook" ? (
                      <iframe
                        key={video.id}
                        src={buildFacebookEmbedUrl(video.url)}
                        className="h-full w-full border-0"
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                        allowFullScreen
                        referrerPolicy="origin-when-cross-origin"
                        title="Facebook video player"
                        onLoad={handleVideoReady}
                      />
                    ) : video.platform === "twitch" ? (
                      <iframe
                        key={video.id}
                        src={buildTwitchEmbedUrl(video.url, videoMuted)}
                        className="h-full w-full border-0"
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowFullScreen
                        title="Twitch live player"
                        onLoad={handleVideoReady}
                      />
                    ) : (
                      <ReactPlayer
                        key={video.id}
                        src={video.url}
                        playing={videoPlaying}
                        muted={videoMuted}
                        controls={false}
                        width="100%"
                        height="100%"
                        playsInline
                        onReady={handleVideoReady}
                        onEnded={handleVideoEnded}
                        onError={handleVideoError}
                        config={
                          {
                            youtube: {
                              rel: 0,
                              iv_load_policy: 3,
                              enablejsapi: 1,
                              playsinline: 1,
                              modestbranding: 1,
                              origin: window.location.origin,
                            },
                            facebook: {
                              appId: import.meta.env.VITE_FACEBOOK_APP_ID,
                              attributes: {
                                autoplay: true,
                                muted: true,
                              },
                            },
                            twitch: {
                              options: {
                                parent: getTwitchParents(),
                                autoplay: true,
                                muted: true,
                              },
                            },
                          } as any
                        }
                      />
                    )}

                    {video.platform !== "facebook" && video.platform !== "twitch" && videoMuted && (
                      <button
                        onClick={() => setVideoMuted(false)}
                        className="absolute bottom-6 right-6 rounded-xl bg-white/20 px-5 py-3 text-2xl font-black backdrop-blur hover:bg-white/40"
                      >
                        Aktifkan Suara
                      </button>
                    )}

                    <button
                      onClick={() => stopVideoPlayback(true)}
                      className="absolute top-5 right-5 rounded-xl bg-white/20 px-5 py-3 text-2xl font-black backdrop-blur hover:bg-white/40"
                    >
                      Tutup
                    </button>
                  </div>
                )}

                {slideIndex === 0 ? (
                  <>
                    <header className="flex items-center justify-between border-b border-white/10 bg-[#062c24]/62 px-12 py-6 backdrop-blur-[2px]">
                      <div>
                        <h1 className="text-[4.4rem] font-black tracking-tight">MASJID AL-MUTTAQIN</h1>
                        <p className="text-[2.8rem] font-black opacity-100">Klegen RT 15/ RW 08, Sendangsari, Pengasih, Kulon Progo, Yogyakarta 55652.</p>
                      </div>
                      {renderRealtime(true)}
                    </header>

                    <div className="flex min-h-0 flex-1 overflow-hidden">
                      <aside className="flex h-full w-[30%] shrink-0 flex-col border-r border-white/10 bg-[#062c24]/56 px-8 py-6 backdrop-blur-[2px]">
                        <div className="rounded-3xl border border-emerald-300/30 bg-white/10 p-5 text-center">
                          <div className="text-[2.9rem] font-bold uppercase opacity-80">Menuju {nextPrayer.name}</div>
                          <div className="text-[5.5rem] font-black text-[#00ff88]">{countdownFormatted}</div>
                        </div>

                        <h2 className="mt-5 mb-4 flex items-center gap-2 text-[3.5rem] font-black">
                          <Icons.Clock /> Jadwal Shalat
                        </h2>
                        <div className="grid min-h-0 flex-1 grid-rows-5 gap-4">
                          {prayers.list.map((prayer) => {
                            const isNext = prayer.name === nextPrayer.name;
                            return (
                              <div key={prayer.name} className={cn("flex items-center justify-between rounded-2xl px-8 py-6 transition", isNext ? "bg-[#7dff9b]" : "bg-black/30")}>
                                <span className="text-[3.4rem] font-black" style={isNext ? { color: "#000000", textShadow: "none" } : undefined}>
                                  {prayer.name.toUpperCase()}
                                </span>
                                <span className="text-[4.4rem] font-black" style={isNext ? { color: "#000000", textShadow: "none" } : undefined}>
                                  {prayer.formatted}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </aside>

                      <main className="min-h-0 flex-1 overflow-hidden p-8">
                        <section className="grid h-full grid-rows-2 gap-4">
                          <div className="flex flex-col items-center justify-center rounded-[2rem] border-4 border-emerald-300 bg-black/38 px-12 text-center text-white shadow-2xl backdrop-blur-[3px]">
                            <div className="mb-4 text-[3.6rem] font-extrabold uppercase tracking-wide">Khatib Jum'at</div>
                            <div className="mb-3 rounded-xl bg-emerald-100 px-6 py-2 text-[2.3rem] font-extrabold text-emerald-900">{fridayLabel(general.khatibDate)}</div>
                            <div className="text-[8rem] font-black leading-tight">{general.khatib}</div>
                          </div>
                          <div className="flex flex-col items-center justify-center rounded-[2rem] border-4 border-emerald-300 bg-black/38 px-12 text-center text-white shadow-2xl backdrop-blur-[3px]">
                            <div className="mb-4 text-[3.6rem] font-extrabold uppercase tracking-wide">Muadzin</div>
                            <div className="mb-3 rounded-xl bg-emerald-100 px-6 py-2 text-[2.3rem] font-extrabold text-emerald-900">{fridayLabel(general.muazinDate)}</div>
                            <div className="text-[8rem] font-black leading-tight">{general.muazin}</div>
                          </div>
                        </section>
                      </main>
                    </div>

                    <footer className="flex h-[7.6rem] items-center gap-4 border-t-4 border-[#00ff88] bg-emerald-500 px-6">
                      {formattedLastUpdate && <div className="rounded-lg bg-[#062c24] px-4 py-2 text-[1.2rem] font-bold uppercase">Update data: {formattedLastUpdate}</div>}
                      <div className="animate-marquee whitespace-nowrap py-1 text-[3.6rem] font-black text-black">
                        {runningText ||
                          "Selamat datang di Masjid Al-Muttaqin | Mohon luruskan dan rapatkan shaf | Matikan alat komunikasi saat shalat berlangsung"}
                      </div>
                    </footer>
                  </>
                ) : (
                  <div className="flex h-full flex-col">
                    <header className="flex items-center justify-between border-b border-white/10 bg-black/45 px-10 py-5 backdrop-blur-[2px]">
                      <h2 className="rounded-2xl bg-white px-7 py-3 text-[4rem] font-black uppercase text-black">{fullSlideTitle}</h2>
                      {renderRealtime(false, true)}
                    </header>

                    <main className="min-h-0 flex-1 overflow-hidden p-8">
                      {slideIndex === 1 && (
                        <section className="grid h-full min-h-0 grid-rows-[auto_auto_1fr] gap-3">
                          <div className="w-full rounded-xl bg-[#002f2a] px-10 py-3 text-center">
                            <div className="text-[2.6rem] font-bold uppercase tracking-wide text-emerald-200">SALDO AWAL</div>
                            <div className="mt-1 text-[5.2rem] font-black text-[#39ff14]">RP {laporanSummary.saldoAwal.toLocaleString("id-ID")}</div>
                          </div>

                          <div className="rounded-xl bg-white p-6 text-black">
                            <div className="text-[3.8rem] font-black text-[#15803d]">TOTAL KAS MASUK : RP {laporanSummary.totalKasMasuk.toLocaleString("id-ID")}</div>
                            <div className="mt-3 font-black">
                              {renderAmountLine("KAS MASUK INFAQ HARIAN", laporanSummary.rincianMasuk.infakHarian, "text-[#15803d]", unifiedFinanceAgendaTextClass, true)}
                              {renderAmountLine("KAS MASUK INFAQ JUM'AT", laporanSummary.rincianMasuk.infakJumat, "text-[#15803d]", unifiedFinanceAgendaTextClass, true)}
                              {renderAmountLine("KAS MASUK KONSUMSI", laporanSummary.rincianMasuk.kasMasukKonsumsi, "text-[#15803d]", unifiedFinanceAgendaTextClass, true)}
                            </div>
                          </div>

                          <div />
                        </section>
                      )}

                      {slideIndex === 2 && (
                        <section className="grid h-full min-h-0 content-start grid-rows-[auto_auto] gap-3">
                          <div className="rounded-xl bg-white p-4 text-black">
                            <div className="text-[4.2rem] font-black text-[#ef4444]">TOTAL KAS KELUAR : RP {laporanSummary.totalKasKeluar.toLocaleString("id-ID")}</div>
                            <div className="mt-2">
                              {renderAmountLine("KAS KELUAR UTAMA", laporanSummary.rincianKeluar.kasUtama, "text-[#ef4444]", "text-[4.2rem]", true)}
                              {renderAmountLine("KAS KELUAR KONSUMSI", laporanSummary.rincianKeluar.kasKeluarKonsumsi, "text-[#ef4444]", "text-[4.2rem]", true)}
                              {renderAmountLine("KAS KELUAR KEGIATAN TPA", laporanSummary.rincianKeluar.kasKegiatanTpa, "text-[#ef4444]", "text-[4.2rem]", true)}
                              {renderAmountLine("KAS KELUAR KEBERSIHAN", laporanSummary.rincianKeluar.kasKebersihan, "text-[#ef4444]", "text-[4.2rem]", true)}
                              {renderAmountLine("KAS KELUAR AKOMODASI USTADZ", laporanSummary.rincianKeluar.kasAkomodasiUstadz, "text-[#ef4444]", "text-[4.2rem]", true)}
                              {renderAmountLine("KAS KELUAR KHATIB JUM'AT", laporanSummary.rincianKeluar.kasKhatibJumat, "text-[#ef4444]", "text-[4.2rem]", true)}
                            </div>
                          </div>

                          <div className="w-full self-start rounded-xl bg-[#002f2a] px-12 py-3 text-center">
                            <div className="text-[2.4rem] font-bold uppercase tracking-wide text-emerald-200">TOTAL SALDO AKHIR</div>
                            <div className="mt-1 text-[5.6rem] font-black text-[#39ff14]">RP {laporanSummary.totalSaldo.toLocaleString("id-ID")}</div>
                          </div>
                        </section>
                      )}

                      {slideIndex === 3 && (
                        <section className="grid h-full min-h-0 grid-rows-[1fr_1fr_1fr_auto] gap-3">
                          {renderPerincianBlock("1. KAS UTAMA", perincianSlide3.kasUtama, 2)}
                          {renderPerincianBlock("2. KAS KONSUMSI", perincianSlide3.kasKonsumsi, 2)}
                          {renderPerincianBlock("3. KAS KEGIATAN TPA", perincianSlide3.kasKegiatanTpa, 2)}
                          <div className="-mx-8 -mb-8 mt-0">{renderFinanceNotice(true)}</div>
                        </section>
                      )}

                      {slideIndex === 4 && (
                        <section className="grid h-full min-h-0 grid-rows-[1fr_1fr_1fr_auto] gap-3">
                          {renderPerincianBlock("4. KAS KEBERSIHAN", perincianSlide4.kasKebersihan, 2)}
                          {renderPerincianBlock("5. KAS AKOMODASI USTADZ", perincianSlide4.kasAkomodasiUstadz, 2)}
                          {renderPerincianBlock("6. KAS KHATIB JUM'AT", perincianSlide4.kasKhatibJumat, 2)}
                          <div className="-mx-8 -mb-8 mt-0">{renderFinanceNotice(true)}</div>
                        </section>
                      )}

                      {slideIndex === 5 && (
                        <section className="grid h-full min-h-0 grid-rows-4 gap-3">
                          {agendaItems.length > 0 ? (
                            agendaItems.map((item, index) => (
                              <div key={`${item.Agenda}-${item.Tanggal}-${index}`} className="flex min-h-0 flex-col justify-center rounded-xl bg-white p-5 text-black">
                                <div className={cn("font-black leading-tight", unifiedFinanceAgendaTextClass)}>{(item.Agenda || "-").toUpperCase()}</div>
                                <div className="mt-2 text-[2.4rem] font-bold leading-tight text-zinc-700">
                                  {(item.Hari || "-").toUpperCase()} {dateOnly(item.Tanggal || "")} | {(item.Waktu || "-").toUpperCase()} | {(item.Tempat || "-").toUpperCase()}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="col-span-full flex items-center justify-center rounded-xl bg-white text-[3.2rem] font-black text-zinc-500">
                              BELUM ADA AGENDA
                            </div>
                          )}
                        </section>
                      )}

                      {slideIndex === 6 && (
                        <section className="h-full min-h-0 overflow-hidden rounded-xl bg-white p-6 text-black">
                          {extraSlide.imageUrl ? (
                            <div className="h-full w-full">
                              <img src={extraSlide.imageUrl} alt="Extra Slide" className="h-full w-full object-contain" />
                            </div>
                          ) : (
                            <div className="h-full overflow-hidden rounded-lg bg-white p-5 text-[3.1rem] font-black leading-snug text-black">
                              {(extraSlide.note || "INFO TAMBAHAN BELUM DIISI").toUpperCase()}
                            </div>
                          )}
                        </section>
                      )}
                    </main>
                  </div>
                )}

                {videoErrorNotice && (
                  <div className="pointer-events-none absolute bottom-24 right-4 z-40 max-w-3xl rounded-xl bg-black/70 px-4 py-3 text-xl font-semibold text-white backdrop-blur">
                    {videoErrorNotice}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      <div
        className="fixed z-[120] flex items-center gap-1.5 opacity-18 transition-opacity duration-300 hover:opacity-70 focus-within:opacity-70"
        style={{
          right: 12,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-md bg-black/35 px-2.5 py-1.5 text-[0.95rem] font-bold text-white"
          aria-label="Toggle fullscreen"
        >
          {isFullscreen ? "EXIT" : "FULL"}
        </button>
        <button
          type="button"
          onClick={zoomOut}
          className="rounded-md bg-black/35 px-3 py-1.5 text-[1.1rem] font-bold text-white"
          aria-label="Zoom out"
        >
          -
        </button>
        <div className="min-w-14 rounded-md bg-black/35 px-2 py-1.5 text-center text-[0.72rem] font-bold text-white">{Math.round(displayZoom * 100)}%</div>
        <button
          type="button"
          onClick={zoomIn}
          className="rounded-md bg-black/35 px-3 py-1.5 text-[1.1rem] font-bold text-white"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
}
