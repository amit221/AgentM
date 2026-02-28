import React, { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, acceptCompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentLess, indentWithTab } from '@codemirror/commands';

// Smart context-aware PostgreSQL completion source
const sqlCompletionSource = (context) => {
  const word = context.matchBefore(/\w[\w.]*/);
  if (!word && !context.explicit) return null;

  // Helper function to create apply function for cursor positioning
  const createApply = (text, cursorOffset = 1) => (view, completion, from, to) => {
    const cursorPos = from + text.length - cursorOffset;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: cursorPos }
    });
    requestAnimationFrame(() => view.focus());
  };

  // SQL Keywords
  const sqlKeywords = [
    // Data Query
    { label: 'SELECT', detail: 'Query data from table', type: 'keyword' },
    { label: 'FROM', detail: 'Specify table source', type: 'keyword' },
    { label: 'WHERE', detail: 'Filter results', type: 'keyword' },
    { label: 'ORDER BY', detail: 'Sort results', type: 'keyword' },
    { label: 'GROUP BY', detail: 'Group results', type: 'keyword' },
    { label: 'HAVING', detail: 'Filter grouped results', type: 'keyword' },
    { label: 'LIMIT', detail: 'Limit number of results', type: 'keyword' },
    { label: 'OFFSET', detail: 'Skip rows in results', type: 'keyword' },
    { label: 'DISTINCT', detail: 'Return unique rows only', type: 'keyword' },
    
    // Joins
    { label: 'JOIN', detail: 'Join tables', type: 'keyword' },
    { label: 'INNER JOIN', detail: 'Inner join tables', type: 'keyword' },
    { label: 'LEFT JOIN', detail: 'Left outer join', type: 'keyword' },
    { label: 'RIGHT JOIN', detail: 'Right outer join', type: 'keyword' },
    { label: 'FULL JOIN', detail: 'Full outer join', type: 'keyword' },
    { label: 'CROSS JOIN', detail: 'Cross join (cartesian product)', type: 'keyword' },
    { label: 'ON', detail: 'Join condition', type: 'keyword' },
    { label: 'USING', detail: 'Join using column', type: 'keyword' },
    
    // Data Modification
    { label: 'INSERT INTO', detail: 'Insert rows into table', type: 'keyword' },
    { label: 'VALUES', detail: 'Specify values to insert', type: 'keyword' },
    { label: 'UPDATE', detail: 'Update existing rows', type: 'keyword' },
    { label: 'SET', detail: 'Set column values', type: 'keyword' },
    { label: 'DELETE FROM', detail: 'Delete rows from table', type: 'keyword' },
    
    // Logical Operators
    { label: 'AND', detail: 'Logical AND', type: 'keyword' },
    { label: 'OR', detail: 'Logical OR', type: 'keyword' },
    { label: 'NOT', detail: 'Logical NOT', type: 'keyword' },
    { label: 'IN', detail: 'Match any in list', type: 'keyword' },
    { label: 'NOT IN', detail: 'Not in list', type: 'keyword' },
    { label: 'BETWEEN', detail: 'Range comparison', type: 'keyword' },
    { label: 'LIKE', detail: 'Pattern matching', type: 'keyword' },
    { label: 'ILIKE', detail: 'Case-insensitive pattern matching', type: 'keyword' },
    { label: 'IS NULL', detail: 'Check for null', type: 'keyword' },
    { label: 'IS NOT NULL', detail: 'Check for not null', type: 'keyword' },
    { label: 'EXISTS', detail: 'Check subquery returns rows', type: 'keyword' },
    
    // Aggregation
    { label: 'AS', detail: 'Alias name', type: 'keyword' },
    { label: 'ASC', detail: 'Ascending order', type: 'keyword' },
    { label: 'DESC', detail: 'Descending order', type: 'keyword' },
    { label: 'NULLS FIRST', detail: 'Nulls sorted first', type: 'keyword' },
    { label: 'NULLS LAST', detail: 'Nulls sorted last', type: 'keyword' },
    
    // Subqueries
    { label: 'WITH', detail: 'Common Table Expression (CTE)', type: 'keyword' },
    { label: 'RECURSIVE', detail: 'Recursive CTE', type: 'keyword' },
    
    // Set Operations
    { label: 'UNION', detail: 'Combine results (distinct)', type: 'keyword' },
    { label: 'UNION ALL', detail: 'Combine results (all)', type: 'keyword' },
    { label: 'INTERSECT', detail: 'Common rows', type: 'keyword' },
    { label: 'EXCEPT', detail: 'Rows in first not in second', type: 'keyword' },
    
    // Transaction
    { label: 'BEGIN', detail: 'Start transaction', type: 'keyword' },
    { label: 'COMMIT', detail: 'Commit transaction', type: 'keyword' },
    { label: 'ROLLBACK', detail: 'Rollback transaction', type: 'keyword' },
    
    // DDL
    { label: 'CREATE TABLE', detail: 'Create new table', type: 'keyword' },
    { label: 'ALTER TABLE', detail: 'Modify table structure', type: 'keyword' },
    { label: 'DROP TABLE', detail: 'Delete table', type: 'keyword' },
    { label: 'TRUNCATE TABLE', detail: 'Remove all rows', type: 'keyword' },
    { label: 'CREATE INDEX', detail: 'Create index', type: 'keyword' },
    { label: 'DROP INDEX', detail: 'Delete index', type: 'keyword' },
    { label: 'CREATE VIEW', detail: 'Create view', type: 'keyword' },
    { label: 'DROP VIEW', detail: 'Delete view', type: 'keyword' },
    
    // Other
    { label: 'CASE', detail: 'Conditional expression', type: 'keyword' },
    { label: 'WHEN', detail: 'Case condition', type: 'keyword' },
    { label: 'THEN', detail: 'Case result', type: 'keyword' },
    { label: 'ELSE', detail: 'Case default', type: 'keyword' },
    { label: 'END', detail: 'End case/block', type: 'keyword' },
    { label: 'CAST', detail: 'Type conversion', type: 'keyword' },
    { label: 'COALESCE', detail: 'Return first non-null', type: 'keyword' },
    { label: 'NULLIF', detail: 'Return null if equal', type: 'keyword' },
    { label: 'RETURNING', detail: 'Return modified rows', type: 'keyword' }
  ];

  // Aggregate Functions
  const aggregateFunctions = [
    { label: 'COUNT(*)', detail: 'Count all rows', type: 'function', apply: createApply('COUNT(*)', 1) },
    { label: 'COUNT(column)', detail: 'Count non-null values', type: 'function', apply: createApply('COUNT()', 1) },
    { label: 'SUM(column)', detail: 'Sum of values', type: 'function', apply: createApply('SUM()', 1) },
    { label: 'AVG(column)', detail: 'Average of values', type: 'function', apply: createApply('AVG()', 1) },
    { label: 'MIN(column)', detail: 'Minimum value', type: 'function', apply: createApply('MIN()', 1) },
    { label: 'MAX(column)', detail: 'Maximum value', type: 'function', apply: createApply('MAX()', 1) },
    { label: 'ARRAY_AGG(column)', detail: 'Aggregate into array', type: 'function', apply: createApply('ARRAY_AGG()', 1) },
    { label: 'STRING_AGG(column, delimiter)', detail: 'Concatenate strings', type: 'function', apply: createApply("STRING_AGG(, ', ')", 6) },
    { label: 'JSON_AGG(column)', detail: 'Aggregate into JSON array', type: 'function', apply: createApply('JSON_AGG()', 1) },
    { label: 'JSONB_AGG(column)', detail: 'Aggregate into JSONB array', type: 'function', apply: createApply('JSONB_AGG()', 1) }
  ];

  // String Functions
  const stringFunctions = [
    { label: 'LOWER(string)', detail: 'Convert to lowercase', type: 'function', apply: createApply('LOWER()', 1) },
    { label: 'UPPER(string)', detail: 'Convert to uppercase', type: 'function', apply: createApply('UPPER()', 1) },
    { label: 'LENGTH(string)', detail: 'String length', type: 'function', apply: createApply('LENGTH()', 1) },
    { label: 'TRIM(string)', detail: 'Remove whitespace', type: 'function', apply: createApply('TRIM()', 1) },
    { label: 'LTRIM(string)', detail: 'Remove left whitespace', type: 'function', apply: createApply('LTRIM()', 1) },
    { label: 'RTRIM(string)', detail: 'Remove right whitespace', type: 'function', apply: createApply('RTRIM()', 1) },
    { label: 'SUBSTRING(string, start, length)', detail: 'Extract substring', type: 'function', apply: createApply('SUBSTRING(, 1, )', 4) },
    { label: 'REPLACE(string, from, to)', detail: 'Replace text', type: 'function', apply: createApply("REPLACE(, '', '')", 6) },
    { label: 'CONCAT(a, b)', detail: 'Concatenate strings', type: 'function', apply: createApply('CONCAT(, )', 3) },
    { label: 'CONCAT_WS(sep, a, b)', detail: 'Concatenate with separator', type: 'function', apply: createApply("CONCAT_WS(', ', , )", 4) },
    { label: 'SPLIT_PART(string, delimiter, part)', detail: 'Split and get part', type: 'function', apply: createApply("SPLIT_PART(, ',', 1)", 9) },
    { label: 'REGEXP_REPLACE(string, pattern, replacement)', detail: 'Regex replace', type: 'function', apply: createApply("REGEXP_REPLACE(, '', '')", 6) },
    { label: 'REGEXP_MATCHES(string, pattern)', detail: 'Extract regex matches', type: 'function', apply: createApply("REGEXP_MATCHES(, '')", 2) }
  ];

  // Date/Time Functions
  const dateFunctions = [
    { label: 'NOW()', detail: 'Current timestamp', type: 'function' },
    { label: 'CURRENT_DATE', detail: 'Current date', type: 'function' },
    { label: 'CURRENT_TIME', detail: 'Current time', type: 'function' },
    { label: 'CURRENT_TIMESTAMP', detail: 'Current timestamp with TZ', type: 'function' },
    { label: 'DATE_TRUNC(precision, timestamp)', detail: 'Truncate timestamp', type: 'function', apply: createApply("DATE_TRUNC('day', )", 1) },
    { label: 'DATE_PART(field, timestamp)', detail: 'Extract date field', type: 'function', apply: createApply("DATE_PART('year', )", 1) },
    { label: 'EXTRACT(field FROM timestamp)', detail: 'Extract date/time field', type: 'function', apply: createApply('EXTRACT(year FROM )', 1) },
    { label: 'AGE(timestamp)', detail: 'Calculate age', type: 'function', apply: createApply('AGE()', 1) },
    { label: 'AGE(timestamp, timestamp)', detail: 'Difference between timestamps', type: 'function', apply: createApply('AGE(, )', 3) },
    { label: "TO_CHAR(timestamp, format)", detail: 'Format timestamp as string', type: 'function', apply: createApply("TO_CHAR(, 'YYYY-MM-DD')", 13) },
    { label: "TO_DATE(string, format)", detail: 'Parse string to date', type: 'function', apply: createApply("TO_DATE(, 'YYYY-MM-DD')", 13) },
    { label: "TO_TIMESTAMP(string, format)", detail: 'Parse string to timestamp', type: 'function', apply: createApply("TO_TIMESTAMP(, 'YYYY-MM-DD HH24:MI:SS')", 22) },
    { label: 'INTERVAL', detail: 'Time interval', type: 'keyword' }
  ];

  // JSON Functions (PostgreSQL specific)
  const jsonFunctions = [
    { label: "row->>'key'", detail: 'Get JSON text value', type: 'snippet', apply: createApply("->>'", 1) },
    { label: "row->'key'", detail: 'Get JSON object', type: 'snippet', apply: createApply("->''", 2) },
    { label: "row#>>'{path}'", detail: 'Get JSON text at path', type: 'snippet', apply: createApply("#>>'{}'", 2) },
    { label: "row#>'{path}'", detail: 'Get JSON object at path', type: 'snippet', apply: createApply("#>'{}'", 2) },
    { label: 'JSONB_EXTRACT_PATH(jsonb, path)', detail: 'Extract path from JSONB', type: 'function', apply: createApply("JSONB_EXTRACT_PATH(, '')", 2) },
    { label: 'JSONB_EXTRACT_PATH_TEXT(jsonb, path)', detail: 'Extract path as text', type: 'function', apply: createApply("JSONB_EXTRACT_PATH_TEXT(, '')", 2) },
    { label: 'JSONB_ARRAY_ELEMENTS(jsonb)', detail: 'Expand JSON array', type: 'function', apply: createApply('JSONB_ARRAY_ELEMENTS()', 1) },
    { label: 'JSONB_OBJECT_KEYS(jsonb)', detail: 'Get object keys', type: 'function', apply: createApply('JSONB_OBJECT_KEYS()', 1) },
    { label: 'JSONB_BUILD_OBJECT(key, value, ...)', detail: 'Build JSON object', type: 'function', apply: createApply("JSONB_BUILD_OBJECT('key', )", 1) },
    { label: 'JSONB_BUILD_ARRAY(values)', detail: 'Build JSON array', type: 'function', apply: createApply('JSONB_BUILD_ARRAY()', 1) },
    { label: 'TO_JSONB(value)', detail: 'Convert to JSONB', type: 'function', apply: createApply('TO_JSONB()', 1) },
    { label: 'JSONB_SET(jsonb, path, new_value)', detail: 'Set value in JSONB', type: 'function', apply: createApply("JSONB_SET(, '{key}', '\"value\"')", 9) },
    { label: 'jsonb @> jsonb', detail: 'JSONB contains', type: 'snippet' },
    { label: 'jsonb ? key', detail: 'JSONB has key', type: 'snippet' },
    { label: 'jsonb ?| array', detail: 'JSONB has any keys', type: 'snippet' },
    { label: 'jsonb ?& array', detail: 'JSONB has all keys', type: 'snippet' }
  ];

  // Array Functions (PostgreSQL specific)
  const arrayFunctions = [
    { label: 'ARRAY[values]', detail: 'Create array literal', type: 'function', apply: createApply('ARRAY[]', 1) },
    { label: 'UNNEST(array)', detail: 'Expand array to rows', type: 'function', apply: createApply('UNNEST()', 1) },
    { label: 'ARRAY_LENGTH(array, dim)', detail: 'Array length', type: 'function', apply: createApply('ARRAY_LENGTH(, 1)', 4) },
    { label: 'ARRAY_POSITION(array, element)', detail: 'Find element position', type: 'function', apply: createApply('ARRAY_POSITION(, )', 3) },
    { label: 'ARRAY_REMOVE(array, element)', detail: 'Remove elements', type: 'function', apply: createApply('ARRAY_REMOVE(, )', 3) },
    { label: 'ARRAY_APPEND(array, element)', detail: 'Append element', type: 'function', apply: createApply('ARRAY_APPEND(, )', 3) },
    { label: 'ARRAY_CAT(array1, array2)', detail: 'Concatenate arrays', type: 'function', apply: createApply('ARRAY_CAT(, )', 3) },
    { label: 'ANY(array)', detail: 'Match any array element', type: 'function', apply: createApply('ANY()', 1) },
    { label: 'ALL(array)', detail: 'Match all array elements', type: 'function', apply: createApply('ALL()', 1) },
    { label: 'array @> array', detail: 'Array contains', type: 'snippet' },
    { label: 'array && array', detail: 'Arrays overlap', type: 'snippet' }
  ];

  // Window Functions
  const windowFunctions = [
    { label: 'ROW_NUMBER() OVER()', detail: 'Row number in partition', type: 'function', apply: createApply('ROW_NUMBER() OVER(ORDER BY )', 1) },
    { label: 'RANK() OVER()', detail: 'Rank with gaps', type: 'function', apply: createApply('RANK() OVER(ORDER BY )', 1) },
    { label: 'DENSE_RANK() OVER()', detail: 'Rank without gaps', type: 'function', apply: createApply('DENSE_RANK() OVER(ORDER BY )', 1) },
    { label: 'LAG(column) OVER()', detail: 'Previous row value', type: 'function', apply: createApply('LAG() OVER(ORDER BY )', 15) },
    { label: 'LEAD(column) OVER()', detail: 'Next row value', type: 'function', apply: createApply('LEAD() OVER(ORDER BY )', 15) },
    { label: 'FIRST_VALUE(column) OVER()', detail: 'First value in window', type: 'function', apply: createApply('FIRST_VALUE() OVER(ORDER BY )', 15) },
    { label: 'LAST_VALUE(column) OVER()', detail: 'Last value in window', type: 'function', apply: createApply('LAST_VALUE() OVER(ORDER BY )', 15) },
    { label: 'NTH_VALUE(column, n) OVER()', detail: 'Nth value in window', type: 'function', apply: createApply('NTH_VALUE(, 1) OVER(ORDER BY )', 15) },
    { label: 'PARTITION BY', detail: 'Partition window', type: 'keyword' },
    { label: 'OVER()', detail: 'Window specification', type: 'keyword', apply: createApply('OVER()', 1) }
  ];

  // Common Data Types
  const dataTypes = [
    { label: 'INTEGER', detail: 'Integer type', type: 'type' },
    { label: 'BIGINT', detail: 'Large integer', type: 'type' },
    { label: 'SMALLINT', detail: 'Small integer', type: 'type' },
    { label: 'SERIAL', detail: 'Auto-increment integer', type: 'type' },
    { label: 'BIGSERIAL', detail: 'Large auto-increment', type: 'type' },
    { label: 'NUMERIC(p,s)', detail: 'Exact decimal', type: 'type', apply: createApply('NUMERIC(10,2)', 3) },
    { label: 'DECIMAL(p,s)', detail: 'Exact decimal', type: 'type', apply: createApply('DECIMAL(10,2)', 3) },
    { label: 'REAL', detail: 'Float 4 bytes', type: 'type' },
    { label: 'DOUBLE PRECISION', detail: 'Float 8 bytes', type: 'type' },
    { label: 'VARCHAR(n)', detail: 'Variable character', type: 'type', apply: createApply('VARCHAR(255)', 4) },
    { label: 'CHAR(n)', detail: 'Fixed character', type: 'type', apply: createApply('CHAR(1)', 2) },
    { label: 'TEXT', detail: 'Unlimited text', type: 'type' },
    { label: 'BOOLEAN', detail: 'True/false', type: 'type' },
    { label: 'DATE', detail: 'Date only', type: 'type' },
    { label: 'TIME', detail: 'Time only', type: 'type' },
    { label: 'TIMESTAMP', detail: 'Date and time', type: 'type' },
    { label: 'TIMESTAMPTZ', detail: 'Timestamp with timezone', type: 'type' },
    { label: 'UUID', detail: 'Universally unique ID', type: 'type' },
    { label: 'JSON', detail: 'JSON data', type: 'type' },
    { label: 'JSONB', detail: 'Binary JSON (faster)', type: 'type' },
    { label: 'BYTEA', detail: 'Binary data', type: 'type' },
    { label: 'ARRAY', detail: 'Array type', type: 'type' }
  ];

  // Query Templates
  const queryTemplates = [
    // SELECT templates
    { label: 'SELECT * FROM table LIMIT 100', detail: 'Basic select query', type: 'template', 
      apply: createApply('SELECT * FROM  LIMIT 100', 11) },
    { label: 'SELECT columns FROM table WHERE condition', detail: 'Select with filter', type: 'template', 
      apply: createApply('SELECT  FROM  WHERE ', 1) },
    { label: 'SELECT with JOIN', detail: 'Join two tables', type: 'template', 
      apply: createApply('SELECT t1.*, t2.*\nFROM  t1\nINNER JOIN  t2 ON t1. = t2.', 1) },
    { label: 'SELECT with GROUP BY', detail: 'Aggregate query', type: 'template', 
      apply: createApply('SELECT , COUNT(*)\nFROM \nGROUP BY \nORDER BY COUNT(*) DESC', 38) },
    { label: 'SELECT with CTE', detail: 'Common table expression', type: 'template', 
      apply: createApply('WITH cte AS (\n  SELECT * FROM  WHERE \n)\nSELECT * FROM cte', 42) },
    
    // INSERT templates
    { label: 'INSERT INTO table VALUES', detail: 'Insert row', type: 'template', 
      apply: createApply('INSERT INTO  (, ) VALUES (, )', 21) },
    { label: 'INSERT INTO ... SELECT', detail: 'Insert from select', type: 'template', 
      apply: createApply('INSERT INTO  (, )\nSELECT , \nFROM ', 1) },
    { label: 'INSERT ... RETURNING', detail: 'Insert and return', type: 'template', 
      apply: createApply('INSERT INTO  (, )\nVALUES (, )\nRETURNING *', 29) },
    
    // UPDATE templates
    { label: 'UPDATE table SET column = value WHERE', detail: 'Update rows', type: 'template', 
      apply: createApply('UPDATE  SET  =  WHERE ', 1) },
    { label: 'UPDATE ... RETURNING', detail: 'Update and return', type: 'template', 
      apply: createApply('UPDATE  SET  =  WHERE  RETURNING *', 12) },
    
    // DELETE templates
    { label: 'DELETE FROM table WHERE', detail: 'Delete rows', type: 'template', 
      apply: createApply('DELETE FROM  WHERE ', 1) },
    { label: 'DELETE ... RETURNING', detail: 'Delete and return', type: 'template', 
      apply: createApply('DELETE FROM  WHERE  RETURNING *', 12) },
    
    // UPSERT template
    { label: 'UPSERT (INSERT ON CONFLICT)', detail: 'Insert or update', type: 'template', 
      apply: createApply('INSERT INTO  (, )\nVALUES (, )\nON CONFLICT () DO UPDATE SET  = EXCLUDED.', 1) },
    
    // Subquery templates
    { label: 'Subquery in WHERE', detail: 'Filter with subquery', type: 'template', 
      apply: createApply('SELECT * FROM \nWHERE  IN (SELECT  FROM  WHERE )', 34) },
    { label: 'Correlated subquery', detail: 'Correlated subquery', type: 'template', 
      apply: createApply('SELECT *,\n  (SELECT COUNT(*) FROM  WHERE . = .) AS count\nFROM ', 1) },
    
    // Window function templates
    { label: 'Pagination with ROW_NUMBER', detail: 'Efficient pagination', type: 'template', 
      apply: createApply('SELECT * FROM (\n  SELECT *, ROW_NUMBER() OVER(ORDER BY ) AS rn\n  FROM \n) sub\nWHERE rn BETWEEN 1 AND 10', 53) },
    { label: 'Running total', detail: 'Cumulative sum', type: 'template', 
      apply: createApply('SELECT *,\n  SUM() OVER(ORDER BY ) AS running_total\nFROM ', 1) },
    
    // Information schema queries
    { label: 'List all tables', detail: 'Query information_schema', type: 'template', 
      apply: createApply("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'", 1) },
    { label: 'Table columns info', detail: 'Get column details', type: 'template', 
      apply: createApply("SELECT column_name, data_type, is_nullable\nFROM information_schema.columns\nWHERE table_name = ''", 1) }
  ];

  // Combine all completions
  const options = [
    ...sqlKeywords,
    ...aggregateFunctions,
    ...stringFunctions,
    ...dateFunctions,
    ...jsonFunctions,
    ...arrayFunctions,
    ...windowFunctions,
    ...dataTypes,
    ...queryTemplates
  ];

  return { from: word ? word.from : context.pos, options, validFor: /\w[\w.]*/ };
};

