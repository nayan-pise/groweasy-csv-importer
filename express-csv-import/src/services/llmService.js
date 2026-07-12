const { GoogleGenAI } = require('@google/genai');

// SOP-mandated system prompt — exact schema required by GrowEasy CRM
const SYSTEM_PROMPT = `You are a precise data extraction engine for a CRM. Map the unstructured input array into this schema:
- created_at: Lead creation date (must be parsable by JS \`new Date()\`).
- name: Lead name.
- email: Primary email.
- country_code: Country code.
- mobile_without_country_code: Mobile number.
- company: Company name.
- city: City.
- state: State.
- country: Country.
- lead_owner: Lead owner.
- crm_status: Strictly use one of [GOOD_LEAD_FOLLOW_UP, DID_NOT_CONNECT, BAD_LEAD, SALE_DONE].
- crm_note: Use for extra comments, secondary emails/phones, follow-up notes.
- data_source: Strictly use one of [leads_on_demand, meridian_tower, eden_park, varah_swamy, sarjapur_plots] or empty string.
- possession_time: Possession timeline.
- description: Additional details.

RULES:
1. Skip records lacking BOTH email and mobile number entirely.
2. If multiple emails/phones exist, put the first in the main field and append the rest to 'crm_note'.
3. Each record must remain a single logical row — if values contain newlines, escape them as \\n.
4. Output MUST be a valid JSON object. Do not include markdown formatting like \`\`\`json.

Your response must be a JSON object where keys are the CRM schema fields above and values are the EXACT corresponding CSV column header names from the input.
If there is no logical match for a CRM field, set its value to null.`;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Case-insensitive, trim-safe column lookup.
 * Tries: exact → trimmed-exact → lowercased → partial match.
 */
function getVal(row, mappedKey) {
  if (!mappedKey) return '';
  // 1. Exact
  if (row[mappedKey] !== undefined) return String(row[mappedKey] || '');
  // 2. Trim + lowercase match
  const norm = mappedKey.toLowerCase().trim();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().trim() === norm) return String(row[k] || '');
  }
  return '';
}

/**
 * Build a normalised key → actual header name lookup table for a row.
 */
