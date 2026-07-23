// POST /api/chat
// Body: { clientId, messages: [{role, content}, ...] }
// Looks up the client's knowledge base + plan limit, calls Claude, logs usage.

const PLAN_LIMITS = { starter: 500, growth: 2000 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { clientId, messages } = req.body || {};
  if (!clientId || !messages) {
    return res.status(400).json({ error: 'clientId and messages are required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  try {
    // 1. Fetch client
    const clientRes = await fetch(
      `${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&select=*`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const rows = await clientRes.json();
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Unknown client' });
    const client = rows[0];

    // 2. Enforce monthly limit
    const limit = PLAN_LIMITS[client.plan] || 500;
    if (client.monthly_conversation_count >= limit) {
      return res.status(429).json({
        error: 'This store has reached its monthly conversation limit. Please try again next month.'
      });
    }

    // 3. Call Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: `You are the customer support assistant for "${client.store_name}". Answer only from the knowledge base below. Be helpful, clear, and professional. Keep responses to 2-4 sentences. Avoid emojis and excessive exclamation marks — write the way a knowledgeable, friendly store employee would speak to a customer in person. If something isn't covered, say you'd need to check and suggest contacting the store directly.\n\nKNOWLEDGE BASE:\n${client.knowledge_base}`,
        messages
      })
    });
    const claudeData = await claudeRes.json();

    if (!claudeRes.ok) {
      console.error('Claude API error:', claudeData);
    }

    const reply = claudeData.content?.find(b => b.type === 'text')?.text
      || "Sorry, could you rephrase that?";

    // 4. Log usage
    await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ monthly_conversation_count: client.monthly_conversation_count + 1 })
    });

    return res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
