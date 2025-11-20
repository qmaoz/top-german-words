/* ===== Progress Management System ===== */

class ProgressManager {
  constructor(pageId) {
    this.PAGE_ID = pageId;
    this.fileHandle = null;
    this.progress = { pages: {} };
    this.hideLearned = localStorage.getItem('hideLearned') === 'true';
    this.totalWords = 0;
    this.learnedCount = 0;
    this.observer = null;

    this.init();
  }

  init() {
    this.btnHide = document.getElementById('toggleHide');
    this.statusEl = document.getElementById('status');
    this.progressBar = document.getElementById('top-progress');
    this.progressFill = document.getElementById('top-progress-fill');
    this.progressText = document.getElementById('top-progress-text');
    this.refreshCells();

    this.setupEventListeners();
    this.boot();
  }

  refreshCells() {
    // Update cached lists of controls and word cells
    this.wordCells = Array.from(document.querySelectorAll('td.word'));
    this.exampleCells = Array.from(document.querySelectorAll('td.german-example'));
    this.nounPluralCells = Array.from(document.querySelectorAll('td.noun-plural')); // NEW
    this.learnBtns = Array.from(document.querySelectorAll('button.learn-btn'));
  }

  setupEventListeners() {
    this.btnHide.addEventListener('click', () => { 
      this.hideLearned = !this.hideLearned; 
      this.applyHide(); 
    });

    // Bind listeners for existing cells
    this.bindAllListeners();

    // Observe table changes to update and bind listeners for new rows/buttons/examples
    const tablesRoot = document.querySelector('main') || document.body;
    if (tablesRoot) {
      this.observer = new MutationObserver((mutations) => {
        let needsRecalc = false;
        for (const m of mutations) {
          if (m.type === 'childList') {
            needsRecalc = true;
            m.addedNodes.forEach(node => {
              if (!(node instanceof Element)) return;
              // If table row is added, query all possible relevant children
              this.bindListenersInNode(node);
            });
          }
        }
        if (needsRecalc) this.recalculateAndUpdateUI();
      });
      this.observer.observe(tablesRoot, { childList: true, subtree: true });
    }
  }

  bindAllListeners() {
    // Always refresh the NodeLists
    this.refreshCells();
    // Word cells: pronounce on click, style as pointer
    for (const td of this.wordCells) this.addWordPronounceListener(td);
    // Example cells: pronounce on click, style as pointer
    for (const td of this.exampleCells) this.addExamplePronounceListener(td);
    // Noun plural cells: pronounce on click, style as pointer (NEW)
    for (const td of this.nounPluralCells) this.addNounPluralPronounceListener(td);
    // Learn buttons: learn/unlearn control
    for (const btn of this.learnBtns) this.addLearnButtonListener(btn);
  }

  bindListenersInNode(node) {
    // Node may be an added row or cell
    // td.word
    if (node.matches && node.matches('td.word')) this.addWordPronounceListener(node);
    // td.german-example
    if (node.matches && node.matches('td.german-example')) this.addExamplePronounceListener(node);
    // td.noun-plural
    if (node.matches && node.matches('td.noun-plural')) this.addNounPluralPronounceListener(node);
    // button.learn-btn
    if (node.matches && node.matches('button.learn-btn')) this.addLearnButtonListener(node);

    // or descendants
    if (node.querySelectorAll) {
      const words = node.querySelectorAll('td.word');
      for (const td of words) this.addWordPronounceListener(td);
      const examples = node.querySelectorAll('td.german-example');
      for (const td of examples) this.addExamplePronounceListener(td);
      const nounPlurals = node.querySelectorAll('td.noun-plural');
      for (const td of nounPlurals) this.addNounPluralPronounceListener(td);
      const buttons = node.querySelectorAll('button.learn-btn');
      for (const btn of buttons) this.addLearnButtonListener(btn);
    }
  }

  addWordPronounceListener(td) {
    if (!td || td.dataset.pronounceBound === '1') return;
    td.dataset.pronounceBound = '1';
    td.style.cursor = 'pointer';
    td.title = 'Click to hear pronunciation';
    td.addEventListener('click', (e) => {
      // Only pronounce, not mark
      const utter = new SpeechSynthesisUtterance(td.textContent.trim());
      utter.lang = 'de-DE';
      speechSynthesis.speak(utter);
    });
  }

