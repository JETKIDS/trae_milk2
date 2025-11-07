const {
  withDb,
  dbRun,
} = require('../utils/db');

const toInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const ensureValidUpdates = (updates) => {
  if (!Array.isArray(updates) || updates.length === 0) {
    const error = new Error('更新データが無効です');
    error.status = 400;
    throw error;
  }

  updates.forEach((update) => {
    const id = toInt(update.id);
    const order = toInt(update.delivery_order);
    if (!id || order === null) {
      const error = new Error('更新データの形式が不正です');
      error.status = 400;
      throw error;
    }
  });
};

const bulkUpdateDeliveryOrder = async (updates) => withDb(async (db) => {
  ensureValidUpdates(updates);

  await dbRun(db, 'BEGIN TRANSACTION');
  try {
    for (const update of updates) {
      await dbRun(
        db,
        'UPDATE customers SET delivery_order = ? WHERE id = ?',
        [toInt(update.delivery_order), toInt(update.id)],
      );
    }
    await dbRun(db, 'COMMIT');
  } catch (error) {
    await dbRun(db, 'ROLLBACK');
    throw error;
  }

  return { message: '配達順が正常に更新されました', updatedCount: updates.length };
});

const updateDeliveryOrderForCourse = async (courseId, customers) => withDb(async (db) => {
  const course = toInt(courseId);
  if (!course || !Array.isArray(customers) || customers.length === 0) {
    const error = new Error('無効なリクエストです');
    error.status = 400;
    throw error;
  }

  customers.forEach((customer) => {
    const id = toInt(customer.id);
    const order = toInt(customer.delivery_order);
    if (!id || order === null) {
      const error = new Error('顧客データの形式が不正です');
      error.status = 400;
      throw error;
    }
  });

  await dbRun(db, 'BEGIN TRANSACTION');
  try {
    for (const customer of customers) {
      await dbRun(
        db,
        'UPDATE customers SET delivery_order = ? WHERE id = ?',
        [toInt(customer.delivery_order), toInt(customer.id)],
      );
    }
    await dbRun(db, 'COMMIT');
  } catch (error) {
    await dbRun(db, 'ROLLBACK');
    throw error;
  }

  return { message: '配達順を更新しました', updatedCount: customers.length };
});

module.exports = {
  bulkUpdateDeliveryOrder,
  updateDeliveryOrderForCourse,
};

