import { TokenCounter } from './tokenCounter';

/**
 * Maximum tokens for sampled results
 */
const MAX_TOKENS = 50000;

/**
 * Sample results to fit within token budget using first + last strategy
 * 
 * Strategy:
 * 1. If results fit in budget, return all
 * 2. If too large, take items from beginning and end
 * 3. Split budget evenly between first and last portions
 * 
 * @param {Array} results - Array of result documents
 * @param {number} maxTokens - Maximum tokens allowed (default 50k)
 * @returns {Object} Sampled results with metadata
 */
export function sampleResults(results, maxTokens = MAX_TOKENS) {
  // Handle null or empty results
  if (!results || !Array.isArray(results) || results.length === 0) {
    return {
      results: [],
      total_count: 0,
      sampled: false,
      token_count: 0
    };
  }

  const totalCount = results.length;
  const counter = new TokenCounter();
  
  try {
    // Check if all results fit within budget
    const fullTokens = counter.countTokens(JSON.stringify(results));
    
    if (fullTokens <= maxTokens) {
      console.log('Results fit within token budget', {
        totalCount,
        tokens: fullTokens,
        maxTokens
      });
      
      return {
        results,
        total_count: totalCount,
        sampled: false,
        token_count: fullTokens
      };
    }

    // Need to sample - split budget between first and last
    const halfBudget = Math.floor(maxTokens / 2);
    
    // Find how many items fit in half budget
    const findItemCount = (items, tokenBudget) => {
      let count = 0;
      let currentTokens = 0;
      
      for (let i = 0; i < items.length; i++) {
        const itemTokens = counter.countTokens(JSON.stringify(items[i]));
        if (currentTokens + itemTokens > tokenBudget) {
          break;
        }
        currentTokens += itemTokens;
        count++;
      }
      
      // Ensure we take at least 1 item if budget allows
      return Math.max(1, count);
    };

    // Get first portion
    const firstCount = findItemCount(results, halfBudget);
    const firstPortion = results.slice(0, firstCount);
    
    // Get last portion (from the end)
    const lastCount = findItemCount([...results].reverse(), halfBudget);
    const lastPortion = results.slice(-lastCount);
    
    // Combine portions (avoid duplicates if array is small)
    let sampledResults;
    if (firstCount + lastCount >= totalCount) {
      // If we're taking most/all items anyway, just take all
      sampledResults = results;
    } else {
      sampledResults = [...firstPortion, ...lastPortion];
    }
    
    const sampledTokens = counter.countTokens(JSON.stringify(sampledResults));
    const sampleInfo = `Showing first ${firstCount} and last ${lastCount} of ${totalCount} results (${sampledResults.length} total items)`;
    
    console.log('Results sampled to fit token budget', {
      originalCount: totalCount,
      sampledCount: sampledResults.length,
      firstCount,
      lastCount,
      originalTokens: fullTokens,
      sampledTokens,
      maxTokens
    });
    
    return {
      results: sampledResults,
      total_count: totalCount,
      sampled: true,
      sample_info: sampleInfo,
      token_count: sampledTokens
    };
  } finally {
    counter.cleanup();
  }
}

/**
 * Helper function to get token count for results without sampling
 * Useful for determining if sampling is needed
 * 
 * @param {Array} results - Array of result documents
 * @returns {number} Token count
 */
export function getResultTokenCount(results) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return 0;
  }
  
  const counter = new TokenCounter();
  try {
    return counter.countTokens(JSON.stringify(results));
  } finally {
    counter.cleanup();
  }
}

/**
 * Check if results would need sampling
 * 
 * @param {Array} results - Array of result documents
 * @param {number} maxTokens - Maximum tokens allowed (default 50k)
 * @returns {Object} { needsSampling, tokenCount }
 */
export function checkIfSamplingNeeded(results, maxTokens = MAX_TOKENS) {
  const tokenCount = getResultTokenCount(results);
  return {
    needsSampling: tokenCount > maxTokens,
    tokenCount
  };
}

