// POST /api/verify-otp  { email, code }
// Verifies a 6-digit OTP and returns a session token + VA info.

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

  // Find matching OTP
  const otpRes = await supaFetch(
    `/roa_va_otps?email=eq.${encodeURIComponent(email)}&code=eq.${encodeURIComponent(code)}&used=eq.false&order=created_at.desc&limit=1`
  );
  const otpRows = await otpRes.json();

  if (!otpRows || !otpRows.length) {
    return res.status(401).json({ error: 'Invalid code. Please try again.' });
  }

  const otp = otpRows[0];
  if (new Date(otp.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Code expired. Request a new one.' });
  }

  // Mark OTP used
  await supaFetch(`/roa_va_otps?id=eq.${otp.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ used: true }),
  });

  // Get VA info
  const vaRes = await supaFetch(`/roa_va_users?email=eq.${encodeURIComponent(email)}&limit=1`);
  const vaRows = await vaRes.json();
  const va = vaRows[0];

  // Create session (8hr expiry)
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  await supaFetch('/roa_va_sessions', {
    method: 'POST',
    body: JSON.stringify({
      token,
      va_email: email,
      va_name: va.name,
      is_admin: va.is_admin,
      expires_at: expiresAt,
    }),
  });

  return res.status(200).json({
    success: true,
    token,
    va: { name: va.name, email: va.email, isAdmin: va.is_admin },
  });
}
