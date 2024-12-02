declare module 'rtf-parser' {
    interface RTFElement {
      type: string;
      value?: string;
      content?: RTFElement[];
    }
  
    interface RTFDocument {
      content: RTFElement[];
    }
  
    type ParseCallback = (err: Error | null, doc: RTFDocument) => void;
  
    export function parseString(rtfContent: string, callback: ParseCallback): void;
  }