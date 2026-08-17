const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const form = $('#composer');
const input = $('#question');
const thread = $('#thread');
const toast = $('#toast');

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

function buildGroundedAnswer(results) {
  if (!results.length) return {
    heading: 'NOT ENOUGH EVIDENCE',
    text: 'I can’t answer that from the active knowledge sources. Try rephrasing the question, enabling another source, or adding a document that covers this topic.',
    citations: []
  };
  return {
    heading: `GROUNDED IN ${results.length} SOURCE PASSAGE${results.length === 1 ? '' : 'S'}`,
    text: results.map((result) => result.text).join(' '),
    citations: results.map((result) => result.citation)
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

  setTimeout(() => {
    const response = buildGroundedAnswer(retrieve(question));
    const citations = response.citations.map((citation, index) => `<span class="citation">[${index + 1}] ${escapeHtml(citation)}</span>`).join('');
    thread.insertAdjacentHTML('beforeend', `
      <div class="message assistant">
        <div class="answer">
          <div class="answer-head">✦ ${response.heading}</div>
          <p>${escapeHtml(response.text)}</p>
          ${citations ? `<div class="citations">${citations}</div>` : ''}
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
  notify(source.classList.contains('active-source') ? 'Source added to context' : 'Source removed from context');
}));
$$('.nav-item').forEach((item) => item.addEventListener('click', () => {
  $$('.nav-item').forEach((nav) => nav.classList.remove('active'));
  item.classList.add('active');
  notify(`${item.dataset.section[0].toUpperCase() + item.dataset.section.slice(1)} selected`);
}));

$('.share-button').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); } catch (_) {}
  notify('Workspace link copied');
});
$('#addSource').addEventListener('click', () => notify('Source picker ready'));
$('#themeToggle').addEventListener('click', () => document.body.classList.toggle('dark'));
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
