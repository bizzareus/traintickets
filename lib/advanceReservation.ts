import moment from "moment";

export const ADVANCE_RESERVATION_DAYS = 60;
const IST_OFFSET_MINUTES = 330;
const BOOKING_OPEN_HOUR = 8;
const DATE_FORMAT = "YYYY-MM-DD";

/** The travel day is excluded: D opens for booking at 08:00 IST on D minus 60 days. */
export function getAdvanceReservationWindow(now = new Date()) {
  const istNow = moment(now).utcOffset(IST_OFFSET_MINUTES);
  const today = istNow.clone().startOf("day");
  const opening = today.clone().hour(BOOKING_OPEN_HOUR);
  const beforeOpening = istNow.isBefore(opening);
  return {
    minDate: today.format(DATE_FORMAT),
    maxDate: today
      .clone()
      .add(ADVANCE_RESERVATION_DAYS - Number(beforeOpening), "days")
      .format(DATE_FORMAT),
    // Midnight advances the lower limit; 08:00 unlocks one more journey date.
    refreshAt: (beforeOpening
      ? opening
      : today.clone().add(1, "day")
    ).valueOf(),
  };
}

/** Also validates URL-prefilled dates before starting or replacing a search. */
export function getJourneyDateError(
  ymd: string,
  now = new Date(),
): string | null {
  const date = moment(ymd, DATE_FORMAT, true);
  if (!date.isValid()) return "Select a valid journey date.";
  const { minDate, maxDate } = getAdvanceReservationWindow(now);
  if (ymd < minDate) return "Select today or a later journey date.";
  if (ymd > maxDate) {
    const opensOn = date
      .clone()
      .subtract(ADVANCE_RESERVATION_DAYS, "days")
      .format("D MMM YYYY");
    return `Booking for ${date.format("D MMM YYYY")} opens on ${opensOn} at 8:00 AM IST. Please select a date within the 60-day advance booking window.`;
  }
  return null;
}
