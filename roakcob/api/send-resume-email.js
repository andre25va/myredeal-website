// POST /api/send-resume-email  { agentEmail, agentName, sessionId, token }
// Sends the agent their personalized resume link via Resend.

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;

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
  const res = await supaFetch(`/roa_va_sessions?token=eq.${encodeURIComponent(token)}&limit=1`);
  const rows = await res.json();
  if (!rows || !rows.length) return null;
  if (new Date(rows[0].expires_at) < new Date()) return null;
  return rows[0];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { agentEmail, agentName, sessionId } = req.body || {};
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();

  if (!agentEmail || !agentName || !sessionId) {
    return res.status(400).json({ error: 'agentEmail, agentName, sessionId required' });
  }
  const session = await verifySession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const resumeUrl = `https://myredeal.com/roakcob?session=${encodeURIComponent(sessionId)}`;
  const firstName = agentName.split(' ')[0] || agentName;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'ROA Kansas City Team <tc@myredeal.com>',
      to: [agentEmail],
      subject: 'Continue Your ROA Onboarding — Your Progress is Saved!',
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:2rem;">
          <img src="https://myredeal.com/logo.png" alt="MyReDeal" style="height:40px;margin-bottom:1.5rem;" />
          <h2 style="color:#012F65;margin-bottom:.5rem;">Pick up where you left off, ${firstName}! 🏡</h2>
          <p style="color:#374151;line-height:1.6;">Your onboarding progress has been saved. Click the button below to continue right where you left off:</p>
          <div style="margin:2rem 0;">
            <a href="${resumeUrl}" style="background:#012F65;color:#fff;padding:.9rem 2rem;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
              ▶ Continue My Onboarding
            </a>
          </div>
          <p style="color:#6b7280;font-size:.85rem;">Or copy this link:<br><a href="${resumeUrl}" style="color:#012F65;word-break:break-all;">${resumeUrl}</a></p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:1.5rem 0;">
          <p style="color:#9ca3af;font-size:.8rem;">Realty of America · Kansas City Team<br>8100 Marty Street, Unit 105 · Overland Park, KS 66204</p>
        </div>
      `,
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.text();
    console.error('Resend error:', err);
    return res.status(500).json({ error: 'Failed to send email.' });
  }

  return res.status(200).json({ success: true, message: `Resume link sent to ${agentEmail}` });
}
