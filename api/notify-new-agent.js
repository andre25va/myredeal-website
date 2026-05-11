export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { firstName, lastName, gmail, sessionId } = req.body || {};

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Missing Resend key' });

  const agentName = [firstName, lastName].filter(Boolean).join(' ') || 'New Agent';
  const dashboardUrl = `https://myredeal.com/vadashboard`;
  const resumeUrl = `https://myredeal.com/roakcob?session=${sessionId}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;">
      <div style="background:#012F65;padding:20px 28px;border-radius:8px 8px 0 0;">
        <h2 style="color:#FBBE2C;margin:0;font-size:1.3rem;">🎉 New Agent Started Onboarding</h2>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px 28px;">
        <p style="margin:0 0 12px;font-size:1rem;"><strong>${agentName}</strong> just started the ROA KC onboarding flow.</p>
        <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-bottom:20px;">
          <tr><td style="padding:6px 0;color:#666;width:120px;">Name</td><td style="padding:6px 0;font-weight:600;">${agentName}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Gmail</td><td style="padding:6px 0;"><a href="mailto:${gmail}" style="color:#012F65;">${gmail || '—'}</a></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Session ID</td><td style="padding:6px 0;font-family:monospace;">${sessionId || '—'}</td></tr>
        </table>
        <a href="${dashboardUrl}" style="display:inline-block;background:#012F65;color:#FBBE2C;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;font-size:.9rem;margin-right:10px;">View in VA Dashboard →</a>
        <a href="${resumeUrl}" style="display:inline-block;background:#FBBE2C;color:#012F65;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;font-size:.9rem;">Copy Resume Link →</a>
      </div>
    </div>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'ROA Onboarding <onboarding@myredeal.com>',
        to: ['tc@myredeal.com'],
        subject: `🎉 ${agentName} started onboarding`,
        html
      })
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: err });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
