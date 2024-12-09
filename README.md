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

## How to Run
- Install Node.JS LTS https://nodejs.org/en
- Open CMD and go to project directory `cd path`
- Install dependencies `npm Install`
- Run Script `npm start`

## Example Screens
!["Migration Screen"](https://i.imgur.com/69qMfNd.png)
