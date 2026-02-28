import { getAIServiceManager } from '../services/manager';
import logger from '../utils/logger';


export interface FieldSamples {
  [fieldPath: string]: string[];
}

export interface FieldDescription {
  fieldPath: string;
  description: string;
}

export interface FieldDescriptionsResponse {
  success: boolean;
  descriptions: FieldDescription[];
  error?: string;
}

/**
 * Generate AI descriptions for database fields based on sample string values
 * Uses GPT-4.1-nano model with retry logic (up to 3 attempts)
 * Falls back to returning schema without descriptions if all retries fail
 */
export async function generateFieldDescriptions(
  collectionName: string,
  databaseName: string,
  fieldSamples: FieldSamples
): Promise<FieldDescriptionsResponse> {
  const MAX_RETRIES = 3;
  const fieldsToAnalyze = Object.entries(fieldSamples)
    .filter(([_, samples]) => samples && samples.length > 0)
    .map(([fieldPath, samples]) => ({
      fieldPath,
      samples: samples.slice(0, 5) // Limit to 5 samples per field
    }));

  if (fieldsToAnalyze.length === 0) {
    return {
      success: true,
      descriptions: [],
      error: 'No string fields found to analyze'
    };
  }

  // Try up to 3 times to get AI descriptions
  let lastError: Error | null = null;
  let partialDescriptions: FieldDescription[] = [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info('Generating field descriptions', {
        collectionName,
        databaseName,
        fieldCount: fieldsToAnalyze.length,
        attempt,
        maxRetries: MAX_RETRIES
      });

      const result = await attemptGenerateDescriptions(
        collectionName,
        databaseName,
        fieldsToAnalyze
      );

      // If we got any descriptions, save them as partial results
      if (result.descriptions && result.descriptions.length > 0) {
        partialDescriptions = result.descriptions;
      }

      // If successful, return the result
      if (result.success) {
        logger.info('Field descriptions generated successfully', {
          collectionName,
          databaseName,
          descriptionsCount: result.descriptions.length,
          attempt
        });
        return result;
      }

      // If not successful, store the error and retry
      lastError = new Error(result.error || 'Unknown error');
      logger.warn('Field description generation attempt failed', {
        collectionName,
        databaseName,
        attempt,
        error: lastError.message
      });

    } catch (error) {
      lastError = error as Error;
      logger.warn('Field description generation attempt failed with exception', {
        collectionName,
        databaseName,
        attempt,
        error: (error as Error).message
      });
    }

    // Wait before retrying (exponential backoff)
    if (attempt < MAX_RETRIES) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      logger.info('Retrying field description generation', {
        collectionName,
        databaseName,
        nextAttempt: attempt + 1,
        delayMs
      });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // All retries failed - return what we have (if any) or empty
  logger.error('All field description generation attempts failed', {
    collectionName,
    databaseName,
    attempts: MAX_RETRIES,
    lastError: lastError?.message,
    partialDescriptionsCount: partialDescriptions.length
  });

  return {
    success: partialDescriptions.length > 0, // Success if we got any descriptions
    descriptions: partialDescriptions,
    error: `Failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}. ${partialDescriptions.length > 0 ? 'Returning partial results.' : ''}`
  };
}

/**
 * Single attempt to generate field descriptions using GPT-4.1-nano
 */
async function attemptGenerateDescriptions(
  collectionName: string,
  databaseName: string,
  fieldsToAnalyze: { fieldPath: string; samples: string[] }[]
): Promise<FieldDescriptionsResponse> {
  const manager = getAIServiceManager();

  const systemPrompt = [
    'You are a MongoDB field analyzer. Your task is to analyze sample values from database fields and provide concise descriptions.',
    '',
    'RULES:',
    '- Provide a description of up to 10 words for each field',
    '- Focus on WHAT the field contains, not how it\'s formatted',
    '- Be specific and informative',
    '- Identify patterns like: user emails, product names, status codes, timestamps, URLs, IDs, etc.',
    '- If all samples are similar, describe the common pattern',
    '- If samples vary, describe the general category',
    '- Avoid generic descriptions like "string values" or "text field"',
    '',
    'OUTPUT FORMAT:',
    'Return a JSON object with a "descriptions" array. Each item should have:',
    '- fieldPath: the field path (exactly as provided)',
    '- description: a concise description (max 10 words)',
    '',
    'Example output:',
    '{"descriptions":[{"fieldPath":"email","description":"User email addresses"},{"fieldPath":"status","description":"Order status: pending, shipped, delivered"}]}',
    '',
    'Return ONLY valid JSON. No markdown, no explanations, no code fences.'
  ].join('\n');

  const userPrompt = [
    `Database: ${databaseName}`,
    `Collection: ${collectionName}`,
    '',
    'FIELD SAMPLES TO ANALYZE:',
    '',
    ...fieldsToAnalyze.map(({ fieldPath, samples }) => 
      `Field: "${fieldPath}"\nSamples: ${JSON.stringify(samples)}\n`
    ),
    '',
    'Analyze each field and provide concise descriptions. Return strict JSON only.'
  ].join('\n');

  const ai = await manager.call(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { 
      temperature: 0.1, 
      maxTokens: 4000,
      model: 'gpt-4.1-nano'
    }
  );

  if (!ai.success || !ai.text) {
    throw new Error(ai.error || 'AI call failed');
  }

  // Extract JSON from response
  let jsonResponse;
  try {
    jsonResponse = extractJsonFromResponse(ai.text as string);
  } catch (parseError) {
    logger.error('Failed to parse AI response', {
      error: (parseError as Error).message,
      response: ai.text
    });
    throw new Error('Failed to parse AI response as JSON');
  }

  // Validate and format the response
  const descriptions: FieldDescription[] = [];
  
  if (jsonResponse.descriptions && Array.isArray(jsonResponse.descriptions)) {
    for (const desc of jsonResponse.descriptions) {
      if (desc.fieldPath && desc.description) {
        descriptions.push({
          fieldPath: desc.fieldPath,
          description: String(desc.description).slice(0, 100) // Enforce max length
        });
      }
    }
  }

  return {
    success: true,
    descriptions
  };
}

/**
 * Extract JSON object from AI response text
 */
function extractJsonFromResponse(text: string): any {
  const trimmed = (text || '').trim();
  
  // Try to parse directly if it looks like JSON
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Continue to other methods
    }
  }
  
  // Try to extract from code fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // Continue to other methods
    }
  }
  
  // Try to find JSON object in text
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Continue
    }
  }
  
  throw new Error('No valid JSON found in AI response');
}

