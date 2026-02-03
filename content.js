// Content script that runs on Google Sheets pages
(function() {
  'use strict';

  let buttonsAdded = false;

  // Wait for Google Sheets to load
  function waitForToolbar() {
    const checkToolbar = setInterval(() => {
      const toolbar = document.querySelector('#docs-toolbar');
      if (toolbar && !buttonsAdded) {
        clearInterval(checkToolbar);
        addCustomButtons();
        buttonsAdded = true;
      }
    }, 500);
  }

  function addCustomButtons() {
    const toolbar = document.querySelector('#docs-toolbar');
    if (!toolbar) return;

    // Create container for our buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'ai-sheets-buttons';
    buttonContainer.style.cssText = `
      display: inline-flex;
      gap: 8px;
      margin-left: 16px;
      align-items: center;
    `;

    // Fix Table button
    const fixButton = createButton('🤖 Fix Table', 'fix-table-btn', () => {
      openFixTableModal();
    });

    // Create Formula button
    const formulaButton = createButton('⚡️ Create Formula', 'create-formula-btn', () => {
      openFormulaModal();
    });

    buttonContainer.appendChild(fixButton);
    buttonContainer.appendChild(formulaButton);

    // Insert after the toolbar
    const toolbarParent = toolbar.parentElement;
    if (toolbarParent) {
      toolbarParent.insertBefore(buttonContainer, toolbar.nextSibling);
    }
  }

  function createButton(text, id, onClick) {
    const button = document.createElement('button');
    button.id = id;
    button.textContent = text;
    button.className = 'ai-sheets-btn';
    button.onclick = onClick;
    return button;
  }

  function openFixTableModal() {
    // Inject script to get selected range data
    injectAndExecute('getSelectedRange', (rangeData) => {
      if (!rangeData || !rangeData.values || rangeData.values.length === 0) {
        showNotification('Please select a range first');
        return;
      }

      showModal({
        title: '🤖 Fix Table',
        content: createFixTableContent(rangeData),
        onConfirm: (fixes) => applyFixes(fixes, rangeData),
        loading: true
      });

      // Call AI to analyze the data
      analyzeAndFixData(rangeData);
    });
  }

  function openFormulaModal() {
    const modal = showModal({
      title: '⚡️ Create Formula',
      content: createFormulaContent(),
      onConfirm: (description) => generateFormula(description),
      confirmText: 'Generate',
      showInput: true
    });
  }

  function createFixTableContent(rangeData) {
    return `
      <div class="modal-content">
        <p>Analyzing selected range: ${rangeData.range}</p>
        <p>Cells: ${rangeData.values.length} rows × ${rangeData.values[0].length} columns</p>
        <div id="fixes-preview" class="fixes-preview">
          <div class="loader"></div>
          <p>AI is analyzing your data...</p>
        </div>
      </div>
    `;
  }

  function createFormulaContent() {
    return `
      <div class="modal-content">
        <p>Describe what you want to calculate:</p>
        <textarea 
          id="formula-description" 
          class="formula-input" 
          placeholder="Example: Calculate sum of column A"
          rows="4"
        ></textarea>
        <div id="formula-preview" class="formula-preview" style="display:none;">
          <h4>Generated Formula:</h4>
          <code id="formula-code"></code>
          <p id="formula-explanation"></p>
        </div>
      </div>
    `;
  }

  function analyzeAndFixData(rangeData) {
    chrome.runtime.sendMessage({
      action: 'getApiResponse',
      data: {
        endpoint: 'fix-table',
        payload: {
          range: rangeData.range,
          values: rangeData.values
        }
      }
    }, (response) => {
      const previewDiv = document.getElementById('fixes-preview');
      if (!previewDiv) return;

      if (response.success) {
        const fixes = response.data.fixes;
        previewDiv.innerHTML = createFixesPreview(fixes);
        
        // Update modal to show apply button
        const modal = document.querySelector('.ai-modal');
        if (modal) {
          const confirmBtn = modal.querySelector('.modal-confirm');
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.onclick = () => {
              applyFixes(fixes, rangeData);
              closeModal();
            };
          }
        }
      } else {
        previewDiv.innerHTML = `
          <div class="error">
            <p>❌ Error analyzing data:</p>
            <p>${response.error}</p>
          </div>
        `;
      }
    });
  }

  function createFixesPreview(fixes) {
    if (!fixes || fixes.length === 0) {
      return '<p class="success">✅ No errors found! Your data looks good.</p>';
    }

    let html = '<div class="fixes-list"><h4>Found issues:</h4><ul>';
    fixes.forEach(fix => {
      html += `
        <li>
          <strong>${fix.type}</strong> at ${fix.cell}:
          <div class="fix-detail">
            <span class="old-value">${fix.oldValue}</span>
            <span class="arrow">→</span>
            <span class="new-value">${fix.newValue}</span>
          </div>
          <small>${fix.reason}</small>
        </li>
      `;
    });
    html += '</ul></div>';
    return html;
  }

  function generateFormula(description) {
    if (!description || description.trim() === '') {
      showNotification('Please enter a description');
      return;
    }

    const previewDiv = document.getElementById('formula-preview');
    previewDiv.style.display = 'block';
    previewDiv.innerHTML = '<div class="loader"></div><p>Generating formula...</p>';

    // Get current sheet context
    injectAndExecute('getSheetContext', (context) => {
      chrome.runtime.sendMessage({
        action: 'getApiResponse',
        data: {
          endpoint: 'create-formula',
          payload: {
            description: description,
            context: context
          }
        }
      }, (response) => {
        if (response.success) {
          const { formula, explanation, targetCell, useAutofill } = response.data;
          
          document.getElementById('formula-code').textContent = formula;
          document.getElementById('formula-explanation').textContent = explanation;
          
          // Update confirm button to apply formula
          const modal = document.querySelector('.ai-modal');
          if (modal) {
            const confirmBtn = modal.querySelector('.modal-confirm');
            confirmBtn.textContent = 'Apply Formula';
            confirmBtn.onclick = () => {
              applyFormula(formula, targetCell, useAutofill);
              closeModal();
            };
          }
        } else {
          previewDiv.innerHTML = `
            <div class="error">
              <p>❌ Error generating formula:</p>
              <p>${response.error}</p>
            </div>
          `;
        }
      });
    });
  }

  function applyFixes(fixes, rangeData) {
    injectAndExecute('applyFixes', null, { fixes, rangeData });
    showNotification(`✅ Applied ${fixes.length} fixes`);
  }

  function applyFormula(formula, targetCell, useAutofill) {
    injectAndExecute('applyFormula', null, { formula, targetCell, useAutofill });
    showNotification('✅ Formula applied');
  }

  // Inject script into page context to access Google Sheets API
  function injectAndExecute(functionName, callback, params) {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function() {
      window.postMessage({ 
        type: 'AI_SHEETS_EXECUTE',
        functionName: functionName,
        params: params
      }, '*');
      
      if (callback) {
        const listener = (event) => {
          if (event.data.type === 'AI_SHEETS_RESPONSE' && 
              event.data.functionName === functionName) {
            window.removeEventListener('message', listener);
            callback(event.data.result);
          }
        };
        window.addEventListener('message', listener);
      }
      
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function showModal({ title, content, onConfirm, confirmText = 'Apply', showInput = false, loading = false }) {
    // Remove existing modal if any
    const existingModal = document.querySelector('.ai-modal-overlay');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ai-modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'ai-modal';
    modal.innerHTML = `
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
      <div class="modal-footer">
        <button class="modal-cancel">Cancel</button>
        <button class="modal-confirm" ${loading ? 'disabled' : ''}>${confirmText}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Event listeners
    modal.querySelector('.modal-close').onclick = closeModal;
    modal.querySelector('.modal-cancel').onclick = closeModal;
    
    const confirmBtn = modal.querySelector('.modal-confirm');
    if (!loading && onConfirm) {
      confirmBtn.onclick = () => {
        if (showInput) {
          const input = document.getElementById('formula-description');
          onConfirm(input.value);
        } else {
          onConfirm();
        }
      };
    }

    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };

    return modal;
  }

  function closeModal() {
    const modal = document.querySelector('.ai-modal-overlay');
    if (modal) modal.remove();
  }

  function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'ai-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 100);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForToolbar);
  } else {
    waitForToolbar();
  }
})();
