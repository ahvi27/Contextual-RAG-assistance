const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const form = $('#composer');
const input = $('#question');
const thread = $('#thread');
const toast = $('#toast');

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

// Local demo corpus. A production backend can replace these chunks with results
// from a vector database while keeping the same grounded-answer contract.
const knowledge = [
  { source: 'Product strategy 2025', citation: 'Strategy, p. 12', text: 'The 2025 product strategy prioritizes workflow clarity, faster onboarding, and trustworthy recommendations over expanding the number of standalone features.' },
  { source: 'Product strategy 2025', citation: 'Strategy, p. 27', text: 'The current roadmap schedules enterprise integrations for Q2, after the collaboration and analytics work planned for Q1.' },
  { source: 'Customer interviews', citation: 'Interviews, finding 3', text: 'Eleven of fifteen interviewed customers said onboarding takes too long because teams must rebuild context when moving between tools.' },
  { source: 'Customer interviews', citation: 'Interviews, finding 6', text: 'Customers consistently asked to see the evidence behind AI recommendations, including a direct link to the original source.' },
  { source: 'Q3 research synthesis', citation: 'Q3 research, p. 8', text: 'Research identifies three leading needs: faster time to value, persistent cross-team context, and verifiable answers with citations.' },
  { source: 'Q3 research synthesis', citation: 'Q3 research, p. 19', text: 'The research recommends moving core integrations forward by one quarter because disconnected workflows are the largest source of early churn.' },
  { source: 'Competitive landscape', citation: 'Landscape, p. 5', text: 'Most competitors offer broad feature sets, but few combine cross-source retrieval, source-level citations, and team context in one workflow.' },
  { source: 'Competitive landscape', citation: 'Landscape, p. 16', text: 'The principal market risk is commoditization of generic chat interfaces; differentiated retrieval quality and trust are more defensible.' }
];

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
}

function saveHistory(question) {
  const history = readStorage('lumen-history', []);
  const next = [{ question, time: new Date().toISOString() }, ...history.filter((item) => item.question !== question)].slice(0, 20);
  writeStorage('lumen-history', next);
  writeStorage('lumen-history-cleared', false);
  renderSavedHistory();
}

function renderSavedHistory() {
  $$('.saved-history').forEach((item) => item.remove());
  const history = readStorage('lumen-history', []);
  if (!$('#historyList .group-label')) $('#historyList').innerHTML = '<p class="group-label">RECENT</p>';
  const anchor = $('#historyList .group-label');
  history.slice(0, 6).reverse().forEach((item) => {
    anchor.insertAdjacentHTML('afterend', `<button class="history-card saved-history" data-question="${escapeHtml(item.question)}"><span class="history-icon">✦</span><span><strong>${escapeHtml(item.question.slice(0, 52))}</strong><small>${escapeHtml(item.question)}</small><em>Saved in this browser · ${new Date(item.time).toLocaleDateString()}</em></span><b>→</b></button>`);
  });
}

function persistActiveSources() {
  writeStorage('lumen-active-sources', $$('.source.active-source strong').map((node) => node.textContent.trim()));
}

function tokenize(value) {
  const stop = new Set(['what','which','where','when','who','why','how','are','the','our','and','for','from','with','into','does','that','this','about','summarize','do','is','to','of','in','a','an']);
  return value.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2 && !stop.has(word)) || [];
}

