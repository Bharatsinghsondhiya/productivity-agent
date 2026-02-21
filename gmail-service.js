export async function listEmails(gmail, options = {}) {
    const { maxResults = 10, query = '' } = options;

    const res = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: query,
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) return { messages: [], resultSizeEstimate: 0 };

    const emailDetails = await Promise.all(
        messages.map(msg =>
            gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
        )
    );

    const formattedEmails = emailDetails.map(email => {
        const data = email.data;
        const essentialHeaders = (data.payload.headers || []).filter(h =>
            ['From', 'Subject', 'Date', 'To'].includes(h.name)
        );
        return {
            id: data.id,
            threadId: data.threadId,
            labelIds: data.labelIds || [],
            snippet: (data.snippet || '').substring(0, 100),
            payload: { headers: essentialHeaders },
            internalDate: data.internalDate,
        };
    });

    return { messages: formattedEmails, resultSizeEstimate: formattedEmails.length };
}

export function parseEmailHeaders(headers) {
    const extracted = { from: '', subject: '', date: '', to: '' };
    headers.forEach(header => {
        const name = header.name.toLowerCase();
        if (name === 'from') extracted.from = header.value;
        if (name === 'subject') extracted.subject = header.value;
        if (name === 'date') extracted.date = header.value;
        if (name === 'to') extracted.to = header.value;
    });
    return extracted;
}

function decodeBase64Url(data) {
    if (!data) return '';
    try {
        const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(base64, 'base64').toString('utf8');
    } catch {
        return '';
    }
}

function stripHtmlTags(html) {
    if (!html) return '';
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function extractBody(part) {
    if (!part) return '';
    if (part.body?.data) return decodeBase64Url(part.body.data);
    if (part.parts && Array.isArray(part.parts)) {
        const textPart = part.parts.find(p => p.mimeType === 'text/plain');
        const htmlPart = part.parts.find(p => p.mimeType === 'text/html');
        if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
        if (htmlPart?.body?.data) return stripHtmlTags(decodeBase64Url(htmlPart.body.data));
        for (const subPart of part.parts) {
            const found = extractBody(subPart);
            if (found) return found;
        }
    }
    return '';
}

export async function getEmailContent(gmail, messageId) {
    const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    const email = res.data;
    const headers = parseEmailHeaders(email.payload.headers || []);
    const body = extractBody(email.payload) || email.snippet || '';
    return {
        id: email.id,
        threadId: email.threadId,
        labelIds: email.labelIds || [],
        headers,
        body,
        snippet: email.snippet,
        internalDate: email.internalDate,
    };
}

export async function sendEmail(gmail, { to, subject, body, cc, bcc, replyTo, html = false }) {
    // Debug: log what we actually received
    console.log('[sendEmail] to:', to);
    console.log('[sendEmail] subject:', subject);
    console.log('[sendEmail] body:', body);

    // Build headers - filter out empty optional ones only
    const headers = [
        `MIME-Version: 1.0`,
        `Date: ${new Date().toUTCString()}`,
        `To: ${to}`,
        subject ? `Subject: ${subject}` : '',
        cc ? `Cc: ${cc}` : '',
        bcc ? `Bcc: ${bcc}` : '',
        replyTo ? `Reply-To: ${replyTo}` : '',
        `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset=utf-8`,
        `Content-Transfer-Encoding: 8bit`,
    ].filter(Boolean);

    // RFC 2822: blank line MUST separate headers from body — never filter it out
    const rawMessage = headers.join('\r\n') + '\r\n\r\n' + (body || '');

    console.log('[sendEmail] raw message preview:\n', rawMessage.substring(0, 300));

    const encoded = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encoded },
    });
    return res.data;
}

export async function modifyLabels(gmail, messageIds, { addLabels = [], removeLabels = [] }) {
    const results = await Promise.all(
        messageIds.map(id =>
            gmail.users.messages.modify({
                userId: 'me',
                id,
                requestBody: { addLabelIds: addLabels, removeLabelIds: removeLabels },
            })
        )
    );
    return results.map(r => r.data);
}

export async function archiveMessages(gmail, messageIds) {
    await modifyLabels(gmail, messageIds, { removeLabels: ['INBOX'] });
    return { success: true, count: messageIds.length };
}

export async function markAsRead(gmail, messageIds, read = true) {
    const operation = read
        ? { removeLabels: ['UNREAD'] }
        : { addLabels: ['UNREAD'] };
    await modifyLabels(gmail, messageIds, operation);
    return { success: true, count: messageIds.length };
}
