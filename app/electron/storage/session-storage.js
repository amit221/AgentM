/**
 * Session storage that mimics BaseStorage interface but stores data in memory only
 * Data is lost when the application closes - perfect for temporary conversations
 */
class SessionStorage {
  constructor(filename, options = {}) {
    this.filename = filename;
    this.validateData = options.validateData || null;
    
    // Store data in memory instead of files
    this.memoryData = null;
    
    console.log(`🧠 Session storage initialized for ${filename} - data will not persist`);
  }

  /**
   * Validate data structure
   */
  validateDataStructure(data) {
    if (this.validateData && typeof this.validateData === 'function') {
      return this.validateData(data);
    }
    return { valid: true };
  }

  /**
   * Load data from memory (or return default if not set)
   */
  async load() {
    try {
      if (this.memoryData === null) {
        const defaultData = this.getDefaultData();
        return { success: true, data: defaultData };
      }

      // Validate data structure
      const validation = this.validateDataStructure(this.memoryData);
      if (!validation.valid) {
        console.warn(`Invalid data structure in session storage for ${this.filename}:`, validation.error);
        const defaultData = this.getDefaultData();
        this.memoryData = defaultData;
        return { success: true, data: defaultData };
      }

      // Return a deep copy to prevent external modifications
      return { success: true, data: JSON.parse(JSON.stringify(this.memoryData)) };
    } catch (error) {
      console.error(`Error loading session data for ${this.filename}:`, error);
      const defaultData = this.getDefaultData();
      return { success: false, error: error.message, data: defaultData };
    }
  }

  /**
   * Save data to memory
   */
  async save(data) {
    try {
      // Validate data before saving
      const validation = this.validateDataStructure(data);
      if (!validation.valid) {
        return { success: false, error: `Invalid data structure: ${validation.error}` };
      }

      // Add metadata like BaseStorage does
      const finalData = {
        ...data,
        _metadata: {
          lastSaved: new Date().toISOString(),
          version: this.getDataVersion(),
          storageType: 'session'
        }
      };

      // Store in memory (deep copy to prevent external modifications)
      this.memoryData = JSON.parse(JSON.stringify(finalData));

      return { success: true };
    } catch (error) {
      console.error(`Error saving session data for ${this.filename}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear all data (reset to default)
   */
  async clear() {
    try {
      const defaultData = this.getDefaultData();
      return await this.save(defaultData);
    } catch (error) {
      console.error(`Error clearing session data for ${this.filename}:`, error);
      return { success: false, error: error.message };
    }
  }

  // No-op methods for compatibility with BaseStorage interface
  async createBackup() {
    return { success: true }; // No backup needed for session storage
  }

  async restoreFromBackup() {
    return { success: false, error: 'No backup available for session storage' };
  }

  // Encryption methods (no-op for session storage since it's temporary)
  encrypt(text) {
    return text; // No encryption needed for temporary data
  }

  decrypt(encryptedText) {
    return encryptedText; // No decryption needed for temporary data
  }

  encryptData(data) {
    return data; // No encryption needed for temporary data
  }

  decryptData(data) {
    return data; // No decryption needed for temporary data
  }

  // Abstract methods to be implemented by subclasses (same as BaseStorage)
  getDefaultData() {
    return {};
  }

  getDataVersion() {
    return '1.0.0-session';
  }
}

module.exports = SessionStorage;
