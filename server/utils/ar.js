function getPrevYearMonth(y, m) {
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function getPaymentsSum(db, customerId, y, m) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COALESCE(SUM(amount), 0) AS total FROM ar_payments WHERE customer_id = ? AND year = ? AND month = ?', [customerId, y, m], (err, row) => {
      if (err) return reject(err);
      resolve(row ? (row.total || 0) : 0);
    });
  });
}

function isInvoiceConfirmed(db, customerId, y, m) {
  return new Promise((resolve, reject) => {
    db.get('SELECT status FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?', [customerId, y, m], (err, row) => {
      if (err) return reject(err);
      resolve(row && String(row.status) === 'confirmed');
    });
  });
}

module.exports = { getPrevYearMonth, getPaymentsSum, isInvoiceConfirmed };


