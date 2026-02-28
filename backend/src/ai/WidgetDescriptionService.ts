import { getAIServiceManager } from '../services/manager';
import logger from '../utils/logger';


export interface WidgetDescriptionRequest {
  widgetTitle: string;
  chartType?: string;
  collectionName?: string;
  databaseName?: string;
  query?: string;
}

export interface WidgetDescriptionResponse {
  success: boolean;
  description: string;
  error?: string;
}

/**
 * Generate AI description for a dashboard widget
 * Uses GPT-4.1-nano model to create concise, meaningful widget descriptions
 */
export async function generateWidgetDescription(
  request: WidgetDescriptionRequest
): Promise<WidgetDescriptionResponse> {
  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info('Generating widget description', {
        widgetTitle: request.widgetTitle,
        chartType: request.chartType,
        collectionName: request.collectionName,
        attempt,
        maxRetries: MAX_RETRIES
      });

      const result = await attemptGenerateDescription(request);

      if (result.success) {
        logger.info('Widget description generated successfully', {
          widgetTitle: request.widgetTitle,
          descriptionLength: result.description.length,
          attempt
        });
        return result;
      }

      lastError = new Error(result.error || 'Unknown error');
      logger.warn('Widget description generation attempt failed', {
        widgetTitle: request.widgetTitle,
        attempt,
        error: lastError.message
      });
    } catch (error) {
      lastError = error as Error;
      logger.warn('Widget description generation attempt failed with exception', {
        widgetTitle: request.widgetTitle,
        attempt,
        error: (error as Error).message
      });
    }

    // Wait before retrying (exponential backoff)
    if (attempt < MAX_RETRIES) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // All retries failed
  logger.error('All widget description generation attempts failed', {
    widgetTitle: request.widgetTitle,
    attempts: MAX_RETRIES,
    lastError: lastError?.message
  });

  return {
    success: false,
    description: '',
    error: `Failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`
  };
}

/**
 * Single attempt to generate widget description using GPT-4.1-nano
 */
async function attemptGenerateDescription(
  request: WidgetDescriptionRequest
): Promise<WidgetDescriptionResponse> {
  const manager = getAIServiceManager();

  const systemPrompt = [
    'You are a dashboard widget description generator.',
    'Your task is to create concise, informative descriptions for dashboard widgets.',
    '',
    'RULES:',
    '- Generate a description between 10-30 words',
    '- Focus on WHAT the widget shows and WHY it\'s useful',
    '- Be specific and business-focused',
    '- Use professional, clear language',
    '- Make it actionable and meaningful',
    '- Don\'t just repeat the widget title',
    '',
    'GOOD EXAMPLES:',
    '- "Tracks monthly revenue trends to identify seasonal patterns and growth opportunities"',
    '- "Displays top performing products by sales volume for inventory planning"',
    '- "Shows customer acquisition metrics over time to measure marketing effectiveness"',
    '',
    'BAD EXAMPLES (avoid these):',
    '- "A chart showing data" (too vague)',
    '- "This widget displays information" (not specific)',
    '- "Monthly Sales Chart" (just repeats title)',
    '',
    'OUTPUT FORMAT:',
    'Return a JSON object with a "description" field containing the generated text.',
    'Example: {"description":"Tracks user engagement metrics to identify trends and optimize retention strategies"}',
    '',
    'Return ONLY valid JSON. No markdown, no explanations, no code fences.'
  ].join('\n');

  const contextParts = [];
  
  if (request.widgetTitle) {
    contextParts.push(`Widget Title: "${request.widgetTitle}"`);
  }
  
  if (request.chartType) {
    contextParts.push(`Chart Type: ${request.chartType}`);
  }
  
  if (request.databaseName && request.collectionName) {
    contextParts.push(`Data Source: ${request.databaseName}.${request.collectionName}`);
  } else if (request.collectionName) {
    contextParts.push(`Collection: ${request.collectionName}`);
  }
  
  if (request.query) {
    // Only include query if it's not too long
    const queryPreview = request.query.length > 200 
      ? request.query.substring(0, 200) + '...' 
      : request.query;
    contextParts.push(`Query: ${queryPreview}`);
  }

  const userPrompt = [
    'Generate a concise, meaningful description for this dashboard widget:',
    '',
    ...contextParts,
    '',
    'Create a professional description (10-30 words) that explains what this widget shows and why it\'s useful.',
    'Return strict JSON only: {"description":"your text here"}'
  ].join('\n');

  const ai = await manager.call(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { 
      temperature: 0.7,
      maxTokens: 150,
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

  // Validate and extract description
  if (!jsonResponse.description || typeof jsonResponse.description !== 'string') {
    throw new Error('Invalid AI response: missing or invalid description field');
  }

  const description = String(jsonResponse.description).trim().slice(0, 200); // Max 200 chars

  if (description.length === 0) {
    throw new Error('AI returned empty description');
  }

  return {
    success: true,
    description
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

