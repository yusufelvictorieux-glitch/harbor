// POST /api/lemonsqueezy-webhook
// Lemon Squeezy calls this automatically after a successful payment.
// We look up the client_id we attached at checkout and mark them active.

import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false
  }
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const rawBody = await getRawBody(req);
  const signature = req.headers['x-signature'];
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(rawBody).digest('hex');

  if (signature !== digest) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody.toString());
  const eventName = event.meta?.event_name;
  const clientId = event.meta?.custom_data?.client_id;

  if (!clientId) {
    console.error('Webhook received with no client_id:', eventName);
    return res.status(200).json({ received: true });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  let newStatus = null;
  if (eventName === 'subscription_created' || eventName === 'subscription_payment_success') {
    newStatus = 'active';
  } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
    newStatus = 'cancelled';
  }

  if (newStatus) {
    await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ status: newStatus })
    });
  }

  return res.status(200).json({ received: true });
}
