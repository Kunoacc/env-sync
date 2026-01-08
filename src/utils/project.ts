import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const CONFIG_FILE = '.envsync.json';

export interface EnvSyncConfig {
  projectId: string;
}

export function getConfigPath(workspaceFolder?: vscode.WorkspaceFolder): string {
  const folder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('No workspace folder open');
  }
  return path.join(folder.uri.fsPath, CONFIG_FILE);
}

export function readConfig(workspaceFolder?: vscode.WorkspaceFolder): EnvSyncConfig | null {
  try {
    const configPath = getConfigPath(workspaceFolder);
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function writeConfig(config: EnvSyncConfig, workspaceFolder?: vscode.WorkspaceFolder): void {
  const configPath = getConfigPath(workspaceFolder);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

export function getSavedProjectId(workspaceFolder?: vscode.WorkspaceFolder): string | null {
  const config = readConfig(workspaceFolder);
  return config?.projectId ?? null;
}

export function saveProjectId(projectId: string, workspaceFolder?: vscode.WorkspaceFolder): void {
  writeConfig({ projectId }, workspaceFolder);
}

export function generateProjectId(username: string, workspaceFolder?: vscode.WorkspaceFolder): string {
  const folder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('No workspace folder open');
  }
  
  const projectName = getPackageJsonName(folder.uri.fsPath) ?? path.basename(folder.uri.fsPath);
  const sanitized = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  
  return `${username}/${sanitized}`;
}

function getPackageJsonName(folderPath: string): string | null {
  try {
    const packageJsonPath = path.join(folderPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }
    const content = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(content);
    if (typeof packageJson.name === 'string' && packageJson.name.trim()) {
      return packageJson.name.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export async function findEnvFiles(patterns?: string[]): Promise<string[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return [];
  
  const config = vscode.workspace.getConfiguration('envsync');
  const filePatterns = patterns ?? config.get<string[]>('filePatterns') ?? ['.env', '.env.local', '.env.development'];
  
  const envFiles: string[] = [];
  
  for (const folder of workspaceFolders) {
    for (const pattern of filePatterns) {
      const globPattern = new vscode.RelativePattern(folder, `**/${pattern}`);
      const files = await vscode.workspace.findFiles(globPattern, '**/node_modules/**');
      
      for (const file of files) {
        envFiles.push(file.fsPath);
      }
    }
  }
  
  return envFiles;
}

export function getRelativePath(filePath: string): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return filePath;
  
  for (const folder of workspaceFolders) {
    const relativePath = path.relative(folder.uri.fsPath, filePath);
    if (!relativePath.startsWith('..')) {
      return `${folder.name}: ${relativePath}`;
    }
  }
  
  return filePath;
}