function retrieve(question) {
  const activeSources = $$('.source.active-source strong').map((node) => node.textContent.trim());
  const terms = tokenize(question);
  return knowledge
    .filter((chunk) => activeSources.includes(chunk.source))
    .map((chunk) => ({
      ...chunk,
      score: terms.reduce((total, term) => total + (chunk.text.toLowerCase().includes(term) ? 2 : 0), 0)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Number($('#depth').value) + 1);
}

function getConversationalAnswer(question) {
  const normalized = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const matches = (...patterns) => patterns.some((pattern) => pattern.test(normalized));

  if (matches(/^(hi|hello|hey|good morning|good afternoon|good evening)\b/, /how are you/)) {
    return {
      heading: 'LUMEN ASSISTANT',
      summary: 'Hello — I’m ready to help.',
      text: 'Ask me what this project does, how to use the workspace, or a question about the active knowledge sources.',
      citations: [], confidence: null
    };
  }

  if (matches(/who i?are you/, /who are you/, /what are you/, /your name/, /tell me about yourself/)) {
    return {
      heading: 'ABOUT LUMEN',
      summary: 'I’m Lumen, an evidence-first knowledge assistant.',
      text: 'I help teams search connected documents, identify relevant context, and answer questions with visible source citations. If the available evidence does not support an answer, I say so instead of guessing.',
      citations: [], confidence: null
    };
  }

  if (matches(/what (is|does) (this|the) project/, /project (is )?about/, /purpose of (this|the) project/, /what (is|does) lumen/, /what does this (app|website)/)) {
    return {
      heading: 'PROJECT OVERVIEW',
      summary: 'Lumen is a contextual retrieval-augmented generation workspace.',
      text: 'The project brings knowledge from documents, research, interviews, and web sources into one searchable workspace. It retrieves passages related to a question, answers only from that evidence, and displays citations so users can verify important claims.',
      citations: [], confidence: null
    };
  }

  if (matches(/what can you do/, /how can you help/, /your capabilities/, /features/)) {
    return {
      heading: 'CAPABILITIES',
      summary: 'I turn connected knowledge into verifiable answers.',
      text: 'I can search active sources, summarize matching findings, compare evidence across documents, surface product risks and themes, and show where every answer came from. You can enable or disable sources and adjust retrieval depth from the context panel.',
      citations: [], confidence: null
    };
  }

  if (matches(/how (do|should|can) i use/, /how does (this|it) work/, /help me get started/)) {
    return {
      heading: 'GETTING STARTED',
      summary: 'Choose sources, then ask a specific question.',
      text: 'Use the knowledge panel to select the sources you trust, choose a retrieval depth, and type a question below. For the most useful answer, mention the topic, time period, or decision you are investigating. Review the displayed citations before using an answer for a critical decision.',
      citations: [], confidence: null
    };
  }

  if (matches(/thank you/, /^thanks\b/, /^thank you\b/)) {
    return {
      heading: 'LUMEN ASSISTANT',
      summary: 'You’re welcome.',
      text: 'Ask another question whenever you’re ready.',
      citations: [], confidence: null
    };
  }

  return null;
}

function buildGroundedAnswer(question, results) {
  const conversational = getConversationalAnswer(question);
  if (conversational) return conversational;
  if (!results.length) return {
    heading: 'NOT ENOUGH EVIDENCE',
    summary: 'The connected sources do not cover this question.',
    text: 'I can’t answer that from the active knowledge sources. Try rephrasing the question, enabling another source, or adding a document that covers this topic.',
    citations: [], confidence: null
  };
  return {
    heading: `ANSWER · ${results.length} SUPPORTING PASSAGE${results.length === 1 ? '' : 'S'}`,
    summary: results.length > 1 ? 'The evidence points to a consistent direction.' : 'One relevant finding is available.',
    text: results.map((result) => result.text).join(' '),
    citations: results.map((result) => result.citation),
    confidence: results.length > 1 ? 'High confidence' : 'Limited evidence'
  };
}

function askQuestion(question) {
  if (!question.trim()) return;
  thread.classList.add('visible');
  $('.hero-copy').style.display = 'none';
  $('.suggestions').style.display = 'none';
  thread.innerHTML = `<div class="message user"><p>${escapeHtml(question)}</p></div>`;
  input.value = '';
  input.style.height = 'auto';
  saveHistory(question);
  thread.insertAdjacentHTML('beforeend', '<div class="message assistant loading"><div class="loading-answer"><span>Reviewing active sources</span><i></i><i></i><i></i></div></div>');

  setTimeout(() => {
    $('.loading')?.remove();
    const response = buildGroundedAnswer(question, retrieve(question));
    const citations = response.citations.map((citation, index) => `<span class="citation">[${index + 1}] ${escapeHtml(citation)}</span>`).join('');
    thread.insertAdjacentHTML('beforeend', `
      <div class="message assistant">
        <div class="answer">
          <div class="answer-head"><span>✦ ${response.heading}</span>${response.confidence ? `<span class="confidence">● ${response.confidence}</span>` : ''}</div>
          <p class="answer-summary">${escapeHtml(response.summary)}</p>
          <p>${escapeHtml(response.text)}</p>
          ${citations ? `<div class="citations">${citations}</div>` : ''}
          <div class="answer-actions">
            <button class="answer-action" data-answer-action="copy">▣ Copy</button>
            <button class="answer-action" data-answer-action="export">↓ Export</button>
            <span class="action-spacer"></span>
            <button class="answer-action" data-answer-action="helpful" aria-label="Helpful answer">♡ Helpful</button>
            <button class="answer-action" data-answer-action="report" aria-label="Report answer">⚑</button>
          </div>
        </div>
      </div>`);
    thread.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 650);
}

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = value;
  return node.innerHTML;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  askQuestion(input.value);
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
});

input.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') form.requestSubmit();
});

