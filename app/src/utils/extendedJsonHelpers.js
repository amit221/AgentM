/**
 * Utilities for handling MongoDB Extended JSON format
 * Extended JSON preserves BSON types like ObjectId and Date
 */

/**
 * Check if value is Extended JSON ObjectId: { "$oid": "..." }
 */
export function isExtendedJsonObjectId(value) {
  return value && typeof value === 'object' && value.$oid && typeof value.$oid === 'string';
}

/**
 * Check if value is Extended JSON Date: { "$date": "..." }
 */
export function isExtendedJsonDate(value) {
  return value && typeof value === 'object' && value.$date && typeof value.$date === 'string';
}

/**
 * Check if a string value looks like an ISO date (fallback for non-EJSON results)
 */
export function isISODateString(value) {
  if (typeof value !== 'string') return false;
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!isoDatePattern.test(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Check if a string value looks like an ObjectId (fallback for non-EJSON results)
 */
export function isObjectIdString(value) {
  if (typeof value !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(value);
}

/**
 * Convert Extended JSON to MongoDB constructor syntax
 * Recursively processes objects and arrays
 */
export function convertExtendedJsonToMongoSyntax(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => convertExtendedJsonToMongoSyntax(item));
  }
  
  if (typeof obj === 'object') {
    // Check for Extended JSON ObjectId
    if (isExtendedJsonObjectId(obj)) {
      return `ObjectId("${obj.$oid}")`;
    }
    
    // Check for Extended JSON Date
    if (isExtendedJsonDate(obj)) {
      return `ISODate("${obj.$date}")`;
    }
    
    // Recursively process nested objects
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertExtendedJsonToMongoSyntax(value);
    }
    return converted;
  }
  
  return obj;
}

/**
 * Format a value for display based on its type
 * Handles Extended JSON and fallback patterns
 */
export function formatValueForDisplay(value) {
  // Check for Extended JSON ObjectId: { "$oid": "..." }
  if (isExtendedJsonObjectId(value)) {
    return `ObjectId("${value.$oid}")`;
  }
  
  // Check for Extended JSON Date: { "$date": "..." }
  if (isExtendedJsonDate(value)) {
    return `ISODate("${value.$date}")`;
  }
  
  // Fallback: Check if this is an ObjectId string (24 character hex string)
  if (isObjectIdString(value)) {
    return `ObjectId("${value}")`;
  }
  
  // Fallback: Check if this is an ISO date string
  if (isISODateString(value)) {
    return `ISODate("${value}")`;
  }
  
  return value;
}

/**
 * Stringify document with proper MongoDB constructors (ObjectId, ISODate)
 * Handles Extended JSON format from EJSON.serialize
 */
export function stringifyWithMongoTypes(obj) {
  return JSON.stringify(obj, (key, value) => {
    // Handle Extended JSON ObjectId: { "$oid": "..." }
    if (isExtendedJsonObjectId(value)) {
      return `__OBJECTID__${value.$oid}__OBJECTID__`;
    }
    // Handle Extended JSON Date: { "$date": "..." }
    if (isExtendedJsonDate(value)) {
      return `__DATE__${value.$date}__DATE__`;
    }
    // Fallback: Handle plain ISO date strings
    if (typeof value === 'string' && isISODateString(value)) {
      return `__DATE__${value}__DATE__`;
    }
    // Fallback: Handle plain ObjectId strings
    if (typeof value === 'string' && isObjectIdString(value)) {
      return `__OBJECTID__${value}__OBJECTID__`;
    }
    return value;
  })
  .replace(/"__DATE__([^"]+)__DATE__"/g, (match, dateStr) => {
    return `ISODate("${dateStr}")`;
  })
  .replace(/"__OBJECTID__([^"]+)__OBJECTID__"/g, (match, oidStr) => {
    return `ObjectId("${oidStr}")`;
  });
}

/**
 * Wrap dates and ObjectIds for editing
 * Shows them as ISODate() and ObjectId() in the editor
 */
export function wrapForEditing(obj) {
  return JSON.stringify(obj, (key, value) => {
    // Handle Extended JSON ObjectId: { "$oid": "..." }
    if (isExtendedJsonObjectId(value)) {
      return `__OBJECTID__${value.$oid}__OBJECTID__`;
    }
    // Handle Extended JSON Date: { "$date": "..." }
    if (isExtendedJsonDate(value)) {
      return `__ISODATE__${value.$date}__ISODATE__`;
    }
    // Fallback: Handle plain ISO date strings
    if (typeof value === 'string' && isISODateString(value)) {
      return `__ISODATE__${value}__ISODATE__`;
    }
    // Fallback: Handle plain ObjectId strings
    if (typeof value === 'string' && isObjectIdString(value)) {
      return `__OBJECTID__${value}__OBJECTID__`;
    }
    return value;
  }, 2)
  .replace(/"__ISODATE__([^"]+)__ISODATE__"/g, (match, dateStr) => {
    return `ISODate("${dateStr}")`;
  })
  .replace(/"__OBJECTID__([^"]+)__OBJECTID__"/g, (match, oidStr) => {
    return `ObjectId("${oidStr}")`;
  });
}

/**
 * Unwrap ISODate() and ObjectId() constructors back to plain strings
 * For parsing edited JSON back into JavaScript objects
 * Validates dates and ObjectIds, throwing errors for invalid values
 */
export function unwrapFromEditing(jsonStr) {
  // Validate and replace ISODate("...") back to plain strings
  const dateErrors = [];
  let unwrapped = jsonStr.replace(/ISODate\("([^"]+)"\)/g, (match, dateStr) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      dateErrors.push(`Invalid date: "${dateStr}"`);
    }
    return `"${dateStr}"`;
  });
  
  // Validate and replace ObjectId("...") back to plain strings
  const objectIdErrors = [];
  unwrapped = unwrapped.replace(/ObjectId\("([^"]+)"\)/g, (match, oidStr) => {
    if (!/^[0-9a-fA-F]{24}$/.test(oidStr)) {
      objectIdErrors.push(`Invalid ObjectId: "${oidStr}" (must be 24 hex characters)`);
    }
    return `"${oidStr}"`;
  });
  
  // Throw error if any validation failed
  const allErrors = [...dateErrors, ...objectIdErrors];
  if (allErrors.length > 0) {
    throw new Error(`Validation failed:\n${allErrors.join('\n')}`);
  }
  
  return unwrapped;
}

/**
 * Get the display type for a value (for styling/coloring)
 */
export function getDisplayType(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  
  if (isExtendedJsonObjectId(value)) return 'objectId';
  if (isExtendedJsonDate(value)) return 'date';
  if (isObjectIdString(value)) return 'objectId';
  if (isISODateString(value)) return 'date';
  
  if (Array.isArray(value)) return 'array';
  
  return typeof value;
}

