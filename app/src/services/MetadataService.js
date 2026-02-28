import httpClient from '../utils/httpClient';

/**
 * MetadataService
 * 
 * Frontend service for managing collection metadata.
 * Handles loading from Electron storage and generating via backend API.
 */
class MetadataService {
  
  /**
   * Get or generate metadata for a database
   * @param {string} connectionId - MongoDB connection ID
   * @param {string} databaseName - Database name
   * @returns {Promise<{metadata: Object, fromCache: boolean}>}
   */
  async getOrGenerateMetadata(connectionId, databaseName) {
    try {
      console.log(`📊 Getting metadata for ${databaseName}...`);
      
      // Load schemas from Electron storage
      const schemasResult = await window.electronAPI.storage.loadCollectionSchemas(databaseName);
      
      // Check if metadata exists
      if (schemasResult.success && schemasResult.metadata) {
        console.log(`✅ Metadata cache HIT for ${databaseName}`);
        return {
          metadata: schemasResult.metadata,
          fromCache: true
        };
      }
      
      console.log(`ℹ️ Metadata cache MISS for ${databaseName}, generating...`);
      
      // If no metadata, check if we have schemas to generate from
      if (!schemasResult.schemas || Object.keys(schemasResult.schemas).length === 0) {
        throw new Error('No schemas available to generate metadata from');
      }
      
      // Generate metadata using existing schemas
      const metadata = await this.generateMetadata(
        connectionId,
        databaseName,
        schemasResult.schemas
      );
      
      // Save metadata back to Electron storage
      await window.electronAPI.storage.saveCollectionSchemas(
        databaseName,
        schemasResult.schemas,
        metadata
      );
      
      console.log(`✅ Metadata generated and saved for ${databaseName}`);
      
      return {
        metadata,
        fromCache: false
      };
      
    } catch (error) {
      console.error(`❌ Failed to get/generate metadata for ${databaseName}:`, error);
      throw error;
    }
  }
  
  /**
   * Generate metadata by calling backend API
   * @param {string} connectionId - MongoDB connection ID
   * @param {string} databaseName - Database name
   * @param {Object} existingSchemas - Existing schemas from storage
   * @returns {Promise<Object>} Generated metadata
   */
  async generateMetadata(connectionId, databaseName, existingSchemas) {
    try {
      console.log(`🤖 Calling backend to generate metadata for ${databaseName}...`);
      console.log(`🤖 Existing schemas keys:`, Object.keys(existingSchemas));
      
      // Extract collection info from existing schemas
      const collections = Object.entries(existingSchemas).map(([name, schemaInfo]) => ({
        name,
        fields: Object.keys(schemaInfo.schema || {}),
        documentCount: schemaInfo.documentCount || 0
      }));
      
      console.log(`🤖 Prepared ${collections.length} collections for metadata generation`);
      console.log(`🤖 Sample collection:`, collections[0]);
      
      // Call backend API
      console.log(`🤖 Sending POST to /api/v1/metadata/generate`);
      const backendUrl = localStorage.getItem('backend-url') || 
                        (typeof __BACKEND_URL__ !== 'undefined' ? __BACKEND_URL__ : 'http://localhost:8787');
      const response = await httpClient.request(`${backendUrl}/api/v1/metadata/generate`, {
        method: 'POST',
        body: {
          databaseName,
          collections
        }
      });
      
      console.log(`🤖 Backend response status:`, response.status);
      
      const data = await response.json();
      console.log(`🤖 Backend response data:`, data);
      
      if (!data || !data.success) {
        console.error(`❌ Backend returned error:`, data?.error);
        throw new Error(data?.error || 'Metadata generation failed');
      }
      
      console.log(`✅ Metadata successfully received from backend`);
      return data.metadata;
      
    } catch (error) {
      console.error('❌ Metadata generation API call failed:', error);
      console.error('❌ Error response:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      throw new Error(`Failed to generate metadata: ${error.message}`);
    }
  }
  
  /**
   * Update metadata for changed collections
   * @param {string} connectionId - MongoDB connection ID
   * @param {string} databaseName - Database name
   * @param {string[]} changedCollections - List of changed collection names
   * @returns {Promise<void>}
   */
  async updateMetadata(connectionId, databaseName, changedCollections) {
    try {
      console.log(`🔄 Updating metadata for ${changedCollections.length} collections in ${databaseName}...`);
      
      // Load existing data
      const schemasResult = await window.electronAPI.storage.loadCollectionSchemas(databaseName);
      
      if (!schemasResult.success || !schemasResult.schemas) {
        console.warn('No existing schemas found, skipping metadata update');
        return;
      }
      
      // Extract collection info for changed collections
      const collectionInfo = changedCollections
        .filter(name => schemasResult.schemas[name])
        .map(name => ({
          name,
          fields: Object.keys(schemasResult.schemas[name].schema || {})
        }));
      
      if (collectionInfo.length === 0) {
        console.log('No valid collections to update');
        return;
      }
      
      // Call backend to update metadata
      const backendUrl = localStorage.getItem('backend-url') || 
                        (typeof __BACKEND_URL__ !== 'undefined' ? __BACKEND_URL__ : 'http://localhost:8787');
      const response = await httpClient.request(`${backendUrl}/api/v1/metadata/update`, {
        method: 'POST',
        body: {
          databaseName,
          existingMetadata: schemasResult.metadata || { collections: [] },
          changedCollections,
          collectionInfo
        }
      });
      
      const data = await response.json();
      
      if (!data || !data.success) {
        throw new Error(data?.error || 'Metadata update failed');
      }
      
      // Save updated metadata
      await window.electronAPI.storage.saveCollectionSchemas(
        databaseName,
        schemasResult.schemas,
        data.metadata
      );
      
      console.log(`✅ Metadata updated for ${databaseName}`);
      
    } catch (error) {
      console.error(`❌ Failed to update metadata for ${databaseName}:`, error);
      throw error;
    }
  }
  
  /**
   * Clear metadata for a database (force regeneration)
   * @param {string} databaseName - Database name
   * @returns {Promise<void>}
   */
  async clearMetadata(databaseName) {
    try {
      const schemasResult = await window.electronAPI.storage.loadCollectionSchemas(databaseName);
      
      if (schemasResult.success && schemasResult.schemas) {
        await window.electronAPI.storage.saveCollectionSchemas(
          databaseName,
          schemasResult.schemas,
          null // Clear metadata
        );
        console.log(`✅ Metadata cleared for ${databaseName}`);
      }
    } catch (error) {
      console.error(`❌ Failed to clear metadata for ${databaseName}:`, error);
      throw error;
    }
  }
}

export default new MetadataService();

