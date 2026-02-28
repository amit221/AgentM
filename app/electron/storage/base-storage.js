const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

/**
 * Base storage manager providing common functionality for all storage types
 */
class BaseStorage {
  constructor(filename, options = {}) {
    this.userDataPath = app.getPath('userData');
    this.filename = filename;
    this.filePath = path.join(this.userDataPath, filename);
    this.backupPath = path.join(this.userDataPath, `${filename}.backup`);
    
    // Options
    this.enableEncryption = options.enableEncryption || false;
    this.enableBackup = options.enableBackup !== false; // Default to true
    this.validateData = options.validateData || null;
    
    // Initialize encryption if enabled
    if (this.enableEncryption) {
      this.encryptionKey = this.getOrCreateEncryptionKey();
    }
  }

  /**
   * Get or create encryption key
   */
  getOrCreateEncryptionKey() {
    const keyFile = path.join(this.userDataPath, '.storage-keys', `${this.filename}.key`);
    
    try {
      // Ensure keys directory exists
      const keysDir = path.dirname(keyFile);
      if (!fs.existsSync(keysDir)) {
        fs.mkdirSync(keysDir, { recursive: true });
      }

      if (fs.existsSync(keyFile)) {
        return fs.readFileSync(keyFile);
      } else {
        const key = crypto.randomBytes(32);
        fs.writeFileSync(keyFile, key);
        return key;
      }
    } catch (error) {
      console.error(`Error handling encryption key for ${this.filename}:`, error);
      return crypto.randomBytes(32); // Fallback to in-memory key
    }
  }

  /**
   * Encrypt data
   */
  encrypt(text) {
    if (!this.enableEncryption || !text) return text;
    
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error(`Encryption error for ${this.filename}:`, error);
      return text; // Fallback to plain text
    }
  }

  /**
   * Decrypt data
   */
  decrypt(encryptedText) {
    if (!this.enableEncryption || !encryptedText) return encryptedText;
    
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
      console.error(`Decryption error for ${this.filename}:`, error);
      return encryptedText; // Return as-is if decryption fails
    }
  }

  /**
   * Create backup of current data
   */
  async createBackup() {
    if (!this.enableBackup || !fs.existsSync(this.filePath)) {
      return { success: true };
    }

    try {
      const data = fs.readFileSync(this.filePath);
      fs.writeFileSync(this.backupPath, data);
      return { success: true };
    } catch (error) {
      console.error(`Error creating backup for ${this.filename}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup() {
    if (!this.enableBackup || !fs.existsSync(this.backupPath)) {
      return { success: false, error: 'No backup file found' };
    }

    try {
      const data = fs.readFileSync(this.backupPath);
      fs.writeFileSync(this.filePath, data);
      return { success: true };
    } catch (error) {
      console.error(`Error restoring backup for ${this.filename}:`, error);
      return { success: false, error: error.message };
    }
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
   * Safe JSON parse with fallback
   */
  safeJsonParse(jsonString, fallback = {}) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error(`JSON parse error for ${this.filename}:`, error);
      return fallback;
    }
  }

  /**
   * Load data from file
   */
  async load() {
    try {
      // Return default if file doesn't exist
      if (!fs.existsSync(this.filePath)) {
        const defaultData = this.getDefaultData();
        return { success: true, data: defaultData };
      }

      // Read and parse data
      const fileData = fs.readFileSync(this.filePath, 'utf8');
      let data = this.safeJsonParse(fileData, this.getDefaultData());

      // Validate data structure
      const validation = this.validateDataStructure(data);
      if (!validation.valid) {
        console.warn(`Invalid data structure in ${this.filename}:`, validation.error);
        
        // Try to restore from backup
        if (this.enableBackup) {
          console.log(`Attempting to restore ${this.filename} from backup...`);
          const restoreResult = await this.restoreFromBackup();
          if (restoreResult.success) {
            const backupData = fs.readFileSync(this.filePath, 'utf8');
            data = this.safeJsonParse(backupData, this.getDefaultData());
          } else {
            data = this.getDefaultData();
          }
        } else {
          data = this.getDefaultData();
        }
      }

      // Decrypt sensitive fields if needed
      data = this.decryptData(data);

      return { success: true, data };
    } catch (error) {
      console.error(`Error loading ${this.filename}:`, error);
      
      // Try to restore from backup on error
      if (this.enableBackup) {
        console.log(`Attempting to restore ${this.filename} from backup due to load error...`);
        const restoreResult = await this.restoreFromBackup();
        if (restoreResult.success) {
          try {
            const backupData = fs.readFileSync(this.filePath, 'utf8');
            const data = this.safeJsonParse(backupData, this.getDefaultData());
            return { success: true, data: this.decryptData(data) };
          } catch (backupError) {
            console.error(`Error loading backup for ${this.filename}:`, backupError);
          }
        }
      }
      
      return { success: false, error: error.message, data: this.getDefaultData() };
    }
  }

  /**
   * Save data to file
   */
  async save(data) {
    try {
      // Validate data before saving
      const validation = this.validateDataStructure(data);
      if (!validation.valid) {
        return { success: false, error: `Invalid data structure: ${validation.error}` };
      }

      // Create backup before saving
      if (this.enableBackup) {
        await this.createBackup();
      }

      // Ensure directory exists
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }

      // Encrypt sensitive fields if needed
      const dataToSave = this.encryptData(data);

      // Add metadata
      const finalData = {
        ...dataToSave,
        _metadata: {
          lastSaved: new Date().toISOString(),
          version: this.getDataVersion()
        }
      };

      // Write to file atomically
      const tempFile = `${this.filePath}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(finalData, null, 2));
      fs.renameSync(tempFile, this.filePath);

      return { success: true };
    } catch (error) {
      console.error(`Error saving ${this.filename}:`, error);
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
      console.error(`Error clearing ${this.filename}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Abstract methods to be implemented by subclasses
  getDefaultData() {
    return {};
  }

  getDataVersion() {
    return '1.0.0';
  }

  encryptData(data) {
    return data; // Override in subclasses if encryption is needed
  }

  decryptData(data) {
    return data; // Override in subclasses if decryption is needed
  }
}

module.exports = BaseStorage;