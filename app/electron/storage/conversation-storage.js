const SessionStorage = require('./session-storage');

/**
 * Dedicated storage manager for conversations and query history
 * Now uses session storage - conversations are temporary and lost on app close
 */
class ConversationStorage extends SessionStorage {
  constructor() {
    super('conversations.json', {
      validateData: (data) => this.validateConversationData(data)
    });
  }

  /**
   * Get default conversation data structure
   */
  getDefaultData() {
    return {
      conversations: [
        {
          id: 'default',
          name: 'Query Session 1',
          database: '',
          queries: [],
          currentPrompt: '',
          currentGeneratedQuery: '',
          isActive: true,
          createdAt: new Date().toISOString(),
          relevantCollections: [],
          collectionSchemas: null
        }
      ],
      activeConversationId: 'default',
      queryHistory: [],
      favorites: [],
      preferences: {
        maxHistoryItems: 100,
        maxConversations: 20,
        autoSaveInterval: 5000
      }
    };
  }

  /**
   * Get data version for migration purposes
   */
  getDataVersion() {
    return '2.1.0';
  }

  /**
   * Validate conversation data structure
   */
  validateConversationData(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Data must be an object' };
    }

    if (!Array.isArray(data.conversations)) {
      return { valid: false, error: 'conversations must be an array' };
    }

    if (!Array.isArray(data.queryHistory)) {
      return { valid: false, error: 'queryHistory must be an array' };
    }

    if (!Array.isArray(data.favorites)) {
      return { valid: false, error: 'favorites must be an array' };
    }

    // Validate each conversation
    for (const conv of data.conversations) {
      if (!conv.id || typeof conv.name !== 'string') {
        return { valid: false, error: 'Each conversation must have id and name' };
      }
      if (!Array.isArray(conv.queries)) {
        return { valid: false, error: 'Each conversation must have queries array' };
      }
    }

    // Ensure at least one conversation exists
    if (data.conversations.length === 0) {
      return { valid: false, error: 'At least one conversation must exist' };
    }

