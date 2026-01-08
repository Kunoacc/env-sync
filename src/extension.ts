import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as nodeCrypto from 'crypto';
import { machineIdSync } from 'node-machine-id';
import axios from 'axios';
import { HistoryProvider, registerHistoryView } from './views/historyProvider';
import { encrypt, decrypt, createPassphrase, computeHash, isLegacyFormat } from './utils/crypto';
import { getSavedProjectId, saveProjectId, generateProjectId, findEnvFiles, getRelativePath } from './utils/project';

import * as legacyCrypto from 'crypto-js';

function getApiUrl(): string {
  const config = vscode.workspace.getConfiguration('envsync');
  return config.get<string>('apiUrl') ?? 'https://your-project.supabase.co/functions/v1';
}

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

let accessToken: string | null = null;
let isLoggedIn = false;
let userEmail = '';
let deviceId = '';
let statusBarItem: vscode.StatusBarItem;
let historyProvider: HistoryProvider;
let extensionSecrets: vscode.SecretStorage;

export async function activate(context: vscode.ExtensionContext) {
  console.log('EnvSync extension is now active!');

  deviceId = machineIdSync();
  extensionSecrets = context.secrets;

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(sync) EnvSync';
  statusBarItem.command = 'envsync.sync';
  context.subscriptions.push(statusBarItem);

  accessToken = await extensionSecrets.get('envsync.accessToken') ?? null;
  userEmail = context.globalState.get('envsync.userEmail') ?? '';
  
  if (accessToken) {
    isLoggedIn = true;
    updateStatusBar();
    validateToken(context);
  }

  historyProvider = registerHistoryView(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('envsync.login', () => loginCommand(context)),
    vscode.commands.registerCommand('envsync.logout', () => logoutCommand(context)),
    vscode.commands.registerCommand('envsync.sync', syncCommand),
    vscode.commands.registerCommand('envsync.push', pushCommand),
    vscode.commands.registerCommand('envsync.pull', pullCommand)
  );

  setupFileWatchers(context);
  statusBarItem.show();
}

async function validateToken(context: vscode.ExtensionContext) {
  try {
    const response = await axios.get(`${getApiUrl()}/auth/validate`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (response.status !== 200) {
      await clearAuthState(context);
    }
  } catch {
    await clearAuthState(context);
  }
}

async function clearAuthState(context: vscode.ExtensionContext) {
  isLoggedIn = false;
  accessToken = null;
  userEmail = '';
  await extensionSecrets.delete('envsync.accessToken');
  await context.globalState.update('envsync.userEmail', undefined);
  historyProvider.updateAccessToken(null);
  updateStatusBar();
}

async function loginCommand(context: vscode.ExtensionContext) {
  const authMethod = await vscode.window.showQuickPick(
    [
      { label: '$(mail) Email (Magic Link)', value: 'magic-link', description: 'No setup required' },
      { label: '$(github) GitHub', value: 'github', description: 'Requires OAuth app setup' },
      { label: '$(globe) Google', value: 'google', description: 'Requires OAuth app setup' },
    ],
    { placeHolder: 'Choose login method' }
  );

  if (!authMethod) return;

  if (authMethod.value === 'magic-link') {
    await magicLinkLogin(context);
  } else {
    await oauthLogin(context, authMethod.value);
  }
}

async function magicLinkLogin(context: vscode.ExtensionContext) {
  const email = await vscode.window.showInputBox({
    prompt: 'Enter your email address',
    placeHolder: 'you@example.com',
    validateInput: (value) => {
      if (!value || !value.includes('@')) {
        return 'Please enter a valid email address';
      }
      return null;
    }
  });

  if (!email) return;

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Sending login link...' },
      async () => {
        await axios.post(`${getApiUrl()}/auth/magic-link`, { email });
      }
    );

    const token = await vscode.window.showInputBox({
      prompt: 'Check your email and enter the 6-digit code',
      placeHolder: '123456',
      validateInput: (value) => {
        if (!value || value.length < 6) {
          return 'Please enter the 6-digit code from your email';
        }
        return null;
      }
    });

    if (!token) return;

    const response = await axios.post(`${getApiUrl()}/auth/verify-otp`, { email, token });

    accessToken = response.data.access_token;
    userEmail = response.data.email;
    isLoggedIn = true;

    await extensionSecrets.store('envsync.accessToken', accessToken!);
    await context.globalState.update('envsync.userEmail', userEmail);

    updateStatusBar();
    historyProvider.updateAccessToken(accessToken);

    vscode.window.showInformationMessage('Successfully logged in!');
  } catch (error: any) {
    const message = error.response?.data?.error ?? error.message;
    vscode.window.showErrorMessage(`Login failed: ${message}`);
  }
}

