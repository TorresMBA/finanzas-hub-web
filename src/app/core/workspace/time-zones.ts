/** Time zones offered in the application: the Americas and Spain. The API accepts any IANA identifier. */
const COMMON_TIME_ZONES = [
  'America/Lima',
  'America/Bogota',
  'America/Guayaquil',
  'America/Mexico_City',
  'America/La_Paz',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/Madrid',
  'UTC',
] as const;

/** The zone of this device, or Lima when the browser does not say. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Lima';
  } catch {
    return 'America/Lima';
  }
}

/** The common zones plus the one of this device, so the default of a form is always among its options. */
export const TIME_ZONES: readonly string[] = [...new Set([browserTimeZone(), ...COMMON_TIME_ZONES])].sort();

/** The same list with one more zone in it, for a workspace that was set up from somewhere else. */
export function timeZonesWith(zone: string | undefined): readonly string[] {
  return zone && !TIME_ZONES.includes(zone) ? [...TIME_ZONES, zone].sort() : TIME_ZONES;
}
