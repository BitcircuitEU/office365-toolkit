import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { Client } from '@microsoft/microsoft-graph-client';
import path from 'path';
import fs from 'fs';
import ensureAuthenticated from '../middleware/auth';
import AuthProvider from '../context/AuthContext';
import { PSTFile, PSTFolder, PSTMessage } from 'pst-extractor';
import { v4 as uuidv4 } from 'uuid';
import * as iconvLite from 'iconv-lite';
import { deEncapsulateSync } from 'rtf-stream-parser';
import { sendStats, sendProgress, MigrationStats, sendLog } from '../socket';


interface CustomRequest extends Request {
  authProvider?: AuthProvider;
}

interface FolderNode {
  id: string;
  text: string;
  children: FolderNode[];
}

let migrationStats: MigrationStats = {
  currentFolderPath: "",
  currentFileName: "",
  totalFolders: 0,
  processedFolders: 0,
  totalEmails: 0,
  processedEmails: 0,
  skippedEmails: 0,
  errorEmails: 0
};

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req: CustomRequest, file, cb) {
    const authProvider = req.authProvider;
    if (!authProvider) {
      return cb(new Error('Authentication provider not found'), '');
    }
    const tenantFolder = authProvider.getTenantFolder();
    if (!tenantFolder) {
      return cb(new Error('Tenant folder not found'), '');
    }
    cb(null, tenantFolder);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: Infinity },
});


router.get('/api/pst/list', ensureAuthenticated, (req: CustomRequest, res: Response) => {
  if (!req.authProvider) {
    res.status(500).json({ error: 'Authentication provider is not initialized' });
    return;
  }
  const tenantFolder = req.authProvider.getTenantFolder();
  if (!tenantFolder) {
    res.status(500).json({ error: 'Tenant folder not found' });
    return;
  }

  fs.readdir(tenantFolder, (err, files) => {
    if (err) {
      console.error('Error reading PST directory:', err);
      res.status(500).send('Error reading PST files');
      return;
    }
    const pstFiles = files.filter(file => path.extname(file).toLowerCase() === '.pst');
    res.json(pstFiles);
  });
});

router.post('/api/pst/upload', ensureAuthenticated, (req: CustomRequest, res: Response) => {
  let uploadedSize = 0;
  let lastLoggedSize = 0;

  req.on('data', (chunk) => {
    uploadedSize += chunk.length;
    const uploadedMB = (uploadedSize / (1024 * 1024)).toFixed(2);

    // Log every 5MB or when upload is complete
    if (uploadedSize - lastLoggedSize >= 5 * 1024 * 1024) {
      sendLog(`Uploading PST file: ${uploadedMB}MB uploaded`);
      lastLoggedSize = uploadedSize;
    }
  });

  req.on('end', () => {
    sendLog('Upload completed. Processing file...');
  });

  upload.single('pstFile')(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      sendLog('Error uploading PST file.');
      return res.status(500).json({ error: err.message });
    } else if (err) {
      sendLog('Error uploading PST file.');
      return res.status(500).json({ error: 'An unknown error occurred when uploading.' });
    }

    if (!req.file) {
      sendLog('Error uploading PST file.');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    sendLog(`File ${req.file.filename} uploaded successfully.`);
    res.json({ message: 'File uploaded successfully', filename: req.file.filename });
  });
});

router.delete('/api/pst/delete/:filename', ensureAuthenticated, (req: CustomRequest, res: Response) => {
  if (!req.authProvider) {
    res.status(500).json({ error: 'Authentication provider is not initialized' });
    return;
  }
  const tenantFolder = req.authProvider.getTenantFolder();
  if (!tenantFolder) {
    res.status(500).json({ error: 'Tenant folder not found' });
    return;
  }

  const filename = req.params.filename;
  const filePath = path.join(tenantFolder, filename);

  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('Error deleting PST file:', err);
      res.status(500).json({ error: 'Error deleting PST file' });
      return;
    }
    console.log(filename + " has been deleted.");
    res.json({ message: 'File deleted successfully' });
  });
});