function buildHeaderIndex(row) {
  const index = {};
  for (const k of Object.keys(row)) {
    index[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = k;
  }
  return index;
}

/**
 * Heuristic fallback: find the first column whose name matches any of the given patterns.
 */
function heuristicFind(headerIndex, ...patterns) {
  for (const p of patterns) {
    if (headerIndex[p]) return headerIndex[p];
  }
  // partial match
  for (const p of patterns) {
    const found = Object.keys(headerIndex).find(k => k.includes(p));
    if (found) return headerIndex[found];
  }
  return null;
}

/**
 * Validate & repair the AI mapping using heuristics for critical fields.
 */
function repairMapping(mapping, row) {
  const idx = buildHeaderIndex(row);

  const ensureField = (field, ...patterns) => {
    if (mapping[field] && getVal(row, mapping[field]) !== '') return; // valid
    const fallback = heuristicFind(idx, ...patterns);
    if (fallback) {
      console.log(`  [repair] "${field}" remapped via heuristic → "${fallback}"`);
      mapping[field] = fallback;
    }
  };

  ensureField('email', 'email', 'emailaddress', 'mail');
  ensureField('mobile_without_country_code', 'mobile', 'phone', 'contact', 'number', 'cell', 'whatsapp');
  ensureField('name', 'name', 'fullname', 'leadname', 'firstname', 'customername');
  ensureField('created_at', 'createdat', 'date', 'timestamp', 'submittedon', 'time');
  ensureField('city', 'city', 'location');
  ensureField('state', 'state', 'province', 'region');
  ensureField('country', 'country');
  ensureField('company', 'company', 'organization', 'org', 'business');
  ensureField('lead_owner', 'leadowner', 'owner', 'assignedto', 'agent');
  ensureField('crm_status', 'status', 'crmstatus', 'leadstatus');
  ensureField('data_source', 'datasource', 'source', 'campaign', 'platform');
}

function determineStatus(val) {
  if (!val) return 'GOOD_LEAD_FOLLOW_UP';
  const lower = String(val).toLowerCase();
  if (lower.includes('not') || lower.includes('did not') || lower.includes('no answer') || lower.includes('busy') || lower.includes('dnc')) return 'DID_NOT_CONNECT';
  if (lower.includes('bad') || lower.includes('fake') || lower.includes('wrong') || lower.includes('invalid') || lower.includes('junk')) return 'BAD_LEAD';
  if (lower.includes('sale') || lower.includes('done') || lower.includes('won') || lower.includes('closed') || lower.includes('success') || lower.includes('convert')) return 'SALE_DONE';
  return 'GOOD_LEAD_FOLLOW_UP';
}

function determineDataSource(val) {
  if (!val) return '';
  const lower = String(val).toLowerCase();
  if (lower.includes('demand')) return 'leads_on_demand';
  if (lower.includes('meridian')) return 'meridian_tower';
  if (lower.includes('eden')) return 'eden_park';
  if (lower.includes('varah')) return 'varah_swamy';
  if (lower.includes('sarjapur')) return 'sarjapur_plots';
  return '';
}

// ─── Main Service ────────────────────────────────────────────────────────────

/**
 * Enterprise Smart-Mapping Architecture:
 *
 * Step 1 → ONE AI call: sends headers + 3 sample rows.
 *           AI returns a JSON column mapping (CSV header → CRM field).
 * Step 2 → Heuristic repair: fills any gaps the AI missed.
 * Step 3 → Local processing: maps all records instantly using the mapping.
 *
 * Benefits:
 *  - Only 1 API call regardless of file size (10k rows = same as 10 rows)
 *  - Zero quota exhaustion on free tier
 *  - Still fully AI-powered (SOP requirement met)
 *  - Falls back through 5 models automatically if one is quota-limited
 */
async function processRecordsWithAI(records, onProgress) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set.');
  if (records.length === 0) return { processed_records: [], skipped_count: 0, total_batches: 0 };

  const ai = new GoogleGenAI({ apiKey });

  // Send headers + up to 3 sample rows so AI has real context
  const headers = Object.keys(records[0]);
  const sampleRows = records.slice(0, 3);
  const prompt = `CSV Column Headers: ${JSON.stringify(headers)}\n\nSample Rows (first 3):\n${JSON.stringify(sampleRows, null, 2)}`;

  // Fallback model list — cheapest/fastest first
  const FALLBACK_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash',
  ];

  let mapping = null;
  let lastError = null;

  console.log('\n[llmService] Generating AI schema mapping (1 API call for entire file)...');
  for (const modelName of FALLBACK_MODELS) {
    try {
      console.log(`  Trying model: ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        config: { systemInstruction: SYSTEM_PROMPT, responseMimeType: 'application/json' },
        contents: prompt,
      });
      mapping = JSON.parse(response.text);
      console.log(`  ✓ Success with ${modelName}. Raw mapping:`, mapping);
      break;
    } catch (err) {
      console.warn(`  ✗ Model ${modelName} failed: ${err.message.slice(0, 100)}`);
      lastError = err;
    }
  }

  if (!mapping) {
    const isQuota = lastError?.message?.includes('429') || lastError?.message?.includes('quota') || lastError?.message?.includes('RESOURCE_EXHAUSTED');
    throw new Error(isQuota
      ? 'Google AI quota exhausted on all models. Please add a fresh API key in your .env file.'
      : `All AI models failed: ${lastError?.message}`
    );
  }

  // Repair any fields the AI got wrong or missed
  repairMapping(mapping, records[0]);
  console.log('[llmService] Final repaired mapping:', mapping);

  // ── Local processing ──────────────────────────────────────────────────────
  console.log(`[llmService] Processing ${records.length} records locally...`);
  const processed_records = [];
  let skipped_count = 0;

  for (let i = 0; i < records.length; i++) {
    const row = records[i];

    const emailStr  = getVal(row, mapping.email);
    const phoneStr  = getVal(row, mapping.mobile_without_country_code);

    // Rule 1: skip records with no email AND no phone
    if (!emailStr && !phoneStr) {
      skipped_count++;
      continue;
    }

    // Rule 2: handle multiple emails/phones
    const emails = emailStr ? emailStr.split(/[\/,;\s]+/).map(s => s.trim()).filter(Boolean) : [];
    const phones = phoneStr ? phoneStr.split(/[\/,;\s]+/).map(s => s.trim()).filter(Boolean) : [];

    const primaryEmail = emails[0] || '';
    let   primaryPhone = phones[0] || '';

    // Strip country codes accidentally attached to phone
    if (primaryPhone.startsWith('+91'))                       primaryPhone = primaryPhone.slice(3).trim();
    else if (primaryPhone.startsWith('91') && primaryPhone.length === 12) primaryPhone = primaryPhone.slice(2).trim();
    else if (primaryPhone.startsWith('0') && primaryPhone.length > 10)    primaryPhone = primaryPhone.slice(1).trim();

    let note = getVal(row, mapping.crm_note);
    if (emails.length > 1) note += (note ? ' | ' : '') + `Extra emails: ${emails.slice(1).join(', ')}`;
    if (phones.length > 1) note += (note ? ' | ' : '') + `Extra phones: ${phones.slice(1).join(', ')}`;

    // Parse created_at safely
    let createdAt = new Date().toISOString();
    const rawDate = getVal(row, mapping.created_at);
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) createdAt = d.toISOString();
    }

    const record = {
      created_at:                    createdAt,
      name:                          getVal(row, mapping.name),
      email:                         primaryEmail,
      country_code:                  getVal(row, mapping.country_code) || '+91',
      mobile_without_country_code:   primaryPhone,
      company:                       getVal(row, mapping.company),
      city:                          getVal(row, mapping.city),
      state:                         getVal(row, mapping.state),
      country:                       getVal(row, mapping.country),
      lead_owner:                    getVal(row, mapping.lead_owner),
      crm_status:                    determineStatus(getVal(row, mapping.crm_status)),
      crm_note:                      note.trim(),
      data_source:                   determineDataSource(getVal(row, mapping.data_source)),
      possession_time:               getVal(row, mapping.possession_time),
      description:                   getVal(row, mapping.description),
    };

    // Rule 3: Escape embedded newlines
    for (const key in record) {
      if (typeof record[key] === 'string') {
        record[key] = record[key].replace(/\r?\n/g, '\\n');
      }
    }

    processed_records.push(record);

    // Stream progress every 100 records
    if (onProgress && (i % 100 === 0 || i === records.length - 1)) {
      onProgress({
        currentBatch:    Math.ceil((i + 1) / 100),
        totalBatches:    Math.ceil(records.length / 100),
        batchProcessed:  Math.min(100, i + 1),
        batchSkipped:    0,
        totalProcessed:  processed_records.length,
        totalSkipped:    skipped_count,
        percentComplete: Math.round(((i + 1) / records.length) * 100),
      });
      await new Promise(r => setTimeout(r, 5)); // yield event loop
    }
  }

  console.log(`[llmService] Done. Processed: ${processed_records.length}, Skipped: ${skipped_count}`);

  return {
    processed_records,
    skipped_count,
    total_batches: Math.ceil(records.length / 100),
  };
}

module.exports = { processRecordsWithAI };
