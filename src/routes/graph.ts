import express, { Request, Response } from 'express';
import { Client } from '@microsoft/microsoft-graph-client';
import AuthProvider from '../context/AuthContext';
import { getLicenseName } from '../utils/licenseMapper';

const router = express.Router();

// Extend the Request interface to include custom properties
interface CustomRequest extends Request {
  authProvider?: AuthProvider;
}

interface FolderNode {
  id: string;
  text: string;
  children: FolderNode[];
}

// Office 365 Routes
router.get('/api/graph/users', async (req: Request, res: Response): Promise<void> => {
  const customReq = req as CustomRequest;
  if (!customReq.authProvider || !customReq.authProvider.isAuthenticated) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return;
  }

  try {
    const graphClient = customReq.authProvider.getGraphClient();
    const users = await graphClient.api('/users')
      .select('displayName,userPrincipalName,assignedLicenses')
      .get();

    const mappedUsers = users.value.map((user: any) => ({
      ...user,
      assignedLicenses: user.assignedLicenses.map((license: any) => ({
        ...license,
        displayName: getLicenseName(license.skuId)
      }))
    }));

    res.json(mappedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Benutzer' });
  }
});

router.post('/api/graph/folders', async (req: CustomRequest, res: Response): Promise<void> => {
  if (!req.authProvider || !req.authProvider.isAuthenticated) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return;
  }

  const mailboxId = req.body.mailboxId;
  if (!mailboxId) {
    res.status(400).json({ error: 'MailboxId ist erforderlich' });
    return;
  }

  try {
    const graphClient = req.authProvider.getGraphClient();
    const folderStructure = await getFullFolderStructure(graphClient, mailboxId);
    res.json(folderStructure);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Ordner' });
  }
});

function escapeSpecialCharacters(str: string): string {
  // Replace newline characters with a space and trim excessive spaces
  str = str.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Encode special characters
  return str.replace(/['"()%#[*+/|,;=:!@&]/g, (char) => {
    return encodeURIComponent(char);
  }).replace(/'/g, "''");
}

export async function getMailboxes(graphClient: Client): Promise<any[]> {
  const result = await graphClient.api('/users')
    .select('id,displayName,mail')
    .filter('mail ne null')
    .get();

  return result.value;
}

async function getFullFolderStructure(graphClient: Client, mailbox: string, parentFolderId: string = ''): Promise<FolderNode[]> {
  let endpoint = `/users/${mailbox}/mailFolders`;
  if (parentFolderId) {
    endpoint += `/${parentFolderId}/childFolders`;
  }

  const response = await graphClient.api(endpoint)
    .select('id,displayName,childFolderCount')
    .get();

  const folders = response.value;

  const folderStructure = await Promise.all(folders.map(async (folder: any) => {
    const node: FolderNode = {
      id: folder.id,
      text: folder.displayName,
      children: []
    };

    if (folder.childFolderCount > 0) {
      node.children = await getFullFolderStructure(graphClient, mailbox, folder.id);
    }

    return node;
  }));

  return folderStructure;
}

export default router;