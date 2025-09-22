const axios = require('axios');

// Lightweight helper that downloads a document as base64 and calls Gemini via our frontend adapter if available
async function fetchAsBase64(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const contentType = response.headers['content-type'] || 'application/octet-stream';
  const base64 = Buffer.from(response.data).toString('base64');
  return { base64, contentType };
}

async function verifyApplicationWithGemini({ application, documentUrl }) {
  try {
    const { base64, contentType } = await fetchAsBase64(documentUrl);

    // Build a concise prompt comparing key fields
    const pd = application.personalDetails || {};
    const prompt = `You are verifying an Indian ID document against provided applicant data. Extract name and address from the document image and compare with the provided data. Return ONLY JSON: { "matchScore": number 0..1, "remarks": string }.
Applicant Data: name=${application.userName}, ward=${application.userWard}, address=${pd.address || ''}, phone=${pd.phoneNumber || ''}`;

    // If a direct Gemini server-side integration exists, call it here. Otherwise use a placeholder deterministic response.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Fallback heuristic: naive match on name presence yields medium score
      const naiveScore = application.userName ? 0.8 : 0.5;
      return { matchScore: naiveScore, remarks: 'Fallback verification (no GEMINI_API_KEY). Configure to enable AI.', geminiRaw: null };
    }

    // Example Gemini API request (pseudo; adjust to your actual integration)
    // Using Google Generative AI REST for gemini-1.5-flash with image part
    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: contentType,
                data: base64
              }
            }
          ]
        }
      ]
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const resp = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });

    // Extract text from response
    const candidates = resp.data && resp.data.candidates ? resp.data.candidates : [];
    const text = candidates[0]?.content?.parts?.[0]?.text || '';
    let result;
    try {
      result = JSON.parse(text);
    } catch (_) {
      // If not pure JSON, try to extract JSON block
      const match = text.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { matchScore: 0.0, remarks: 'Unable to parse AI response' };
    }

    return {
      matchScore: typeof result.matchScore === 'number' ? result.matchScore : 0,
      remarks: result.remarks || 'No remarks',
      geminiRaw: { text }
    };
  } catch (err) {
    console.error('verifyApplicationWithGemini error:', err?.response?.data || err.message || err);
    return { matchScore: 0.0, remarks: 'AI verification error', geminiRaw: { error: true } };
  }
}

module.exports = { verifyApplicationWithGemini };

