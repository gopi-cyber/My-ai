import type { ToolDefinition } from '../actions/tools/registry.ts';

export const documentParseTool: ToolDefinition = {
  name: 'document_parse',
  description: 'Parse and extract content from documents (PDF, DOCX, XLSX, TXT). Returns text content and metadata.',
  category: 'media',
  parameters: {
    filePath: {
      type: 'string',
      description: 'Path to the document file',
      required: true,
    },
    mode: {
      type: 'string',
      description: ' Extraction mode: text, summary, tables, or all (default: text)',
      required: false,
    },
  },
  execute: async (params: Record<string, unknown>) => {
    const filePath = params.filePath as string;
    const mode = (params.mode as string) || 'text';

    const ext = filePath.split('.').pop()?.toLowerCase();
    
    if (ext === 'pdf') {
      return await parsePDF(filePath, mode);
    } else if (ext === 'docx') {
      return await parseDOCX(filePath, mode);
    } else if (ext === 'xlsx' || ext === 'xls') {
      return await parseExcel(filePath, mode);
    } else if (ext === 'txt' || ext === 'md' || ext === 'json' || ext === 'xml') {
      return await parseText(filePath, mode);
    } else {
      return `Unsupported document format: ${ext}. Supported: PDF, DOCX, XLSX, TXT, MD, JSON, XML`;
    }
  },
};

export const documentSummarizeTool: ToolDefinition = {
  name: 'document_summarize',
  description: 'Generate a structured summary of a document including key points, structure, and action items.',
  category: 'media',
  parameters: {
    filePath: {
      type: 'string',
      description: 'Path to the document file',
      required: true,
    },
  },
  execute: async (params: Record<string, unknown>) => {
    const filePath = params.filePath as string;
    const { getLLM } = await import('../llm/manager.ts');
    const llm = getLLM();
    
    const content = await parseDocumentFull(filePath);
    
    if (!llm) {
      return 'LLM not available for summarization';
    }

    const summary = await llm.chat([
      { role: 'user', content: `Summarize this document. Extract:
1. Main topics
2. Key decisions or action items
3. Document structure

Document:
${content.slice(0, 10000)}
` }
    ]);

    return summary;
  },
};

async function parsePDF(filePath: string, mode: string): Promise<string> {
  try {
    const pdfImport = (await import('pdf-parse')) as any;
    const pdf = pdfImport.default || pdfImport;
    const { readFileSync } = await import('node:fs');
    const dataBuffer = readFileSync(filePath);
    const data = await pdf(dataBuffer);
    
    if (mode === 'summary') {
      return `PDF Summary:
- Pages: ${data.numpages}
- Title: ${data.info.Title || 'Unknown'}
- Author: ${data.info.Author || 'Unknown'}
- Text length: ${data.text.length} chars`;
    }
    
    return data.text.slice(0, 50000);
  } catch {
    return 'PDF parsing failed. Install pdf-parse: bun add pdf-parse';
  }
}

async function parseDOCX(filePath: string, mode: string): Promise<string> {
  try {
    const extractImport = (await import('extract-text')) as any;
    const ExtractData = extractImport.default || extractImport;
    const extractor = new ExtractData();
    const text = await (extractor.extract || extractor)(filePath);
    return mode === 'summary' ? text.slice(0, 500) : text.slice(0, 50000);
  } catch {
    return 'DOCX parsing failed. Install extract-text: bun add extract-text';
  }
}

async function parseExcel(filePath: string, mode: string): Promise<string> {
  try {
    const { readFileSync } = await import('node:fs');
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(readFileSync(filePath));
    const sheets: string[] = [];
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const data = XLSX.utils.sheet_to_json(sheet);
      sheets.push(`Sheet: ${sheetName}\n${JSON.stringify(data.slice(0, 100), null, 2)}`);
    }
    
    return sheets.join('\n\n');
  } catch {
    return 'Excel parsing failed. Install xlsx: bun add xlsx';
  }
}

async function parseText(filePath: string, mode: string): Promise<string> {
  const { readFileSync } = await import('node:fs');
  const content = readFileSync(filePath, 'utf-8');
  return mode === 'summary' ? content.slice(0, 500) : content;
}

async function parseDocumentFull(filePath: string): Promise<string> {
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  if (ext === 'pdf') return parsePDF(filePath, 'text');
  if (ext === 'docx') return parseDOCX(filePath, 'text');
  if (ext === 'xlsx' || ext === 'xls') return parseExcel(filePath, 'text');
  return parseText(filePath, 'text');
}