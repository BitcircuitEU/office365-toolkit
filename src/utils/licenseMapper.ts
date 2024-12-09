import fs from 'fs';
import path from 'path';
import readline from 'readline';

const licenseMap = new Map<string, string>();

export function initializeLicenseMap(): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(path.join(__dirname, 'licenses.csv'));
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let isFirstLine = true;
    let guidIndex = -1;
    let productNameIndex = -1;

    rl.on('line', (line) => {
      const columns = line.split(',').map(col => col.trim());
      
      if (isFirstLine) {
        guidIndex = columns.findIndex(col => col.includes('GUID'));
        productNameIndex = columns.findIndex(col => col.includes('Product_Display_Name'));
        
        if (guidIndex === -1 || productNameIndex === -1) {
          console.error('Could not find GUID or Product_Display_Name columns');
          rl.close();
          return;
        }

        isFirstLine = false;
      } else {
        const guid = columns[guidIndex];
        const productName = columns[productNameIndex];
        
        if (guid && productName) {
          licenseMap.set(guid, productName);
        } else {
          console.warn('Invalid row:', line);
        }
      }
    });

    rl.on('close', () => {
      console.log('License map initialized with', licenseMap.size, 'entries');
      resolve();
    });

    rl.on('error', (error) => {
      console.error('Error reading license CSV:', error);
      reject(error);
    });
  });
}

export function getLicenseName(guid: string): string {
  return licenseMap.get(guid) || guid;
}