router.post('/api/pst/structure', ensureAuthenticated, (req: CustomRequest, res: Response) => {
  if (!req.authProvider) {
    res.status(500).json({ error: 'Authentication provider is not initialized' });
    return;
  }
  const tenantFolder = req.authProvider.getTenantFolder();
  if (!tenantFolder) {
    res.status(500).json({ error: 'Tenant folder not found' });
    return;
  }

  const fileName = req.body.fileName;
  const filePath = path.join(tenantFolder, fileName);

  try {
    const pstFile = new PSTFile(filePath);
    const rootFolder = pstFile.getRootFolder();
    const folderStructure = processPSTFolder(rootFolder);
    res.json(folderStructure);
  } catch (error) {
    console.error('Error processing PST file:', error);
    res.status(500).json({ error: 'Error processing PST file', details: (error as Error).message });
  }
});

router.post('/api/pst/import', ensureAuthenticated, async (req: CustomRequest, res: Response) => {
  if (!req.authProvider) {
    res.status(500).json({ error: 'Authentication provider is not initialized' });
    return;
  }
  const tenantFolder = req.authProvider.getTenantFolder();
  if (!tenantFolder) {
    res.status(500).json({ error: 'Tenant folder not found' });
    return;
  }

  const { pstFile, mailboxId, pstFolderId, office365FolderId } = req.body;

  try {
    const filePath = path.join(tenantFolder, pstFile);
    const pstFileObj = new PSTFile(filePath);
    const rootFolder = pstFileObj.getRootFolder();
    
    const selectedFolder = findFolderByNodeId(rootFolder, pstFolderId);
    
    if (!selectedFolder) {
      res.status(404).json({ error: 'Selected PST folder not found' });
      return;
    }

    const graphClient = await req.authProvider.getGraphClient();

    migrationStats = {
      currentFolderPath: "",
      currentFileName: "",
      totalFolders: 0,
      processedFolders: 0,
      totalEmails: 0,
      processedEmails: 0,
      skippedEmails: 0,
      errorEmails: 0
    };

    await importPSTFolder(selectedFolder, mailboxId, office365FolderId, graphClient);

    console.log('Import completed successfully');
    res.json({ message: 'Import completed successfully', stats: migrationStats });
  } catch (error) {
    console.error('Error processing PST file:', error);
    res.status(500).json({ error: 'Error processing PST file', details: (error as Error).message, stats: migrationStats });
  }
});

