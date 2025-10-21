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
    this.wordCells = Array.from(document.querySelectorAll('td.word'));
    this.progressBar = document.getElementById('top-progress');
    this.progressFill = document.getElementById('top-progress-fill');
    this.progressText = document.getElementById('top-progress-text');
    
    this.setupEventListeners();
    this.boot();
  }

  setupEventListeners() {
    this.btnHide.addEventListener('click', () => { 
      this.hideLearned = !this.hideLearned; 
      this.applyHide(); 
    });

    // Bind existing cells
    for (const td of this.wordCells) this.addWordCellListener(td);

    // Observe table body changes to update counts and bind listeners for new rows
    const tablesRoot = document.querySelector('main') || document.body;
    if (tablesRoot) {
      this.observer = new MutationObserver((mutations) => {
        let needsRecalc = false;
        for (const m of mutations) {
          if (m.type === 'childList') {
            needsRecalc = true;
            // Bind listeners for any new td.word
            m.addedNodes.forEach(node => {
              if (!(node instanceof Element)) return;
              if (node.matches && node.matches('td.word')) this.addWordCellListener(node);
              const newCells = node.querySelectorAll ? node.querySelectorAll('td.word') : [];
              newCells.forEach(td => this.addWordCellListener(td));
            });
          }
        }
        if (needsRecalc) this.recalculateAndUpdateUI();
      });
      this.observer.observe(tablesRoot, { childList: true, subtree: true });
    }
  }

  addWordCellListener(td) {
    if (!td || td.dataset.listenerBound === '1') return;
    td.dataset.listenerBound = '1';
    td.addEventListener('click', async () => {
      const w = td.textContent.trim();
      const set = this.getSet();
      if (set.has(w)) {
        set.delete(w);
        td.classList.remove('learned');
      } else {
        set.add(w);
        td.classList.add('learned');
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
    const learned = this.getSet();
    for (const td of this.wordCells) {
      const w = td.textContent.trim();
      td.classList.toggle('learned', learned.has(w));
      td.title = 'Натисніть, щоб відмітити як вивчене';
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
    this.wordCells = Array.from(document.querySelectorAll('td.word'));
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
});