$$('.suggestions button').forEach((button) => button.addEventListener('click', () => askQuestion(button.dataset.prompt)));
$$('.source').forEach((source) => source.addEventListener('click', () => {
  source.classList.toggle('active-source');
  persistActiveSources();
  notify(source.classList.contains('active-source') ? 'Source added to context' : 'Source removed from context');
}));
function showView(name) {
  const titles = { workspace: 'Product strategy synthesis', sources: 'Sources', history: 'History' };
  $('.workspace').hidden = name !== 'workspace';
  $('#sourcesView').hidden = name !== 'sources';
  $('#historyView').hidden = name !== 'history';
  $$('.nav-item').forEach((nav) => nav.classList.toggle('active', nav.dataset.section === name));
  $('.breadcrumb strong').textContent = titles[name];
  $('.status').style.display = name === 'workspace' ? 'block' : 'none';
  $('#sidebar').classList.remove('open');
  window.location.hash = name === 'workspace' ? '' : name;
}

$$('.nav-item').forEach((item) => item.addEventListener('click', () => showView(item.dataset.section)));
$('#brandHome').addEventListener('click', () => showView('workspace'));

function openPastThread(question) {
  showView('workspace');
  setTimeout(() => askQuestion(question), 80);
}

$('#historyList').addEventListener('click', (event) => {
  const card = event.target.closest('.history-card');
  if (card) openPastThread(card.dataset.question);
});
$$('.recent').forEach((item, index) => item.addEventListener('click', () => {
  const questions = [
    'What themes are emerging across customer feedback?',
    'Summarize the key product risks.',
    'Where do our research and roadmap disagree?'
  ];
  openPastThread(questions[index]);
}));

$('#newThread').addEventListener('click', () => {
  thread.innerHTML = '';
  thread.classList.remove('visible');
  $('.hero-copy').style.display = 'block';
  $('.suggestions').style.display = 'grid';
  showView('workspace');
  input.focus();
});

$('#clearHistory').addEventListener('click', () => {
  writeStorage('lumen-history', []);
  writeStorage('lumen-history-cleared', true);
  $$('#historyList .history-card').forEach((card) => card.remove());
  $$('#historyList .group-label').forEach((label) => label.remove());
  $('#historyList').innerHTML = '<div class="empty-results">No saved conversations yet.<br>Start a new thread to create one.</div>';
  notify('Conversation history cleared');
});

function filterItems(inputSelector, itemSelector, textGetter) {
  $(inputSelector).addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    $$(itemSelector).forEach((item) => {
      item.style.display = textGetter(item).toLowerCase().includes(query) ? '' : 'none';
    });
  });
}

filterItems('#sourceSearch', '.source-table .table-row:not(.table-head)', (item) => item.dataset.sourceName);
filterItems('#historySearch', '.history-card', (item) => item.textContent);

$$('.source-table .table-row:not(.table-head)').forEach((row) => row.addEventListener('click', () => {
  const sourceName = row.dataset.sourceName;
  const matchingSource = $$('.source').find((source) => source.querySelector('strong').textContent.trim() === sourceName);
  matchingSource?.classList.toggle('active-source');
  persistActiveSources();
  const included = matchingSource?.classList.contains('active-source');
  row.querySelector('.ready').innerHTML = included ? '● Included' : '○ Excluded';
  row.querySelector('.ready').style.color = included ? '#55a184' : '#9b96a0';
  notify(`${sourceName} ${included ? 'included in' : 'excluded from'} context`);
}));

