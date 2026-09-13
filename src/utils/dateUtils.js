'use strict';
/** Simple date utility helpers to avoid heavy date library dependencies */

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function daysBetween(dateA, dateB) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(dateB) - new Date(dateA)) / msPerDay);
}

module.exports = { addDays, formatDate, daysBetween };
