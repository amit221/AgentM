/**
 * HTTP Client utility with fallback mechanism
 * First tries direct requests, falls back to Electron proxy on CORS errors
 */

class HttpClient {
  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI;
    this.fallbackToProxy = false; // Track if we should use proxy for subsequent requests
  }

  /**
   * Make a generic HTTP request with fallback mechanism
   * @param {string} url - Full URL to request
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async request(url, options = {}) {
    if (!url || typeof url !== 'string') {
      throw new Error('HTTP Client: Invalid URL provided');
    }

    // If we're not in Electron or we've already determined to use proxy, go straight to proxy
    if (!this.isElectron || this.fallbackToProxy) {
      return this._electronRequest(url, options);
    }

    // First, try direct request
    try {
      const response = await this._directRequest(url, options);
      
      // If direct request succeeds, reset fallback flag
      this.fallbackToProxy = false;
      
      return response;
    } catch (error) {
      // Check if it's a CORS error
      if (this._isCorsError(error)) {
        // console.warn('⚠️ HTTP Client: CORS error detected, falling back to Electron proxy:', {
        //   url,
        //   error: error.message
        // }); // Reduced logging for performance
        
        // Set fallback flag for future requests
        this.fallbackToProxy = true;
        
        // Fall back to Electron proxy
        return this._electronRequest(url, options);
      }
      
      // If it's not a CORS error, re-throw
      throw error;
    }
  }

  /**
   * Make a direct request using browser fetch
   * @private
   */
  async _directRequest(url, options = {}) {
    const fetchOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    if (options.body && options.method !== 'GET' && options.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const startTime = Date.now();
    const response = await fetch(url, fetchOptions);
    const responseTime = Date.now() - startTime;

    // Parse response data first, before checking if request was ok
    let responseData;
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.data = responseData;
      throw error;
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      json: async () => responseData,
      text: async () => typeof responseData === 'string' ? responseData : JSON.stringify(responseData),
      responseTime
    };
  }

  /**
   * Make request through Electron proxy
   * @private
   */
  async _electronRequest(url, options = {}) {
    if (!this.isElectron) {
      console.warn('HTTP Client: Not running in Electron, falling back to browser fetch');
      return this._browserFallback(url, options);
    }

    try {
      const response = await window.electronAPI.http.request({
        method: options.method || 'GET',
        url,
        headers: options.headers || {},
        body: options.body,
        timeout: options.timeout || 30000 // Default 30 second timeout
      });

      if (!response.success) {
        const errorMessage = response.error || `HTTP ${response.status}: ${response.statusText}`;
        console.error('❌ HTTP Client: Electron proxy request failed:', {
          url,
          status: response.status,
          error: errorMessage
        });
        
        // Create an enriched error object with status and data
        const error = new Error(errorMessage);
        error.status = response.status;
        error.statusText = response.statusText;
        error.data = response.data;
        throw error;
      }

      return {
        ok: response.success,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        json: async () => response.data,
        text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
        responseTime: response.responseTime
      };
    } catch (error) {
      console.error('❌ HTTP Client: Electron proxy request failed:', {
        url,
        method: options.method || 'GET',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Check if an error is a CORS error
   * @private
   */
  _isCorsError(error) {
    const errorMessage = error.message.toLowerCase();
    return errorMessage.includes('cors') || 
           errorMessage.includes('cross-origin') ||
           errorMessage.includes('blocked by cors policy') ||
           errorMessage.includes('access-control-allow-origin') ||
           errorMessage.includes('failed to fetch') ||
           errorMessage.includes('network error') ||
           errorMessage.includes('typeerror');
  }

  /**
   * Test the fallback mechanism by making a request
   * @param {string} url - URL to test
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Test result
   */
  async testFallback(url, options = {}) {
    try {
      // Reset fallback flag for testing
      this.fallbackToProxy = false;
      
      const result = await this.request(url, options);
      
      return {
        success: true,
        method: 'direct',
        url,
        status: result.status,
        fallbackUsed: false
      };
    } catch (error) {
      if (this._isCorsError(error)) {
        
        try {
          const proxyResult = await this._electronRequest(url, options);
          
          return {
            success: true,
            method: 'proxy',
            url,
            status: proxyResult.status,
            fallbackUsed: true,
            originalError: error.message
          };
        } catch (proxyError) {
          return {
            success: false,
            method: 'both_failed',
            url,
            directError: error.message,
            proxyError: proxyError.message,
            fallbackUsed: true
          };
        }
      }
      
      return {
        success: false,
        method: 'direct_failed',
        url,
        error: error.message,
        fallbackUsed: false
      };
    }
  }

  /**
   * Make an AI API request with fallback mechanism
   * @param {string} endpoint - API endpoint (e.g., '/generate', '/explain')
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async aiRequest(endpoint, options = {}) {
    const url = this._getAiUrl(endpoint);
    return this.request(url, options);
  }

  /**
   * Make an Agent API request with fallback mechanism
   * @param {string} endpoint - API endpoint (e.g., '/decide')
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async agentRequest(endpoint, options = {}) {
    const url = this._getAgentUrl(endpoint);
    return this.request(url, options);
  }

  /**
   * Browser fallback for development/testing
   * @private
   */
  async _browserFallback(url, options = {}) {
    const fetchOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    if (options.body && options.method !== 'GET' && options.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(options.body);
    }

    return fetch(url, fetchOptions);
  }

  /**
   * Get AI API URL for browser fallback
   * @private
   */
  _getAiUrl(endpoint) {
    // Use environment variable or localStorage override or default
    const backendUrl = localStorage.getItem('backend-url') || 
                      (typeof __BACKEND_URL__ !== 'undefined' ? __BACKEND_URL__ : 'http://localhost:8787');
    return `${backendUrl}/api/v1/ai${endpoint}`;
  }

  /**
   * Get Agent API URL for browser fallback
   * @private
   */
  _getAgentUrl(endpoint) {
    // Use environment variable or localStorage override or default
    const backendUrl = localStorage.getItem('backend-url') || 
                      (typeof __BACKEND_URL__ !== 'undefined' ? __BACKEND_URL__ : 'http://localhost:8787');
    return `${backendUrl}/api/v1/agent${endpoint}`;
  }

  /**
   * Check if running in Electron
   * @returns {boolean}
   */
  isElectronAvailable() {
    return this.isElectron;
  }

  /**
   * Reset fallback flag to try direct requests again
   * Useful for testing or when server CORS configuration changes
   */
  resetFallback() {
    this.fallbackToProxy = false;
  }

  /**
   * Force use of proxy for all future requests
   * Useful when you know the server has CORS issues
   */
  forceProxy() {
    this.fallbackToProxy = true;
  }
}

// Create and export a singleton instance
const httpClient = new HttpClient();
export default httpClient;

// Also export the class for testing
export { HttpClient };

