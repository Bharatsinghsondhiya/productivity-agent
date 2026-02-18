# Oui Operations Agent

An AI-powered email operations assistant that connects to your Gmail account and lets you manage emails through natural language conversation. Read, summarize, compose, send, label, and archive emails — all through a clean chat interface.

## ✨ Features

- 📬 **Smart Email Reading** — Fetches emails and displays them in clean formatted tables
- 🧠 **AI Summarization** — Processes email content into intelligent digests: type classification, key points, action items, extracted dates and amounts
- 💬 **Conversation Memory** — Follow-up questions use cached context, no re-fetching needed
- ✍️ **Email Composition** — Composes and sends professional emails from natural language instructions
- 🗂️ **Email Organization** — Label, archive, and mark emails as read/unread
- 🔄 **Rate Limit Handling** — Automatic retry with backoff on API rate limits
- 🔒 **Secure OAuth** — Gmail access via Google OAuth 2.0, credentials never stored in code

## 🏗️ Architecture

```
Browser (Chat UI)
    ↓ HTTP POST
web-server.js  (Express + retry logic)
    ↓
agent.js  (LangGraph agent + Gmail tools)
    ↓
email-processor.js  (clean → extract → classify → digest)
    ↓
context-manager.js  (cache + conversation memory)
    ↓
Gmail API
```

## 📋 Prerequisites

- Node.js v18+
- Google Cloud Project with **Gmail API** enabled
- OAuth 2.0 Desktop credentials (`credentials.json`)
- Groq API key (free at [console.groq.com](https://console.groq.com))

## 🔧 Setup

### 1. Clone and Install

```bash
git clone https://github.com/your-username/oui-operations-agent.git
cd oui-operations-agent
npm install
```

### 2. Configure Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → Enable **Gmail API**
3. Go to **APIs & Services → Credentials**
4. Create **OAuth 2.0 Client ID** → Desktop app
5. Download the JSON and save as `credentials.json` in the project root
6. Add your Gmail address as a test user in the OAuth consent screen

### 3. Environment Variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

Get your free Groq API key at [console.groq.com](https://console.groq.com).

### 4. Run

```bash
npm run web
```

Open [http://localhost:3000](http://localhost:3000)

On first use, a browser window will open for Gmail OAuth authorization. After you approve, a `token.json` is saved locally for future sessions.

## 💬 Example Queries

```
"Show my unread emails"
"Read the email from Google"
"Summarize the last 3 emails"
"Send a leave request to manager@company.com for Feb 20-22"
"Archive all promotional emails"
"Mark the YC email as read"
```

## 📂 Project Structure

```
oui-operations-agent/
├── agent.js               # LangGraph agent, all Gmail tools, handleQuery()
├── web-server.js          # Express server, /api/message endpoint, retry logic
├── gmail-auth.js          # OAuth 2.0 authentication flow
├── gmail-service.js       # Gmail API: list, read, send, label, archive
├── email-processor.js     # Email cleaning, key info extraction, classification
├── context-manager.js     # Email cache, conversation history, context injection
├── public/
│   ├── index.html         # Single-page chat interface
│   ├── app.js             # Frontend logic, email card rendering
│   └── style.css          # Dark theme, digest card components
├── .env                   # API keys (git-ignored)
├── credentials.json       # Google OAuth credentials (git-ignored)
└── token.json             # Saved OAuth token (git-ignored)
```

## 🔒 Security

- `credentials.json`, `token.json`, and `.env` are all git-ignored — never committed
- OAuth 2.0 scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`
- No email content is stored persistently — context is in-memory only

## 🛠️ Customization

**Change email fetch count** — edit `agent.js`:
```js
async ({ maxResults = 3, query = '' }) => {  // increase as needed
```

**Change LLM model** — edit `agent.js`:
```js
const llm = new ChatGroq({ model: 'llama-3.3-70b-versatile' });
```

**Modify UI theme** — CSS variables at the top of `public/style.css`

## 🚀 Future Scope

- Attachment reading and PDF text extraction
- Google Docs and Sheets integration
- Multi-email summarization and inbox triage
- Workflow automation (e.g., auto-log invoices to a sheet)

