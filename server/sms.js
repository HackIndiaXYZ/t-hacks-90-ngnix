const mask = (n) => `…${String(n).slice(-4)}`;

export const smsConfigured = () =>
  process.env.SMS_PROVIDER === 'twilio' && !!(process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM);

export async function sendSms(numbers, text) {
  const to = [...new Set(numbers.filter(Boolean))];
  if (!to.length) return { sent: 0, failed: 0 };

  if (!smsConfigured()) {
    console.log(`[sms] no provider configured; would text ${to.map(mask).join(', ')}: ${text}`);
    return { sent: 0, failed: 0, logged: true };
  }

  const { TWILIO_SID: sid, TWILIO_TOKEN: token, TWILIO_FROM: from } = process.env;
  const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
  let sent = 0;
  let failed = 0;
  await Promise.all(
    to.map(async (num) => {
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: num, From: from, Body: text }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
        sent += 1;
      } catch (err) {
        failed += 1;
        console.error(`[sms] failed to text ${mask(num)}:`, err.message);
      }
    }),
  );
  return { sent, failed };
}
