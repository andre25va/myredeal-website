// GET /api/get-agents  (requires Authorization: Bearer <session_token>)
// Returns all agent onboarding records for the VA dashboard.

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supaFetch(path, opts = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  return res;
}

async function verifySession(token) {
  if (!token) return null;
  const res = await supaFetch(
    `/roa_va_sessions?token=eq.${encodeURIComponent(token)}&limit=1`
  );
  const rows = await res.json();
  if (!rows || !rows.length) return null;
  const session = rows[0];
  if (new Date(session.expires_at) < new Date()) return null;
  return session;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const session = await verifySession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const agentsRes = await supaFetch(
    '/roa_agent_onboarding?select=*&order=last_saved.desc.nullslast'
  );
  const agents = await agentsRes.json();

  return res.status(200).json({ success: true, agents: agents || [] });
}
