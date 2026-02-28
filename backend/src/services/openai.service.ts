import OpenAI from 'openai';
import logger from '../utils/logger';

export default class OpenAIService {
  private client: OpenAI | null = null;
  private configured = false;

  configure(apiKey: string) {
    try {
      this.client = new OpenAI({ apiKey });
      this.configured = true;
      logger.info('OpenAI configured');
      return { success: true };
    } catch (err: any) {
      this.configured = false;
      logger.error('OpenAI configure failed', { error: err?.message });
      return { success: false, error: err?.message || 'Failed to configure OpenAI' };
    }
  }

  isReady() {
    return this.configured && this.client !== null;
  }

  /**
   * Core method to call OpenAI API
   * Simple wrapper that handles API communication only
   */
  async callAI(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { temperature?: number; maxTokens?: number; model?: string }
  ): Promise<{ text: string; tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }; model?: string }> {
    if (!this.client) throw new Error('OpenAI service not configured');
    const start = Date.now();
    const completion = await this.client.chat.completions.create({
      model: options?.model ?? 'gpt-4.1-mini',
      messages,
      max_completion_tokens: options?.maxTokens ?? 15000
    });
    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error('No response received from OpenAI');
    
    const usage = (completion as any)?.usage;
    const tokenUsage = usage ? {
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0
    } : undefined;
    
    try {
      logger.info('OpenAI call completed', {
        durationMs: Date.now() - start,
        model: completion.model,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
      });
    } catch {}
    
    return {
      text: response,
      tokenUsage,
      model: completion.model
    };
  }
}