    return { valid: true };
  }

  /**
   * Encrypt sensitive strings within conversations, favorites, and history
   */
  encryptData(data) {
    if (!data) return data;

    const clone = JSON.parse(JSON.stringify(data));
    // Ensure cap at storage level too
    clone.queryHistory = Array.isArray(clone.queryHistory) ? clone.queryHistory.slice(-50) : [];

    // Helper to encrypt a field if present and string
    const enc = (value) => typeof value === 'string' ? this.encrypt(value) : value;

    // Encrypt within conversations
    if (Array.isArray(clone.conversations)) {
      clone.conversations = clone.conversations.map(conv => {
        const convCopy = { ...conv };
        convCopy.currentPrompt = enc(convCopy.currentPrompt);
        convCopy.currentGeneratedQuery = enc(convCopy.currentGeneratedQuery);
        if (Array.isArray(convCopy.queries)) {
          convCopy.queries = convCopy.queries.map(q => ({
            ...q,
            prompt: enc(q.prompt),
            // Support both legacy "query" and current "generatedQuery" fields
            query: enc(q.query),
            generatedQuery: enc(q.generatedQuery)
          }));
        }
        return convCopy;
      });
    }

    // Encrypt favorites
    if (Array.isArray(clone.favorites)) {
      clone.favorites = clone.favorites.map(f => ({
        ...f,
        prompt: enc(f.prompt),
        query: enc(f.query),
        generatedQuery: enc(f.generatedQuery)
      }));
    }

    // Encrypt history
    if (Array.isArray(clone.queryHistory)) {
      clone.queryHistory = clone.queryHistory.map(h => ({
        ...h,
        prompt: enc(h.prompt),
        query: enc(h.query),
        generatedQuery: enc(h.generatedQuery)
      }));
    }

    return clone;
  }

  /**
   * Decrypt sensitive strings within conversations, favorites, and history
   */
  decryptData(data) {
    if (!data) return data;

    const clone = JSON.parse(JSON.stringify(data));
    const dec = (value) => typeof value === 'string' ? this.decrypt(value) : value;

    if (Array.isArray(clone.conversations)) {
      clone.conversations = clone.conversations.map(conv => {
        const convCopy = { ...conv };
        convCopy.currentPrompt = dec(convCopy.currentPrompt);
        convCopy.currentGeneratedQuery = dec(convCopy.currentGeneratedQuery);
        if (Array.isArray(convCopy.queries)) {
          convCopy.queries = convCopy.queries.map(q => ({
            ...q,
            prompt: dec(q.prompt),
            query: dec(q.query),
            generatedQuery: dec(q.generatedQuery)
          }));
        }
        return convCopy;
      });
    }

    if (Array.isArray(clone.favorites)) {
      clone.favorites = clone.favorites.map(f => ({
        ...f,
        prompt: dec(f.prompt),
        query: dec(f.query),
        generatedQuery: dec(f.generatedQuery)
      }));
    }

    if (Array.isArray(clone.queryHistory)) {
      clone.queryHistory = clone.queryHistory.map(h => ({
        ...h,
        prompt: dec(h.prompt),
        query: dec(h.query),
        generatedQuery: dec(h.generatedQuery)
      }));
    }

    return clone;
  }

  /**
   * Add a new conversation
   */
  async addConversation(conversationData = {}) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      
      // Generate ID if not provided
      const id = conversationData.id || `conversation_${Date.now()}`;
      
      const newConversation = {
        id,
        name: conversationData.name || `Query Session ${data.conversations.length + 1}`,
        database: conversationData.database || '',
        queries: [],
        currentPrompt: conversationData.prompt || '',
        currentGeneratedQuery: conversationData.query || '',
        isActive: false,
        createdAt: new Date().toISOString(),
        relevantCollections: [],
        collectionSchemas: null,
        ...conversationData
      };

      data.conversations.push(newConversation);
      
      // Enforce max conversations limit
      if (data.conversations.length > data.preferences.maxConversations) {
        // Remove oldest non-active conversations
        data.conversations = data.conversations
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, data.preferences.maxConversations);
      }

      const saveResult = await this.save(data);
      return { 
        success: saveResult.success, 
        conversationId: id,
        error: saveResult.error
      };
    } catch (error) {
      console.error('Error adding conversation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove a conversation
   */
  async removeConversation(conversationId) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      const originalLength = data.conversations.length;
      
      // Don't allow removing the last conversation
      if (data.conversations.length <= 1) {
        return { success: false, error: 'Cannot remove the last conversation' };
      }
      
      data.conversations = data.conversations.filter(conv => conv.id !== conversationId);
      
      if (data.conversations.length === originalLength) {
        return { success: false, error: 'Conversation not found' };
      }

      // Update active conversation if removed one was active
      if (data.activeConversationId === conversationId) {
        data.activeConversationId = data.conversations[0]?.id || null;
        // Set new active conversation
        data.conversations = data.conversations.map(conv => ({
          ...conv,
          isActive: conv.id === data.activeConversationId
        }));
      }

      return await this.save(data);
    } catch (error) {
      console.error('Error removing conversation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a conversation
   */
  async updateConversation(conversationId, updates) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      const conversationIndex = data.conversations.findIndex(conv => conv.id === conversationId);
      
      if (conversationIndex === -1) {
        return { success: false, error: 'Conversation not found' };
      }

      // Remove currentResults from updates to avoid saving temporary data
      const { currentResults, ...safeUpdates } = updates;

      data.conversations[conversationIndex] = {
        ...data.conversations[conversationIndex],
        ...safeUpdates,
        lastModified: new Date().toISOString()
      };

      return await this.save(data);
    } catch (error) {
      console.error('Error updating conversation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set active conversation
   */
  async setActiveConversation(conversationId) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      
      // Check if conversation exists
      const conversationExists = data.conversations.some(conv => conv.id === conversationId);
      if (!conversationExists) {
        return { success: false, error: 'Conversation not found' };
      }

      data.activeConversationId = conversationId;
      data.conversations = data.conversations.map(conv => ({
        ...conv,
        isActive: conv.id === conversationId
      }));

      return await this.save(data);
    } catch (error) {
      console.error('Error setting active conversation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add query to history
   */
  async addToHistory(queryItem) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      
      const historyItem = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...queryItem
      };

      data.queryHistory.unshift(historyItem); // Add to beginning
      
      // Enforce max history limit
      if (data.queryHistory.length > data.preferences.maxHistoryItems) {
        data.queryHistory = data.queryHistory.slice(0, data.preferences.maxHistoryItems);
      }

      return await this.save(data);
    } catch (error) {
      console.error('Error adding to history:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add to favorites
   */
  async addToFavorites(favoriteItem) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      
      const favorite = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        ...favoriteItem
      };

      data.favorites.push(favorite);

      return await this.save(data);
    } catch (error) {
      console.error('Error adding to favorites:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove from favorites
   */
  async removeFromFavorites(favoriteId) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      data.favorites = data.favorites.filter(fav => fav.id !== favoriteId);

      return await this.save(data);
    } catch (error) {
      console.error('Error removing from favorites:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear conversation queries
   */
  async clearConversationQueries(conversationId) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      const conversation = data.conversations.find(conv => conv.id === conversationId);
      
      if (!conversation) {
        return { success: false, error: 'Conversation not found' };
      }

      conversation.queries = [];
      conversation.currentPrompt = '';
      conversation.currentGeneratedQuery = '';

      return await this.save(data);
    } catch (error) {
      console.error('Error clearing conversation queries:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all conversations and related data
   */
  async getConversations() {
    try {
      const result = await this.load();
      if (!result.success) {
        return { 
          success: false, 
          error: result.error,
          data: this.getDefaultData()
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      console.error('Error getting conversations:', error);
      return { 
        success: false, 
        error: error.message,
        data: this.getDefaultData()
      };
    }
  }

  /**
   * Update preferences
   */
  async updatePreferences(preferences) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      data.preferences = {
        ...data.preferences,
        ...preferences
      };

      return await this.save(data);
    } catch (error) {
      console.error('Error updating conversation preferences:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Migrate data from old format
   */
  async migrateFromOldFormat(oldConversationData) {
    try {
      if (!oldConversationData) {
        return { success: true, migrated: false };
      }

      const result = await this.load();
      const data = result.success ? result.data : this.getDefaultData();

      let migrated = false;

      // Migrate conversations
      if (oldConversationData.conversations && Array.isArray(oldConversationData.conversations)) {
        const cleanedConversations = oldConversationData.conversations.map(conv => {
          const { currentResults, ...cleanConv } = conv;
          return {
            ...cleanConv,
            queries: cleanConv.queries ? cleanConv.queries.map(q => {
              const { results, ...cleanQuery } = q;
              return cleanQuery;
            }) : []
          };
        });

        data.conversations = cleanedConversations;
        migrated = true;
      }

      // Migrate active conversation
      if (oldConversationData.activeConversationId) {
        data.activeConversationId = oldConversationData.activeConversationId;
        migrated = true;
      }

      // Migrate query history
      if (oldConversationData.queryHistory && Array.isArray(oldConversationData.queryHistory)) {
        const cleanedHistory = oldConversationData.queryHistory.map(q => {
          const { results, ...cleanQuery } = q;
          return cleanQuery;
        });
        data.queryHistory = cleanedHistory;
        migrated = true;
      }

      // Migrate favorites
      if (oldConversationData.favorites && Array.isArray(oldConversationData.favorites)) {
        data.favorites = oldConversationData.favorites;
        migrated = true;
      }

      if (migrated) {
        const saveResult = await this.save(data);
        return { 
          success: saveResult.success, 
          migrated: true,
          error: saveResult.error
        };
      }

      return { success: true, migrated: false };
    } catch (error) {
      console.error('Error migrating conversation data:', error);
      return { success: false, error: error.message, migrated: false };
    }
  }
}

module.exports = ConversationStorage;