import { google } from "googleapis"
import path from "path"
import { Readable } from "stream"

function getAuth() {
  const credPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "./google-drive-credentials.json")
  return new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  })
}

export async function uploadToDrive(file: Buffer, filename: string, mimeType: string) {
  const auth = getAuth()
  const drive = google.drive({ version: "v3", auth })
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: folderId ? [folderId] : undefined,
    },
    media: {
      mimeType,
      body: Readable.from(file),
    },
    fields: "id, webViewLink",
  })

  // Rendre le fichier accessible en lecture via le lien
  await drive.permissions.create({
    fileId: res.data.id!,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  })

  return {
    fileId: res.data.id!,
    url: res.data.webViewLink!,
  }
}

export async function deleteFromDrive(fileId: string) {
  const auth = getAuth()
  const drive = google.drive({ version: "v3", auth })
  await drive.files.delete({ fileId }).catch(() => {})
}
