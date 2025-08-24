{\rtf1\ansi\ansicpg1252\cocoartf2513
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww10800\viewh8400\viewkind0
\pard\tx566\tx1133\tx1700\tx2267\tx2834\tx3401\tx3968\tx4535\tx5102\tx5669\tx6236\tx6803\pardirnatural\partightenfactor0

\f0\fs24 \cf0 export class ObjectStorageService \{\
  async getObjectEntityUploadURL(): Promise<string> \{\
    console.log('Generating upload URL for object storage');\
    return 'https://mock-storage.com/upload?token=mock-upload-token';\
  \}\
\
  async getObjectEntityFile(objectPath: string): Promise<any> \{\
    console.log('Retrieving file:', objectPath);\
    return \{\
      path: objectPath,\
      filename: objectPath.split('/').pop(),\
      size: 1024,\
      contentType: 'application/octet-stream',\
      content: Buffer.from('mock file content')\
    \};\
  \}\
\
  downloadObject(objectFile: any, res: any): void \{\
    res.setHeader('Content-Type', objectFile.contentType || 'application/octet-stream');\
    res.setHeader('Content-Disposition', `attachment; filename="$\{objectFile.filename\}"`);\
    res.send(objectFile.content);\
  \}\
\}\
\
export class ObjectNotFoundError extends Error \{\
  constructor(filename: string) \{\
    super(`Object not found: $\{filename\}`);\
    this.name = "ObjectNotFoundError";\
  \}\
\}}