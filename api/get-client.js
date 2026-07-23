// GET /api/get-client?id=hb_xxxxx
// Returns only what the widget needs to render + answer questions.

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(id)}&select=id,store_name,accent_color,knowledge_base,plan`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );

    const rows = await response.json();
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = rows[0];
    return res.status(200).json({
      storeName: client.store_name,
      accentColor: client.accent_color,
      knowledgeBase: client.knowledge_base,
      plan: client.plan
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
