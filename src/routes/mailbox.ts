import express, { Request, Response } from 'express';
import { getFullFolderStructure, createFolders } from '../utils/mailboxUtils';
import AuthProvider from '../context/AuthContext';

const router = express.Router();

// Extend the Request interface to include custom properties
interface CustomRequest extends Request {
  authProvider?: AuthProvider;
}

router.get('/list-mailboxes', async (req: Request, res: Response): Promise<void> => {
  const customReq = req as CustomRequest;
  if (!customReq.authProvider || !customReq.authProvider.isAuthenticated) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return;
  }

  try {
    const graphClient = customReq.authProvider.getGraphClient();
    const mailboxes = await graphClient.api('/users')
      .select('displayName,userPrincipalName')
      .get();

    res.json(mailboxes.value);
  } catch (error) {
    console.error('Error fetching mailboxes:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Postfächer' });
  }
});

router.post('/get-mailbox-folders', async (req: CustomRequest, res: Response): Promise<void> => {
  if (!req.authProvider || !req.authProvider.isAuthenticated) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return;
  }

  const { mailbox } = req.body;

  if (!mailbox) {
    res.status(400).json({ error: 'Kein Postfach angegeben' });
    return;
  }

  try {
    const graphClient = req.authProvider.getGraphClient();
    const folderStructure = await getFullFolderStructure(graphClient, mailbox);
    res.json(folderStructure);
  } catch (error) {
    console.error('Error fetching mailbox folders:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Postfachordner' });
  }
});

router.post('/create-folders', async (req: CustomRequest, res: Response): Promise<void> => {
  if (!req.authProvider || !req.authProvider.isAuthenticated) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return;
  }

  const { mailbox, targetFolderId, folderStructure } = req.body;

  if (!mailbox || !targetFolderId || !folderStructure) {
    res.status(400).json({ error: 'Fehlende erforderliche Parameter' });
    return;
  }

  try {
    console.log('Creating folders for mailbox:', mailbox);
    console.log('Target folder ID:', targetFolderId);
    console.log('Folder structure:', JSON.stringify(folderStructure, null, 2));

    const graphClient = req.authProvider.getGraphClient();
    const result = await createFolders(graphClient, mailbox, targetFolderId, folderStructure);

    const totalProcessed = result.created.length + result.skipped.length + result.errors.length;
    const existingFolders = result.skipped.length;
    const skippedDueToErrors = result.errors.length;

    res.json({
      message: 'Ordner wurden verarbeitet',
      totalProcessed,
      created: result.created.length,
      skipped: {
        total: result.skipped.length,
        existing: existingFolders,
        errors: skippedDueToErrors
      },
      details: result
    });
  } catch (error) {
    console.error('Error creating folders:', error);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen der Ordner',
      details: (error as Error).message,
      stack: (error as Error).stack
    });
  }
});

export default router;