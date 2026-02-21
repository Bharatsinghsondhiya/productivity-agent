import * as z from 'zod';
import { createAgent, tool, humanInTheLoopMiddleware } from 'langchain';
import { ChatGroq } from '@langchain/groq';
import { Command } from '@langchain/langgraph';
import { getGmailClient } from './gmail-auth.js';
import { listEmails, sendEmail, modifyLabels, archiveMessages, markAsRead, getEmailContent } from './gmail-service.js';
import { buildDigest } from './email-processor.js';
import contextManager from './context-manager.js';

const llm = new ChatGroq({
  model: 'llama-3.3-70b-versatile',
  temperature: 0,
  maxRetries: 2,
});

const getEmails = tool(
  async ({ maxResults = 3, query = '' }) => {
    try {
      const gmail = await getGmailClient();
      const emails = await listEmails(gmail, { maxResults, query });
      return JSON.stringify(emails);
    } catch (error) {
      return JSON.stringify({ error: error.message, messages: [], resultSizeEstimate: 0 });
    }
  },
  {
    name: 'get_emails',
    description: 'Get emails from Gmail inbox. Supports Gmail search syntax. Returns messages with sender, subject, date, and labels.',
    schema: z.object({
      maxResults: z.number().optional().describe('Max emails to fetch (default: 3)'),
      query: z.string().optional().describe('Gmail search query (e.g. "is:unread", "from:user@example.com")')
    })
  }
);

