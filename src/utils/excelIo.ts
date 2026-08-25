import * as XLSX from 'xlsx';

/**
 * Excel 导入限制常量
 */
export const EXCEL_IMPORT_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const EXCEL_IMPORT_MAX_ROWS = 5000;

/**
 * Excel 导出统一 SSOT 工具模块 (附录 A′-5)
 */

/**
 * 构造统一格式的 Excel 文件名
 */
export function buildExcelFilename(prefix: string, dateOrExtra?: string): string {
  const dateStr = dateOrExtra || new Date().toISOString().slice(0, 10);
  return `${prefix}_${dateStr}.xlsx`;
}

/**
 * 统一导出 Workbook 并触发下载
 */
export function exportWorkbook(workbook: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(workbook, filename);
}

/**
 * 便捷导出 JSON 数组至单个 WorkSheet Excel
 */
export function exportJsonToExcel<T extends Record<string, any>>(
  data: T[],
  sheetName: string = 'Sheet1',
  filename?: string
): void {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const finalFilename = filename || buildExcelFilename(sheetName);
  XLSX.writeFile(workbook, finalFilename);
}
