# CGPA Calculator

## Enable AI marksheet analysis

1. Copy `.env.example` to a new file named `.env`.
2. Add a Gemini or OpenAI API key in `.env`. Never put a key in `script.js` or `index.html`.
3. In this folder, run `npm start`.
4. Open `http://localhost:3000` in the browser.

When a marksheet image or PDF is uploaded, the server sends it to Gemini or OpenAI and returns structured subject code, name, credit, and grade data. The browser validates that response and fills the selected semester. If the API is not configured or unavailable, the original on-device OCR scanner is used instead.

To use Gemini, add `GEMINI_API_KEY`, set `AI_PROVIDER=gemini`, then restart the server. Set `AI_PROVIDER=auto` to try Gemini and then OpenAI when a configured provider fails.

The app has a 7 MB browser upload limit for AI analysis. Uploaded marksheets are sent to OpenAI only when AI analysis is enabled and an upload is made.
