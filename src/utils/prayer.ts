import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";

// Pinpoint tuned for Klegen RT 15/RW 08, Sendangsari, Pengasih, Kulon Progo.
const PENGASIH_COORDINATES = new Coordinates(-7.8589, 110.1308);

function getPengasihPrayerTimes(now: Date) {
  const params = CalculationMethod.Singapore();
  params.madhab = Madhab.Shafi;
  return new PrayerTimes(PENGASIH_COORDINATES, now, params);
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export type PrayerItem = {
  name: string;
  time: Date;
  formatted: string;
};

export function getPrayerTimes(now: Date) {
  const prayerTimes = getPengasihPrayerTimes(now);
  const list: PrayerItem[] = [
    { name: "Subuh", time: prayerTimes.fajr, formatted: formatTime(prayerTimes.fajr) },
    { name: "Dzuhur", time: prayerTimes.dhuhr, formatted: formatTime(prayerTimes.dhuhr) },
    { name: "Ashar", time: prayerTimes.asr, formatted: formatTime(prayerTimes.asr) },
    { name: "Maghrib", time: prayerTimes.maghrib, formatted: formatTime(prayerTimes.maghrib) },
    { name: "Isya", time: prayerTimes.isha, formatted: formatTime(prayerTimes.isha) },
  ];

  return { list };
}

export function getNextPrayer(now: Date): PrayerItem {
  const todayPrayers = getPrayerTimes(now).list;
  const upcoming = todayPrayers.find((item) => item.time > now);

  if (upcoming) {
    return upcoming;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowSubuh = getPengasihPrayerTimes(tomorrow).fajr;

  return {
    name: "Subuh",
    time: tomorrowSubuh,
    formatted: formatTime(tomorrowSubuh),
  };
}
