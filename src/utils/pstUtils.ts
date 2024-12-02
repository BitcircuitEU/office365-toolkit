import { PSTFile, PSTFolder, PSTMessage, PSTAttachment } from 'pst-extractor';
import path from 'path';

const pstCache = new Map<string, PSTFile>();

function getPSTFile(fileName: string): PSTFile {
  if (!pstCache.has(fileName)) {
    const filePath = path.join(__dirname, '../../pst', fileName);
    const pstFile = new PSTFile(filePath);
    pstCache.set(fileName, pstFile);
  }
  return pstCache.get(fileName)!;
}

function findTopOfPersonalFolders(folder: PSTFolder): PSTFolder | null {
  if (folder.displayName === 'Top of Personal Folders') {
    return folder;
  }
  if (folder.hasSubfolders) {
    const childFolders = folder.getSubFolders();
    for (let childFolder of childFolders) {
      const result = findTopOfPersonalFolders(childFolder);
      if (result) return result;
    }
  }
  return null;
}

interface FolderResult {
  text: string;
  children: FolderResult[];
}

function processFolder(folder: PSTFolder): FolderResult {
  const result: FolderResult = {
    text: folder.displayName,
    children: []
  };

  if (folder.hasSubfolders) {
    const childFolders = folder.getSubFolders();
    for (let childFolder of childFolders) {
      result.children.push(processFolder(childFolder));
    }
  }

  return result;
}

function findFolderByName(folder: PSTFolder, name: string): PSTFolder | null {
  if (folder.displayName === name) {
    return folder;
  }
  if (folder.hasSubfolders) {
    const childFolders = folder.getSubFolders();
    for (let childFolder of childFolders) {
      const result = findFolderByName(childFolder, name);
      if (result) return result;
    }
  }
  return null;
}

interface FolderStructure {
  folderName: string;
  emails: PSTMessage[]; // Change the type to PSTMessage[]
  subfolders: FolderStructure[];
}

const extractFolderStructureFromPST = (fileName: string, selectedPstFolder: string): FolderStructure => {
  const pstFile = getPSTFile(fileName);
  const rootFolder = pstFile.getRootFolder();
  const sourceFolder = findFolderByName(rootFolder, selectedPstFolder);

  if (!sourceFolder) {
      throw new Error('Selected PST folder not found');
  }

  return extractFolderAndEmails(sourceFolder);
};

const extractFolderAndEmails = (folder: PSTFolder): FolderStructure => {
  const emails = extractEmailsFromFolder(folder);
  const subfolders = folder.getSubFolders().map(subfolder => extractFolderAndEmails(subfolder));

  return {
      folderName: folder.displayName,
      emails,
      subfolders
  };
};

function extractEmailsFromFolder(folder: PSTFolder): PSTMessage[] {
  const emails: PSTMessage[] = [];
  let email: PSTMessage | null;

  while (email = folder.getNextChild() as PSTMessage) {
    if (email instanceof PSTMessage) {
      if (email.messageClass === "IPM.Note" || email.messageClass === "IPM.Note.Draft") {
        emails.push(email);
      } else {
        continue;
      }
    }
  }

  return emails;
}

export { 
  getPSTFile, 
  findTopOfPersonalFolders, 
  processFolder, 
  extractFolderStructureFromPST, 
  extractFolderAndEmails,
  extractEmailsFromFolder
};