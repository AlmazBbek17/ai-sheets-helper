// This script runs in the page context and has access to Google Sheets API
(function() {
  'use strict';

  // Listen for messages from content script
  window.addEventListener('message', async (event) => {
    if (event.data.type !== 'AI_SHEETS_EXECUTE') return;

    const { functionName, params } = event.data;
    let result = null;

    try {
      switch (functionName) {
        case 'getSelectedRange':
          result = await getSelectedRange();
          break;
        case 'getSheetContext':
          result = await getSheetContext();
          break;
        case 'applyFixes':
          result = await applyFixes(params.fixes, params.rangeData);
          break;
        case 'applyFormula':
          result = await applyFormula(params.formula, params.targetCell, params.useAutofill);
          break;
      }

      window.postMessage({
        type: 'AI_SHEETS_RESPONSE',
        functionName: functionName,
        result: result
      }, '*');
    } catch (error) {
      console.error('Error in injected script:', error);
      window.postMessage({
        type: 'AI_SHEETS_RESPONSE',
        functionName: functionName,
        result: null,
        error: error.message
      }, '*');
    }
  });

  async function getSelectedRange() {
    try {
      // Access Google Sheets API through the page's global scope
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getActiveSheet();
      const range = sheet.getActiveRange();
      
      if (!range) return null;

      const values = range.getValues();
      const formulas = range.getFormulas();
      const a1Notation = range.getA1Notation();

      return {
        range: a1Notation,
        values: values,
        formulas: formulas,
        numRows: range.getNumRows(),
        numCols: range.getNumColumns(),
        startRow: range.getRow(),
        startCol: range.getColumn()
      };
    } catch (error) {
      console.error('Error getting selected range:', error);
      return null;
    }
  }

  async function getSheetContext() {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getActiveSheet();
      const range = sheet.getActiveRange();
      
      // Get column headers
      const lastCol = sheet.getLastColumn();
      const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

      return {
        sheetName: sheet.getName(),
        headers: headers,
        currentCell: range ? range.getA1Notation() : 'A1',
        lastRow: sheet.getLastRow(),
        lastCol: lastCol
      };
    } catch (error) {
      console.error('Error getting sheet context:', error);
      return {
        sheetName: 'Sheet1',
        headers: [],
        currentCell: 'A1',
        lastRow: 1,
        lastCol: 1
      };
    }
  }

  async function applyFixes(fixes, rangeData) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getActiveSheet();

      fixes.forEach(fix => {
        const cell = sheet.getRange(fix.cell);
        
        // Apply the fix based on type
        if (fix.type === 'formula_error' || fix.type === 'formula') {
          cell.setFormula(fix.newValue);
        } else {
          cell.setValue(fix.newValue);
        }
      });

      SpreadsheetApp.flush();
      return { success: true, fixedCount: fixes.length };
    } catch (error) {
      console.error('Error applying fixes:', error);
      return { success: false, error: error.message };
    }
  }

  async function applyFormula(formula, targetCell, useAutofill) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getActiveSheet();
      
      // If no target cell specified, use current selection
      let range;
      if (targetCell) {
        range = sheet.getRange(targetCell);
      } else {
        range = sheet.getActiveRange();
      }

      // Set the formula
      range.setFormula(formula);

      // Apply autofill if requested
      if (useAutofill && range.getNumRows() === 1) {
        const lastRow = sheet.getLastRow();
        if (lastRow > range.getRow()) {
          const fillRange = sheet.getRange(
            range.getRow(),
            range.getColumn(),
            lastRow - range.getRow() + 1,
            1
          );
          range.autoFill(fillRange, SpreadsheetApp.AutoFillSeries.DEFAULT_SERIES);
        }
      }

      SpreadsheetApp.flush();
      return { success: true };
    } catch (error) {
      console.error('Error applying formula:', error);
      return { success: false, error: error.message };
    }
  }
})();
