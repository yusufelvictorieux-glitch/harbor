// POST /api/paddle-webhook
// Receives signed events from Paddle and keeps the Supabase `clients`
// table in sync with each customer's subscription status.

import crypto from 'crypto';

// Vercel needs the raw request body (not the parsed JSON) to verify
// Paddle's signature, so we turn off automatic body parsing here.
export const config = {
  api: {
    bodyParser: false
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifyPaddleSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;

  // Paddle sends: "ts=1700000000;h1=abcdef123..."
  const parts = Object.fromEntries(
    signatureHeader.split(';').map((p) => p.split('='))
  );
  const { ts, h1 } = parts;
  if (!ts || !h1) return false;

  const signedPayload = `${ts}:${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Constant-time comparison to avoid timing attacks
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(h1, 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

// Maps a Paddle price ID to Harbor's internal plan name.
const PRICE_TO_PLAN = {
  'pri_01kz42j0a8nta3sy80sa1wz96z': 'starter',
  'pri_01kz42qj62yw6mfz2kv9tjxy0t': 'growth'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const rawBody = await readRawBody(req);
  const signatureHeader = req.headers['paddle-signature'];
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

  const isValid = verifyPaddleSignature(rawBody, signatureHeader, webhookSecret);
  if (!isValid) {
    console.error('Invalid Paddle webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  const eventType = event.event_type;
  const data = event.data || {};

  try {
    // The clientId was passed as custom data at checkout time.
    const clientId = data.custom_data?.client_id;

    if (!clientId) {
      // Some events won't have this — acknowledge so Paddle doesn't retry.
      return res.status(200).json({ received: true, note: 'No client_id in payload' });
    }

    let updateFields = null;

    switch (eventType) {
      case 'subscription.activated':
      case 'subscription.resumed': {
        const priceId = data.items?.[0]?.price?.id;
        const plan = PRICE_TO_PLAN[priceId] || null;
        updateFields = {
          status: 'active',
          ...(plan ? { plan } : {})
        };
        break;
      }

      case 'subscription.canceled':
      case 'subscription.paused':
      case 'subscription.past_due': {
        updateFields = { status: 'inactive' };
        break;
      }

      case 'transaction.completed': {
        // First successful payment on a new subscription — treat as active too.
        updateFields = { status: 'active' };
        break;
      }

      default:
        return res.status(200).json({ received: true, event: eventType });
    }

    if (updateFields) {
      await fetch(
        `${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify(updateFields)
        }
      );
    }

    return res.status(200).json({ received: true, event: eventType });
  } catch (err) {
    console.error('Paddle webhook error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
