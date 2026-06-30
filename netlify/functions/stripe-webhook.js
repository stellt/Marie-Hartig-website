// netlify/functions/stripe-webhook.js
//
// Listens for Stripe events (e.g. checkout.session.completed) and verifies
// the signature so you know the event genuinely came from Stripe.
//
// Set STRIPE_WEBHOOK_SECRET in Netlify env vars once you've created the
// webhook endpoint in the Stripe Dashboard (see instructions provided
// alongside this file).

const Stripe = require('stripe');

exports.handler = async (event) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object;
      // Payment succeeded. This is the right place to, e.g.:
      //   - send a confirmation email
      //   - log the order somewhere (Airtable, Google Sheet, a database)
      // For now we just log it — tell me if you want order emails wired up.
      console.log('✅ Payment succeeded for session:', session.id, session.customer_details?.email);
      break;
    }
    case 'checkout.session.async_payment_failed': {
      const session = stripeEvent.data.object;
      console.log('❌ Payment failed for session:', session.id);
      break;
    }
    default:
      // Unhandled event type — fine to ignore.
      break;
  }

  // Always return 2xx quickly so Stripe doesn't retry unnecessarily.
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