const readEmailTool = tool(
  async ({ messageId }) => {
    try {
      const cached = contextManager.getCachedEmail(messageId);
      if (cached) {
        contextManager.addActiveEmails(messageId);
        return JSON.stringify({ success: true, email: cached });
      }

      const gmail = await getGmailClient();
      const emailContent = await getEmailContent(gmail, messageId);
      const digest = buildDigest(emailContent);

      contextManager.cacheEmail(messageId, digest);
      contextManager.addActiveEmails(messageId);

      return JSON.stringify({ success: true, email: digest });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: 'read_email',
    description: 'Read and analyze a specific email. Returns a processed digest: type, summary, key points, action items, dates, and amounts.',
    schema: z.object({
      messageId: z.string().describe('Message ID from get_emails results')
    })
  }
);

const sendEmailTool = tool(
  async ({ to, subject, body, cc, bcc, html }) => {
    try {
      console.log('[sendEmailTool] called with body:', body ? body.substring(0, 100) : '!!! EMPTY !!!');
      // Guard: body must be present
      if (!body || body.trim().length === 0) {
        return JSON.stringify({ error: 'Email body is empty. Please provide the message body text.' });
      }
      const gmail = await getGmailClient();
      const result = await sendEmail(gmail, { to, subject, body: body.trim(), cc, bcc, html });
      return JSON.stringify({ success: true, messageId: result.id, to, subject });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: 'send_email',
    description: 'Send an email via Gmail. The body parameter MUST contain the full written email message text — never leave it empty.',
    schema: z.object({
      to: z.string().describe('Recipient email address (or comma-separated list)'),
      subject: z.string().describe('Email subject line'),
      body: z.string().min(1).describe('The FULL written body text of the email. Must be non-empty. Write the complete email content here.'),
      cc: z.string().optional().describe('CC addresses (comma-separated)'),
      bcc: z.string().optional().describe('BCC addresses (comma-separated)'),
      html: z.boolean().optional().describe('True for HTML email (default: false)')
    })
  }
);

const labelEmailsTool = tool(
  async ({ messageIds, addLabels, removeLabels }) => {
    try {
      const gmail = await getGmailClient();
      await modifyLabels(gmail, messageIds, { addLabels, removeLabels });
      return JSON.stringify({ success: true, count: messageIds.length });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: 'label_emails',
    description: 'Add or remove Gmail labels from emails.',
    schema: z.object({
      messageIds: z.array(z.string()).describe('Email message IDs to modify'),
      addLabels: z.array(z.string()).optional().describe('Labels to add (e.g. ["IMPORTANT"])'),
      removeLabels: z.array(z.string()).optional().describe('Labels to remove (e.g. ["UNREAD"])')
    })
  }
);

const archiveEmailsTool = tool(
  async ({ messageIds }) => {
    try {
      const gmail = await getGmailClient();
      await archiveMessages(gmail, messageIds);
      return JSON.stringify({ success: true, count: messageIds.length });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: 'archive_emails',
    description: 'Archive emails (remove from INBOX).',
    schema: z.object({
      messageIds: z.array(z.string()).describe('Email message IDs to archive')
    })
  }
);

const markReadTool = tool(
  async ({ messageIds, read }) => {
    try {
      const gmail = await getGmailClient();
      await markAsRead(gmail, messageIds, read);
      return JSON.stringify({ success: true, count: messageIds.length });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: 'mark_read',
    description: 'Mark emails as read or unread.',
    schema: z.object({
      messageIds: z.array(z.string()).describe('Email message IDs'),
      read: z.boolean().describe('True to mark as read, false for unread')
    })
  }
);

const agent = createAgent({
  model: llm,
  tools: [getEmails, readEmailTool, sendEmailTool, labelEmailsTool, archiveEmailsTool, markReadTool],
  systemPrompt: `You are Oui — an email automation assistant.

TOOLS: get_emails, read_email, send_email, label_emails, archive_emails, mark_read

SCOPE: Email management only. Politely decline non-email questions.

CORE RULES:
1. COMPOSE emails yourself — write the full message including greeting and sign-off. Use "Best regards, Oui" or similar for sign-offs. No "[Your Name]" placeholders.
2. TAKE ACTION — call tools directly, don't just describe what you'd do.
3. Greetings like "hi/hello" → respond warmly without fetching emails.

EMAIL LIST FORMAT:
When showing emails from get_emails, output a pipe table:
| From | Subject | Date | Labels |
|------|---------|------|--------|
Parse JSON: From/Subject/Date from payload.headers, Labels from labelIds.

EMAIL ANALYSIS:
read_email returns a PROCESSED DIGEST with: type, summary, keyPoints, actionItems, dates, amounts.
Give INTELLIGENT ANALYSIS — explain what the email means, why it matters, what action is needed.

Present as:
From: [sender]
Subject: [subject]
Type: [type]

**Summary:** [your intelligent summary]
**Key Points:** [bullet list]
**Action Required:** [yes/no + what]

FOLLOW-UP QUESTIONS:
When user asks about a previously read email, answer using cached context WITHOUT re-fetching.

SENDING EMAILS:
- Compose the COMPLETE email body yourself — write every word of it
- The 'body' field when calling send_email MUST contain the full written message text (greeting, content, sign-off)
- NEVER call send_email with an empty body or a placeholder like '[message]'
- Example body: "Dear Sumit,\n\nYou are invited to our presentation on 20 Feb at 3pm...\n\nBest regards,\nOui Team"
- Gather only facts needed (recipient, date, topic), then write and send immediately`,
});

export async function handleQuery(query, resume) {
  const resumeCommand = resume
    ? new Command({
      resume: {
        [resume.interruptId]: { decisions: [{ type: resume.decision }] },
      },
    })
    : null;

  let enrichedQuery = query;
  if (!resume && query) {
    const context = contextManager.getContextForLLM();
    if (context) {
      enrichedQuery = `[CONTEXT]\n${context}\n[/CONTEXT]\n\nUser: ${query}`;
    }
  }

  const response = await agent.invoke(
    resumeCommand || {
      messages: [{ role: 'user', content: enrichedQuery }],
    },
    { configurable: { thread_id: '1' } }
  );

  if (query && response?.messages?.length) {
    const lastMsg = response.messages[response.messages.length - 1];
    if (lastMsg?.content) {
      contextManager.addExchange(query, lastMsg.content.substring(0, 300));
    }
  }

  return response;
}
