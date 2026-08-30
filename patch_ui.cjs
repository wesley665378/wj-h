const fs = require('fs');
let code = fs.readFileSync('views/ValueCreation.tsx', 'utf8');

const uiLogic = `
            <button 
              onClick={handleDownloadTemplate}
              className="px-3 py-1 text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 rounded-sm hover:bg-amber-100 transition-colors flex items-center"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              模板
            </button>
            <input 
              type="file" 
              accept=".xlsx,.xls,.csv" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImport} 
            />
            <button 
              onClick={handleImportClick}
              disabled={importLoading}
              className="px-3 py-1 text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 rounded-sm hover:bg-blue-100 transition-colors flex items-center disabled:opacity-50"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {importLoading ? '导入中...' : '导入'}
            </button>
            <button 
              onClick={exportToExcel}
`;

code = code.replace('<button \n              onClick={exportToExcel}', uiLogic);
fs.writeFileSync('views/ValueCreation.tsx', code);
console.log('done');
