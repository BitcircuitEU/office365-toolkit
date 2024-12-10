# Office 365 Toolkit (& PST Importer)

![github-issues](https://img.shields.io/github/issues/bitcircuiteu/office365-toolkit.svg) 
![stars](https://img.shields.io/github/stars/bitcircuiteu/office365-toolkit.svg) 
![forks](https://img.shields.io/github/forks/bitcircuiteu/office365-toolkit.svg) 
![](https://david-dm.org/bitcircuiteu/office365-toolkit/status.svg) 
![](https://david-dm.org/bitcircuiteu/office365-toolkit/dev-status.svg)

Web Based Office 365 Toolkit

## Current Features
- Login via Azure Tenant App (Register App in Azure Portal first)
- Import Content from PST File to Office365 via Graph API
  - Checks for Duplicates
  - Creates missing Folders
  - Creates missing E-Mails (IPM.Note, IPM.Note.Draft)
  - Foldermapping via Folder Tree


# Coming Soon
- Support for Contacts/Contactfolders
- Support for Events/Calendars

# Known Issues
- If a Mail has Only rtf content we try to parse and convert it to html as rtf body is not supported by graph api. Some Rtf bodys can't be converted with the current parser and throw errors, this mails might be skipped or have an empty body

## How to Run
- Install Node.JS LTS https://nodejs.org/en
- Open CMD and go to project directory `cd path`
- Install dependencies `npm Install`
- Run Script `npm start`

## Azure App Permissions
- Following App Permissions should be set for the Azure Application as Application Permission
  ```
  Calendars.ReadWrite
  Mail.ReadWrite
  Group.ReadWrite.All
  MailboxFolder.ReadWrite.All
  MailboxSettings.ReadWrite
  ```

## Tests
- Tested with PST Files exported from Outlook 2019 & 365
- Tested with PST Files exported from Exchange via Powershell Bulk Export
- Tested with PST Files exported from 365 Compliance Center
- Technically OST Files might work too, but have not been tested.

## Example Screens
!["Migration Screen"](https://i.imgur.com/69qMfNd.png)
