'use strict';
const svc = require('./users.service');

async function getMe(req, res, next) {
  try {
    const user = await svc.getUserById(req.user.id);
    return res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const user = await svc.updateUserProfile(req.user.id, req.body);
    return res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

async function changeMyPassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await svc.changePassword(req.user.id, currentPassword, newPassword);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const result = await svc.listUsers(req.query);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getUserById(req, res, next) {
  try {
    const user = await svc.getUserById(req.params.id);
    return res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

async function updateUserRole(req, res, next) {
  try {
    const { role } = req.body;
    const user = await svc.updateUserRole(req.params.id, role);
    return res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

async function toggleUserActive(req, res, next) {
  try {
    const { is_active } = req.body;
    const user = await svc.toggleUserActiveStatus(req.params.id, is_active);
    return res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMe,
  updateMe,
  changeMyPassword,
  listUsers,
  getUserById,
  updateUserRole,
  toggleUserActive
};
