// POST /api/send-otp  { email }
// Checks if email is a registered VA, generates a OTP, stores it in
// Supabase, and sends it via Resend to the VA's inbox.
// TEMP: OTP is hardcoded to 1234 for testing.

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
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  return res;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  // Check VA is registered and active
  const vaRes = await supaFetch(`/roa_va_users?email=eq.${encodeURIComponent(email)}&is_active=eq.true&limit=1`);
  const vaRows = await vaRes.json();
  if (!vaRows || !vaRows.length) {
    return res.status(403).json({ error: 'Email not authorized. Contact your admin.' });
  }
  const va = vaRows[0];

  // TEMP: Hardcoded OTP for testing
  const code = '1234';
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hrs

  // Invalidate any previous unused OTPs for this email
  await supaFetch(`/roa_va_otps?email=eq.${encodeURIComponent(email)}&used=eq.false`, {
    method: 'PATCH',
    body: JSON.stringify({ used: true }),
  });

  // Store new OTP
  await supaFetch('/roa_va_otps', {
    method: 'POST',
    body: JSON.stringify({ email, code, expires_at: expiresAt }),
  });

  // Send via Resend
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'ROA Dashboard <tc@myredeal.com>',
      to: [email],
      subject: `Your ROA VA Dashboard Code: ${code}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
          <h2 style="color:#012F65;margin-bottom:.5rem;">ROA VA Dashboard</h2>
          <p style="color:#374151;">Hi ${va.name},</p>
          <p style="color:#374151;">Your login code is:</p>
          <div style="font-size:2.5rem;font-weight:800;letter-spacing:.25em;color:#012F65;background:#f1f5f9;padding:1rem 1.5rem;border-radius:10px;display:inline-block;margin:1rem 0;">${code}</div>
          <p style="color:#6b7280;font-size:.85rem;">This code is valid for 24 hours.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:1.5rem 0;">
          <p style="color:#9ca3af;font-size:.8rem;">Realty of America &middot; Kansas City Team</p>
        </div>
      `,
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.text();
    console.error('Resend error:', err);
    return res.status(500).json({ error: 'Failed to send email. Try again.' });
  }

  return res.status(200).json({ success: true, message: 'Code sent to ' + email });
}