  addExamplePronounceListener(td) {
    if (!td || td.dataset.pronounceBound === '1') return;
    td.dataset.pronounceBound = '1';
    td.style.cursor = 'pointer';
    td.title = 'Click to hear pronunciation';
    td.addEventListener('click', (e) => {
      // Only pronounce, not mark
      const utter = new SpeechSynthesisUtterance(td.textContent.trim());
      utter.lang = 'de-DE';
      speechSynthesis.speak(utter);
    });
  }

  addNounPluralPronounceListener(td) {
    if (!td || td.dataset.pronounceBound === '1') return;
    td.dataset.pronounceBound = '1';
    td.style.cursor = 'pointer';
    td.title = 'Click to hear pronunciation';
    td.addEventListener('click', (e) => {
      // Only pronounce, not mark
      const utter = new SpeechSynthesisUtterance(td.textContent.trim());
      utter.lang = 'de-DE';
      speechSynthesis.speak(utter);
    });
  }

  addLearnButtonListener(btn) {
    if (!btn || btn.dataset.learnBtnBound === '1') return;
    btn.dataset.learnBtnBound = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Find the word for this button: should be the next sibling td.word in the same tr
      const tr = btn.closest('tr');
      if (!tr) return;
      const wordCell = tr.querySelector('td.word');
      if (!wordCell) return;
      const w = wordCell.textContent.trim();
      const set = this.getSet();
      let learned;
      if (set.has(w)) {
        set.delete(w);
        wordCell.classList.remove('learned');
        btn.textContent = '☆';
        btn.title = 'Відмітити як вивчене';
        learned = false;
      } else {
        set.add(w);
        wordCell.classList.add('learned');
        btn.textContent = '★';
        btn.title = 'Скасувати як вивчене';
        learned = true;
      }
      this.setSet(set);
      await this.saveProgressToDB();
      this.applyHide();
      this.recalculateAndUpdateUI();
    });
  }

  // Update hide button icon based on state
  updateHideButton() {
    this.btnHide.textContent = this.hideLearned ? '👁️‍🗨️' : '👁️';
  }

  // IndexedDB helpers
  async idbOpen(dbName, storeName) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(storeName);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve({ db: req.result, storeName });
    });
  }

  async idbPut(db, storeName, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  }

  async idbGet(db, storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Progress helpers
  getSet() {
    const arr = this.progress.pages[this.PAGE_ID] || [];
    return new Set(arr);
  }

  setSet(set) {
    this.progress.pages[this.PAGE_ID] = [...set].sort();
  }

  applyMarks() {
    this.refreshCells();
    const learned = this.getSet();
    // Set class and button status for each word row
    for (const td of this.wordCells) {
      const w = td.textContent.trim();
      const isLearned = learned.has(w);
      td.classList.toggle('learned', isLearned);

      // Find corresponding learn-btn (should be first button in the same row)
      const tr = td.closest('tr');
      if (tr) {
        const btn = tr.querySelector('button.learn-btn');
        if (btn) {
          btn.textContent = isLearned ? '★' : '☆';
          btn.title = isLearned ? 'Скасувати як вивчене' : 'Відмітити як вивчене';
        }
      }
    }
    this.applyHide();
    this.recalculateAndUpdateUI();
  }

  applyHide() {
    for (const td of this.wordCells) {
      const tr = td.closest('tr');
      const isLearned = td.classList.contains('learned');
      tr.style.display = this.hideLearned && isLearned ? 'none' : '';
    }
    localStorage.setItem('hideLearned', this.hideLearned ? 'true' : 'false');
    this.updateHideButton();
  }

  // Progress UI helpers
  computeTotals() {
    // Refresh list in case of DOM changes
    this.refreshCells();
    const set = this.getSet();
    this.totalWords = this.wordCells.length;
    // Count learned by class (reflects visual state), fallback to set
    let learnedByClass = 0;
    for (const td of this.wordCells) if (td.classList.contains('learned')) learnedByClass++;
    const learnedBySet = set.size;
    this.learnedCount = Math.max(learnedByClass, learnedBySet);
  }

  updateProgressUI() {
    if (!this.progressBar || !this.progressFill || !this.progressText) return;
    const total = this.totalWords || 0;
    const learned = Math.min(this.learnedCount || 0, total);
    const percent = total === 0 ? 0 : Math.round((learned / total) * 100);
    this.progressFill.style.width = percent + '%';
    this.progressBar.setAttribute('aria-valuenow', String(percent));
    this.progressText.textContent = `${learned}/${total} (${percent}%)`;
  }

  recalculateAndUpdateUI() {
    this.computeTotals();
    this.updateProgressUI();
  }

  // File I/O
  async loadFromFile() {
    const file = await this.fileHandle.getFile();
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      this.progress = parsed && typeof parsed === 'object'
        ? (parsed.pages ? parsed : { pages: parsed })
        : { pages: {} };
    } catch {
      this.progress = { pages: {} };
    }
    this.applyMarks();
  }

  async saveToFile() {
    if (!this.fileHandle) return;
    const writable = await this.fileHandle.createWritable();
    await writable.write(JSON.stringify(this.progress, null, 2));
    await writable.close();
  }

  // Persisting handle in IndexedDB
  async saveHandle(handle) {
    const { db, storeName } = await this.idbOpen('progress-db', 'handles');
    await this.idbPut(db, storeName, 'progressHandle', handle);
    db.close();
  }

  async restoreHandle() {
    const { db, storeName } = await this.idbOpen('progress-db', 'handles');
    const h = await this.idbGet(db, storeName, 'progressHandle');
    db.close();
    return h || null;
  }

  // Permission helpers
  async ensurePermission(handle) {
    if (!handle) return 'denied';
    let state = await handle.queryPermission({ mode: 'readwrite' });
    if (state === 'granted') return state;
    if (state === 'prompt') {
      state = await handle.requestPermission({ mode: 'readwrite' });
    }
    return state;
  }

  // Save progress to IndexedDB
  async saveProgressToDB() {
    try {
      const { db, storeName } = await this.idbOpen('german-words-db', 'progress');
      await this.idbPut(db, storeName, 'progress', this.progress);
      db.close();
      this.statusEl.textContent = 'Прогрес збережено.';
    } catch {
      this.statusEl.textContent = 'Помилка збереження.';
    }
  }

  // Auto-restore on load
  async boot() {
    try {
      // Try to load from IndexedDB first
      const { db, storeName } = await this.idbOpen('german-words-db', 'progress');
      const stored = await this.idbGet(db, storeName, 'progress');
      db.close();

      if (stored) {
        this.progress = stored;
        this.applyMarks();
        this.statusEl.textContent = 'Прогрес завантажено з бази даних.';
        return;
      }

      this.statusEl.textContent = 'Прогрес зберігається автоматично.';
      this.applyMarks();
      this.updateHideButton();
      this.recalculateAndUpdateUI();
    } catch {
      this.statusEl.textContent = 'Прогрес зберігається автоматично.';
      this.applyMarks();
      this.updateHideButton();
      this.recalculateAndUpdateUI();
    }
  }
}

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Get page ID from script tag data attribute or default to 'verbs'
  const scriptTag = document.querySelector('script[data-page-id]');
  const pageId = scriptTag ? scriptTag.getAttribute('data-page-id') : 'verbs';

  new ProgressManager(pageId);

  const hint = document.getElementById('hint');

  hint.innerHTML = `
    Рекомендація по вивченню слів:
    <ol>
      <li>Ознайомся зі словом, транскрипцією, перекладом та прикладом вживання.</li>
      <li>Натискай на німецьке слово або приклад речення, щоб прослухати вимову. Намагайся повторити вимову.</li>
      <li>Відволічись, наприклад, ознайомлюючись із наступним словом.</li>
      <li>Через короткий час повернись до попереднього слова, і, дивлячись лише на український переклад речення-прикладу, спробуй відтворити приклад на німецькій мові.</li>
      <li>Якщо не вдалося відтворити речення, значить слово ще недостатньо засвоєно. Тому, спробуй знову ознайомитись із цим реченням, потім відволіктись, потім знову намагайся відтворити німецьке речення, дивлячись тільки на переклад.</li>
      <li>Якщо вдалося відтворити речення, дивлячись лише на український переклад речення, значить слово засвоєно добре.</li>
      <li>Натисни на зірочку зліва поряд з німецьким словом, щоб відмітити його як "вивчене", коли вважаєш за потрібне, наприклад, якщо легко вдалося відтворити речення на наступний день.</li>
    </ol>
    <p>Прогрес прив'язаний до конкретного пристрою і зберігається у браузері, тому при очищенні даних браузера прогрес буде втрачено.</p>
  `;

});
