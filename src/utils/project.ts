import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export function getProjectIdentifier(workspaceFolder?: vscode.WorkspaceFolder): string {
  const folder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
  
  if (!folder) {
    throw new Error('No workspace folder open');
  }
  
  const packageJsonName = getPackageJsonName(folder.uri.fsPath);
  if (packageJsonName) {
    return packageJsonName;
  }
  
  const folderName = path.basename(folder.uri.fsPath);
  const pathHash = crypto
    .createHash('sha256')
    .update(folder.uri.fsPath)
    .digest('hex')
    .substring(0, 8);
  
  return `${folderName}-${pathHash}`;
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