$('.filter-button').addEventListener('click', (event) => {
  const labels = ['All types⌄', 'Connected only', 'Uploads only'];
  const next = (labels.indexOf(event.currentTarget.textContent) + 1) % labels.length;
  event.currentTarget.textContent = labels[next];
  $$('.source-table .table-row:not(.table-head)').forEach((row) => {
    const connection = row.children[1].textContent.toLowerCase();
    row.style.display = next === 0 || (next === 1 && connection !== 'pdf upload') || (next === 2 && connection === 'pdf upload') ? '' : 'none';
  });
  notify(`Filter: ${labels[next].replace('⌄', '')}`);
});

$('.share-button').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); } catch (_) {}
  notify('Workspace link copied');
});
$('#addSource').addEventListener('click', () => $('#sourceDialog').showModal());
$$('[data-open-source]').forEach((button) => button.addEventListener('click', () => $('#sourceDialog').showModal()));
$$('.connector-grid button').forEach((button) => button.addEventListener('click', () => {
  if (button.value !== 'cancel') setTimeout(() => notify(`${button.querySelector('strong').textContent} selected`), 100);
}));
$('#themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  writeStorage('lumen-dark-mode', document.body.classList.contains('dark'));
});
$('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#collapsePanel').addEventListener('click', () => {
  $('.context-panel').style.display = 'none';
  $('.workspace').style.gridTemplateColumns = '1fr';
});
$('#settingsToggle').addEventListener('click', () => {
  const body = $('#settingsBody');
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? 'block' : 'none';
  $('#settingsChevron').textContent = hidden ? '⌃' : '⌄';
});
$('#depth').addEventListener('input', (event) => {
  $('#depthLabel').textContent = ['Precise', 'Focused', 'Expansive'][event.target.value - 1];
});

const initialView = location.hash.replace('#', '');
if (['sources', 'history'].includes(initialView)) showView(initialView);

thread.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-answer-action]');
  if (!button) return;
  const answer = button.closest('.answer');
  const answerText = [...answer.querySelectorAll('p')].map((node) => node.textContent).join('\n\n');
  const citationsText = [...answer.querySelectorAll('.citation')].map((node) => node.textContent).join('\n');
  const action = button.dataset.answerAction;
  if (action === 'copy') {
    try { await navigator.clipboard.writeText(`${answerText}${citationsText ? `\n\nSources\n${citationsText}` : ''}`); } catch (_) {}
    notify('Answer copied to clipboard');
  } else if (action === 'export') {
    const blob = new Blob([`${answerText}${citationsText ? `\n\nSources\n${citationsText}` : ''}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `lumen-answer-${Date.now()}.txt`; link.click();
    URL.revokeObjectURL(url);
    notify('Answer exported');
  } else {
    button.classList.toggle('selected');
    notify(action === 'helpful' ? 'Thanks for the feedback' : 'Answer flagged for review');
  }
});

if (readStorage('lumen-dark-mode', false)) document.body.classList.add('dark');
const storedSources = readStorage('lumen-active-sources', null);
if (storedSources) {
  $$('.source').forEach((source) => source.classList.toggle('active-source', storedSources.includes(source.querySelector('strong').textContent.trim())));
  $$('.source-table .table-row:not(.table-head)').forEach((row) => {
    const included = storedSources.includes(row.dataset.sourceName);
    row.querySelector('.ready').innerHTML = included ? '● Included' : '○ Excluded';
    row.querySelector('.ready').style.color = included ? '#55a184' : '#9b96a0';
  });
}
if (readStorage('lumen-history-cleared', false)) {
  $$('#historyList .history-card, #historyList .group-label').forEach((item) => item.remove());
  $('#historyList').innerHTML = '<div class="empty-results">No saved conversations yet.<br>Start a new thread to create one.</div>';
} else {
  renderSavedHistory();
}
