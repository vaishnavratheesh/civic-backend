const axios = require('axios');

/**
 * Downloads a document URL and returns base64 + MIME type.
 */
async function fetchAsBase64(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  const contentType = response.headers['content-type'] || 'image/jpeg';
  const base64 = Buffer.from(response.data).toString('base64');
  return { base64, contentType };
}

/**
 * Calls Gemini Vision to verify a SINGLE document image.
 * Returns { isValidDocument, documentType, matchScore, remarks }
 */
async function verifySingleDocument(apiKey, base64, contentType, applicantData, expectedDocType) {
  const { userName, address, phoneNumber, ward } = applicantData;

  const prompt = `You are a strict Indian government document verification system.

TASK: Examine the provided image and answer these questions with FULL STRICTNESS:

1. Is this a valid, official Indian government document (Aadhaar Card, Voter ID, Ration Card, PAN Card, Driving License, Passport, Income Certificate, Caste Certificate, Disability Certificate, BPL Card, etc.)? 
   - If it is a selfie, a natural photo/scene, a random image, a blank paper, or clearly NOT an official document → isValidDocument = false
   - Only real, printed government documents should be considered valid

2. What type of document is this? (e.g., "Aadhaar Card", "Voter ID", "Random Photo", "Not a Document", etc.)

3. Does the document appear to be for the applicant:
   - Name: ${userName || 'Unknown'}
   - Address: ${address || 'Unknown'}
   - Ward: ${ward || 'Unknown'}
   ${expectedDocType ? `- Expected document type: ${expectedDocType}` : ''}

Compare what you read from the document to the applicant data. Give a matchScore between 0 and 1:
- 0.0 if the image is NOT a valid government document
- 0.1-0.3 if it is a real document but clearly belongs to a different person or wrong type
- 0.5-0.7 if it is a valid document with partial match (name partially matches)
- 0.8-1.0 ONLY if it is clearly the correct document type AND the name/details roughly match

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "isValidDocument": true/false,
  "detectedDocumentType": "exact document type detected or 'Not a Document'",
  "nameFound": "name found in document or empty string",
  "matchScore": 0.0,
  "remarks": "brief explanation of your decision"
}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: contentType.split(';')[0], // strip charset
              data: base64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.9,
      maxOutputTokens: 512
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const resp = await axios.post(url, payload, { 
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
  });

  const candidates = resp.data?.candidates || [];
  const text = candidates[0]?.content?.parts?.[0]?.text || '';
  
  let result;
  try {
    // Try direct parse first
    result = JSON.parse(text.trim());
  } catch (_) {
    // Extract JSON block from response
    const match = text.match(/\{[\s\S]*\}/);
    try {
      result = match ? JSON.parse(match[0]) : null;
    } catch (__) {
      result = null;
    }
  }

  if (!result) {
    return { isValidDocument: false, detectedDocumentType: 'Unknown', matchScore: 0, remarks: 'AI could not parse document' };
  }

  return {
    isValidDocument: !!result.isValidDocument,
    detectedDocumentType: result.detectedDocumentType || 'Unknown',
    nameFound: result.nameFound || '',
    matchScore: typeof result.matchScore === 'number' ? Math.min(1, Math.max(0, result.matchScore)) : 0,
    remarks: result.remarks || ''
  };
}

/**
 * Main verifier: verifies all documents attached to an application.
 * Each document is verified individually; final score is the minimum across all documents
 * (weakest link approach — all documents must be valid).
 */
async function verifyApplicationWithGemini(application) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    // Get documents from application
    const documents = Array.isArray(application.documents) ? application.documents : [];
    
    if (!apiKey) {
      // No API key: return a clear failure score — don't blindly approve
      console.warn('[geminiVerify] No GEMINI_API_KEY set. Cannot verify documents. Returning low score.');
      return {
        matchScore: 0.3,
        remarks: 'Document verification requires GEMINI_API_KEY to be configured. Manual review recommended.',
        geminiRaw: null,
        documentsChecked: 0,
        allValid: false
      };
    }

    if (documents.length === 0) {
      console.warn('[geminiVerify] No documents attached to application');
      return {
        matchScore: 0.2,
        remarks: 'No documents were uploaded with this application. Manual review required.',
        geminiRaw: null,
        documentsChecked: 0,
        allValid: false
      };
    }

    const applicantData = {
      userName: application.userName || '',
      address: application.personalDetails?.address || '',
      phoneNumber: application.personalDetails?.phoneNumber || '',
      ward: application.userWard || ''
    };

    console.log(`[geminiVerify] Verifying ${documents.length} document(s) for ${applicantData.userName}`);

    const results = [];
    for (const doc of documents) {
      if (!doc.url) {
        results.push({ name: doc.name, matchScore: 0, remarks: 'No URL for document', isValidDocument: false });
        continue;
      }
      
      try {
        const { base64, contentType } = await fetchAsBase64(doc.url);
        
        // Only process images (PDFs are harder, allow them with lower strict threshold)
        const isPDF = contentType.includes('pdf');
        if (isPDF) {
          // For PDFs, we skip vision check and give a moderate score
          results.push({ 
            name: doc.name, 
            isValidDocument: true, 
            matchScore: 0.6, 
            remarks: `PDF document "${doc.name}" accepted for manual review.`,
            detectedDocumentType: 'PDF Document'
          });
          continue;
        }

        const result = await verifySingleDocument(apiKey, base64, contentType, applicantData, doc.name);
        console.log(`[geminiVerify] Document "${doc.name}": isValid=${result.isValidDocument}, score=${result.matchScore}, type=${result.detectedDocumentType}`);
        results.push({ name: doc.name, ...result });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (docErr) {
        console.error(`[geminiVerify] Error verifying document "${doc.name}":`, docErr.message);
        results.push({ name: doc.name, matchScore: 0, remarks: `Error checking document: ${docErr.message}`, isValidDocument: false });
      }
    }

    // Aggregate: use the MINIMUM score (all documents must pass)
    const minScore = results.reduce((min, r) => Math.min(min, r.matchScore), 1);
    const allValid = results.every(r => r.isValidDocument !== false);
    const invalidDocs = results.filter(r => r.isValidDocument === false).map(r => r.name);

    let remarks;
    if (!allValid) {
      remarks = `Invalid or unrecognized documents detected: ${invalidDocs.join(', ')}. ` +
        results.map(r => `${r.name}: ${r.remarks}`).join(' | ');
    } else {
      remarks = results.map(r => `${r.name}: ${r.remarks}`).join(' | ');
    }

    return {
      matchScore: minScore,
      remarks,
      geminiRaw: { results },
      documentsChecked: results.length,
      allValid
    };

  } catch (err) {
    console.error('[geminiVerify] verifyApplicationWithGemini error:', err?.response?.data || err.message || err);
    return { matchScore: 0.0, remarks: 'AI verification encountered an error. Manual review required.', geminiRaw: { error: true }, allValid: false };
  }
}

module.exports = { verifyApplicationWithGemini };
