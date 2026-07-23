// POST /api/create-client
// Body: { storeName, email, url, knowledge, plan, color }
// Creates a row in Supabase and returns a clientId for the embed code.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  const { storeName, email, url, knowledge, plan, color } = req.body || {};

  if (!storeName || !email || !knowledge) {
    return res.status(400).json({ error: 'storeName, email, and knowledge are required' });
  }

  const clientId = 'hb_' + Math.random().toString(36).slice(2, 10);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        id: clientId,
        store_name: storeName,
        email,
        url: url || null,
        knowledge_base: knowledge,
        plan: plan || 'starter',
        accent_color: color || '#1B2A41'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Supabase insert failed:', errText);
      return res.status(500).json({ error: 'Could not save client' });
    }

    return res.status(200).json({ clientId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
