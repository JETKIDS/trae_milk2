import moment from "moment";

export const toDayOfWeek = (date: string | Date) => moment(date).day();

export const parseYearMonthFromDate = (date: string | Date) => {
  const m = moment(date);
  return {
    year: m.year(),
    month: m.month() + 1,
  };
};

export const getPrevYearMonth = (year: number, month: number) => {
  const date = moment(`${year}-${String(month).padStart(2, "0")}-01`).subtract(1, "month");
  return {
    year: Number(date.format("YYYY")),
    month: Number(date.format("MM")),
  };
};

