export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[chat] Anthropic API error', response.status, JSON.stringify(data));
    }
    // Always return 200 so we can see the error details
    res.status(200).json(data);
  } catch (err) {
    console.error('[chat] fetch failed:', err);
    res.status(200).json({ error: { type: 'fetch_error', message: err.message } });
  }
}