function escapeSpecialCharacters(str: string): string {
  // Replace newline characters with a space and trim excessive spaces
  str = str.replace(/\s+/g, ' ').trim();

  // Encode special characters
  return str.replace(/['"()%#[*+/|,;=:!@&]/g, (char) => {
    return encodeURIComponent(char);
  }).replace(/'/g, "''");
}

function processPSTFolder(folder: PSTFolder, parentId: string = ''): FolderNode[] {
  const result: FolderNode[] = [];

  if (folder.hasSubfolders) {
    const childFolders = folder.getSubFolders();
    for (let i = 0; i < childFolders.length; i++) {
      const childFolder = childFolders[i];
      const folderId = parentId ? `${parentId}_${i}` : `${i}`;
      const node: FolderNode = {
        id: folderId,
        text: childFolder.displayName,
        children: processPSTFolder(childFolder, folderId)
      };
      result.push(node);
    }
  }

  return result;
}

function findFolderByNodeId(rootFolder: PSTFolder, nodeId: string): PSTFolder | null {
  const idParts = nodeId.split('_').map(Number);
  let currentFolder = rootFolder;

  for (let i = 0; i < idParts.length; i++) {
    if (!currentFolder.hasSubfolders) {
      return null;
    }
    const subFolders = currentFolder.getSubFolders();
    if (idParts[i] >= subFolders.length) {
      return null;
    }
    currentFolder = subFolders[idParts[i]];
  }

  return currentFolder;
}

async function importPSTFolder(folder: PSTFolder, mailboxId: string, office365FolderId: string, graphClient: Client) {
  console.log(`Importing folder ${folder.displayName} to mailbox ${mailboxId} in folder ${office365FolderId}`);

  migrationStats.totalFolders++;
  migrationStats.currentFolderPath = folder.displayName;
  let emailCount = 0;
  const totalEmails = folder.contentCount;
  migrationStats.totalEmails += totalEmails;


  // Reset the cursor to the beginning
  folder.moveChildCursorTo(0);

  let email = folder.getNextChild();
  while (email !== null) {
    if (email instanceof PSTMessage) {
      if (email.messageClass === "IPM.Note" || email.messageClass === "IPM.Note.Draft") {
        try {
          if(email.subject)
            migrationStats.currentFileName = email.subject;

          const created = await createOffice365Email(mailboxId, office365FolderId, email, graphClient);
          emailCount++;

          if (created) {
            migrationStats.processedEmails++;
          } else {
            migrationStats.skippedEmails++;
          }
          
          console.log(`Processed email: ${email.subject}`);

          sendStats(migrationStats);
          const progress = (migrationStats.processedEmails / migrationStats.totalEmails) * 100;
          sendProgress(progress);
        } catch (error) {
          console.error(`Error processing email: ${email.subject}`, error);
          migrationStats.errorEmails++;
        }
      } else {
        console.log(`Skipped non-email item: ${email.messageClass}`);
        migrationStats.skippedEmails++;
      }
    } else {
      console.log(`Skipped non-message item`);
    }

    // Get the next email
    email = folder.getNextChild();
  }

  console.log(`Finished processing ${emailCount}/${totalEmails} emails in folder ${folder.displayName}`);
  migrationStats.processedFolders++;

  if (folder.hasSubfolders) {
    const subFolders = folder.getSubFolders();
    for (const subFolder of subFolders) {
      const newOffice365SubFolderId = await createOffice365Folder(graphClient, mailboxId, office365FolderId, subFolder.displayName);
      await importPSTFolder(subFolder, mailboxId, newOffice365SubFolderId, graphClient);
    }
  }
}

async function createOffice365Folder(graphClient: Client, mailboxId: string, parentFolderId: string, folderName: string): Promise<string> {
  console.log(`Checking folder ${folderName} in mailbox ${mailboxId} under parent folder ${parentFolderId}`);

  try {
    const normalizedFolderName = folderName.replace(/\s+/g, ' ').trim();

    const existingFolders = await graphClient.api(`/users/${mailboxId}/mailFolders/${parentFolderId}/childFolders`)
      .select('id,displayName')
      .top(999)
      .get();

    const existingFolder = existingFolders.value.find((folder: any) => 
      folder.displayName.replace(/\s+/g, ' ').trim().toLowerCase() === normalizedFolderName.toLowerCase()
    );

    if (existingFolder) {
      console.log(`Folder "${folderName}" already exists with id: ${existingFolder.id}`);
      return existingFolder.id;
    }

    // If the folder doesn't exist, create it
    const newFolder = await graphClient.api(`/users/${mailboxId}/mailFolders/${parentFolderId}/childFolders`)
      .post({
        displayName: folderName
      });

    console.log(`Created new folder: ${folderName}`);
    return newFolder.id;
  } catch (error) {
    console.error(`Error checking/creating folder ${folderName}:`, error);
    sendLog(`Error creating folder "${folderName}": ${error}`);
    throw error;
  }
}

async function createOffice365Email(mailboxId: string, folderId: string, pstEmail: PSTMessage, graphClient: Client) {
  console.log(`Checking/Creating email: ${pstEmail.subject}`);

  try {
    let filter = `subject eq '${escapeSpecialCharacters(pstEmail.subject)}'`;

    if (pstEmail.senderEmailAddress) {
      filter += ` and from/emailAddress/address eq '${escapeSpecialCharacters(pstEmail.senderEmailAddress)}'`;
    }

    if (pstEmail.messageDeliveryTime) {
      const deliveryTime = new Date(pstEmail.messageDeliveryTime);
      const minTime = new Date(deliveryTime.getTime() - 60000); // 1 minute before
      const maxTime = new Date(deliveryTime.getTime() + 60000); // 1 minute after

      filter += ` and receivedDateTime ge ${minTime.toISOString()} and receivedDateTime le ${maxTime.toISOString()}`;
    }

    const existingEmails = await graphClient.api(`/users/${mailboxId}/mailFolders/${folderId}/messages`)
      .filter(filter)
      .select('id,subject,receivedDateTime,from')
      .top(1)
      .get();

    if (existingEmails.value && existingEmails.value.length > 0) {
      console.log(`Skipped email: ${pstEmail.subject}`);
      return;
    }

    // If the email doesn't exist, create it
    let emailBody = pstEmail.bodyHTML || pstEmail.body;
    let bodyType = pstEmail.bodyHTML ? 'HTML' : 'Text';
    const isDraft = pstEmail.messageClass === 'IPM.Note.Draft';

    // Convert RTF to HTML
    if(pstEmail.bodyRTF) {
      const result = deEncapsulateSync(pstEmail.bodyRTF, { decode: iconvLite.decode });
      emailBody = result.text.toString();
      bodyType = 'HTML';
    }

    const email: any = {
      internetMessageId: `<${uuidv4()}@numera-office-toolkit.com>`,
      subject: pstEmail.subject || "(No subject)",
      body: {
        contentType: bodyType,
        content: emailBody
      },
      toRecipients: pstEmail.displayTo ? pstEmail.displayTo.split(';').map((recipient: string) => ({ emailAddress: { address: recipient.trim() } })) : [],
      ccRecipients: pstEmail.displayCC ? pstEmail.displayCC.split(';').map((recipient: string) => ({ emailAddress: { address: recipient.trim() } })) : [],
      bccRecipients: pstEmail.displayBCC ? pstEmail.displayBCC.split(';').map((recipient: string) => ({ emailAddress: { address: recipient.trim() } })) : [],
      sender: pstEmail.senderEmailAddress ? {
        emailAddress: {
          name: pstEmail.senderName,
          address: pstEmail.senderEmailAddress
        }
      } : undefined,
      from: pstEmail.senderEmailAddress ? {
        emailAddress: {
          name: pstEmail.senderName,
          address: pstEmail.senderEmailAddress
        }
      } : undefined,
      isDraft: isDraft,
      isRead: !isDraft,
      attachments: []
    };

    if (isDraft) {
      email.singleValueExtendedProperties = [
          {
              id: "SystemTime 0x0039",
              value: pstEmail.clientSubmitTime?.toISOString() || new Date().toISOString()
          },
          {
              id: "SystemTime 0x0E06",
              value: pstEmail.messageDeliveryTime?.toISOString() || new Date().toISOString()
          },
          {
              id: "SystemTime 0x3007",
              value: pstEmail.creationTime?.toISOString() || new Date().toISOString()
          },
          {
              id: "SystemTime 0x3008",
              value: pstEmail.modificationTime?.toISOString() || new Date().toISOString()
          }
      ];
    } else {
      email.singleValueExtendedProperties = [
          {
              id: "Integer 0x0E07",
              value: "1"
          },
          {
              id: "SystemTime 0x0039",
              value: pstEmail.clientSubmitTime?.toISOString() || new Date().toISOString()
          },
          {
              id: "SystemTime 0x0E06",
              value: pstEmail.messageDeliveryTime?.toISOString() || new Date().toISOString()
          },
          {
              id: "SystemTime 0x3007",
              value: pstEmail.creationTime?.toISOString() || new Date().toISOString()
          },
          {
              id: "SystemTime 0x3008",
              value: pstEmail.modificationTime?.toISOString() || new Date().toISOString()
          }
      ];
    }

    if (pstEmail.numberOfAttachments > 0) {
        for (let i = 0; i < pstEmail.numberOfAttachments; i++) {
            const attachment = pstEmail.getAttachment(i);
            if (attachment && attachment.filename) {
                const attachmentStream = attachment.fileInputStream;
                if (attachmentStream) {
                    const chunks: Buffer[] = [];
                    const bufferSize = 8176;
                    const buffer = Buffer.alloc(bufferSize);
                    let bytesRead: number;

                    do {
                        bytesRead = attachmentStream.read(buffer);
                        if (bytesRead > 0) {
                            chunks.push(Buffer.from(buffer.slice(0, bytesRead)));
                        }
                    } while (bytesRead === bufferSize);

                    const attachmentBuffer = Buffer.concat(chunks);
                    email.attachments.push({
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        name: attachment.longFilename || attachment.filename,
                        contentType: attachment.mimeTag,
                        contentBytes: attachmentBuffer.toString('base64'),
                    });
                } else {
                    console.warn(`Failed to get stream for attachment: ${attachment.filename}`);
                }
            }
        }
    }

    try {
      const messageID = await graphClient.api(`/users/${mailboxId}/mailFolders/${folderId}/messages`).post(email);
      console.log(`Created new email: ${pstEmail.subject}`);
      return messageID;
    } catch (error) {
      console.error('Error creating email.', error);
      sendLog(`Error creating email "${pstEmail.subject}": ${error}`);
      throw error;
    }
    
  } catch (error) {
    console.error(`Error creating email ${pstEmail.subject}:`, error);
    sendLog(`Error creating email "${pstEmail.subject}": ${error}`);
    throw error;
  }
}

export default router;