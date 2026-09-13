'use strict';
const bcrypt = require('bcryptjs');
const supabase = require('../../config/supabase');
const { getPagination, paginatedResponse } = require('../../utils/pagination');

/** Get profile by user ID */
async function getUserById(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, state, district, designation, phone, is_verified, is_active, last_login, created_at')
    .eq('id', userId)
    .single();

  if (error || !data) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return data;
}

/** Update profile */
async function updateUserProfile(userId, payload) {
  const allowed = ['full_name', 'phone', 'designation', 'state', 'district'];
  const updates = {};
  allowed.forEach(k => {
    if (payload[k] !== undefined) updates[k] = payload[k];
  });
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select('id, email, full_name, role, state, district, designation, phone')
    .single();

  if (error) throw error;
  return data;
}

/** Change password */
async function changePassword(userId, currentPassword, newPassword) {
  const { data: user, error: fetchErr } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', userId)
    .single();

  if (fetchErr || !user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) {
    const err = new Error('Current password is incorrect');
    err.status = 400;
    throw err;
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  const { error: updateErr } = await supabase
    .from('users')
    .update({ password_hash: newHash, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateErr) throw updateErr;
  return { success: true, message: 'Password updated successfully' };
}

/** List all users (paginated) */
async function listUsers(query) {
  const { page, limit, from, to } = getPagination(query);

  let q = supabase
    .from('users')
    .select('id, email, full_name, role, state, district, designation, is_active, last_login, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query.role) q = q.eq('role', query.role);
  if (query.state) q = q.eq('state', query.state);
  if (query.district) q = q.eq('district', query.district);

  const { data, count, error } = await q;
  if (error) throw error;

  return paginatedResponse(data, count, page, limit);
}

/** Update user role */
async function updateUserRole(userId, newRole) {
  const validRoles = ['district_officer', 'collector', 'state_admin', 'central_admin', 'ministry'];
  if (!validRoles.includes(newRole)) {
    const err = new Error(`Invalid role. Valid roles: ${validRoles.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from('users')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, email, full_name, role')
    .single();

  if (error) throw error;
  return data;
}

/** Activate / deactivate user */
async function toggleUserActiveStatus(userId, isActive) {
  const { data, error } = await supabase
    .from('users')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, email, full_name, is_active')
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  getUserById,
  updateUserProfile,
  changePassword,
  listUsers,
  updateUserRole,
  toggleUserActiveStatus
};
