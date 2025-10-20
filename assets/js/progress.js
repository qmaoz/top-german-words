/* ===== Progress Management System ===== */

class ProgressManager {
  constructor(pageId) {
    this.PAGE_ID = pageId;
    this.fileHandle = null;
    this.progress = { pages: {} };
    this.hideLearned = localStorage.getItem('hideLearned') === 'true';
    
    this.init();
  }

  init() {
    this.btnHide = document.getElementById('toggleHide');
    this.statusEl = document.getElementById('status');
    this.wordCells = Array.from(document.querySelectorAll('td.word'));
    
    this.setupEventListeners();
    this.boot();
  }

  setupEventListeners() {
    this.btnHide.addEventListener('click', () => { 
      this.hideLearned = !this.hideLearned; 
      this.applyHide(); 
    });

    for (const td of this.wordCells) {
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
        
        // Save progress to IndexedDB
        await this.saveProgressToDB();
        this.applyHide();
      });
    }
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
    } catch {
      this.statusEl.textContent = 'Прогрес зберігається автоматично.';
      this.applyMarks();
      this.updateHideButton();
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
