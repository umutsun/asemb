import { Router, Request, Response } from 'express';
import { ragChat } from '../services/rag-chat.service';

const router = Router();

/**
 * Send a chat message
 */
router.post('/api/v2/chat', async (req: Request, res: Response) => {
  try {
    console.log('Chat request received:', {
      body: req.body,
      headers: req.headers['content-type']
    });
    
    const { 
      message, 
      conversationId, 
      userId = 'demo-user',
      temperature = 0.1,
      model,
      systemPrompt,
      ragWeight,
      useLocalDb,
      language,
      responseStyle
    } = req.body;
    
    if (!message || message.trim() === '') {
      console.log('Message validation failed:', { message });
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('Processing message:', { message, conversationId, userId, temperature });
    
    // Pass all options to processMessage
    const result = await ragChat.processMessage(message, conversationId, userId, {
      temperature,
      model,
      systemPrompt,
      ragWeight,
      useLocalDb,
      language,
      responseStyle
    });
    
    console.log('Chat response:', { 
      hasResponse: !!result.response,
      sourcesCount: result.sources?.length || 0 
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Chat error details:', error);
    res.status(500).json({ 
      error: 'Chat processing failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * Get user conversations
 */
router.get('/api/v2/chat/conversations', async (req: Request, res: Response) => {
  try {
    const { userId = 'demo-user' } = req.query;
    
    const conversations = await ragChat.getUserConversations(userId as string);
    
    res.json({
      conversations,
      count: conversations.length
    });
  } catch (error: any) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

/**
 * Get specific conversation
 */
router.get('/api/v2/chat/conversation/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const conversation = await ragChat.getConversation(id);
    
    res.json(conversation);
  } catch (error: any) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * Get popular/suggested questions
 */
router.get('/api/v2/chat/suggestions', async (req: Request, res: Response) => {
  try {
    const suggestions = await ragChat.getPopularQuestions();
    res.json({ suggestions });
  } catch (error: any) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

export default router;