(() => {
  const DEFAULT_DAYS = 365;
  const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";
  const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function calendarDay(value) {
    const match = ISO_DATE.exec(String(value || ""));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const millis = Date.UTC(year, month - 1, day);
    const parsed = new Date(millis);
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return null;
    return Math.floor(millis / 86400000);
  }

  function referenceISO(referenceDate = new Date(), timezone = DEFAULT_TIMEZONE) {
    if (typeof referenceDate === "string") {
      if (calendarDay(referenceDate) === null) throw new Error("Fecha de referencia inválida.");
      return referenceDate;
    }
    const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    if (Number.isNaN(date.valueOf())) throw new Error("Fecha de referencia inválida.");
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function getRenspaValidity(producer, referenceDate = new Date(), options = {}) {
    const timezone = options.timezone || DEFAULT_TIMEZONE;
    const windowDays = Number.isInteger(options.days) ? options.days : DEFAULT_DAYS;
    const reference = referenceISO(referenceDate, timezone);
    const update = producer?.ultimaActualizacionISO || null;
    const updateDay = calendarDay(update);
    const daysSinceUpdate = updateDay === null ? null : calendarDay(reference) - updateDay;
    const reason = daysSinceUpdate === null ? "sin_fecha" : daysSinceUpdate < 0 ? "fecha_futura" : daysSinceUpdate <= windowDays ? "within_window" : "expired";
    const status = reason === "sin_fecha" || reason === "expired" ? "no_vigente" : "vigente";
    return { status, label: status === "vigente" ? "Activo vigente" : "Activo no vigente", daysSinceUpdate, reason };
  }

  globalThis.SENASA_RenspaValidity = Object.freeze({ getRenspaValidity, referenceISO, calendarDay });
})();
