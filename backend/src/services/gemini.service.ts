import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger';

export default class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
  private configured = false;

  configure(apiKey: string) {
    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      this.configured = true;
      logger.info('Gemini configured');
      return { success: true };
    } catch (err: any) {
      this.configured = false;
      logger.error('Gemini configure failed', { error: err?.message });
      return { success: false, error: err?.message || 'Failed to configure Gemini' };
    }
  }

  isReady() { 
    return this.configured && this.model !== null; 
  }

  /**
   * Core method to call Gemini API
   * Simple wrapper that handles API communication only
   */
  async callAI(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { temperature?: number; maxTokens?: number; model?: string }
  ): Promise<{ text: string; tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }; model?: string }> {
    if (!this.model) throw new Error('Gemini service not configured');
    
    const start = Date.now();
    
    // Convert messages to Gemini format (combine system and user messages)
    const combinedContent = messages.map(msg => {
      if (msg.role === 'system') {
        return `System: ${msg.content}`;
      } else if (msg.role === 'user') {
        return `User: ${msg.content}`;
      } else {
        return `Assistant: ${msg.content}`;
      }
    }).join('\n\n');
    
    const result = await this.model.generateContent(combinedContent);
    const response = result.response;
    const text = response.text();
    
    if (!text) throw new Error('No response received from Gemini');
    
    // Extract token usage if available (Gemini API provides this in usageMetadata)
    const usageMetadata = (response as any).usageMetadata;
    const tokenUsage = usageMetadata ? {
      inputTokens: usageMetadata.promptTokenCount || 0,
      outputTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0
    } : undefined;
    
    try {
      logger.info('Gemini call completed', {
        durationMs: Date.now() - start,
        model: 'gemini-2.0-flash-exp',
        promptTokens: tokenUsage?.inputTokens,
        candidatesTokens: tokenUsage?.outputTokens,
        totalTokens: tokenUsage?.totalTokens,
      });
    } catch {}
    
    return {
      text,
      tokenUsage,
      model: 'gemini-2.0-flash-exp'
    };
  }
}


