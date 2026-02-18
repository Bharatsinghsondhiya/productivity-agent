/**
 * Context Manager - Tracks conversation state and email cache
 * Enables follow-up questions without re-fetching or losing context
 */

class ContextManager {
    constructor() {
        // Cache of processed email digests: messageId → digest object
        this.emailCache = new Map();

        // IDs of emails currently being discussed
        this.activeEmailIds = [];

        // Conversation history: [{role, content, timestamp}]
        this.conversationHistory = [];

        // Max conversation turns to keep
        this.maxHistory = 10;

        // Max cached emails
        this.maxCache = 50;
    }

    /**
     * Cache a processed email digest
     */
    cacheEmail(messageId, digest) {
        // Evict oldest if at capacity
        if (this.emailCache.size >= this.maxCache) {
            const firstKey = this.emailCache.keys().next().value;
            this.emailCache.delete(firstKey);
        }
        this.emailCache.set(messageId, {
            ...digest,
            cachedAt: Date.now()
        });
    }

    /**
     * Get cached email (returns null if not found)
     */
    getCachedEmail(messageId) {
        return this.emailCache.get(messageId) || null;
    }

    /**
     * Set which email IDs are currently being discussed
     */
    setActiveEmails(ids) {
        this.activeEmailIds = Array.isArray(ids) ? ids : [ids];
    }

    /**
     * Add email IDs to the active discussion (append, don't replace)
     */
    addActiveEmails(ids) {
        const newIds = Array.isArray(ids) ? ids : [ids];
        this.activeEmailIds = [...new Set([...this.activeEmailIds, ...newIds])];
    }

    /**
     * Get digests of all active emails (for LLM context)
     */
    getActiveDigests() {
        return this.activeEmailIds
            .map(id => this.emailCache.get(id))
            .filter(Boolean);
    }

    /**
     * Track a conversation exchange
     */
    addExchange(userMsg, agentMsg) {
        this.conversationHistory.push(
            { role: 'user', content: userMsg, timestamp: Date.now() },
            { role: 'agent', content: agentMsg, timestamp: Date.now() }
        );

        // Trim if exceeds max
        while (this.conversationHistory.length > this.maxHistory * 2) {
            this.conversationHistory.shift();
        }
    }

    /**
     * Build compact context string for LLM injection
     * Gives the LLM awareness of what's being discussed
     */
    getContextForLLM() {
        const parts = [];

        // Active email context
        const activeDigests = this.getActiveDigests();
        if (activeDigests.length > 0) {
            parts.push('CURRENTLY DISCUSSED EMAILS:');
            activeDigests.forEach((d, i) => {
                parts.push(`Email ${i + 1}: From: ${d.from} | Subject: ${d.subject} | Type: ${d.type}`);
                parts.push(`Summary: ${d.summary.substring(0, 200)}`);
                if (d.actionItems.length > 0) {
                    parts.push(`Action items: ${d.actionItems.join('; ')}`);
                }
                if (d.dates.length > 0) {
                    parts.push(`Key dates: ${d.dates.join(', ')}`);
                }
                if (d.amounts.length > 0) {
                    parts.push(`Amounts: ${d.amounts.join(', ')}`);
                }
            });
        }

        // Recent conversation summary (last 3 turns)
        const recent = this.conversationHistory.slice(-6);
        if (recent.length > 0) {
            parts.push('\nRECENT CONVERSATION:');
            recent.forEach(msg => {
                const truncated = msg.content.length > 150
                    ? msg.content.substring(0, 147) + '...'
                    : msg.content;
                parts.push(`${msg.role}: ${truncated}`);
            });
        }

        return parts.join('\n');
    }

    /**
     * Clear all context (for new session)
     */
    clear() {
        this.emailCache.clear();
        this.activeEmailIds = [];
        this.conversationHistory = [];
    }
}

// Singleton instance
const contextManager = new ContextManager();
export default contextManager;
