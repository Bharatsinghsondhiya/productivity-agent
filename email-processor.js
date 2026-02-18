/**
 * Email Processor - Cleans, summarizes, and classifies email content
 * Pre-processes raw email bodies BEFORE sending to LLM
 */

/**
 * Clean raw email body text - strip junk, signatures, footers, URLs
 */
export function cleanEmailBody(rawBody) {
    if (!rawBody) return '';

    let cleaned = rawBody;

    // Remove URLs (keep just "[link]" indicator)
    cleaned = cleaned.replace(/https?:\/\/[^\s)>\]]+/gi, '[link]');

    // Remove email footers / unsubscribe blocks
    const footerPatterns = [
        /unsubscribe.*$/gim,
        /you received this email because.*$/gim,
        /to stop receiving.*$/gim,
        /view this email in your browser.*$/gim,
        /click here to unsubscribe.*$/gim,
        /manage your preferences.*$/gim,
        /privacy policy.*terms of service.*$/gim,
        /©\s*\d{4}.*$/gim,
        /\d{4}\s+(amphitheatre|street|avenue|road|blvd).*$/gim,
    ];
    for (const pattern of footerPatterns) {
        cleaned = cleaned.replace(pattern, '');
    }

    // Remove quoted replies (lines starting with >)
    cleaned = cleaned.replace(/^>.*$/gm, '');

    // Remove "On [date], [person] wrote:" patterns
    cleaned = cleaned.replace(/on\s+\w+,\s+\w+\s+\d+.*wrote:.*$/gim, '');

    // Remove excessive whitespace/newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
    cleaned = cleaned.trim();

    return cleaned;
}

/**
 * Extract key information from cleaned email body
 */
export function extractKeyInfo(cleanedBody) {
    const info = {
        dates: [],
        amounts: [],
        actionItems: [],
        names: [],
        keyPhrases: [],
    };

    if (!cleanedBody) return info;

    // Extract dates (various formats)
    const datePatterns = [
        /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*,?\s*\d{2,4}\b/gi,
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}\s*,?\s*\d{2,4}\b/gi,
        /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
        /\b(today|tomorrow|next week|this week)\b/gi,
    ];
    for (const pattern of datePatterns) {
        const matches = cleanedBody.match(pattern);
        if (matches) info.dates.push(...matches.map(m => m.trim()));
    }
    info.dates = [...new Set(info.dates)].slice(0, 5);

    // Extract monetary amounts
    const amountMatches = cleanedBody.match(/[₹$€£]\s?[\d,]+(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s?(?:USD|INR|EUR|GBP)/gi);
    if (amountMatches) info.amounts = [...new Set(amountMatches)].slice(0, 5);

    // Extract action-like sentences
    const sentences = cleanedBody.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 10);
    const actionKeywords = /\b(please|kindly|required|must|need to|action|deadline|respond|reply|confirm|submit|complete|attend|join|register|rsvp)\b/i;
    info.actionItems = sentences.filter(s => actionKeywords.test(s)).slice(0, 5);

    // First 3 substantive sentences as key phrases
    info.keyPhrases = sentences
        .filter(s => s.length > 20 && s.length < 200)
        .filter(s => !/^\[link\]/.test(s))
        .slice(0, 3);

    return info;
}

/**
 * Classify email type based on headers and body content
 */
export function classifyEmail(headers, cleanedBody) {
    const from = (headers.from || '').toLowerCase();
    const subject = (headers.subject || '').toLowerCase();
    const body = (cleanedBody || '').toLowerCase();
    const combined = `${from} ${subject} ${body}`;

    // Classification rules (order matters - first match wins)
    if (/noreply|no-reply|newsletter|marketing|promo|offer|sale|discount|deal|unsubscribe/i.test(combined)) {
        if (/off|%|discount|sale|deal|coupon|offer|price|save/i.test(combined)) return 'promotional';
        return 'newsletter';
    }
    if (/alert|security|verification|verify|password|signin|login|suspicious|unusual/i.test(combined)) return 'security';
    if (/invoice|payment|receipt|order|transaction|billing|subscription/i.test(combined)) return 'transactional';
    if (/meeting|invite|calendar|event|rsvp|attend|join|webinar|summit|conference/i.test(combined)) return 'event';
    if (/notification|update|reminder|notice/i.test(combined)) return 'notification';
    if (/github|gitlab|jenkins|deploy|build|commit|pull request|merge/i.test(combined)) return 'development';

    return 'personal';
}

/**
 * Build a compact digest from full email content
 * This is what gets sent to the LLM instead of raw body
 */
export function buildDigest(emailContent) {
    const { headers, body, snippet } = emailContent;
    const cleanedBody = cleanEmailBody(body || snippet || '');
    const keyInfo = extractKeyInfo(cleanedBody);
    const type = classifyEmail(headers, cleanedBody);

    // Build compact summary (max ~300 chars)
    let summary = '';
    if (keyInfo.keyPhrases.length > 0) {
        summary = keyInfo.keyPhrases.join('. ');
    } else if (cleanedBody) {
        summary = cleanedBody.substring(0, 300);
    } else {
        summary = snippet || 'No readable content';
    }

    // Trim summary
    if (summary.length > 400) {
        summary = summary.substring(0, 397) + '...';
    }

    const digest = {
        from: headers.from || 'Unknown',
        to: headers.to || '',
        subject: headers.subject || 'No Subject',
        date: headers.date || '',
        type,
        summary,
        keyPoints: keyInfo.keyPhrases,
        actionItems: keyInfo.actionItems,
        dates: keyInfo.dates,
        amounts: keyInfo.amounts,
        actionRequired: keyInfo.actionItems.length > 0,
        fullBodyLength: (body || '').length,
    };

    return digest;
}
