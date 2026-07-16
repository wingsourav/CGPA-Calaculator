const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const maxRequestBytes = 10 * 1024 * 1024;
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
}
const allowedFiles = new Set([
  'index.html', 'style.css', 'script.js', 'login.html', 'login.css', 'login.js',
  'create-account.html', 'create-account.js', 'forgot-password.html', 'forgot-password.js',
  'change-password.html', 'change-password.js', 'change-password-form.html', 'change-password-form.js',
  'stars.svg', 'cloud_1.svg', 'cloud_2.svg', 'cloud_3.svg', 'cloud_4.svg',
  'wmremove-transformed.jpeg', 'login-background.png'
]);

const marksheetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['subjects'],
  properties: {
    subjects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'subject', 'credit', 'grade'],
        properties: {
          code: { type: 'string' },
          subject: { type: 'string' },
          credit: { type: 'number' },
          grade: { type: 'string' }
        }
      }
    }
  }
};

const send = (response, status, body, type = 'application/json; charset=utf-8') => {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
};

const readJsonBody = request => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  request.on('data', chunk => {
    size += chunk.length;
    if (size > maxRequestBytes) { reject(new Error('The uploaded file is too large (maximum 10 MB).')); request.destroy(); return; }
    chunks.push(chunk);
  });
  request.on('end', () => {
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Invalid request data.')); }
  });
  request.on('error', reject);
});

const outputText = payload => payload.output_text || payload.output
  ?.flatMap(item => item.content || [])
  .filter(item => item.type === 'output_text')
  .map(item => item.text)
  .join('') || '';

const validateUploadedFile = file => {
  if (!file?.data || !file?.type || !file?.name) throw new Error('Choose a PDF or image marksheet first.');
  if (!/^application\/pdf$|^image\//.test(file.type)) throw new Error('Only PDF and image marksheets are supported.');
};

const analyzeWithOpenAI = async file => {
  if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI is not configured.');
  const content = file.type === 'application/pdf'
    ? { type: 'input_file', filename: file.name, file_data: file.data }
    : { type: 'input_image', image_url: file.data, detail: 'high' };
  const apiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MARKSHEET_MODEL || 'gpt-4.1-mini',
      input: [{ role: 'user', content: [{
        type: 'input_text',
        text: 'Read this university marksheet. Extract every row in the subject table exactly once. Return only rows with a subject code, subject name, credit and grade. Do not include totals, SGPA, headers, registration data, or invented values.'
      }, content] }],
      text: { format: { type: 'json_schema', name: 'marksheet_subjects', strict: true, schema: marksheetSchema } }
    })
  });
  const result = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(result.error?.message || 'OpenAI could not analyze this marksheet.');
  try { return JSON.parse(outputText(result)); } catch { throw new Error('OpenAI returned an unreadable marksheet result.'); }
};

const geminiSchema = {
  type: 'OBJECT',
  properties: {
    subjects: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          code: { type: 'STRING' }, subject: { type: 'STRING' }, credit: { type: 'NUMBER' }, grade: { type: 'STRING' }
        },
        required: ['code', 'subject', 'credit', 'grade']
      }
    }
  },
  required: ['subjects']
};

const analyzeWithGemini = async file => {
  if (!process.env.GEMINI_API_KEY) throw new Error('Gemini is not configured.');
  const base64 = String(file.data).split(',')[1];
  if (!base64) throw new Error('Unable to prepare this file for Gemini.');
  const model = process.env.GEMINI_MARKSHEET_MODEL || 'gemini-2.5-flash';
  const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: 'Read this university marksheet. Extract every row in the subject table exactly once. Return only rows with a subject code, subject name, credit and grade. Do not include totals, SGPA, headers, registration data, or invented values.' },
        { inline_data: { mime_type: file.type, data: base64 } }
      ] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema }
    })
  });
  const result = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(result.error?.message || 'Gemini could not analyze this marksheet.');
  const text = result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  try { return JSON.parse(text); } catch { throw new Error('Gemini returned an unreadable marksheet result.'); }
};

const analyzeMarksheet = async request => {
  const { file } = await readJsonBody(request);
  validateUploadedFile(file);
  const provider = (process.env.AI_PROVIDER || 'auto').toLowerCase();
  const analyzers = provider === 'gemini' ? [analyzeWithGemini] : provider === 'openai' ? [analyzeWithOpenAI] : [analyzeWithGemini, analyzeWithOpenAI];
  const errors = [];
  for (const analyzer of analyzers) {
    try { return await analyzer(file); } catch (error) { errors.push(error.message); }
  }
  throw new Error(errors.join(' ') || 'No AI provider is configured.');
};

http.createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/analyze-marksheet') {
    try { send(response, 200, await analyzeMarksheet(request)); } catch (error) { send(response, 400, { error: error.message || 'Unable to analyze marksheet.' }); }
    return;
  }
  if (request.method !== 'GET') { send(response, 405, { error: 'Method not allowed.' }); return; }
  const requested = request.url === '/' ? 'index.html' : decodeURIComponent(request.url.split('?')[0]).replace(/^\//, '');
  if (!allowedFiles.has(requested)) { send(response, 404, 'Not found', 'text/plain; charset=utf-8'); return; }
  const filePath = path.join(root, requested);
  fs.readFile(filePath, (error, data) => {
    if (error) { send(response, 404, 'Not found', 'text/plain; charset=utf-8'); return; }
    const type = requested.endsWith('.html') ? 'text/html; charset=utf-8' : requested.endsWith('.css') ? 'text/css; charset=utf-8' : requested.endsWith('.js') ? 'application/javascript; charset=utf-8' : requested.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
    send(response, 200, data, type);
  });
}).listen(port, () => console.log(`CGPA Calculator running at http://localhost:${port}`));
