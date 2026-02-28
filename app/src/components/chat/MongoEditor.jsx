import React, { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, acceptCompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentLess, indentWithTab } from '@codemirror/commands';

// Prettier
import prettier from 'prettier/standalone';
import pluginBabel from 'prettier/plugins/babel';
import pluginEstree from 'prettier/plugins/estree';

// Smart context-aware MongoDB completion source
const mongoCompletionSource = (context) => {
  const word = context.matchBefore(/\w[\w.$]*/);
  if (!word && !context.explicit) return null;

  // Helper function to create apply function for cursor positioning
  const createApply = (text, cursorOffset = 3) => (view, completion, from, to) => {
    const cursorPos = from + text.length - cursorOffset;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: cursorPos }
    });
    requestAnimationFrame(() => view.focus());
  };

  // Enhanced BSON Data Types with examples and documentation
  const bsonTypes = [
    { label: 'ObjectId()', detail: 'BSON ObjectId - Example: ObjectId("507f1f77bcf86cd799439011")', type: 'function', apply: createApply('ObjectId("")', 2) },
    { label: 'ISODate()', detail: 'BSON Date - Example: ISODate("2023-01-01T00:00:00Z")', type: 'function', apply: createApply('ISODate("")', 2) },
    { label: 'NumberInt()', detail: 'BSON 32-bit Integer - Example: NumberInt(42)', type: 'function', apply: createApply('NumberInt()', 1) },
    { label: 'NumberLong()', detail: 'BSON 64-bit Integer - Example: NumberLong("9223372036854775807")', type: 'function', apply: createApply('NumberLong("")', 2) },
    { label: 'NumberDecimal()', detail: 'BSON Decimal128 - Example: NumberDecimal("123.45")', type: 'function', apply: createApply('NumberDecimal("")', 2) },
    { label: 'UUID()', detail: 'BSON UUID - Example: UUID("550e8400-e29b-41d4-a716-446655440000")', type: 'function', apply: createApply('UUID("")', 2) },
    { label: 'BinData()', detail: 'BSON Binary Data - Example: BinData(0, "SGVsbG8gV29ybGQ=")', type: 'function', apply: createApply('BinData(0, "")', 5) },
    { label: 'Timestamp()', detail: 'BSON Timestamp - Example: Timestamp(1640995200, 1)', type: 'function', apply: createApply('Timestamp(0, 0)', 6) },
    { label: 'MinKey', detail: 'BSON MinKey - Represents the lowest possible value', type: 'keyword' },
    { label: 'MaxKey', detail: 'BSON MaxKey - Represents the highest possible value', type: 'keyword' },
    
    // Common value shortcuts with better details
    { label: 'true', detail: 'Boolean true value', type: 'value' },
    { label: 'false', detail: 'Boolean false value', type: 'value' },
    { label: 'null', detail: 'Null value - represents no value', type: 'value' },
    { label: 'undefined', detail: 'Undefined value - field not set', type: 'value' },
    { label: 'new Date()', detail: 'Current JavaScript Date', type: 'function', apply: createApply('new Date()', 8) },
    { label: '/regex/i', detail: 'Regular expression with case insensitive flag', type: 'snippet', apply: createApply('//i', 1) }
  ];

  // Query Operators
  const queryOperators = [
    // Comparison
    { label: '$eq', detail: 'Equal to', type: 'keyword' },
    { label: '$ne', detail: 'Not equal to', type: 'keyword' },
    { label: '$gt', detail: 'Greater than', type: 'keyword' },
    { label: '$gte', detail: 'Greater than or equal', type: 'keyword' },
    { label: '$lt', detail: 'Less than', type: 'keyword' },
    { label: '$lte', detail: 'Less than or equal', type: 'keyword' },
    { label: '$in', detail: 'In array', type: 'keyword' },
    { label: '$nin', detail: 'Not in array', type: 'keyword' },
    
    // Logical
    { label: '$and', detail: 'Logical AND', type: 'keyword' },
    { label: '$or', detail: 'Logical OR', type: 'keyword' },
    { label: '$nor', detail: 'Logical NOR', type: 'keyword' },
    { label: '$not', detail: 'Logical NOT', type: 'keyword' },
    
    // Element
    { label: '$exists', detail: 'Field exists', type: 'keyword' },
    { label: '$type', detail: 'Field type', type: 'keyword' },
    
    // Evaluation
    { label: '$expr', detail: 'Expression', type: 'keyword' },
    { label: '$jsonSchema', detail: 'JSON Schema validation', type: 'keyword' },
    { label: '$mod', detail: 'Modulo operation', type: 'keyword' },
    { label: '$regex', detail: 'Regular expression', type: 'keyword' },
    { label: '$text', detail: 'Text search', type: 'keyword' },
    { label: '$where', detail: 'JavaScript expression', type: 'keyword' },
    
    // Array
    { label: '$all', detail: 'All elements match', type: 'keyword' },
    { label: '$elemMatch', detail: 'Element match', type: 'keyword' },
    { label: '$size', detail: 'Array size', type: 'keyword' },
    
    // Geospatial
    { label: '$geoIntersects', detail: 'Geospatial intersects', type: 'keyword' },
    { label: '$geoWithin', detail: 'Geospatial within', type: 'keyword' },
    { label: '$near', detail: 'Geospatial near', type: 'keyword' },
    { label: '$nearSphere', detail: 'Geospatial near sphere', type: 'keyword' }
  ];

  // Aggregation Pipeline Stages
  const aggregationStages = [
    { label: '{ $match: {  } }', detail: 'Filter documents', type: 'function', apply: createApply('{ $match: {  } }', 4) },
    { label: '{ $project: {  } }', detail: 'Select/transform fields', type: 'function', apply: createApply('{ $project: {  } }', 4) },
    { label: '{ $group: { _id: null } }', detail: 'Group documents', type: 'function', apply: createApply('{ $group: { _id: ,  } }', 4) },
    { label: '{ $sort: {  } }', detail: 'Sort documents', type: 'function', apply: createApply('{ $sort: {  } }', 4) },
    { label: '{ $limit:  }', detail: 'Limit results', type: 'function', apply: createApply('{ $limit:  }', 2) },
    { label: '{ $skip:  }', detail: 'Skip documents', type: 'function', apply: createApply('{ $skip:  }', 2) },
    { label: '{ $unwind: "$" }', detail: 'Unwind array', type: 'function', apply: createApply('{ $unwind: "$" }', 2) },
    { label: '{ $lookup: {  } }', detail: 'Join collections', type: 'function', apply: createApply('{ $lookup: { from: "", localField: "", foreignField: "", as: "" } }', 54) },
    { label: '{ $addFields: {  } }', detail: 'Add fields', type: 'function', apply: createApply('{ $addFields: {  } }', 4) },
    { label: '{ $set: {  } }', detail: 'Set fields', type: 'function', apply: createApply('{ $set: {  } }', 4) },
    { label: '{ $unset: "" }', detail: 'Remove fields', type: 'function', apply: createApply('{ $unset: "" }', 2) },
    { label: '{ $replaceRoot: {  } }', detail: 'Replace root', type: 'function', apply: createApply('{ $replaceRoot: { newRoot: "$" } }', 2) },
    { label: '{ $count: "" }', detail: 'Count documents', type: 'function', apply: createApply('{ $count: "" }', 2) },
    { label: '{ $facet: {  } }', detail: 'Multi-facet aggregation', type: 'function', apply: createApply('{ $facet: {  } }', 4) },
    { label: '{ $bucket: {  } }', detail: 'Bucket documents', type: 'function', apply: createApply('{ $bucket: { groupBy: "$", boundaries: [] } }', 4) },
    { label: '{ $sample: { size:  } }', detail: 'Random sample', type: 'function', apply: createApply('{ $sample: { size:  } }', 4) },
    { label: '{ $out: "" }', detail: 'Output to collection', type: 'function', apply: createApply('{ $out: "" }', 2) },
    { label: '{ $merge: {  } }', detail: 'Merge to collection', type: 'function', apply: createApply('{ $merge: { into: "", on: "_id" } }', 19) }
  ];

  // Update Operators
  const updateOperators = [
    // Field Update
    { label: '$set', detail: 'Set field value', type: 'keyword' },
    { label: '$unset', detail: 'Remove field', type: 'keyword' },
    { label: '$rename', detail: 'Rename field', type: 'keyword' },
    { label: '$inc', detail: 'Increment value', type: 'keyword' },
    { label: '$mul', detail: 'Multiply value', type: 'keyword' },
    { label: '$min', detail: 'Set minimum value', type: 'keyword' },
    { label: '$max', detail: 'Set maximum value', type: 'keyword' },
    { label: '$currentDate', detail: 'Set current date', type: 'keyword' },
    
    // Array Update
    { label: '$push', detail: 'Add to array', type: 'keyword' },
    { label: '$pop', detail: 'Remove from array', type: 'keyword' },
    { label: '$pull', detail: 'Remove matching elements', type: 'keyword' },
    { label: '$pullAll', detail: 'Remove multiple elements', type: 'keyword' },
    { label: '$addToSet', detail: 'Add unique to array', type: 'keyword' },
    { label: '$each', detail: 'Apply to each element', type: 'keyword' },
    { label: '$slice', detail: 'Limit array size', type: 'keyword' },
    { label: '$sort', detail: 'Sort array elements', type: 'keyword' },
    { label: '$position', detail: 'Array insert position', type: 'keyword' }
  ];

  // MongoDB Expression Operators (for aggregation)
  const expressionOperators = [
    // Arithmetic Expressions
    { label: '$add', detail: 'Add numbers/dates', type: 'function', apply: createApply('{ $add: [  ] }', 4) },
    { label: '$subtract', detail: 'Subtract numbers/dates', type: 'function', apply: createApply('{ $subtract: [  ] }', 4) },
    { label: '$multiply', detail: 'Multiply numbers', type: 'function', apply: createApply('{ $multiply: [  ] }', 4) },
    { label: '$divide', detail: 'Divide numbers', type: 'function', apply: createApply('{ $divide: [  ] }', 4) },
    { label: '$mod', detail: 'Modulo operation', type: 'function', apply: createApply('{ $mod: [  ] }', 4) },
    { label: '$abs', detail: 'Absolute value', type: 'function', apply: createApply('{ $abs: "$" }', 2) },
    { label: '$ceil', detail: 'Round up', type: 'function', apply: createApply('{ $ceil: "$" }', 2) },
    { label: '$floor', detail: 'Round down', type: 'function', apply: createApply('{ $floor: "$" }', 2) },
    { label: '$round', detail: 'Round to nearest', type: 'function', apply: createApply('{ $round: ["$", 2] }', 6) },
    { label: '$sqrt', detail: 'Square root', type: 'function', apply: createApply('{ $sqrt: "$" }', 2) },
    { label: '$pow', detail: 'Power operation', type: 'function', apply: createApply('{ $pow: ["$", 2] }', 6) },
    
    // String Expressions
    { label: '$concat', detail: 'Concatenate strings', type: 'function', apply: createApply('{ $concat: [  ] }', 4) },
    { label: '$substr', detail: 'Substring', type: 'function', apply: createApply('{ $substr: ["$", 0, 5] }', 8) },
    { label: '$toLower', detail: 'Convert to lowercase', type: 'function', apply: createApply('{ $toLower: "$" }', 2) },
    { label: '$toUpper', detail: 'Convert to uppercase', type: 'function', apply: createApply('{ $toUpper: "$" }', 2) },
    { label: '$split', detail: 'Split string', type: 'function', apply: createApply('{ $split: ["$", ","] }', 5) },
    { label: '$trim', detail: 'Trim whitespace', type: 'function', apply: createApply('{ $trim: { input: "$" } }', 2) },
    { label: '$ltrim', detail: 'Left trim', type: 'function', apply: createApply('{ $ltrim: { input: "$" } }', 2) },
    { label: '$rtrim', detail: 'Right trim', type: 'function', apply: createApply('{ $rtrim: { input: "$" } }', 2) },
    { label: '$regexFind', detail: 'Find regex match', type: 'function', apply: createApply('{ $regexFind: { input: "$", regex: "" } }', 2) },
    { label: '$regexMatch', detail: 'Test regex match', type: 'function', apply: createApply('{ $regexMatch: { input: "$", regex: "" } }', 2) },
    { label: '$strLenCP', detail: 'String length', type: 'function', apply: createApply('{ $strLenCP: "$" }', 2) },
    
    // Date Expressions
    { label: '$dateAdd', detail: 'Add to date', type: 'function', apply: createApply('{ $dateAdd: { startDate: "$", unit: "day", amount: 1 } }', 19) },
    { label: '$dateDiff', detail: 'Date difference', type: 'function', apply: createApply('{ $dateDiff: { startDate: "$", endDate: "$", unit: "day" } }', 18) },
    { label: '$dateFromParts', detail: 'Construct date', type: 'function', apply: createApply('{ $dateFromParts: { year: 2023, month: 1, day: 1 } }', 12) },
    { label: '$dateToParts', detail: 'Deconstruct date', type: 'function', apply: createApply('{ $dateToParts: { date: "$" } }', 2) },
    { label: '$year', detail: 'Extract year', type: 'function', apply: createApply('{ $year: "$" }', 2) },
    { label: '$month', detail: 'Extract month', type: 'function', apply: createApply('{ $month: "$" }', 2) },
    { label: '$dayOfMonth', detail: 'Extract day', type: 'function', apply: createApply('{ $dayOfMonth: "$" }', 2) },
    { label: '$dayOfWeek', detail: 'Day of week', type: 'function', apply: createApply('{ $dayOfWeek: "$" }', 2) },
    { label: '$dayOfYear', detail: 'Day of year', type: 'function', apply: createApply('{ $dayOfYear: "$" }', 2) },
    { label: '$hour', detail: 'Extract hour', type: 'function', apply: createApply('{ $hour: "$" }', 2) },
    { label: '$minute', detail: 'Extract minute', type: 'function', apply: createApply('{ $minute: "$" }', 2) },
    { label: '$second', detail: 'Extract second', type: 'function', apply: createApply('{ $second: "$" }', 2) },
    
    // Array Expressions
    { label: '$arrayElemAt', detail: 'Get array element', type: 'function', apply: createApply('{ $arrayElemAt: ["$", 0] }', 5) },
    { label: '$arrayToObject', detail: 'Array to object', type: 'function', apply: createApply('{ $arrayToObject: "$" }', 2) },
    { label: '$objectToArray', detail: 'Object to array', type: 'function', apply: createApply('{ $objectToArray: "$" }', 2) },
    { label: '$concatArrays', detail: 'Concatenate arrays', type: 'function', apply: createApply('{ $concatArrays: [  ] }', 4) },
    { label: '$filter', detail: 'Filter array', type: 'function', apply: createApply('{ $filter: { input: "$", cond: {} } }', 3) },
    { label: '$map', detail: 'Transform array', type: 'function', apply: createApply('{ $map: { input: "$", in: {} } }', 3) },
    { label: '$reduce', detail: 'Reduce array', type: 'function', apply: createApply('{ $reduce: { input: "$", initialValue: {}, in: {} } }', 3) },
    { label: '$zip', detail: 'Zip arrays', type: 'function', apply: createApply('{ $zip: { inputs: [  ] } }', 4) },
    { label: '$range', detail: 'Generate range', type: 'function', apply: createApply('{ $range: [0, 10, 1] }', 8) },
    { label: '$size', detail: 'Array size', type: 'function', apply: createApply('{ $size: "$" }', 2) },
    { label: '$slice', detail: 'Array slice', type: 'function', apply: createApply('{ $slice: ["$", 0, 5] }', 8) },
    { label: '$reverseArray', detail: 'Reverse array', type: 'function', apply: createApply('{ $reverseArray: "$" }', 2) },
    { label: '$sortArray', detail: 'Sort array', type: 'function', apply: createApply('{ $sortArray: { input: "$", sortBy: {} } }', 3) },
    
    // Conditional Expressions
    { label: '$cond', detail: 'Conditional expression', type: 'function', apply: createApply('{ $cond: { if: {}, then: {}, else: {} } }', 3) },
    { label: '$ifNull', detail: 'Handle null values', type: 'function', apply: createApply('{ $ifNull: ["$", "default"] }', 11) },
    { label: '$switch', detail: 'Switch statement', type: 'function', apply: createApply('{ $switch: { branches: [{ case: {}, then: {} }], default: {} } }', 3) },
    
    // Comparison Expressions
    { label: '$eq', detail: 'Equal comparison', type: 'function', apply: createApply('{ $eq: [  ] }', 4) },
    { label: '$ne', detail: 'Not equal comparison', type: 'function', apply: createApply('{ $ne: [  ] }', 4) },
    { label: '$gt', detail: 'Greater than', type: 'function', apply: createApply('{ $gt: [  ] }', 4) },
    { label: '$gte', detail: 'Greater than or equal', type: 'function', apply: createApply('{ $gte: [  ] }', 4) },
    { label: '$lt', detail: 'Less than', type: 'function', apply: createApply('{ $lt: [  ] }', 4) },
    { label: '$lte', detail: 'Less than or equal', type: 'function', apply: createApply('{ $lte: [  ] }', 4) },
    
    // Logical Expressions
    { label: '$and', detail: 'Logical AND', type: 'function', apply: createApply('{ $and: [  ] }', 4) },
    { label: '$or', detail: 'Logical OR', type: 'function', apply: createApply('{ $or: [  ] }', 4) },
    { label: '$not', detail: 'Logical NOT', type: 'function', apply: createApply('{ $not: [  ] }', 4) },
    
    // Type Expressions
    { label: '$type', detail: 'Get field type', type: 'function', apply: createApply('{ $type: "$" }', 2) },
    { label: '$convert', detail: 'Convert type', type: 'function', apply: createApply('{ $convert: { input: "$", to: "string" } }', 10) },
    { label: '$toString', detail: 'Convert to string', type: 'function', apply: createApply('{ $toString: "$" }', 2) },
    { label: '$toInt', detail: 'Convert to integer', type: 'function', apply: createApply('{ $toInt: "$" }', 2) },
    { label: '$toDouble', detail: 'Convert to double', type: 'function', apply: createApply('{ $toDouble: "$" }', 2) },
    { label: '$toBool', detail: 'Convert to boolean', type: 'function', apply: createApply('{ $toBool: "$" }', 2) },
    { label: '$toDate', detail: 'Convert to date', type: 'function', apply: createApply('{ $toDate: "$" }', 2) },
    { label: '$toObjectId', detail: 'Convert to ObjectId', type: 'function', apply: createApply('{ $toObjectId: "$" }', 2) }
  ];

  // Query Patterns and Snippets (not method definitions)
  const queryPatterns = [
    // Basic Query Patterns
    { label: '{ field: "value" }', detail: 'String equality', type: 'snippet', apply: createApply('{ : "" }', 6) },
    { label: '{ field: { $gt:  } }', detail: 'Greater than', type: 'snippet', apply: createApply('{ : { $gt:  } }', 4) },
    { label: '{ field: { $in: [] } }', detail: 'In array', type: 'snippet', apply: createApply('{ : { $in: [] } }', 4) },
    { label: '{ field: { $exists: true } }', detail: 'Field exists', type: 'snippet', apply: createApply('{ : { $exists: true } }', 18) },
    { label: '{ field: { $regex: /pattern/ } }', detail: 'Regex match', type: 'snippet', apply: createApply('{ : { $regex: // } }', 4) },
    { label: '{ $and: [  ] }', detail: 'AND condition', type: 'snippet', apply: createApply('{ $and: [  ] }', 4) },
    { label: '{ $or: [  ] }', detail: 'OR condition', type: 'snippet', apply: createApply('{ $or: [  ] }', 4) },
    { label: '{ $text: { $search: "" } }', detail: 'Text search', type: 'snippet', apply: createApply('{ $text: { $search: "" } }', 2) }
  ];

  // Advanced Query Templates
  const queryTemplates = [
    
    // Advanced Query Patterns
    { label: 'Date Range Query', detail: 'Query between dates', type: 'template', 
      apply: createApply('{ createdAt: { $gte: ISODate(""), $lte: ISODate("") } }', 2) },
    { label: 'Paginated Query', detail: 'Skip and limit with sort', type: 'template', 
      apply: createApply('.find({}).sort({ _id: 1 }).skip(0).limit(10)', 37) },
    { label: 'Text Search with Score', detail: 'Text search with relevance score', type: 'template', 
      apply: createApply('.find({ $text: { $search: "" } }, { score: { $meta: "textScore" } }).sort({ score: { $meta: "textScore" } })', 31) },
    { label: 'Geospatial Near Query', detail: 'Find documents near coordinates', type: 'template', 
      apply: createApply('{ location: { $near: { $geometry: { type: "Point", coordinates: [lng, lat] }, $maxDistance: 1000 } } }', 19) },
    { label: 'Array Element Match', detail: 'Match array elements', type: 'template', 
      apply: createApply('{ arrayField: { $elemMatch: {  } } }', 4) },
    { label: 'Nested Object Query', detail: 'Query nested object fields', type: 'template', 
      apply: createApply('{ "parent.child": "value" }', 7) },
    { label: 'Case Insensitive Search', detail: 'Case insensitive string match', type: 'template', 
      apply: createApply('{ field: { $regex: "", $options: "i" } }', 19) },
    { label: 'Multiple Conditions', detail: 'Multiple field conditions', type: 'template', 
      apply: createApply('{ $and: [{ field1: "value1" }, { field2: { $gt: 0 } }] }', 52) },
    { label: 'OR with Multiple Fields', detail: 'OR across different fields', type: 'template', 
      apply: createApply('{ $or: [{ field1: "value" }, { field2: "value" }] }', 31) },
    { label: 'Null or Missing Check', detail: 'Check for null or missing fields', type: 'template', 
      apply: createApply('{ $or: [{ field: null }, { field: { $exists: false } }] }', 35) },
    
    // Aggregation Templates
    { label: 'Group by Field Count', detail: 'Count documents by field value', type: 'template', 
      apply: createApply('[{ $group: { _id: "$", count: { $sum: 1 } } }, { $sort: { count: -1 } }]', 22) },
    { label: 'Average by Group', detail: 'Calculate average by group', type: 'template', 
      apply: createApply('[{ $group: { _id: "$", avg: { $avg: "$" } } }]', 33) },
    { label: 'Lookup with Pipeline', detail: 'Join with aggregation pipeline', type: 'template', 
      apply: createApply('[{ $lookup: { from: "", let: { localVar: "$" }, pipeline: [{ $match: { $expr: { $eq: ["$", "$$localVar"] } } }], as: "" } }]', 32) },
    { label: 'Unwind and Regroup', detail: 'Unwind array and regroup', type: 'template', 
      apply: createApply('[{ $unwind: "$" }, { $group: { _id: "$", items: { $push: "$$ROOT" } } }]', 20) },
    { label: 'Match and Project', detail: 'Filter and select fields', type: 'template', 
      apply: createApply('[{ $match: {  } }, { $project: {  } }]', 22) },
    { label: 'Sort and Limit', detail: 'Sort results and limit count', type: 'template', 
      apply: createApply('[{ $sort: {  } }, { $limit:  }]', 7) },
    
    // Update Templates
    { label: 'Set Multiple Fields', detail: 'Update multiple fields', type: 'template', 
      apply: createApply('{ $set: { field1: "value1", field2: "value2" } }', 28) },
    { label: 'Increment Counter', detail: 'Increment numeric field', type: 'template', 
      apply: createApply('{ $inc: { counter: 1 } }', 13) },
    { label: 'Add to Array', detail: 'Push item to array field', type: 'template', 
      apply: createApply('{ $push: { arrayField: "newItem" } }', 11) },
    { label: 'Add Unique to Array', detail: 'Add unique item to array', type: 'template', 
      apply: createApply('{ $addToSet: { arrayField: "uniqueItem" } }', 14) },
    { label: 'Remove from Array', detail: 'Pull items from array', type: 'template', 
      apply: createApply('{ $pull: { arrayField: "itemToRemove" } }', 16) },
    { label: 'Set Current Date', detail: 'Set field to current date', type: 'template', 
      apply: createApply('{ $currentDate: { lastModified: true } }', 27) },
    { label: 'Upsert Pattern', detail: 'Update or insert pattern', type: 'template', 
      apply: createApply('.updateOne({ _id: ObjectId("") }, { $set: {  } }, { upsert: true })', 33) },
    
    // Index Templates
    { label: 'Single Field Index', detail: 'Create single field index', type: 'template', 
      apply: createApply('.createIndex({ field: 1 })', 17) },
    { label: 'Compound Index', detail: 'Create compound index', type: 'template', 
      apply: createApply('.createIndex({ field1: 1, field2: -1 })', 25) },
    { label: 'Text Index', detail: 'Create text search index', type: 'template', 
      apply: createApply('.createIndex({ field: "text" })', 20) },
    { label: 'Partial Index', detail: 'Create partial index with condition', type: 'template', 
      apply: createApply('.createIndex({ field: 1 }, { partialFilterExpression: {  } })', 4) },
    { label: 'TTL Index', detail: 'Create TTL (time-to-live) index', type: 'template', 
      apply: createApply('.createIndex({ dateField: 1 }, { expireAfterSeconds: 3600 })', 50) },
    { label: 'Unique Index', detail: 'Create unique constraint index', type: 'template', 
      apply: createApply('.createIndex({ field: 1 }, { unique: true })', 42) },
    
    // Performance Templates
    { label: 'Explain Query', detail: 'Analyze query performance', type: 'template', 
      apply: createApply('.find({}).explain("executionStats")', 26) },
    { label: 'Query with Hint', detail: 'Force specific index usage', type: 'template', 
      apply: createApply('.find({}).hint({ field: 1 })', 18) },
    { label: 'Bulk Write Operations', detail: 'Batch multiple operations', type: 'template', 
      apply: createApply('.bulkWrite([{ insertOne: { document: {} } }, { updateOne: { filter: {}, update: {} } }])', 52) }
  ];

  // Get more context to understand where we are
  const beforeText = context.state.sliceDoc(Math.max(0, context.pos - 200), context.pos);
  
  // Context detection
  const isMethodContext = /db\.[A-Za-z0-9_.$]+\.[A-Za-z0-9_]*$/.test(beforeText) || 
                          /\.(find|findOne|aggregate|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany)\([^)]*\)\.[A-Za-z0-9_]*$/.test(beforeText);
  const isInsideFindParams = /\.find\s*\(\s*[^)]*$/.test(beforeText);
  const isInsideFindOneParams = /\.findOne\s*\(\s*[^)]*$/.test(beforeText);
  const isInsideUpdateParams = /\.(updateOne|updateMany|replaceOne)\s*\(\s*[^,)]*,?\s*[^)]*$/.test(beforeText);
  const isInsideDeleteParams = /\.(deleteOne|deleteMany)\s*\(\s*[^)]*$/.test(beforeText);
  const isInsideCountParams = /\.countDocuments\s*\(\s*[^)]*$/.test(beforeText);
  const isInsideDistinctParams = /\.distinct\s*\(\s*[^,)]*,?\s*[^)]*$/.test(beforeText);
  const isInsideAggregateArray = /\.aggregate\s*\(\s*\[\s*$/.test(beforeText) || (/\.aggregate\s*\(\s*\[/.test(beforeText) && !/\{\s*\$\w+/.test(beforeText));
  const isInsideAggregateStage = /\{\s*\$\w+\s*:\s*[^}]*$/.test(beforeText);
  const isInsideQueryObject = /\{\s*[^}]*$/.test(beforeText) && !isInsideAggregateStage;
  
  // If we're in a method context, don't show anything (let methodCompletion handle it)
  if (isMethodContext) {
    return null;
  }
  
  // If we're inside find/findOne parameters, show query operators and field patterns
  if (isInsideFindParams || isInsideFindOneParams || isInsideDeleteParams || isInsideCountParams) {
    const queryOptions = [
      ...queryOperators,
      ...bsonTypes,
      ...queryPatterns // queryPatterns now only contains snippets, no duplicates
    ];
    return { from: word ? word.from : context.pos, options: queryOptions, validFor: /\w[\w.$]*/ };
  }
  
  // If we're inside update parameters, show update operators
  if (isInsideUpdateParams) {
    const updateOptions = [
      ...updateOperators,
      ...bsonTypes,
      ...queryTemplates.filter(t => t.label.includes('Set') || t.label.includes('Inc') || t.label.includes('Array'))
    ];
    return { from: word ? word.from : context.pos, options: updateOptions, validFor: /\w[\w.$]*/ };
  }
  
  // If we're inside an aggregation stage, show expression operators (check this first)
  if (isInsideAggregateStage) {
    const expressionOptions = [
      ...expressionOperators,
      ...bsonTypes
    ];
    return { from: word ? word.from : context.pos, options: expressionOptions, validFor: /\w[\w.$]*/ };
  }
  
  // If we're inside aggregate array, show aggregation stages
  if (isInsideAggregateArray) {
    return { from: word ? word.from : context.pos, options: aggregationStages, validFor: /\w[\w.$]*/ };
  }
  
  // If we're inside a query object, show query operators and field patterns
  if (isInsideQueryObject) {
    const queryOptions = [
      ...queryOperators,
      ...bsonTypes
    ];
    return { from: word ? word.from : context.pos, options: queryOptions, validFor: /\w[\w.$]*/ };
  }

  // Default: show all options for general context
  const options = [
    ...bsonTypes,
    ...queryOperators,
    ...aggregationStages,
    ...updateOperators,
    ...expressionOperators,
    ...queryPatterns,
    ...queryTemplates
  ];

  return { from: word ? word.from : context.pos, options, validFor: /\w[\w.$]*/ };
};

const isMacPlatform = () => /Mac|iPhone|iPod|iPad/.test(navigator.platform);

export default function MongoEditor({
  value = '',
  onChange,
  disabled = false,
  placeholderText = 'Enter your MongoDB query syntax...',
  collectionNames = [],
  minHeight = 60,
  maxHeight = 240
}) {
  const muiTheme = useTheme();
  const isDarkMode = muiTheme?.palette?.mode === 'dark';
  const parentRef = useRef(null);
  const viewRef = useRef(null);

  const editable = useMemo(() => new Compartment(), []);
  const themeCompartment = useMemo(() => new Compartment(), []);

  useEffect(() => {
    if (!parentRef.current) return undefined;

    // Collections completion
    const collectionsCompletion = (context) => {
      const before = context.matchBefore(/db\.?[\w$]*/);
      if (!before) return null;
      const startsWithDb = /^db(\.|$)/.test(before.text);
      if (!startsWithDb) return null;
      
      // If we have collections, show them
      if (collectionNames.length > 0) {
        const opts = collectionNames.map((name) => ({
          label: `db.${name}`,
          type: 'variable',
          detail: 'Collection'
        }));
        
        const createApply = (text, cursorOffset = 3) => (view, completion, from, to) => {
          const cursorPos = from + text.length - cursorOffset;
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: cursorPos }
          });
          requestAnimationFrame(() => view.focus());
        };

        const snippetOpts = collectionNames.flatMap((name) => [
          { label: `db.${name}.find({  })`, type: 'function', detail: 'Find documents', apply: createApply(`db.${name}.find({  })`, 3) },
          { label: `db.${name}.find({  }, {  })`, type: 'function', detail: 'Find with projection', apply: createApply(`db.${name}.find({  }, {  })`, 9) },
          { label: `db.${name}.findOne({  })`, type: 'function', detail: 'Find one document', apply: createApply(`db.${name}.findOne({  })`, 3) },
          { label: `db.${name}.aggregate([  ])`, type: 'function', detail: 'Aggregation pipeline', apply: createApply(`db.${name}.aggregate([  ])`, 3) },
          { label: `db.${name}.insertOne({  })`, type: 'function', detail: 'Insert document', apply: createApply(`db.${name}.insertOne({  })`, 3) },
          { label: `db.${name}.updateOne({  }, {  })`, type: 'function', detail: 'Update document', apply: createApply(`db.${name}.updateOne({  }, {  })`, 9) },
          { label: `db.${name}.deleteOne({  })`, type: 'function', detail: 'Delete document', apply: createApply(`db.${name}.deleteOne({  })`, 3) },
          { label: `db.${name}.countDocuments({  })`, type: 'function', detail: 'Count documents', apply: createApply(`db.${name}.countDocuments({  })`, 3) }
        ]);
        
        const options = [...opts, ...snippetOpts];
        return { from: before.from, options, validFor: /db\.?[\w$]*/ };
      }
      
      // If no collections, provide basic db methods that work without knowing collections
      const basicDbMethods = [
        { label: 'db.listCollections()', type: 'function', detail: 'List all collections' },
        { label: 'db.stats()', type: 'function', detail: 'Database statistics' },
        { label: 'db.getName()', type: 'function', detail: 'Current database name' }
      ];
      
      return { from: before.from, options: basicDbMethods, validFor: /db\.?[\w$]*/ };
    };

    // Methods completion
    const methodCompletion = (context) => {
      // Check for method context more broadly - after db.collection. or after chained methods
      const beforeText = context.state.sliceDoc(Math.max(0, context.pos - 150), context.pos);
      const methodMatch = beforeText.match(/db\.[A-Za-z0-9_.$]+\.([A-Za-z0-9_]*)$/) || 
                          beforeText.match(/\.(find|findOne|aggregate|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany)\([^)]*\)\.([A-Za-z0-9_]*)$/);
      
      if (!methodMatch && !context.explicit) return null;
      
      // Check if we're in a chained method context (after find().limit etc.)
      const isChainedContext = /\.(find|findOne|aggregate)\([^)]*\)\./.test(beforeText);
      
      // If we found a method context, use it
      const before = methodMatch ? {
        from: context.pos - methodMatch[methodMatch.length - 1].length,
        text: methodMatch[methodMatch.length - 1]
      } : context.matchBefore(/[A-Za-z0-9_]*$/);
      
      if (!before) return null;
      
      const createApply = (text, cursorOffset = 3) => (view, completion, from, to) => {
        const cursorPos = from + text.length - cursorOffset;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: cursorPos }
        });
        requestAnimationFrame(() => view.focus());
      };
      
      // Define cursor methods that can be chained
      const cursorMethods = [
        { label: 'limit()', type: 'function', detail: 'Limit number of results', apply: createApply('limit()', 1) },
        { label: 'skip()', type: 'function', detail: 'Skip number of documents', apply: createApply('skip()', 1) },
        { label: 'sort({  })', type: 'function', detail: 'Sort results', apply: createApply('sort({  })', 3) },
        { label: 'count()', type: 'function', detail: 'Count documents (deprecated, use countDocuments)', apply: createApply('count()', 1) },
        { label: 'explain()', type: 'function', detail: 'Explain query execution', apply: createApply('explain()', 1) },
        { label: 'hint({  })', type: 'function', detail: 'Force index usage', apply: createApply('hint({  })', 3) },
        { label: 'maxTimeMS()', type: 'function', detail: 'Set maximum execution time', apply: createApply('maxTimeMS()', 1) },
        { label: 'collation({  })', type: 'function', detail: 'Specify collation', apply: createApply('collation({  })', 3) },
        { label: 'toArray()', type: 'function', detail: 'Convert cursor to array', apply: createApply('toArray()', 1) },
        { label: 'forEach()', type: 'function', detail: 'Iterate over results', apply: createApply('forEach()', 1) },
        { label: 'map()', type: 'function', detail: 'Transform each document', apply: createApply('map()', 1) },
        { label: 'hasNext()', type: 'function', detail: 'Check if cursor has more documents', apply: createApply('hasNext()', 1) },
        { label: 'next()', type: 'function', detail: 'Get next document', apply: createApply('next()', 1) }
      ];

      // If we're in a chained context, show only cursor methods
      if (isChainedContext) {
        return { 
          from: before.from, 
          options: cursorMethods,
          validFor: /[A-Za-z0-9_]*/
        };
      }

      const methods = [
        // Query Methods (most common versions only)
        { label: 'find({  })', type: 'function', detail: 'Find documents', apply: createApply('find({  })', 3) },
        { label: 'findOne({  })', type: 'function', detail: 'Find one document', apply: createApply('findOne({  })', 3) },
        { label: 'findOneAndUpdate({  }, {  })', type: 'function', detail: 'Find and update', apply: createApply('findOneAndUpdate({  }, {  })', 9) },
        { label: 'findOneAndReplace({  }, {  })', type: 'function', detail: 'Find and replace', apply: createApply('findOneAndReplace({  }, {  })', 9) },
        { label: 'findOneAndDelete({  })', type: 'function', detail: 'Find and delete', apply: createApply('findOneAndDelete({  })', 3) },
        
        // Cursor Methods (can be chained after find or used directly)
        ...cursorMethods,
        
        // Aggregation
        { label: 'aggregate([  ])', type: 'function', detail: 'Aggregation pipeline', apply: createApply('aggregate([  ])', 3) },
        
        // Insert Methods
        { label: 'insertOne({  })', type: 'function', detail: 'Insert one document', apply: createApply('insertOne({  })', 3) },
        { label: 'insertMany([  ])', type: 'function', detail: 'Insert multiple documents', apply: createApply('insertMany([  ])', 3) },
        
        // Update Methods
        { label: 'updateOne({  }, {  })', type: 'function', detail: 'Update one document', apply: createApply('updateOne({  }, {  })', 9) },
        { label: 'updateMany({  }, {  })', type: 'function', detail: 'Update multiple documents', apply: createApply('updateMany({  }, {  })', 9) },
        { label: 'replaceOne({  }, {  })', type: 'function', detail: 'Replace document', apply: createApply('replaceOne({  }, {  })', 9) },
        
        // Delete Methods
        { label: 'deleteOne({  })', type: 'function', detail: 'Delete one document', apply: createApply('deleteOne({  })', 3) },
        { label: 'deleteMany({  })', type: 'function', detail: 'Delete multiple documents', apply: createApply('deleteMany({  })', 3) },
        
        // Utility Methods
        { label: 'countDocuments({  })', type: 'function', detail: 'Count documents', apply: createApply('countDocuments({  })', 3) },
        { label: 'estimatedDocumentCount()', type: 'function', detail: 'Estimated count', apply: createApply('estimatedDocumentCount()', 1) },
        { label: 'distinct("", {  })', type: 'function', detail: 'Distinct values', apply: createApply('distinct("", {  })', 7) },
        
        // Index Methods
        { label: 'createIndex({  })', type: 'function', detail: 'Create index', apply: createApply('createIndex({  })', 3) },
        { label: 'createIndexes([  ])', type: 'function', detail: 'Create multiple indexes', apply: createApply('createIndexes([  ])', 3) },
        { label: 'dropIndex("")', type: 'function', detail: 'Drop index', apply: createApply('dropIndex("")', 2) },
        { label: 'dropIndexes()', type: 'function', detail: 'Drop all indexes', apply: createApply('dropIndexes()', 1) },
        { label: 'getIndexes()', type: 'function', detail: 'List indexes', apply: createApply('getIndexes()', 1) },
        { label: 'reIndex()', type: 'function', detail: 'Rebuild indexes', apply: createApply('reIndex()', 1) },
        
        // Bulk Operations
        { label: 'bulkWrite([  ])', type: 'function', detail: 'Bulk write operations', apply: createApply('bulkWrite([  ])', 3) },
        { label: 'initializeOrderedBulkOp()', type: 'function', detail: 'Ordered bulk operations', apply: createApply('initializeOrderedBulkOp()', 1) },
        { label: 'initializeUnorderedBulkOp()', type: 'function', detail: 'Unordered bulk operations', apply: createApply('initializeUnorderedBulkOp()', 1) },
        
        // Collection Management
        { label: 'drop()', type: 'function', detail: 'Drop collection', apply: createApply('drop()', 1) },
        { label: 'rename("")', type: 'function', detail: 'Rename collection', apply: createApply('rename("")', 2) },
        { label: 'stats()', type: 'function', detail: 'Collection statistics', apply: createApply('stats()', 1) },
        { label: 'validate()', type: 'function', detail: 'Validate collection', apply: createApply('validate()', 1) },
        
        // Watch/Change Streams
        { label: 'watch([  ])', type: 'function', detail: 'Watch for changes', apply: createApply('watch([  ])', 3) }
      ];
      
      return { 
        from: before.from, 
        options: methods,
        validFor: /[A-Za-z0-9_]*/
      };
    };







    // $-operators and stages
    const mongoDollarCompletion = (context) => {
      const dollar = context.matchBefore(/\$[A-Za-z0-9_]*$/);
      if (!dollar && !context.explicit) return null;
      
      const upto = context.state.sliceDoc(Math.max(0, context.pos - 600), context.pos);
      const inAggregate = /\.aggregate\s*\(\s*\[/.test(upto);
      
      const stages = [
        '$match', '$project', '$group', '$sort', '$limit', '$skip',
        '$addFields', '$lookup', '$unwind', '$set', '$unset', '$count', '$facet', '$replaceRoot', '$merge', '$out'
      ];
      const queryOps = [
        '$and', '$or', '$nor', '$not', '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists', '$type', '$regex', '$text', '$expr'
      ];
      const updateOps = [
        '$set', '$unset', '$inc', '$mul', '$rename', '$push', '$addToSet', '$pull', '$pullAll', '$pop', '$min', '$max', '$currentDate'
      ];
      
      const items = inAggregate ? stages : [...queryOps, ...updateOps];
      return { 
        from: dollar ? dollar.from : context.pos, 
        options: items.map((s) => ({ label: s, type: 'keyword' })), 
        validFor: /\$[A-Za-z0-9_]*/ 
      };
    };

    const state = EditorState.create({
      doc: value,
      extensions: [
        keymap.of([
          {
            key: 'Tab',
            run: (view) => {
              if (acceptCompletion(view)) return true;
              // Use indentWithTab command properly or fallback to manual indent
              try {
                return indentWithTab(view);
              } catch (error) {
                console.warn('indentWithTab failed, using fallback:', error);
                const { from } = view.state.selection.main;
                view.dispatch({ changes: { from, to: from, insert: '  ' } });
                return true;
              }
            },
          },
          { 
            key: 'Shift-Tab', 
            run: (view) => {
              try {
                return indentLess(view);
              } catch (error) {
                console.warn('indentLess failed:', error);
                return false;
              }
            }
          },
          ...closeBracketsKeymap,
          {
            key: 'Enter',
            run: (view) => acceptCompletion(view) || false,
          },
        ]),
        closeBrackets(),
        javascript({ jsx: false, typescript: false, json: false }),
        autocompletion({
          override: [mongoDollarCompletion, methodCompletion, collectionsCompletion, mongoCompletionSource],
          activateOnTyping: true,
          selectOnOpen: true,
          maxRenderedOptions: 200,
          defaultKeymap: true,
          closeOnBlur: false,
        }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        themeCompartment.of(isDarkMode ? oneDark : []),
        editable.of(EditorView.editable.of(!disabled)),
        EditorView.lineWrapping,
        placeholder(placeholderText),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const next = update.state.doc.toString();
            onChange && onChange(next);
          }
        }),
        EditorView.theme({
          '&': { 
            border: `1px solid ${isDarkMode ? muiTheme.palette.grey[700] : muiTheme.palette.grey[300]}`, 
            borderRadius: '8px', 
            textAlign: 'left', 
            backgroundColor: 'inherit',
            fontSize: '1rem',
            '&:hover': {
              borderColor: isDarkMode ? muiTheme.palette.grey[600] : muiTheme.palette.grey[400]
            },
            '&:focus-within': {
              borderColor: muiTheme.palette.primary.main,
              outline: 'none'
            }
          },
          '.cm-scroller': { maxHeight: `${maxHeight}px`, minHeight: `${minHeight}px`, overflowY: 'auto', backgroundColor: 'inherit' },
          '.cm-content': { 
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', 
            fontSize: '1rem',
            lineHeight: '1.4375em', // Match MUI TextField exactly
            textAlign: 'left', 
            backgroundColor: 'inherit',
            padding: '16.5px 14px' // Match MUI TextField outlined variant padding exactly
          },
          '.cm-line': { textAlign: 'left', backgroundColor: 'inherit' },
          '.cm-activeLine': { backgroundColor: 'transparent' },
          '.cm-activeLineGutter': { backgroundColor: 'transparent' },
          '.cm-tooltip': { borderRadius: '8px' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: parentRef.current });
    viewRef.current = view;

    const onKeydown = (e) => {
      const key = e.key.toLowerCase();
      const saveCombo = (isMacPlatform() && e.metaKey && key === 's') || (!isMacPlatform() && e.ctrlKey && key === 's');
      if (saveCombo) {
        e.preventDefault();
        (async () => {
          const input = viewRef.current ? viewRef.current.state.doc.toString() : '';
          try {
            const formatted = await prettier.format(input, {
              parser: 'babel',
              plugins: [pluginBabel, pluginEstree],
              semi: true,
              singleQuote: false,
              trailingComma: 'es5',
            });
            if (viewRef.current) {
              viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: formatted } });
            }
          } catch {}
        })();
      }
    };
    window.addEventListener('keydown', onKeydown);

    return () => {
      window.removeEventListener('keydown', onKeydown);
      view.destroy();
    };
  }, [collectionNames]);

  // Sync disabled
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({ effects: editable.reconfigure(EditorView.editable.of(!disabled)) });
  }, [disabled]);

  // Sync external value
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  // React to theme changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: themeCompartment.reconfigure(isDarkMode ? oneDark : []) });
  }, [isDarkMode, themeCompartment]);

  return <div ref={parentRef} />;
}