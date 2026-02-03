// api/create-formula.js
// Vercel serverless function to generate Google Sheets formulas

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
    const { description, context } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    // Call Claude AI to generate formula
    const result = await generateFormulaWithAI(description, context);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in create-formula:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function generateFormulaWithAI(description, context) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  
  if (!OPENROUTER_API_KEY) {
    throw new Error('API key not configured');
  }

  // Prepare formula generation prompt
  const prompt = `You are a Google Sheets formula expert. Generate a formula based on the user's description.

User wants: ${description}

Sheet context:
- Sheet name: ${context.sheetName}
- Column headers: ${context.headers.join(', ')}
- Current cell: ${context.currentCell}
- Last row with data: ${context.lastRow}
- Last column with data: ${context.lastCol}

Generate a Google Sheets formula that accomplishes what the user wants.

Return ONLY a JSON object in this exact format:
{
  "formula": "=SUM(A:A)",
  "explanation": "This formula sums all values in column A",
  "targetCell": "D2",
  "useAutofill": true
}

Important:
- formula: Must start with = and be a valid Google Sheets formula
- explanation: Brief explanation of what the formula does
- targetCell: Where to place the formula (use A1 notation). If user selected a cell, use that. Otherwise suggest best location.
- useAutofill: true if formula should be copied down to other rows, false otherwise

Examples:
"Calculate sum of column A" → {"formula": "=SUM(A:A)", "targetCell": "B1", "useAutofill": false}
"Add 20% tax to column B" → {"formula": "=B2*0.2", "targetCell": "C2", "useAutofill": true}
"Show only sales > 1000" → {"formula": "=FILTER(A:D, C:C>1000)", "targetCell": "F1", "useAutofill": false}
"Average of last 10 rows" → {"formula": "=AVERAGE(A2:A11)", "targetCell": "A12", "useAutofill": false}

Return ONLY valid JSON, no explanations.`;

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
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Extract JSON from response
  let result;
  try {
    // Try to parse as-is
    result = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[1]);
    } else {
      // Try to find object in text
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        result = JSON.parse(objectMatch[0]);
      } else {
        throw new Error('Could not parse AI response');
      }
    }
  }

  // Validate result
  if (!result.formula || !result.formula.startsWith('=')) {
    throw new Error('Invalid formula generated');
  }

  return result;
}
