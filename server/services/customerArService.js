const moment = require('moment');
const { withDb, dbGet } = require('../utils/db');
const { getPrevYearMonth, getPaymentsSum } = require('../utils/ar');
const {
  parseCustomerId,
  parseYearMonth,
} = require('../validation/parsers');
const {
  computeMonthlyTotal,
  ensureLedgerInitialized,
} = require('./customerLedgerService');

const getArSummary = async (customerId, year, month) => {
  const cid = parseCustomerId(customerId);
  const { year: y, month: m } = parseYearMonth(year, month);

  await ensureLedgerInitialized();

  return withDb(async (db) => {
    const { year: prevYear, month: prevMonth } = getPrevYearMonth(y, m);

    const roundingRow = await dbGet(
      db,
      'SELECT rounding_enabled FROM customer_settings WHERE customer_id = ?',
      [cid],
    );
    const roundingEnabled = roundingRow ? roundingRow.rounding_enabled === 1 : true;

    const invoiceRow = await dbGet(
      db,
      'SELECT amount FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?',
      [cid, prevYear, prevMonth],
    );

    let prevInvoiceAmount;
    if (invoiceRow && typeof invoiceRow.amount === 'number') {
      prevInvoiceAmount = invoiceRow.amount;
    } else {
      const totalRaw = await computeMonthlyTotal(db, cid, prevYear, prevMonth);
      prevInvoiceAmount = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;
    }

    const prevPaymentAmount = await getPaymentsSum(db, cid, prevYear, prevMonth);
    const currentPaymentAmount = await getPaymentsSum(db, cid, y, m);
    const carryoverAmount = (prevInvoiceAmount || 0) - currentPaymentAmount;

    return {
      prev_year: prevYear,
      prev_month: prevMonth,
      prev_invoice_amount: prevInvoiceAmount,
      prev_payment_amount: prevPaymentAmount,
      current_payment_amount: currentPaymentAmount,
      carryover_amount: carryoverAmount,
    };
  });
};

const getArSummaryConsistency = async (customerId, year, month) => {
  const cid = parseCustomerId(customerId);
  const { year: y, month: m } = parseYearMonth(year, month);

  await ensureLedgerInitialized();

  return withDb(async (db) => {
    const prevMoment = moment(`${y}-${String(m).padStart(2, '0')}-01`).subtract(1, 'month');
    const prevYear = parseInt(prevMoment.format('YYYY'), 10);
    const prevMonth = parseInt(prevMoment.format('MM'), 10);

    const roundingRow = await dbGet(
      db,
      'SELECT rounding_enabled FROM customer_settings WHERE customer_id = ?',
      [cid],
    );
    const roundingEnabled = roundingRow ? roundingRow.rounding_enabled === 1 : true;

    const totalRaw = await computeMonthlyTotal(db, cid, prevYear, prevMonth);
    const expectedAmount = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;

    const invoiceRow = await dbGet(
      db,
      'SELECT amount FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?',
      [cid, prevYear, prevMonth],
    );
    const arInvoiceAmount = invoiceRow?.amount ?? null;

    const prevPaymentRow = await dbGet(
      db,
      'SELECT COALESCE(SUM(amount), 0) AS total FROM ar_payments WHERE customer_id = ? AND year = ? AND month = ?',
      [cid, prevYear, prevMonth],
    );
    const prevPaymentTotal = prevPaymentRow?.total || 0;

    const cumulativeInvoiceRow = await dbGet(
      db,
      'SELECT COALESCE(SUM(amount), 0) AS total FROM ar_invoices WHERE customer_id = ? AND (year < ? OR (year = ? AND month <= ?))',
      [cid, prevYear, prevYear, prevMonth],
    );
    const cumulativePaymentRow = await dbGet(
      db,
      'SELECT COALESCE(SUM(amount), 0) AS total FROM ar_payments WHERE customer_id = ? AND (year < ? OR (year = ? AND month <= ?))',
      [cid, prevYear, prevYear, prevMonth],
    );

    const carryoverAmount = (cumulativeInvoiceRow?.total || 0) - (cumulativePaymentRow?.total || 0);

    const prevInvoiceAmountFromSummary = arInvoiceAmount ?? totalRaw;

    return {
      prevYear,
      prevMonth,
      rounding_enabled: Boolean(roundingEnabled),
      totalRaw,
      expectedAmount,
      arInvoiceAmount,
      arSummaryPrevInvoiceAmount: prevInvoiceAmountFromSummary,
      carryoverAmountFromSummary: carryoverAmount,
      prevPaymentTotal,
      isPrevInvoiceEqualToExpected: arInvoiceAmount === null ? false : arInvoiceAmount === expectedAmount,
      isSummaryUsingARAmount: arInvoiceAmount === null
        ? prevInvoiceAmountFromSummary === totalRaw
        : prevInvoiceAmountFromSummary === arInvoiceAmount,
    };
  });
};

module.exports = {
  getArSummary,
  getArSummaryConsistency,
};

