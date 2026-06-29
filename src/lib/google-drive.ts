import { google } from "googleapis"
import path from "path"
import { Readable } from "stream"

function getAuth() {
  const scopes = ["https://www.googleapis.com/auth/drive.file"]
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const credentialsJsonBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64

  if (credentialsJson || credentialsJsonBase64) {
    const raw = credentialsJsonBase64
      ? Buffer.from(credentialsJsonBase64, "base64").toString("utf8")
      : credentialsJson

    return new google.auth.GoogleAuth({
      credentials: JSON.parse(raw!),
      scopes,
    })
  }

  const credPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "./google-drive-credentials.json")
  return new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes,
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
