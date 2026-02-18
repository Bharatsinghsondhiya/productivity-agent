import fs from 'fs/promises';
import path from 'path';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';

const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
];

async function loadSavedCredentials() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        return google.auth.fromJSON(JSON.parse(content));
    } catch {
        return null;
    }
}

async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    await fs.writeFile(TOKEN_PATH, JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    }));
}

async function authorize() {
    let client = await loadSavedCredentials();
    if (client) return client;

    client = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_PATH });
    if (client.credentials) await saveCredentials(client);
    return client;
}

export async function getGmailClient() {
    const auth = await authorize();
    return google.gmail({ version: 'v1', auth });
}
