'use strict';
const svc = require('./alerts.service');
const supabase = require('../../config/supabase');

async function getMyAlerts(req, res, next) {
  try {
    const result = await svc.getUserAlerts(req.user.id, req.query);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getAllAlerts(req, res, next) {
  try {
    const result = await svc.getAllAlerts(req.query);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function markAsRead(req, res, next) {
  try {
    const result = await svc.markAsRead(req.params.id, req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function dismissAlert(req, res, next) {
  try {
    const result = await svc.dismissAlert(req.params.id, req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function sendManualAlert(req, res, next) {
  try {
    const result = await svc.sendManualAlert(req.body);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const { count, error } = await supabase
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .or(`recipient_user_id.eq.${req.user.id},recipient_user_id.is.null`)
      .is('read_at', null);

    if (error) throw error;
    return res.status(200).json({ success: true, unread_count: count || 0 });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMyAlerts,
  getAllAlerts,
  markAsRead,
  dismissAlert,
  sendManualAlert,
  getUnreadCount
};
