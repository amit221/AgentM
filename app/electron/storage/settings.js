const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

class SettingsStorage {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.settingsFile = path.join(this.userDataPath, 'settings.json');
    this.encryptionKey = this.getOrCreateEncryptionKey();
  }

  getOrCreateEncryptionKey() {
    const keyFile = path.join(this.userDataPath, '.key');
    
    try {
      if (fs.existsSync(keyFile)) {
        return fs.readFileSync(keyFile);
      } else {
        const key = crypto.randomBytes(32);
        fs.writeFileSync(keyFile, key);
        return key;
      }
    } catch (error) {
      console.error('Error handling encryption key:', error);
      return crypto.randomBytes(32); // Fallback to in-memory key
    }
  }

  encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      return text; // Fallback to plain text
    }
  }

  decrypt(encryptedText) {
    try {
      if (!encryptedText.includes(':')) {
        return encryptedText; // Assume plain text
      }
      
      const [ivHex, encrypted] = encryptedText.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return encryptedText; // Return as-is if decryption fails
    }
  }

  async saveSettings(settings) {
    try {
      // Ensure directory exists
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }

      // Encrypt sensitive data
      const settingsToSave = { ...settings };
      if (settingsToSave.openaiApiKey) {
        settingsToSave.openaiApiKey = this.encrypt(settingsToSave.openaiApiKey);
      }
      if (settingsToSave.geminiApiKey) {
        settingsToSave.geminiApiKey = this.encrypt(settingsToSave.geminiApiKey);
      }
      fs.writeFileSync(this.settingsFile, JSON.stringify(settingsToSave, null, 2));
      return { success: true };
    } catch (error) {
      console.error('Error saving settings:', error);
      return { success: false, error: error.message };
    }
  }

  async loadSettings() {
    try {
      if (!fs.existsSync(this.settingsFile)) {
        return { success: true, settings: {} };
      }

      const settingsData = fs.readFileSync(this.settingsFile, 'utf8');
      const settings = JSON.parse(settingsData);

      // Decrypt sensitive data
      if (settings.openaiApiKey) {
        settings.openaiApiKey = this.decrypt(settings.openaiApiKey);
      }
      if (settings.geminiApiKey) {
        settings.geminiApiKey = this.decrypt(settings.geminiApiKey);
      }
      return { success: true, settings };
    } catch (error) {
      console.error('Error loading settings:', error);
      return { success: false, error: error.message };
    }
  }

  async saveFavorite(favorite) {
    try {
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      
      if (!settings.favorites) {
        settings.favorites = [];
      }

      favorite.id = Date.now().toString();
      settings.favorites.push(favorite);

      return await this.saveSettings(settings);
    } catch (error) {
      console.error('Error saving favorite:', error);
      return { success: false, error: error.message };
    }
  }

  async loadFavorites() {
    try {
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      return { success: true, favorites: settings.favorites || [] };
    } catch (error) {
      console.error('Error loading favorites:', error);
      return { success: false, error: error.message };
    }
  }

  async saveHistory(historyItem) {
    try {
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      
      if (!settings.history) {
        settings.history = [];
      }

      historyItem.id = Date.now().toString();
      historyItem.timestamp = new Date().toISOString();
      settings.history.unshift(historyItem); // Add to beginning

      // Keep only last 50 history items
      settings.history = settings.history.slice(0, 50);

      return await this.saveSettings(settings);
    } catch (error) {
      console.error('Error saving history:', error);
      return { success: false, error: error.message };
    }
  }

  async loadHistory() {
    try {
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      return { success: true, history: settings.history || [] };
    } catch (error) {
      console.error('Error loading history:', error);
      return { success: false, error: error.message };
    }
  }

  // App state persistence methods
  async saveAppState(appState) {
    try {
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      
      settings.appState = {
        ...settings.appState,
        ...appState,
        lastSaved: new Date().toISOString()
      };

      return await this.saveSettings(settings);
    } catch (error) {
      console.error('Error saving app state:', error);
      return { success: false, error: error.message };
    }
  }

  async loadAppState() {
    try {
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      return { success: true, appState: settings.appState || {} };
    } catch (error) {
      console.error('Error loading app state:', error);
      return { success: false, error: error.message };
    }
  }

  async saveConnectionState(connectionState) {
    try {
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      
      // Encrypt sensitive connection string before saving
      const stateToSave = { ...connectionState };
      if (stateToSave.connectionString) {
        stateToSave.connectionString = this.encrypt(stateToSave.connectionString);
      }

      settings.connectionState = {
        ...stateToSave,
        lastSaved: new Date().toISOString()
      };

      return await this.saveSettings(settings);
    } catch (error) {
      console.error('Error saving connection state:', error);
      return { success: false, error: error.message };
    }
  }

  async loadConnectionState() {
    try {
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      
      const connectionState = settings.connectionState || {};
      
      // Decrypt connection string if it exists
      if (connectionState.connectionString) {
        connectionState.connectionString = this.decrypt(connectionState.connectionString);
      }

      return { success: true, connectionState };
    } catch (error) {
      console.error('Error loading connection state:', error);
      return { success: false, error: error.message };
    }
  }

  async saveConversations(conversations) {
    try {
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      
      settings.conversations = {
        data: conversations,
        lastSaved: new Date().toISOString()
      };

      return await this.saveSettings(settings);
    } catch (error) {
      console.error('Error saving conversations:', error);
      return { success: false, error: error.message };
    }
  }

  async loadConversations() {
    try {
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      
      const conversationsData = settings.conversations?.data || [];
      return { success: true, conversations: conversationsData };
    } catch (error) {
      console.error('Error loading conversations:', error);
      return { success: false, error: error.message };
    }
  }

  async saveCollectionSchemas(databaseName, schemas, metadata = null) {
    try {
      const schemasCount = schemas ? Object.keys(schemas).length : 0;
      
      console.log(`💾 [SETTINGS.JS] saveCollectionSchemas called:`, {
        databaseName,
        schemasCount,
        hasMetadata: !!metadata,
        metadataType: metadata ? typeof metadata : 'null',
        metadataKeys: metadata ? Object.keys(metadata) : [],
        hasViews: !!(metadata?.views),
        hasFunctions: !!(metadata?.functions),
        hasEnumTypes: !!(metadata?.enumTypes),
        hasCollections: !!(metadata?.collections)
      });
      
      // Allow saving even with empty schemas (indicates indexing completed, even if no tables/collections found)
      // This is especially important for PostgreSQL where tables might be in different schemas
      if (schemasCount === 0) {
        console.log(`⚠️ [SETTINGS.JS] Saving empty schemas for ${databaseName} - no tables/collections found (indexing completed)`);
        // Continue to save - this indicates indexing was completed, even if no tables were found
      }
      
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      
      if (!settings.collectionSchemas) {
        settings.collectionSchemas = {};
      }

      // Get existing data for this database to preserve fields we're not updating
      const existingData = settings.collectionSchemas[databaseName] || {};
      const existingMetadata = existingData.metadata || {};
      
      // Merge metadata to preserve both pgMetadata (views, functions, enumTypes) 
      // AND collectionMetadata (collections array from AI descriptions)
      // New metadata fields overwrite existing ones, but we keep fields that aren't in the new metadata
      let mergedMetadata = null;
      if (metadata || Object.keys(existingMetadata).length > 0) {
        mergedMetadata = {
          ...existingMetadata,  // Keep existing fields (like views, functions, enumTypes, collections)
          ...metadata           // Overwrite with new fields
        };
        
        console.log(`💾 [SETTINGS.JS] Merged metadata:`, {
          existingKeys: Object.keys(existingMetadata),
          newKeys: metadata ? Object.keys(metadata) : [],
          mergedKeys: Object.keys(mergedMetadata),
          hasViews: !!(mergedMetadata?.views),
          viewsCount: mergedMetadata?.views ? Object.keys(mergedMetadata.views).length : 0,
          hasFunctions: !!(mergedMetadata?.functions),
          functionsCount: mergedMetadata?.functions?.length || 0,
          hasEnumTypes: !!(mergedMetadata?.enumTypes),
          enumTypesCount: mergedMetadata?.enumTypes ? Object.keys(mergedMetadata.enumTypes).length : 0
        });
      }

      settings.collectionSchemas[databaseName] = {
        schemas,
        metadata: mergedMetadata,
        lastUpdated: new Date().toISOString()
      };

      console.log(`💾 [SETTINGS.JS] About to save settings with metadata:`, {
        databaseName,
        dataToSave: {
          hasSchemas: schemasCount > 0,
          hasMetadata: !!mergedMetadata,
          metadataKeys: mergedMetadata ? Object.keys(mergedMetadata) : []
        }
      });

      const saveResult = await this.saveSettings(settings);
      
      console.log(`💾 [SETTINGS.JS] Save result:`, {
        success: saveResult.success,
        error: saveResult.error || 'none'
      });
      
      return saveResult;
    } catch (error) {
      console.error('❌ [SETTINGS.JS] Error saving collection schemas:', error);
      return { success: false, error: error.message };
    }
  }

  async loadCollectionSchemas(databaseName) {
    try {
      console.log(`📂 [SETTINGS.JS] loadCollectionSchemas called for: ${databaseName}`);
      
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      
      const schemaData = settings.collectionSchemas?.[databaseName];
      if (!schemaData) {
        console.log(`📂 [SETTINGS.JS] No schema data found for ${databaseName}`);
        return { success: true, schemas: null, metadata: null };
      }

      const schemasCount = schemaData.schemas ? Object.keys(schemaData.schemas).length : 0;
      
      // If schemas exist but are empty, check if indexing completed
      // Empty schemas with lastUpdated timestamp indicate indexing completed (no tables/collections found)
      if (schemasCount === 0) {
        if (schemaData.lastUpdated) {
          // Empty schemas with timestamp = indexing completed, no tables found (valid state)
          console.log(`📂 [SETTINGS.JS] Schema data is empty but indexing completed (lastUpdated: ${schemaData.lastUpdated})`);
          return { 
            success: true, 
            schemas: schemaData.schemas || {}, // Return empty object, not null
            metadata: schemaData.metadata || null,
            lastUpdated: schemaData.lastUpdated
          };
        } else {
          // Empty schemas without timestamp = old/invalid data, clean it up
          console.log(`📂 [SETTINGS.JS] Schema data exists but is empty and has no timestamp - cleaning up`);
          
          // Remove the empty schema data from storage
          if (settings.collectionSchemas) {
            delete settings.collectionSchemas[databaseName];
            await this.saveSettings(settings);
            console.log(`🧹 [SETTINGS.JS] Cleaned up empty schema data for ${databaseName}`);
          }
          
          return { success: true, schemas: null, metadata: null };
        }
      }

      console.log(`📂 [SETTINGS.JS] Found schema data:`, {
        databaseName,
        hasSchemas: !!schemaData.schemas,
        schemasCount,
        hasMetadata: !!schemaData.metadata,
        metadataType: schemaData.metadata ? typeof schemaData.metadata : 'null',
        metadataCollections: schemaData.metadata?.collections?.length || 0,
        lastUpdated: schemaData.lastUpdated
      });

      const loadResult = { 
        success: true, 
        schemas: schemaData.schemas,
        metadata: schemaData.metadata || null,
        lastUpdated: schemaData.lastUpdated
      };
      
      console.log(`📂 [SETTINGS.JS] Returning:`, {
        success: true,
        hasSchemas: schemasCount > 0,
        hasMetadata: !!loadResult.metadata,
        metadataCollections: loadResult.metadata?.collections?.length || 0
      });
      
      return loadResult;
    } catch (error) {
      console.error('❌ [SETTINGS.JS] Error loading collection schemas:', error);
      return { success: false, error: error.message };
    }
  }

  async clearAllCollectionSchemas() {
    try {
      const result = await this.loadSettings();
      const settings = result.success ? result.settings : {};
      
      settings.collectionSchemas = {};
      
      return await this.saveSettings(settings);
    } catch (error) {
      console.error('Error clearing collection schemas:', error);
      return { success: false, error: error.message };
    }
  }

}

module.exports = SettingsStorage;