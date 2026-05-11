// GET  /api/manage-vas        — list all VAs (admin only)
// POST /api/manage-vas        { name, email } — add VA (admin only)
// DELETE /api/manage-vas      { id } — delete VA (admin only)

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supaFetch(path, opts = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  return res;
}

async function verifyAdminSession(token) {
  if (!token) return null;
  const res = await supaFetch(`/roa_va_sessions?token=eq.${encodeURIComponent(token)}&limit=1`);
  const rows = await res.json();
  if (!rows || !rows.length) return null;
  const s = rows[0];
  if (new Date(s.expires_at) < new Date()) return null;
  if (!s.is_admin) return null;
  return s;
}

export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const session = await verifyAdminSession(token);
  if (!session) return res.status(401).json({ error: 'Admin access required' });

  if (req.method === 'GET') {
    const r = await supaFetch('/roa_va_users?order=created_at.asc');
    const vas = await r.json();
    return res.status(200).json({ success: true, vas: vas || [] });
  }

  if (req.method === 'POST') {
    const { name, email } = req.body || {};
    if (!name || !email) return res.status(400).json({ error: 'name and email required' });
    const r = await supaFetch('/roa_va_users', {
      method: 'POST',
      body: JSON.stringify({ name, email, is_admin: false, is_active: true }),
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(400).json({ error: err.includes('duplicate') ? 'Email already exists' : 'Failed to add VA' });
    }
    const rows = await r.json();
    return res.status(200).json({ success: true, va: rows[0] });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    // Don't allow deleting yourself
    const vaRes = await supaFetch(`/roa_va_users?id=eq.${id}&limit=1`);
    const vaRows = await vaRes.json();
    if (vaRows && vaRows[0] && vaRows[0].email === session.va_email) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await supaFetch(`/roa_va_users?id=eq.${id}`, { method: 'DELETE' });
    // Also invalidate sessions
    const emailToDelete = vaRows && vaRows[0] ? vaRows[0].email : null;
    if (emailToDelete) {
      await supaFetch(`/roa_va_sessions?va_email=eq.${encodeURIComponent(emailToDelete)}`, { method: 'DELETE' });
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
