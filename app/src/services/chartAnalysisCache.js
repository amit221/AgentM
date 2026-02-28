/**
 * Chart Analysis Cache Service
 * Provides persistent caching for AI chart analysis results across component mounts/unmounts
 */

class ChartAnalysisCache {
  constructor() {
    this.cache = new Map();
    this.pendingRequests = new Map();
  }

  /**
   * Generate a cache key from query data
   */
  generateCacheKey(processedData, query, queryContext, conversationContext = null) {
    const dataHash = this.hashData(processedData?.documents);
    const queryHash = this.hashString(query || '');
    const contextHash = this.hashString(JSON.stringify({
      database: queryContext?.database,
      collection: queryContext?.collection,
      queryType: queryContext?.queryType
    }));
    const conversationHash = conversationContext 
      ? this.hashString(JSON.stringify(conversationContext))
      : 'no_conv';
    
    return `${dataHash}_${queryHash}_${contextHash}_${conversationHash}`;
  }

  /**
   * Simple hash function for data
   */
  hashData(data) {
    if (!Array.isArray(data) || data.length === 0) return 'empty';
    
    // Create hash from data length, first item keys, and sample values
    const firstItem = data[0];
    const keys = Object.keys(firstItem).sort().join(',');
    const sampleValues = Object.values(firstItem).slice(0, 3).join(',');
    
    return `${data.length}_${this.hashString(keys)}_${this.hashString(sampleValues)}`;
  }

  /**
   * Simple hash function for strings
   */
  hashString(str) {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Get cached analysis result
   */
  get(processedData, query, queryContext, conversationContext = null) {
    const key = this.generateCacheKey(processedData, query, queryContext, conversationContext);
    const cached = this.cache.get(key);
    
    if (cached) {
      console.log(`📦 ChartAnalysisCache: Cache HIT for key: ${key}`);
      return {
        ...cached,
        fromCache: true
      };
    }
    
    console.log(`📦 ChartAnalysisCache: Cache MISS for key: ${key}`);
    return null;
  }

  /**
   * Store analysis result in cache
   */
  set(processedData, query, queryContext, analysisResult, conversationContext = null) {
    const key = this.generateCacheKey(processedData, query, queryContext, conversationContext);
    
    // Add timestamp for potential expiration
    const cacheEntry = {
      ...analysisResult,
      cachedAt: Date.now(),
      key
    };
    
    this.cache.set(key, cacheEntry);
    console.log(`📦 ChartAnalysisCache: Cached result for key: ${key}`);
    
    // Clean up old entries if cache gets too large
    if (this.cache.size > 50) {
      this.cleanup();
    }
  }

  /**
   * Check if a request is already pending for this data
   */
  isPending(processedData, query, queryContext, conversationContext = null) {
    const key = this.generateCacheKey(processedData, query, queryContext, conversationContext);
    return this.pendingRequests.has(key);
  }

  /**
   * Mark a request as pending
   */
  setPending(processedData, query, queryContext, promise, conversationContext = null) {
    const key = this.generateCacheKey(processedData, query, queryContext, conversationContext);
    this.pendingRequests.set(key, promise);
    
    // Clean up when promise resolves/rejects
    promise.finally(() => {
      this.pendingRequests.delete(key);
    });
    
    console.log(`📦 ChartAnalysisCache: Marked request as pending for key: ${key}`);
    return promise;
  }

  /**
   * Get pending request promise
   */
  getPending(processedData, query, queryContext, conversationContext = null) {
    const key = this.generateCacheKey(processedData, query, queryContext, conversationContext);
    return this.pendingRequests.get(key);
  }

  /**
   * Clean up old cache entries
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt > maxAge) {
        this.cache.delete(key);
        console.log(`📦 ChartAnalysisCache: Cleaned up expired entry: ${key}`);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.pendingRequests.clear();
    console.log('📦 ChartAnalysisCache: Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Create singleton instance
const chartAnalysisCache = new ChartAnalysisCache();

// Export for debugging
if (typeof window !== 'undefined') {
  window.chartAnalysisCache = chartAnalysisCache;
}

export default chartAnalysisCache;
