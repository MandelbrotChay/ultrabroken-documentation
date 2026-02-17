// Quick test harness for filterQueryForRetrieval
const QUESTION_WORDS = new Set(['what','how','why','where','when','which','who','whom','whose']);
const COMMON_LOWERCASE_STOPWORDS = new Set(['the','a','an','to','of','in','on','for','by','with','and','or','is','are']);
const WHITELIST = new Set(['Zuggle','Tulin','Overload']);

const tokenize = (s) => (String(s||'').toLowerCase().match(/\w+/g) || []);

const isTitleCase = (t) => /^[A-Z][a-z]+$/.test(t);

const filterQueryForRetrieval = (query) => {
  if (!query) return '';
  const raw = String(query).trim().split(/\s+/);
  const tokens = [];
  for (let i = 0; i < raw.length; i++){
    const r = raw[i];
    const stripped = (r||'').replace(/^[^\w]+|[^\w]+$/g,'');
    if (!stripped) continue;
    if (WHITELIST.has(stripped)) { tokens.push(stripped); continue; }
    if (QUESTION_WORDS.has(stripped.toLowerCase())) continue;
    if (stripped === stripped.toUpperCase() && stripped.length >= 2) { tokens.push(stripped); continue; }
    if (/[0-9]|-|_/.test(stripped)) { tokens.push(stripped); continue; }
    if (isTitleCase(stripped)){
      const run = [stripped];
      let j = i+1;
      while (j < raw.length){
        const next = (raw[j]||'').replace(/^[^\w]+|[^\w]+$/g,'');
        if (!isTitleCase(next)) break;
        run.push(next);
        j++;
      }
      if (run.length > 1){
        tokens.push(run.join('_'));
        i = j-1;
        continue;
      }
      tokens.push(stripped);
      continue;
    }
    if (stripped === stripped.toLowerCase() && COMMON_LOWERCASE_STOPWORDS.has(stripped)) continue;
    if (stripped.length <= 2 && stripped === stripped.toLowerCase()) continue;
    tokens.push(stripped);
  }
  if (tokens.length === 0){
    for (const r of String(query).trim().split(/\s+/)){
      const s = (r||'').replace(/^[^\w]+|[^\w]+$/g,'');
      if (!s) continue;
      if (QUESTION_WORDS.has(s.toLowerCase())) continue;
      tokens.push(s);
      break;
    }
  }
  return tokens.join(' ');
};

const tests = [
  'What is SDC?',
  'the Legend of Zelda OOB',
  'How to SDC?',
  'Overload',
  'Stick Desync Clip',
  'the'
];

for (const q of tests){
  const filtered = filterQueryForRetrieval(q);
  console.log('---');
  console.log('orig:    ', q);
  console.log('filtered:', filtered);
  console.log('tokens:  ', tokenize(filtered));
}
