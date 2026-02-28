/** Detect placeholder tokens in Mongo-like query strings. */
export function detectPlaceholders(query) {
  if (!query || typeof query !== 'string') return [];
  const matches = new Set();
  // :param style (avoid matching :// in connection strings)
  (query.match(/(^|\s):([a-zA-Z_][a-zA-Z0-9_]*)\b/g) || [])
    .forEach((m) => {
      const name = m.trim().replace(/^:/, '');
      if (name) matches.add(`:${name}`);
    });
  // ${param} style
  (query.match(/\$\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g) || [])
    .forEach((m) => matches.add(m));
  // {paramN} style - quoted
  const quotedCurlyRe = /(["'])\{\s*(param[0-9]+)\s*\}\1/g;
  let mm;
  while ((mm = quotedCurlyRe.exec(query)) !== null) {
    matches.add(`{${mm[2]}}`);
  }
  // {paramN} style - unquoted
  (query.match(/\{\s*(param[0-9]+)\s*\}/g) || [])
    .forEach((m2) => {
      const name = m2.replace(/\{\s*(param[0-9]+)\s*\}/, '{$1}');
      matches.add(name);
    });
  return Array.from(matches);
}


