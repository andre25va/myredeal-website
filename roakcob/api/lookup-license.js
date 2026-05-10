export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, state } = req.body || {};
  if (!name || !state) {
    return res.status(400).json({ error: 'Missing name or state' });
  }

  const stateFullName = state === 'KS' ? 'Kansas' : 'Missouri';
  const stateSources = state === 'KS'
    ? 'realtor.com, realestateagents.com, krec.ks.gov'
    : 'realtor.com, realestateagents.com, pr.mo.gov/licensee, mopro.mo.gov';

  // For MO, also try reversed name format (LAST, FIRST) since MoPro stores names that way
  const nameParts = name.trim().split(/\s+/);
  const reversedName = nameParts.length >= 2
    ? `${nameParts[nameParts.length - 1]}, ${nameParts.slice(0, -1).join(' ')}`
    : name;
  const nameNote = state === 'MO'
    ? `\nTry searching both "${name}" and "${reversedName}" (last name first format) since Missouri's database stores names as LAST, FIRST.`
    : '';

  const prompt = `Search for the ${stateFullName} real estate license information for agent named "${name}".${nameNote}
Search these sources: ${stateSources} and any other real estate license databases.

Return ONLY a valid JSON array. Each item in the array should represent one match and contain:
- "agentName": full name as found on the source
- "licenseNumber": the official real estate license number as shown on the source (string)
- "expirationDate": expiration date in YYYY-MM-DD format if found, otherwise null
- "brokerageName": current brokerage or firm name if found, otherwise null
- "source": domain name where this was found

If no matches are found, return an empty array: []
Return ONLY the raw JSON array with no markdown, no explanation, no code fences.`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }],
        input: prompt
      })
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI error:', errText);
      return res.status(502).json({ error: 'OpenAI request failed', details: errText });
    }

    const data = await openaiRes.json();

    // Extract text from the response output
    const messageOutput = data.output?.find(o => o.type === 'message');
    const rawText = messageOutput?.content?.find(c => c.type === 'output_text')?.text || '[]';

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let results;
    try {
      results = JSON.parse(cleaned);
    } catch {
      results = [];
    }

    if (!Array.isArray(results)) results = results ? [results] : [];

    // Deduplicate by license number — keep the first occurrence (best source)
    const seen = new Set();
    results = results.filter(r => {
      const key = (r.licenseNumber || '').trim().toUpperCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return res.status(200).json({ results });
  } catch (err) {
    console.error('Lookup handler error:', err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}
