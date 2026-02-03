// api/fix-table.js
// Vercel serverless function to analyze and fix table data

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { range, values } = req.body;

    if (!values || !Array.isArray(values)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    // Call Claude AI to analyze the data
    const fixes = await analyzeDataWithAI(range, values);

    return res.status(200).json({ fixes });
  } catch (error) {
    console.error('Error in fix-table:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function analyzeDataWithAI(range, values) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  
  if (!OPENROUTER_API_KEY) {
    throw new Error('API key not configured');
  }

  // Prepare data analysis prompt
  const prompt = `You are a data analysis expert. Analyze this Google Sheets data and find errors that need to be fixed.

Range: ${range}
Data:
${JSON.stringify(values, null, 2)}

Find and fix:
1. Formula errors (#DIV/0!, #REF!, #N/A, #VALUE!, #ERROR!)
2. Wrong data types (text in number columns, numbers in text columns)
3. Duplicate entries
4. Empty cells that should have data
5. Date formatting issues

Return ONLY a JSON array of fixes in this exact format:
[
  {
    "cell": "A2",
    "type": "formula_error|data_type|duplicate|empty_cell|date_format",
    "oldValue": "current value",
    "newValue": "corrected value",
    "reason": "brief explanation"
  }
]

Important:
- Use A1 notation for cell references (A1, B2, C3, etc.)
- For formulas, include the = sign in newValue
- If no errors found, return empty array []
- Return ONLY valid JSON, no explanations`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ai-sheets-helper.vercel.app',
      'X-Title': 'AI Sheets Helper'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Extract JSON from response
  let fixes;
  try {
    // Try to parse as-is
    fixes = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      fixes = JSON.parse(jsonMatch[1]);
    } else {
      // Try to find array in text
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        fixes = JSON.parse(arrayMatch[0]);
      } else {
        fixes = [];
      }
    }
  }

  return fixes;
}
