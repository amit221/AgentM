import { Router, Request } from 'express';
import { DecideRequestSchema, ErrorRequestSchema } from '../ai/AgentProtocol';
import { agentDecide, agentErrorRepair } from '../ai/AgentService';
import { generateFieldDescriptions } from '../ai/FieldDescriptionService';
import { generateWidgetDescription } from '../ai/WidgetDescriptionService';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// GET /models - Get suggested AI models
// Any valid OpenAI or Gemini model name can be used — these are just defaults shown in the UI.
// Provider is auto-detected from the model name: "gpt"/"o3"/"o4" → OpenAI, "gemini" → Google.
router.get('/models', (req, res) => {
  try {
    const models = [
      { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', tier: 'standard' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'openai', tier: 'mini' },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', provider: 'openai', tier: 'nano' },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', tier: 'standard' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', tier: 'mini' },
      { id: 'o3', name: 'o3', provider: 'openai', tier: 'reasoning' },
      { id: 'o4-mini', name: 'o4-mini', provider: 'openai', tier: 'reasoning' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', tier: 'mini' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', tier: 'standard' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', tier: 'mini' },
    ];

    res.json({
      success: true,
      models,
      defaultModel: 'gpt-4.1-mini',
      note: 'Any OpenAI or Google Gemini model name can be used. These are suggested defaults.'
    });
  } catch (err: any) {
    logger.error('Failed to get models', { error: err?.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load available models' 
    });
  }
});

// Schema for field description request
const FieldDescriptionRequestSchema = z.object({
  collectionName: z.string().min(1),
  databaseName: z.string().min(1),
  fieldSamples: z.record(z.array(z.string()))
});

// Schema for widget description request
const WidgetDescriptionRequestSchema = z.object({
  widgetTitle: z.string().min(1),
  chartType: z.string().optional(),
  collectionName: z.string().optional(),
  databaseName: z.string().optional(),
  query: z.string().optional()
});

router.post('/decide', async (req: Request, res) => {
  const parsed = DecideRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('Invalid /agent/decide payload', { requestId: res.locals?.requestId, issues: parsed.error.issues?.slice(0, 5) });
    return res.status(400).json({ error: parsed.error.message, requestId: res.locals?.requestId });
  }
  
  try {
    const result = await agentDecide(
      parsed.data,
      {
        endpoint: req.path,
        requestId: res.locals?.requestId,
        conversationId: parsed.data.session_id
      }
    );
    
    return res.json({ success: true, ...result });
  } catch (err: any) {
    logger.error('Agent decide failed', { requestId: res.locals?.requestId, error: err?.message, stack: err?.stack });
    return res.status(500).json({ error: err?.message || 'Failed to process request', requestId: res.locals?.requestId });
  }
});

router.post('/error', async (req: Request, res) => {
  const parsed = ErrorRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('Invalid /agent/error payload', { requestId: res.locals?.requestId, issues: parsed.error.issues?.slice(0, 5) });
    return res.status(400).json({ error: parsed.error.message, requestId: res.locals?.requestId });
  }
  
  try {
    const result = await agentErrorRepair(
      parsed.data,
      {
        endpoint: req.path,
        requestId: res.locals?.requestId
      }
    );
    
    return res.json({ success: true, ...result });
  } catch (err: any) {
    logger.error('Agent error repair failed', { requestId: res.locals?.requestId, error: err?.message, stack: err?.stack });
    return res.status(500).json({ error: err?.message || 'Failed to process error', requestId: res.locals?.requestId });
  }
});

router.post('/field-descriptions', async (req: Request, res) => {
  const parsed = FieldDescriptionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('Invalid /agent/field-descriptions payload', { requestId: res.locals?.requestId, issues: parsed.error.issues?.slice(0, 5) });
    return res.status(400).json({ error: parsed.error.message, requestId: res.locals?.requestId });
  }
  
  try {
    const { collectionName, databaseName, fieldSamples } = parsed.data;
    const result = await generateFieldDescriptions(
      collectionName,
      databaseName,
      fieldSamples
    );
    
    return res.json(result);
  } catch (err: any) {
    logger.error('Field descriptions failed', { requestId: res.locals?.requestId, error: err?.message, stack: err?.stack });
    return res.status(500).json({ error: err?.message || 'Failed to generate field descriptions', requestId: res.locals?.requestId });
  }
});

router.post('/widget-description', async (req: Request, res) => {
  const parsed = WidgetDescriptionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('Invalid /agent/widget-description payload', { requestId: res.locals?.requestId, issues: parsed.error.issues?.slice(0, 5) });
    return res.status(400).json({ error: parsed.error.message, requestId: res.locals?.requestId });
  }
  
  try {
    const result = await generateWidgetDescription(
      parsed.data
    );
    
    return res.json(result);
  } catch (err: any) {
    logger.error('Widget description failed', { requestId: res.locals?.requestId, error: err?.message, stack: err?.stack });
    return res.status(500).json({ error: err?.message || 'Failed to generate widget description', requestId: res.locals?.requestId });
  }
});

export default router;
