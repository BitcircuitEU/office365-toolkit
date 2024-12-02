import { v4 as uuidv4 } from 'uuid';
import { Client } from '@microsoft/microsoft-graph-client';
import { parseString } from 'rtf-parser';

function escapeSpecialCharacters(str: string): string {
  // Replace newline characters with a space and trim excessive spaces
  str = str.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Encode special characters
  return str.replace(/['"()%#[*+/|,;=:!@&]/g, (char) => {
    return encodeURIComponent(char);
  }).replace(/'/g, "''");
}

interface FolderNode {
  id: string;
  text: string;
  children: FolderNode[];
}

function parseRTFContent(rtfContent: string): Promise<string> {
  return new Promise((resolve, reject) => {
    parseString(rtfContent, (err: any, doc: { content: any[]; }) => {
      if (err) {
        return reject(err);
      }
      let text = '';
      doc.content.forEach((element) => {
        if (element.type === 'text') {
          text += element.value;
        }
      });
      resolve(text);
    });
  });
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

interface FolderResult {
  created: string[];
  skipped: string[];
  errors: { folder: string, error: string }[];
}

async function createFolders(graphClient: Client, mailbox: string, parentFolderId: string, folderStructure: any): Promise<FolderResult> {
  if (!Array.isArray(folderStructure)) {
    console.error('folderStructure is not an array:', typeof folderStructure);
    if (typeof folderStructure === 'object') {
      folderStructure = [folderStructure];
    } else {
      throw new Error(`Invalid folderStructure type: ${typeof folderStructure}`);
    }
  }

  const result: FolderResult = {
    created: [],
    skipped: [],
    errors: []
  };

  for (const folder of folderStructure) {
    try {
      if (typeof folder !== 'object' || !folder.text) {
        console.error('Invalid folder object:', folder);
        result.errors.push({ folder: folder, error: 'Invalid folder object' });
        continue;
      }
      
      const existingFolders = await graphClient.api(`/users/${mailbox}/mailFolders/${parentFolderId}/childFolders`)
        .filter(`displayName eq '${escapeSpecialCharacters(folder.text)}'`)
        .get();

      if (existingFolders.value.length > 0) {
        console.log(`[Create Folder] -> Skipped | "${folder.text}"`);
        result.skipped.push(folder.text);
        
        if (Array.isArray(folder.children) && folder.children.length > 0) {
          const subResult = await createFolders(graphClient, mailbox, existingFolders.value[0].id, folder.children);
          result.created = result.created.concat(subResult.created);
          result.skipped = result.skipped.concat(subResult.skipped);
          result.errors = result.errors.concat(subResult.errors);
        }
      } else {
        const newFolder = await graphClient.api(`/users/${mailbox}/mailFolders/${parentFolderId}/childFolders`)
          .post({
            displayName: folder.text
          });
        console.log(`[Create Folder] -> Added | "${folder.text}" in parent folder ${parentFolderId} with ID ${newFolder.id}`);
        result.created.push(folder.text);
        
        if (Array.isArray(folder.children) && folder.children.length > 0) {
          const subResult = await createFolders(graphClient, mailbox, newFolder.id, folder.children);
          result.created = result.created.concat(subResult.created);
          result.skipped = result.skipped.concat(subResult.skipped);
          result.errors = result.errors.concat(subResult.errors);
        }
      }
    } catch (error: any) {
      console.error(`Error processing folder "${folder.text}":`, error);
      result.errors.push({ folder: folder.text, error: error.message });
    }
  }

  return result;
}

async function findFolderIdByName(client: Client, mailbox: string, parentFolderId: string, folderName: string): Promise<string | null> {  
  const response = await client.api(`/users/${mailbox}/mailFolders/${parentFolderId}/childFolders`)
      .filter(`displayName eq '${escapeSpecialCharacters(folderName)}'`)
      .get();

  if (response.value.length > 0) {
      console.log(`[Search Folder] -> Found | "${folderName}" with ID ${response.value[0].id}`);
      return response.value[0].id;
  } else {
      console.warn(`[Search Folder] -> Not Found | "${folderName}" not found under parent folder ID ${parentFolderId}`);
      return null;
  }
}

interface EmailStructure {
  folderName: string;
  emails: any[];
  subfolders: EmailStructure[];
}

const createItemsInMailbox = async (client: Client, mailbox: string, targetFolderId: string, folderStructure: EmailStructure): Promise<any[]> => {
  const createdItems: any[] = [];

  async function createEmailsInFolder(parentFolderId: string, structure: EmailStructure, isTopLevel: boolean = false) {
      const folderId = isTopLevel ? parentFolderId : await findFolderIdByName(client, mailbox, parentFolderId, structure.folderName);
      
      if (!folderId) {
          console.error(`Cannot find folder ID for "${structure.folderName}". Skipping.`);
          return;
      }

      for (const email of structure.emails) {        
          let messageContent = email.bodyHTML || email.body || email.bodyRTF;
          const isDraft = email.messageClass === 'IPM.Note.Draft';

          if (email.bodyRTF || email.body) {
            try {
              messageContent = await parseRTFContent(messageContent);
            } catch (error) {
              messageContent = email.bodyRTF || email.body;
              continue;
            }
          }

          const emailData: any = {
              internetMessageId: email.internetMessageId || `<${uuidv4()}@numera-office-toolkit.com>`,
              subject: email.subject || "(No subject)",
              body: {
                  contentType: 'HTML',
                  content: messageContent
              },
              toRecipients: email.displayTo ? email.displayTo.split(';').map((recipient: string) => ({ emailAddress: { address: recipient.trim() } })) : [],
              ccRecipients: email.displayCC ? email.displayCC.split(';').map((recipient: string) => ({ emailAddress: { address: recipient.trim() } })) : [],
              bccRecipients: email.displayBCC ? email.displayBCC.split(';').map((recipient: string) => ({ emailAddress: { address: recipient.trim() } })) : [],
              sender: email.senderEmailAddress ? {
                  emailAddress: {
                      name: email.senderName,
                      address: email.senderEmailAddress
                  }
              } : undefined,
              from: email.senderEmailAddress ? {
                  emailAddress: {
                      name: email.senderName,
                      address: email.senderEmailAddress
                  }
              } : undefined,
              isDraft: isDraft,
              isRead: !isDraft,
              attachments: []
          };

          if (isDraft) {
            emailData.singleValueExtendedProperties = [
                {
                    id: "SystemTime 0x0039",
                    value: email.clientSubmitTime?.toISOString() || new Date().toISOString()
                },
                {
                    id: "SystemTime 0x0E06",
                    value: email.messageDeliveryTime?.toISOString() || new Date().toISOString()
                },
                {
                    id: "SystemTime 0x3007",
                    value: email.creationTime?.toISOString() || new Date().toISOString()
                },
                {
                    id: "SystemTime 0x3008",
                    value: email.modificationTime?.toISOString() || new Date().toISOString()
                }
            ];
          } else {
            emailData.singleValueExtendedProperties = [
                {
                    id: "Integer 0x0E07",
                    value: "1"
                },
                {
                    id: "SystemTime 0x0039",
                    value: email.clientSubmitTime?.toISOString() || new Date().toISOString()
                },
                {
                    id: "SystemTime 0x0E06",
                    value: email.messageDeliveryTime?.toISOString() || new Date().toISOString()
                },
                {
                    id: "SystemTime 0x3007",
                    value: email.creationTime?.toISOString() || new Date().toISOString()
                },
                {
                    id: "SystemTime 0x3008",
                    value: email.modificationTime?.toISOString() || new Date().toISOString()
                }
            ];
          }

          if (email.numberOfAttachments > 0) {
              for (let i = 0; i < email.numberOfAttachments; i++) {
                  const attachment = email.getAttachment(i);
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
                          emailData.attachments.push({
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
            let filter = `subject eq '${escapeSpecialCharacters(email.subject)}'`;

            if (email.senderEmailAddress) {
              filter += ` and from/emailAddress/address eq '${escapeSpecialCharacters(email.senderEmailAddress)}'`;
            }

            if (email.messageDeliveryTime) {
              // Use a time range of ±1 minute to account for potential small differences
              const deliveryTime = new Date(email.messageDeliveryTime);
              const minTime = new Date(deliveryTime.getTime() - 60000); // 1 minute before
              const maxTime = new Date(deliveryTime.getTime() + 60000); // 1 minute after

              filter += ` and receivedDateTime ge ${minTime.toISOString()} and receivedDateTime le ${maxTime.toISOString()}`;
            }

            const existingEmails = await client.api(`/users/${mailbox}/mailFolders/${folderId}/messages`)
                .filter(filter)
                .select('id,subject,receivedDateTime,from')
                .top(1)
                .get();

            if (existingEmails.value.length > 0) {
                console.log(`[Import Mail] -> Skipped | "${email.subject}"`);
                continue;
            }
          } catch (error) {
              console.error(`Failed to check existence of email "${email.subject}" in folder "${structure.folderName}":`, error);
              continue;
          }

          try {
              const endpoint = `/users/${mailbox}/mailFolders/${folderId}/messages`;
              const createdEmail = await client.api(endpoint)
                  .post(emailData);
              createdItems.push(createdEmail);
              console.log(`[Import Mail] -> Imported | "${email.subject}"`);
          } catch (error) {
              console.error(`Failed to create email "${email.subject}" in folder "${structure.folderName}":`, error);
          }
      }

      for (const subfolder of structure.subfolders) {
          await createEmailsInFolder(folderId, subfolder);
      }

      console.log("Alle E-Mails importiert.");
  }

  await createEmailsInFolder(targetFolderId, folderStructure, true);

  return createdItems;
};

export { getFullFolderStructure, createFolders, createItemsInMailbox };