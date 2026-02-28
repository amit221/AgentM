import OpenAIService from './openai.service';
import GeminiService from './gemini.service';
import logger from '../utils/logger';

type ServiceType = 'openai' | 'gemini';

class AIServiceManager {
  private services: Record<ServiceType, any>;
  private activeService: ServiceType | null = null;
  private configurations: Record<ServiceType, { isConfigured: boolean; apiKey: string | null }>; 

  constructor() {
    this.services = {
      openai: new OpenAIService(),
      gemini: new GeminiService()
    } as const as Record<ServiceType, any>;

    this.configurations = {
      openai: { isConfigured: false, apiKey: null },
      gemini: { isConfigured: false, apiKey: null }
    };
  }

  /**
   * Initialize provider configurations from environment variables.
   * Supported env vars:
   * - OPENAI_API_KEY
   * - GEMINI_API_KEY
   * - AI_PROVIDER ("openai" | "gemini") optional preferred active service
   */
  initializeFromEnv() {
    const log = logger.child({ component: 'AIServiceManager' });
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const preferred = (process.env.AI_PROVIDER as ServiceType | undefined) ?? undefined;

    if (openaiKey) {
      const res = this.configure('openai', openaiKey);
      log.info('Configured OpenAI service', { success: res.success });
    }
    if (geminiKey) {
      const res = this.configure('gemini', geminiKey);
      log.info('Configured Gemini service', { success: res.success });
    }

    if (preferred && this.configurations[preferred]?.isConfigured) {
      this.setActiveService(preferred);
      log.info('Set preferred active AI provider', { activeService: preferred });
    }

    if (!this.activeService) {
      log.warn('No AI services configured');
    }

    return this.getStatus();
  }

  configure(serviceType: ServiceType, apiKey: string) {
    if (!this.services[serviceType]) return { success: false, error: `Unknown service type: ${serviceType}` };
    try {
      const result = this.services[serviceType].configure(apiKey);
      if (result.success) {
        this.configurations[serviceType] = { isConfigured: true, apiKey };
        if (!this.activeService) this.activeService = serviceType;
      } else {
        this.configurations[serviceType] = { isConfigured: false, apiKey: null };
      }
      return result;
    } catch (err: any) {
      this.configurations[serviceType] = { isConfigured: false, apiKey: null };
      logger.error('AI service configuration failed', { serviceType, error: err?.message });
      return { success: false, error: err?.message || 'Failed to configure service' };
    }
  }

  setActiveService(serviceType: ServiceType) {
    if (!this.services[serviceType]) return { success: false, error: `Unknown service type: ${serviceType}` };
    if (!this.configurations[serviceType].isConfigured) return { success: false, error: `${serviceType} service is not configured` };
    this.activeService = serviceType;
    return { success: true };
  }

  removeConfiguration(serviceType: ServiceType) {
    if (!this.services[serviceType]) return { success: false, error: `Unknown service type: ${serviceType}` };
    this.configurations[serviceType] = { isConfigured: false, apiKey: null };
    if (this.activeService === serviceType) {
      const fallback = (Object.keys(this.configurations) as ServiceType[]).find(s => this.configurations[s].isConfigured) || null;
      this.activeService = fallback;
    }
    return { success: true };
  }

  getStatus() {
    const configuredServices = (Object.keys(this.configurations) as ServiceType[]).filter(s => this.configurations[s].isConfigured);
    return {
      isReady: this.activeService !== null && this.configurations[this.activeService]?.isConfigured,
      activeService: this.activeService,
      configuredServices,
      configurations: {
        openai: { isConfigured: this.configurations.openai.isConfigured },
        gemini: { isConfigured: this.configurations.gemini.isConfigured }
      }
    };
  }

  private getActiveServiceInstance() {
    if (!this.activeService) return null;
    if (!this.configurations[this.activeService].isConfigured) return null;
    return this.services[this.activeService];
  }

  private getProviderForModel(modelName: string): ServiceType | null {
    const lower = modelName.toLowerCase();
    if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4')) {
      return 'openai';
    }
    if (lower.includes('gemini')) {
      return 'gemini';
    }
    return null;
  }

  private getServiceForModel(modelName?: string): { service: any; provider: ServiceType } | null {
    if (!modelName) {
      const svc = this.getActiveServiceInstance();
      if (!svc || !this.activeService) return null;
      return { service: svc, provider: this.activeService };
    }

    const provider = this.getProviderForModel(modelName);
    if (!provider) {
      logger.warn('Could not determine provider for model, falling back to active service', { modelName });
      const svc = this.getActiveServiceInstance();
      if (!svc || !this.activeService) return null;
      return { service: svc, provider: this.activeService };
    }

    if (!this.configurations[provider]?.isConfigured) {
      logger.error('Provider not configured for requested model', { modelName, provider });
      return null;
    }

    return { service: this.services[provider], provider };
  }

  async call(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { temperature?: number; maxTokens?: number; model?: string }
  ) {
    const serviceInfo = this.getServiceForModel(options?.model);
    if (!serviceInfo) {
      return { success: false, error: 'No AI service configured for the requested model. Please configure OpenAI or Gemini.' };
    }

    const { service: svc, provider } = serviceInfo;
    if (typeof svc.callAI !== 'function') {
      return { success: false, error: 'AI service does not support raw calls' };
    }

    try {
      const start = Date.now();
      const result = await svc.callAI(messages, options);
      
      const text = typeof result === 'string' ? result : result.text;
      const tokenUsage = typeof result === 'object' ? result.tokenUsage : undefined;
      const model = typeof result === 'object' ? result.model : options?.model;
      
      logger.info('AI raw call finished', {
        provider,
        requestedModel: options?.model,
        actualModel: model,
        durationMs: Date.now() - start,
        success: true,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        inputTokens: tokenUsage?.inputTokens,
        outputTokens: tokenUsage?.outputTokens,
        totalTokens: tokenUsage?.totalTokens,
      });
      return { success: true, text, tokenUsage, model };
    } catch (err: any) {
      logger.error('AI raw call failed', { provider, requestedModel: options?.model, error: err?.message });
      return { success: false, error: err?.message || 'AI call failed' };
    }
  }
}

let singleton: AIServiceManager | null = null;
export function getAIServiceManager(): AIServiceManager {
  if (!singleton) singleton = new AIServiceManager();
  return singleton;
}
