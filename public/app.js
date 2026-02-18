const form = document.getElementById('form');
const input = document.getElementById('input');
const log = document.getElementById('log');
const envTag = document.getElementById('envTag');

let userHasScrolledUp = false;

log.addEventListener('scroll', () => {
  const isAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 50;
  userHasScrolledUp = !isAtBottom;
});

function createAvatar(name, who) {
  const el = document.createElement('div');
  el.className = 'avatar';
  el.textContent = who === 'user' ? 'U' : 'A';
  return el;
}

function escapeHtml(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function appendMessage(content, who = 'bot', meta) {
  const row = document.createElement('div');
  row.className = `msg ${who}`;

  const avatar = createAvatar(who === 'user' ? 'You' : 'Agent', who);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  // Render content
  if (typeof content === 'string') {
    // Check if it's HTML (contains tags)
    if (content.includes('<')) {
      bubble.innerHTML = content;
    } else {
      const p = document.createElement('div');
      p.innerHTML = escapeHtml(content).replace(/\n/g, '<br/>');
      bubble.appendChild(p);
    }
  } else {
    bubble.textContent = JSON.stringify(content);
  }

  if (who === 'user') {
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
  }

  // Optional meta
  if (meta) {
    const m = document.createElement('div');
    m.className = 'meta';
    m.textContent = meta;
    bubble.appendChild(m);
  }

  log.appendChild(row);

  // Smart auto-scroll: only scroll if user hasn't manually scrolled up
  if (!userHasScrolledUp) {
    log.scrollTop = log.scrollHeight;
  }
}

// Convert pipe-delimited table-like text into a clean table format
function formatAgentReport(text) {
  console.log('Formatting report from text:', text);

  const lines = String(text).split('\n').map(l => l.trim()).filter(Boolean);
  const tableLines = lines.filter(l => l.includes('|'));

  if (tableLines.length < 2) {
    console.log('No table format detected');
    return null;
  }

  let header = tableLines[0];
  let rows = tableLines.slice(1).filter(r => !r.match(/^[\|\-\s]+$/)); // Skip separator lines

  const cols = header.split('|').map(c => c.trim()).filter(Boolean).map(c => c.toLowerCase());
  console.log('Table columns:', cols);

  function getByName(cells, name) {
    const idx = cols.indexOf(name.toLowerCase());
    if (idx === -1) return null;
    return (cells[idx] || '').trim();
  }

  const items = [];
  rows.forEach((rline) => {
    const cells = rline.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length === 0) return;

    const subj = getByName(cells, 'subject') || getByName(cells, 'title') || cells[0];
    const from = getByName(cells, 'from') || getByName(cells, 'sender') || '';
    const date = getByName(cells, 'date') || '';
    const labels = getByName(cells, 'labels') || getByName(cells, 'status') || '';

    items.push({ subj, from, date, labels });
  });

  if (items.length === 0) {
    console.log('No items parsed from table');
    return null;
  }

  console.log('Parsed items:', items);

  let html = `<div class="report">`;
  html += `<div class="report-title">Inbox overview (${items.length} email${items.length !== 1 ? 's' : ''})</div>`;
  html += `<table class="email-table">`;
  html += `<thead><tr>`;
  html += `<th>#</th>`;
  html += `<th>From</th>`;
  html += `<th>Subject</th>`;
  html += `<th>Date (UTC)</th>`;
  html += `<th>Labels</th>`;
  html += `</tr></thead>`;
  html += `<tbody>`;

  items.forEach((it, idx) => {
    html += `<tr>`;
    html += `<td>${idx + 1}</td>`;
    html += `<td class="email-from">${escapeHtml(it.from)}</td>`;
    html += `<td class="email-subject">${escapeHtml(it.subj)}</td>`;
    html += `<td class="email-date">${escapeHtml(it.date)}</td>`;
    html += `<td class="email-labels">`;

    // Parse and display labels as badges
    if (it.labels) {
      const labelList = it.labels.split(',').map(l => l.trim()).filter(Boolean);
      labelList.forEach(label => {
        const labelClass = label.toUpperCase() === 'UNREAD' ? 'unread' :
          label.toUpperCase() === 'IMPORTANT' ? 'important' : '';
        html += `<span class="label-badge ${labelClass}">${escapeHtml(label.toUpperCase())}</span>`;
      });
    }

    html += `</td>`;
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  return html;
}

// Format email content display (for read_email digest results)
function formatEmailContent(text) {
  // Detect email digest patterns: From + Subject + (Type or Summary)
  const fromMatch = text.match(/(?:^|\n)\*?\*?From:?\*?\*?\s*(.+?)(?:\n|$)/i);
  const subjectMatch = text.match(/(?:^|\n)\*?\*?Subject:?\*?\*?\s*(.+?)(?:\n|$)/i);
  const typeMatch = text.match(/(?:^|\n)\*?\*?Type:?\*?\*?\s*(.+?)(?:\n|$)/i);
  const dateMatch = text.match(/(?:^|\n)\*?\*?Date:?\*?\*?\s*(.+?)(?:\n|$)/i);

  // Need at least from + subject to format as email card
  if (!fromMatch && !subjectMatch) return null;

  const from = fromMatch ? fromMatch[1].trim() : 'Unknown';
  const subject = subjectMatch ? subjectMatch[1].trim() : 'No Subject';
  const type = typeMatch ? typeMatch[1].trim().toLowerCase() : '';
  const date = dateMatch ? dateMatch[1].trim() : '';

  // Extract Summary section
  const summaryMatch = text.match(/\*?\*?Summary:?\*?\*?\s*(.+?)(?:\n\*\*|\n\n|$)/is);
  const summary = summaryMatch ? summaryMatch[1].trim() : '';

  // Extract Key Points section
  const keyPointsMatch = text.match(/\*?\*?Key Points:?\*?\*?\s*([\s\S]*?)(?:\n\*\*|\n\n(?![-•*])|$)/i);
  let keyPoints = [];
  if (keyPointsMatch) {
    keyPoints = keyPointsMatch[1].split('\n')
      .map(line => line.replace(/^[-•*\s]+/, '').trim())
      .filter(line => line.length > 0);
  }

  // Extract Action Required
  const actionMatch = text.match(/\*?\*?Action Required:?\*?\*?\s*(.+?)(?:\n|$)/i);
  const actionRequired = actionMatch ? actionMatch[1].trim() : '';

  // Extract any remaining body text (everything after headers/sections)
  let body = '';
  const lines = text.split('\n');
  let afterSections = false;
  let bodyLines = [];
  for (const line of lines) {
    if (afterSections && !line.match(/^\*?\*?(From|Subject|Type|Date|Summary|Key Points|Action Required):?\*?\*?/i)) {
      bodyLines.push(line);
    }
    if (line.match(/^\*?\*?(Action Required|Key Points):?\*?\*?/i)) {
      afterSections = true;
    }
  }
  body = bodyLines.join('\n').trim();
  // If no structured content found, fall back to full body
  if (!summary && !keyPoints.length && !body) {
    const lastHeaderIdx = Math.max(
      ...lines.map((l, i) => l.match(/^\*?\*?(From|Subject|Type|Date):?\*?\*?/i) ? i : -1)
    );
    if (lastHeaderIdx >= 0 && lastHeaderIdx < lines.length - 1) {
      body = lines.slice(lastHeaderIdx + 1).join('\n').trim();
    }
  }

  // Type badge colors
  const typeColors = {
    promotional: '#f59e0b', newsletter: '#8b5cf6', security: '#ef4444',
    transactional: '#10b981', event: '#3b82f6', notification: '#6366f1',
    development: '#14b8a6', personal: '#ec4899'
  };
  const badgeColor = typeColors[type] || '#64748b';

  // Build email digest card HTML
  let html = `<div class="email-content-card">`;
  html += `<div class="email-content-header">`;
  if (from) html += `<div class="email-field"><span class="email-field-label">From</span><span class="email-field-value from-value">${escapeHtml(from)}</span></div>`;
  if (subject) html += `<div class="email-field"><span class="email-field-label">Subject</span><span class="email-field-value subject-value">${escapeHtml(subject)}</span></div>`;
  if (date) html += `<div class="email-field"><span class="email-field-label">Date</span><span class="email-field-value">${escapeHtml(date)}</span></div>`;
  if (type) html += `<div class="email-field"><span class="email-field-label">Type</span><span class="email-type-badge" style="background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}44">${escapeHtml(type)}</span></div>`;
  html += `</div>`;

  // Summary section
  if (summary) {
    html += `<div class="email-digest-section">`;
    html += `<div class="email-digest-label">Summary</div>`;
    html += `<div class="email-digest-text">${escapeHtml(summary).replace(/\n/g, '<br/>')}</div>`;
    html += `</div>`;
  }

  // Key points
  if (keyPoints.length > 0) {
    html += `<div class="email-digest-section">`;
    html += `<div class="email-digest-label">Key Points</div>`;
    html += `<ul class="email-key-points">`;
    keyPoints.forEach(point => {
      html += `<li>${escapeHtml(point)}</li>`;
    });
    html += `</ul></div>`;
  }

  // Action required
  if (actionRequired) {
    const isActionNeeded = !/^no/i.test(actionRequired);
    html += `<div class="email-action-indicator ${isActionNeeded ? 'action-needed' : 'no-action'}">`;
    html += `<span class="action-icon">${isActionNeeded ? '⚡' : '✓'}</span>`;
    html += `<span>${escapeHtml(actionRequired)}</span>`;
    html += `</div>`;
  }

  // Fallback body
  if (!summary && !keyPoints.length && body) {
    html += `<div class="email-content-body">${escapeHtml(body).replace(/\n/g, '<br/>')}</div>`;
  }

  html += `</div>`;
  return html;
}

// Typewriter effect function
function typewriteText(element, text, speed = 10) {
  return new Promise((resolve) => {
    const isHTMLContent = text.includes('<table') || text.includes('<div class="report">') || text.includes('<div class="email-content-card">');

    if (isHTMLContent) {
      element.innerHTML = text;
      if (!userHasScrolledUp) {
        log.scrollTop = log.scrollHeight;
      }
      resolve();
      return;
    }

    let i = 0;
    element.innerHTML = '';

    function type() {
      if (i < text.length) {
        if (text[i] === '<') {
          const closingIndex = text.indexOf('>', i);
          if (closingIndex !== -1) {
            element.innerHTML += text.substring(i, closingIndex + 1);
            i = closingIndex + 1;
          } else {
            element.innerHTML += text[i];
            i++;
          }
        } else {
          element.innerHTML += text[i];
          i++;
        }

        if (!userHasScrolledUp) {
          log.scrollTop = log.scrollHeight;
        }

        setTimeout(type, speed);
      } else {
        resolve();
      }
    }

    type();
  });
}

// initial welcome
appendMessage('Hello! I\'m your Oui Operations Agent. I can help you:\n• View and read your emails\n• Compose and send professional emails\n• Organize, label, and archive emails\n• Extract information from email content\n\nTry: "Show my unread emails" or "What\'s in the latest email?"', 'bot');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;

  // Show user message
  appendMessage(input.value, 'user');
  const userMsg = input.value;
  input.value = '';

  // Create agent bubble with thinking animation (SINGLE BUBBLE)
  const agentRow = document.createElement('div');
  agentRow.className = 'msg bot';
  const avatar = createAvatar('Agent', 'bot');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = '<div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div></div>';

  agentRow.appendChild(avatar);
  agentRow.appendChild(bubble);
  log.appendChild(agentRow);

  if (!userHasScrolledUp) {
    log.scrollTop = log.scrollHeight;
  }

  try {
    const resp = await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: userMsg }),
    });

    const r = await resp.json();

    // remove typing indicator
    const last = log.querySelector('.msg.bot:last-child');
    if (last) {
      const indicator = last.querySelector('.thinking-indicator'); // Corrected selector
      if (indicator) indicator.remove();
    }

    if (!r.ok) {
      // Friendly error display
      let errorMsg = r.error || 'Unknown error';
      if (errorMsg.includes('429') || errorMsg.includes('rate_limit') || errorMsg.includes('Rate limit')) {
        errorMsg = '⏳ Rate limit reached. Please wait 15-20 seconds and try again.';
      }
      await typewriteText(bubble, `<div style="color: #f0a050; padding: 8px 0;">⚠️ ${escapeHtml(errorMsg)}</div>`);
      return;
    }

    // Access the actual response data
    const response = r.response;

    // update environment tag if provided
    if (response?.env) envTag.textContent = response.env;

    if (response?.__interrupt__?.length) {
      // Handle interrupt with typewriter effect
      const iv = response.__interrupt__[0];
      const interruptId = iv.id;
      const description = iv.value?.actionRequests?.[0]?.description || 'Action required';
      const decisions = (iv.value?.reviewConfigs?.[0]?.allowedDecisions || []).filter(d => d !== 'edit');

      let html = `<div class="report">`;
      html += `<div class="report-title">⚠️ Action Required — Refund Pending Approval</div>`;
      html += `<div class="report-meta" style="margin-top: 12px;">${escapeHtml(description)}</div>`;

      if (decisions.length > 0) {
        html += `<div class="report-actions">`;
        html += `<div class="report-sub">Suggested actions:</div>`;
        html += `<ul>`;
        decisions.forEach(d => {
          html += `<li data-action="${escapeHtml(d)}" data-interrupt-id="${escapeHtml(interruptId)}">${escapeHtml(d)}</li>`;
        });
        html += `</ul></div>`;
      }
      html += `</div>`;

      // Replace thinking with content using typewriter
      await typewriteText(bubble, html);

      // Attach click handlers
      bubble.querySelectorAll('.report-actions li').forEach(li => {
        li.addEventListener('click', async () => {
          const decision = li.getAttribute('data-action');
          const interruptId = li.getAttribute('data-interrupt-id');
          appendMessage(`Decision: ${decision}`, 'user');
          await sendResume(interruptId, decision);
        });
      });

      return;
    }

    // Normal response - replace thinking with typewriter effect
    let content = response?.messages?.[response.messages.length - 1]?.content || response?.content || '';

    console.log('Received content from agent:', content);
    console.log('Response structure:', response);

    // Try to format as report table
    const reportHtml = formatAgentReport(content);
    if (reportHtml) {
      console.log('Using table format');
      await typewriteText(bubble, reportHtml);
    } else {
      // Try to format as email content card
      const emailHtml = formatEmailContent(content);
      if (emailHtml) {
        console.log('Using email content format');
        // Show any text before the email card, plus the card
        const beforeEmail = content.split(/(?:From|Subject):/i)[0].trim();
        let finalHtml = '';
        if (beforeEmail && beforeEmail.length > 5) {
          finalHtml += `<div style="margin-bottom: 12px;">${escapeHtml(beforeEmail).replace(/\n/g, '<br/>')}</div>`;
        }
        finalHtml += emailHtml;
        await typewriteText(bubble, finalHtml);
      } else {
        console.log('Using plain text format');
        const formattedContent = escapeHtml(content).replace(/\n/g, '<br/>');
        await typewriteText(bubble, formattedContent);
      }
    }

  } catch (err) {
    console.error('Error:', err);
    bubble.innerHTML = `<div style="color: #ef4444;">Error: ${escapeHtml(err.message)}</div>`;
  }
});

async function revealTextInto(el, text) {
  el.innerHTML = '';
  if (!text) return;
  const clean = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    el.innerHTML += ch === '\n' ? '<br/>' : ch;
    await new Promise(r => setTimeout(r, 8));
  }
}

async function sendResume(interruptId, decision) {
  try {
    const resp = await fetch('/api/message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume: { interruptId, decision } })
    });
    const data = await resp.json();
    if (data.ok) {
      appendMessage(`Decision sent: ${decision}`, 'bot');
      // show response from resume
      if (data.response?.messages && data.response.messages.length) {
        const txt = data.response.messages[data.response.messages.length - 1].content;
        appendMessage('', 'bot');
        const latestBubble = log.querySelector('.msg.bot:last-child .bubble');
        await revealTextInto(latestBubble, txt);
      }
    } else {
      appendMessage('Resume failed: ' + (data.error || 'unknown'), 'bot');
    }
  } catch (e) { appendMessage('Resume error: ' + e.message, 'bot'); }
}