async function oauthLogin(context: vscode.ExtensionContext, provider: string) {
  const state = nodeCrypto.randomUUID();
  await context.globalState.update('envsync.authState', state);
  
  const serverResult = await startLocalServer(state, context);
  
  const authUrl = `${getApiUrl()}/auth/login?state=${state}&provider=${provider}&redirect_uri=http://localhost:${serverResult.port}/callback`;
  vscode.env.openExternal(vscode.Uri.parse(authUrl));
  
  vscode.window.showInformationMessage('Browser opened for authentication. Please complete the login process.');
}

interface LocalServerResult {
  server: any;
  port: number;
}

async function startLocalServer(state: string, context: vscode.ExtensionContext): Promise<LocalServerResult> {
  const http = require('http');
  
  return new Promise<LocalServerResult>((resolve) => {
    let timeoutId: NodeJS.Timeout;
    
    const server = http.createServer(async (req: any, res: any) => {
      if (req.url?.startsWith('/callback')) {
        clearTimeout(timeoutId);
        
        const url = new URL(`http://localhost${req.url}`);
        const receivedState = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        
        if (receivedState !== state) {
          res.writeHead(400);
          res.end('Authentication failed: State mismatch');
          server.close();
          return;
        }
        
        if (!code) {
          res.writeHead(400);
          res.end('Authentication failed: No code received');
          server.close();
          return;
        }
        
        try {
          const tokenResponse = await axios.post(`${getApiUrl()}/auth/token`, {
            code,
            redirect_uri: `http://localhost:${server.address().port}/callback`
          });
          
          accessToken = tokenResponse.data.access_token;
          userEmail = tokenResponse.data.email;
          isLoggedIn = true;
          
          await extensionSecrets.store('envsync.accessToken', accessToken!);
          await context.globalState.update('envsync.userEmail', userEmail);
          
          updateStatusBar();
          historyProvider.updateAccessToken(accessToken);
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Authentication Successful</h1>
                <p>You can now close this window and return to VS Code.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);
          
          vscode.window.showInformationMessage('Successfully logged in!');
          server.close();
        } catch (error) {
          console.error('Token exchange failed:', error);
          res.writeHead(500);
          res.end('Authentication failed: Could not retrieve token');
          server.close();
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    server.listen(0, 'localhost', () => {
      const port = server.address().port;
      
      timeoutId = setTimeout(() => {
        server.close();
        vscode.window.showWarningMessage('Authentication timed out. Please try again.');
      }, OAUTH_TIMEOUT_MS);
      
      resolve({ server, port });
    });
  });
}

async function logoutCommand(context: vscode.ExtensionContext) {
  if (!isLoggedIn) {
    vscode.window.showErrorMessage('Not logged in');
    return;
  }

  try {
    if (accessToken) {
      await axios.post(`${getApiUrl()}/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }
  } catch {
  }
  
  await clearAuthState(context);
  vscode.window.showInformationMessage('Successfully logged out');
}

async function syncCommand() {
  if (!ensureLoggedIn()) return;
  
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }
  
  const projectId = await getOrSelectProject();
  if (!projectId) return;
  
  const envFiles = await findEnvFiles();
  
  if (envFiles.length === 0) {
    vscode.window.showInformationMessage('No .env files found in the workspace');
    return;
  }
  
  for (const filePath of envFiles) {
    await checkAndSyncFile(filePath, projectId);
  }
  
  vscode.commands.executeCommand('envsync.refreshHistory');
}

async function pushCommand(fileItem?: any) {
  if (!ensureLoggedIn()) return;
  
  let envFile: string | undefined;
  
  if (fileItem && fileItem.fileName) {
    const projectId = fileItem.projectId;
    const fileName = fileItem.fileName;
    
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    
    for (const folder of workspaceFolders) {
      const globPattern = new vscode.RelativePattern(folder, `**/${fileName}`);
      const files = await vscode.workspace.findFiles(globPattern, '**/node_modules/**');
      
      if (files.length > 0) {
        envFile = files[0].fsPath;
        break;
      }
    }
    
    if (!envFile) {
      vscode.window.showErrorMessage(`Could not find ${fileName} in workspace`);
      return;
    }
    
    await pushEnvFile(envFile, projectId);
  } else {
    envFile = await selectEnvFile();
    if (!envFile) return;
    
    const projectId = await getOrSelectProject();
    if (!projectId) return;
    
    await pushEnvFile(envFile, projectId);
  }
  
  vscode.commands.executeCommand('envsync.refreshHistory');
}

async function pullCommand() {
  if (!ensureLoggedIn()) return;
  
  const envFile = await selectEnvFile();
  if (!envFile) return;
  
  const projectId = await getOrSelectProject();
  if (!projectId) return;
  
  await pullEnvFile(envFile, projectId);
  
  vscode.commands.executeCommand('envsync.refreshHistory');
}

function updateStatusBar() {
  if (isLoggedIn) {
    statusBarItem.text = `$(sync) EnvSync: ${userEmail.split('@')[0]}`;
    statusBarItem.tooltip = `Logged in as ${userEmail}`;
  } else {
    statusBarItem.text = '$(sync) EnvSync';
    statusBarItem.tooltip = 'Not logged in';
  }
}

interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

async function fetchUserProjects(): Promise<Project[]> {
  if (!accessToken) return [];
  
  try {
    const response = await axios.get(`${getApiUrl()}/files`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data.projects || [];
  } catch {
    return [];
  }
}

async function getOrSelectProject(): Promise<string | null> {
  const savedId = getSavedProjectId();
  if (savedId) {
    return savedId;
  }
  
  return selectProject();
}

async function selectProject(): Promise<string | null> {
  const projects = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Loading projects...' },
    () => fetchUserProjects()
  );
  
  const username = userEmail.split('@')[0];
  const suggestedId = generateProjectId(username);
  
  const CREATE_NEW = '$(add) Create new project';
  
  const items: vscode.QuickPickItem[] = [
    { label: CREATE_NEW, description: `Suggested: ${suggestedId}` },
    ...projects.map(p => ({
      label: p.name,
      description: `Last updated: ${new Date(p.updated_at).toLocaleDateString()}`
    }))
  ];
  
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a project to sync with or create a new one',
    title: 'EnvSync: Choose Project'
  });
  
  if (!selected) return null;
  
  if (selected.label === CREATE_NEW) {
    const newName = await vscode.window.showInputBox({
      prompt: 'Enter project name',
      value: suggestedId,
      validateInput: (value) => {
        if (!value || value.trim().length < 2) {
          return 'Project name must be at least 2 characters';
        }
        if (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(value)) {
          return 'Project name can only contain letters, numbers, hyphens, underscores, and slashes';
        }
        return null;
      }
    });
    
    if (!newName) return null;
    
    saveProjectId(newName.trim());
    vscode.window.showInformationMessage(`Project "${newName.trim()}" configured for this workspace`);
    return newName.trim();
  }
  
  saveProjectId(selected.label);
  vscode.window.showInformationMessage(`Linked to project "${selected.label}"`);
  return selected.label;
}

function ensureLoggedIn(): boolean {
  if (!isLoggedIn || !accessToken) {
    vscode.window.showErrorMessage('Please login first');
    vscode.commands.executeCommand('envsync.login');
    return false;
  }
  return true;
}

async function selectEnvFile(): Promise<string | undefined> {
  const envFiles = await findEnvFiles();
  
  if (envFiles.length === 0) {
    vscode.window.showInformationMessage('No .env files found in the workspace');
    return undefined;
  }
  
  if (envFiles.length === 1) {
    return envFiles[0];
  }
  
  const relativePaths = envFiles.map(file => getRelativePath(file));
  
  const selectedPath = await vscode.window.showQuickPick(relativePaths, {
    placeHolder: 'Select an .env file'
  });
  
  if (!selectedPath) return undefined;
  
  const selectedIndex = relativePaths.indexOf(selectedPath);
  return envFiles[selectedIndex];
}

async function checkAndSyncFile(filePath: string, projectId: string) {
  if (!accessToken) return;
  
  try {
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const localHash = computeHash(fileContent);
    const localTimestamp = fs.statSync(filePath).mtime.getTime();
    
    try {
      const response = await axios.get(`${getApiUrl()}/files/${projectId}/${encodeURIComponent(fileName)}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (response.status === 200) {
        const data = response.data;
        const remoteHash = data.hash;
        const remoteTimestamp = new Date(data.updated_at).getTime();
        
        if (localHash !== remoteHash) {
          if (localTimestamp > remoteTimestamp) {
            const shouldPush = await vscode.window.showInformationMessage(
              `Your local ${fileName} is newer. Push to cloud?`,
              'Yes', 'No'
            );
            
            if (shouldPush === 'Yes') {
              await pushEnvFile(filePath, projectId);
            }
          } else {
            const shouldPull = await vscode.window.showInformationMessage(
              `Remote ${fileName} is newer. Pull from cloud?`,
              'Yes', 'No'
            );
            
            if (shouldPull === 'Yes') {
              await pullEnvFile(filePath, projectId);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        const shouldPush = await vscode.window.showInformationMessage(
          `${fileName} not found in cloud. Push it?`,
          'Yes', 'No'
        );
        
        if (shouldPush === 'Yes') {
          await pushEnvFile(filePath, projectId);
        }
      } else {
        throw error;
      }
    }
  } catch (error: any) {
    const message = error.response?.data?.message ?? error.message;
    vscode.window.showErrorMessage(`Error checking file ${path.basename(filePath)}: ${message}`);
  }
}

async function pushEnvFile(filePath: string, projectId: string) {
  if (!accessToken) return;
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    
    const passphrase = createPassphrase(userEmail, deviceId);
    const encryptedContent = encrypt(fileContent, passphrase);
    const fileHash = computeHash(fileContent);
    
    const response = await axios.put(
      `${getApiUrl()}/files/${projectId}/${encodeURIComponent(fileName)}`,
      {
        content: encryptedContent,
        hash: fileHash
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    
    if (response.status !== 200) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }
    
    vscode.window.showInformationMessage(`Successfully pushed ${fileName} to cloud`);
  } catch (error: any) {
    const message = error.response?.data?.message ?? error.message;
    vscode.window.showErrorMessage(`Error pushing file: ${message}`);
  }
}

async function pullEnvFile(filePath: string, projectId: string) {
  if (!accessToken) return;
  
  try {
    const fileName = path.basename(filePath);
    
    const response = await axios.get(
      `${getApiUrl()}/files/${projectId}/${encodeURIComponent(fileName)}/content`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    
    if (response.status !== 200) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    
    const data = response.data;
    
    if (!data || !data.content) {
      vscode.window.showInformationMessage(`No ${fileName} found in cloud`);
      return;
    }
    
    const passphrase = createPassphrase(userEmail, deviceId);
    let decryptedContent: string;
    
    if (isLegacyFormat(data.content)) {
      const legacyKey = legacyCrypto.SHA256(`${userEmail}-${deviceId}-envsync-key`).toString();
      const bytes = legacyCrypto.AES.decrypt(data.content, legacyKey);
      decryptedContent = bytes.toString(legacyCrypto.enc.Utf8);
    } else {
      decryptedContent = decrypt(data.content, passphrase);
    }
    
    if (data.hash) {
      const computedHash = computeHash(decryptedContent);
      if (computedHash !== data.hash) {
        throw new Error('Integrity check failed: content hash mismatch');
      }
    }
    
    const backupPath = `${filePath}.backup-${Date.now()}`;
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
    }
    
    fs.writeFileSync(filePath, decryptedContent, 'utf8');
    
    vscode.window.showInformationMessage(`Successfully pulled ${fileName} from cloud (backup at ${path.basename(backupPath)})`);
  } catch (error: any) {
    const message = error.response?.data?.message ?? error.message;
    vscode.window.showErrorMessage(`Error pulling file: ${message}`);
  }
}

const debounceTimers = new Map<string, NodeJS.Timeout>();

function setupFileWatchers(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('envsync');
  const autoSync = config.get<boolean>('autoSync') ?? false;
  
  if (!autoSync) return;
  
  const patterns = config.get<string[]>('filePatterns') ?? ['.env', '.env.local', '.env.development'];
  
  for (const pattern of patterns) {
    const fileWatcher = vscode.workspace.createFileSystemWatcher(`**/${pattern}`);
    
    fileWatcher.onDidChange(async (uri) => {
      if (!isLoggedIn) return;
      
      const filePath = uri.fsPath;
      if (path.basename(filePath).includes('.backup-')) return;
      
      const existingTimer = debounceTimers.get(filePath);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      const timer = setTimeout(async () => {
        debounceTimers.delete(filePath);
        const projectId = getSavedProjectId();
        if (!projectId) return;
        await checkAndSyncFile(filePath, projectId);
        vscode.commands.executeCommand('envsync.refreshHistory');
      }, 1000);
      
      debounceTimers.set(filePath, timer);
    });
    
    context.subscriptions.push(fileWatcher);
  }
}

export function deactivate() {}
