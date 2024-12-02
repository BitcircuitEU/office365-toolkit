import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createItemsInMailbox } from '../utils/mailboxUtils';
import { getPSTFile, findTopOfPersonalFolders, processFolder, extractFolderStructureFromPST } from '../utils/pstUtils';
import ensureAuthenticated from '../middleware/auth';
import AuthProvider from '../context/AuthContext';

const router = express.Router();

// Extend the Request interface to include custom properties
interface CustomRequest extends Request {
  authProvider?: AuthProvider;
}

// Route to list PST files
router.get('/list-pst-files', ensureAuthenticated, (req: CustomRequest, res: Response) => {
  const pstDir = path.resolve(__dirname, '../../pst'); // Adjust the path to the root directory
  fs.readdir(pstDir, (err, files) => {
    if (err) {
      console.error('Error reading PST directory:', err);
      res.status(500).send('Error reading PST files');
      return;
    }
    const pstFiles = files.filter(file => path.extname(file).toLowerCase() === '.pst');
    res.json(pstFiles);
  });
});

// Route to analyze a PST file
router.post('/analyze-pst', ensureAuthenticated, async (req: CustomRequest, res: Response): Promise<void> => {
  const fileName = req.body.fileName;

  if (!fileName) {
    console.log('No filename provided');
    res.status(400).json({ error: 'Kein Dateiname angegeben.' });
    return;
  }

  console.log('Processing file:', fileName);

  const filePath = path.resolve(__dirname, '../../pst', fileName); // Adjust the path to the root directory

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error('Error accessing PST file:', err);
      res.status(404).json({ error: 'Die angegebene PST-Datei wurde nicht gefunden.' });
      return;
    }

    try {
      console.log('Attempting to open PST file:', filePath);
      const pstFile = getPSTFile(fileName);
      console.log('PST file opened successfully');

      const rootFolder = pstFile.getRootFolder();
      console.log('Root folder retrieved');

      const topOfPersonalFolders = findTopOfPersonalFolders(rootFolder);
      if (!topOfPersonalFolders) {
        throw new Error('Top of Personal Folders nicht gefunden');
      }

      const folderStructure = processFolder(topOfPersonalFolders);
      console.log('Folder structure processed');

      res.json(folderStructure);
    } catch (error) {
      console.error('Fehler beim Analysieren der PST-Datei:', error);
      res.status(500).json({ 
        error: 'Fehler beim Analysieren der PST-Datei', 
        details: (error as Error).message,
        stack: (error as Error).stack
      });
    }
  });
});

router.post('/import-emails', ensureAuthenticated, async (req: CustomRequest, res: Response): Promise<void> => {
  const { mailbox, targetFolderId, selectedPstFolder, fileName } = req.body;

  if (!mailbox || !targetFolderId || !selectedPstFolder || !fileName) {
    res.status(400).json({ error: 'Fehlende erforderliche Parameter' });
    return;
  }

  if (!req.authProvider) {
    res.status(500).json({ error: 'Authentication provider is not initialized' });
    return;
  }

  try {
    console.log('Selected PST folder:', selectedPstFolder);
    console.log('Target mailbox:', mailbox);
    console.log('Target folder ID:', targetFolderId);

    const folderStructure = extractFolderStructureFromPST(fileName, selectedPstFolder);

    if (!folderStructure) {
      res.status(404).json({ error: 'Keine Emails im ausgewählten PST-Ordner gefunden' });
      return;
    }

    const client = req.authProvider.getGraphClient();
    const createdItems = await createItemsInMailbox(client, mailbox, targetFolderId, folderStructure);

    res.json({
      success: true,
      message: 'Emails und Ordner wurden erfolgreich importiert',
      createdCount: createdItems.length
    });
  } catch (error) {
    console.error('Error importing emails:', error);
    res.status(500).json({ error: 'Fehler beim Importieren der Emails', details: (error as Error).message });
  }
});

export default router;