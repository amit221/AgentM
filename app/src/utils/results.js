// Normalize raw executeRawQuery response into the UI's results shape
export function normalizeResults(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.operation === 'script') {
    return {
      operation: 'script',
      result: result.result,
      count: result.count,
      executionTime: result.executionTime,
    };
  }
  return {
    documents: result.result,
    count: result.count,
    executionTime: result.executionTime,
  };
}


