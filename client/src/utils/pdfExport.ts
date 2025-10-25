import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PdfExportOptions {
  filename?: string;
  title?: string;
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'a3' | 'letter';
  margin?: number;
}

export const exportToPdf = async (
  elementId: string,
  options: PdfExportOptions = {}
): Promise<void> => {
  const {
    filename = 'document.pdf',
    title = 'Document',
    orientation = 'portrait',
    format = 'a4',
    margin = 10
  } = options;

  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  try {
    // 要素をキャンバスに変換
    const canvas = await html2canvas(element, {
      scale: 2, // 高解像度
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: element.scrollWidth,
      height: element.scrollHeight
    });

    // PDFを作成
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format
    });

    // タイトルを追加
    pdf.setFontSize(16);
    pdf.text(title, margin, 20);

    // 画像をPDFに追加
    const imgWidth = pdf.internal.pageSize.getWidth() - (margin * 2);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    let heightLeft = imgHeight;
    let position = 30; // タイトルの下から開始

    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= pdf.internal.pageSize.getHeight();

    // 複数ページに分割する場合
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();
    }

    // PDFをダウンロード
    pdf.save(filename);
  } catch (error) {
    console.error('PDF export error:', error);
    throw new Error('PDF出力に失敗しました');
  }
};

export const exportTableToPdf = async (
  tableData: any[],
  columns: string[],
  options: PdfExportOptions = {}
): Promise<void> => {
  const {
    filename = 'table.pdf',
    title = 'Table Export',
    orientation = 'landscape',
    format = 'a4'
  } = options;

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format
  });

  // タイトル
  pdf.setFontSize(16);
  pdf.text(title, 20, 20);

  // テーブルデータを追加
  let yPosition = 40;
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const cellHeight = 8;
  const cellWidth = (pdf.internal.pageSize.getWidth() - margin * 2) / columns.length;

  // ヘッダー
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  columns.forEach((column, index) => {
    pdf.text(column, margin + (index * cellWidth), yPosition);
  });
  yPosition += cellHeight;

  // データ行
  pdf.setFont('helvetica', 'normal');
  tableData.forEach((row, rowIndex) => {
    // ページ分割チェック
    if (yPosition > pageHeight - 20) {
      pdf.addPage();
      yPosition = 20;
    }

    columns.forEach((column, colIndex) => {
      const cellValue = String(row[column] || '');
      pdf.text(cellValue, margin + (colIndex * cellWidth), yPosition);
    });
    yPosition += cellHeight;
  });

  pdf.save(filename);
};