const isMacPlatform = () => /Mac|iPhone|iPod|iPad/.test(navigator.platform);

export default function SQLEditor({
  value = '',
  onChange,
  disabled = false,
  placeholderText = 'Enter your SQL query...',
  tableNames = [],
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

    // Tables completion
    const tablesCompletion = (context) => {
      const word = context.matchBefore(/\w[\w.]*/);
      if (!word && !context.explicit) return null;
      
      // If we have table names, suggest them
      if (tableNames.length > 0) {
        const createApply = (text, cursorOffset = 1) => (view, completion, from, to) => {
          const cursorPos = from + text.length - cursorOffset;
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: cursorPos }
          });
          requestAnimationFrame(() => view.focus());
        };

        const tableOpts = tableNames.map((name) => ({
          label: name,
          type: 'variable',
          detail: 'Table'
        }));
        
        // Also add common query snippets with table names
        const snippetOpts = tableNames.flatMap((name) => [
          { label: `SELECT * FROM ${name} LIMIT 100`, type: 'function', detail: 'Select from table', apply: createApply(`SELECT * FROM ${name} LIMIT 100`, 1) },
          { label: `SELECT COUNT(*) FROM ${name}`, type: 'function', detail: 'Count rows', apply: createApply(`SELECT COUNT(*) FROM ${name}`, 1) },
          { label: `INSERT INTO ${name}`, type: 'function', detail: 'Insert into table', apply: createApply(`INSERT INTO ${name} () VALUES ()`, 13) },
          { label: `UPDATE ${name} SET`, type: 'function', detail: 'Update table', apply: createApply(`UPDATE ${name} SET  WHERE `, 8) },
          { label: `DELETE FROM ${name} WHERE`, type: 'function', detail: 'Delete from table', apply: createApply(`DELETE FROM ${name} WHERE `, 1) }
        ]);
        
        return { from: word ? word.from : context.pos, options: [...tableOpts, ...snippetOpts], validFor: /\w[\w.]*/ };
      }
      
      return null;
    };

    // Build schema for CodeMirror SQL
    const schema = {};
    tableNames.forEach(name => {
      schema[name] = [];
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        keymap.of([
          {
            key: 'Tab',
            run: (view) => {
              if (acceptCompletion(view)) return true;
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
        sql({ dialect: PostgreSQL, schema }),
        autocompletion({
          override: [tablesCompletion, sqlCompletionSource],
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
            lineHeight: '1.4375em',
            textAlign: 'left', 
            backgroundColor: 'inherit',
            padding: '16.5px 14px'
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

    // Ctrl+S / Cmd+S to format SQL (basic formatting)
    const onKeydown = (e) => {
      const key = e.key.toLowerCase();
      const saveCombo = (isMacPlatform() && e.metaKey && key === 's') || (!isMacPlatform() && e.ctrlKey && key === 's');
      if (saveCombo) {
        e.preventDefault();
        // Basic SQL formatting - just ensure proper spacing
        const input = viewRef.current ? viewRef.current.state.doc.toString() : '';
        // Simple formatting: uppercase keywords, clean whitespace
        const formatted = input
          .replace(/\s+/g, ' ')
          .trim();
        if (viewRef.current && formatted !== input) {
          viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: formatted } });
        }
      }
    };
    window.addEventListener('keydown', onKeydown);

    return () => {
      window.removeEventListener('keydown', onKeydown);
      view.destroy();
    };
  }, [tableNames]);

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

