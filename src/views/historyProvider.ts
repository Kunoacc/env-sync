import * as vscode from 'vscode';
import * as path from 'path';
import axios from 'axios';
import { format } from 'date-fns';
import { getSavedProjectId, findEnvFiles } from '../utils/project';
import { decrypt, isLegacyFormat, computeHash } from '../utils/crypto';
import { machineIdSync } from 'node-machine-id';
import * as legacyCrypto from 'crypto-js';

function getApiUrl(): string {
  const config = vscode.workspace.getConfiguration('envsync');
  return config.get<string>('apiUrl') ?? 'https://bryhohgvcdntkgakggzb.supabase.co/functions/v1';
}

export class HistoryItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: 'file' | 'version',
    public readonly projectId: string,
    public readonly fileName: string,
    public readonly versionId?: string,
    public readonly timestamp?: Date,
    public readonly isCurrent?: boolean
  ) {
    super(label, collapsibleState);

    if (type === 'file') {
      this.iconPath = new vscode.ThemeIcon('file-text');
      this.contextValue = 'envFile';
      this.description = `Last synced: ${timestamp ? format(timestamp, 'MMM d, yyyy h:mm a') : 'Never'}`;
    } else {
      this.iconPath = isCurrent 
        ? new vscode.ThemeIcon('check') 
        : new vscode.ThemeIcon('history');
      this.contextValue = isCurrent ? 'currentVersion' : 'historicalVersion';
      this.description = timestamp ? format(timestamp, 'MMM d, yyyy h:mm a') : '';
      
      if (!isCurrent) {
        this.command = {
          command: 'envsync.restoreVersion',
          title: 'Restore Version',
          arguments: [this]
        };
      }
    }
  }
}

export class HistoryProvider implements vscode.TreeDataProvider<HistoryItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<HistoryItem | undefined | null | void> = new vscode.EventEmitter<HistoryItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<HistoryItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private accessToken: string | null) {}

  updateAccessToken(token: string | null) {
    this.accessToken = token;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: HistoryItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: HistoryItem): Promise<HistoryItem[]> {
    if (!this.accessToken) {
      return [new HistoryItem(
        'Please log in to view sync history',
        vscode.TreeItemCollapsibleState.None,
        'file',
        '',
        ''
      )];
    }

    if (!vscode.workspace.workspaceFolders) {
      return [new HistoryItem(
        'No workspace folder open',
        vscode.TreeItemCollapsibleState.None,
        'file',
        '',
        ''
      )];
    }

    try {
      if (!element) {
        return await this.getEnvFiles();
      } else if (element.type === 'file') {
        return await this.getFileVersions(element.projectId, element.fileName);
      }
    } catch (error) {
      console.error('Error getting history data:', error);
      vscode.window.showErrorMessage('Failed to load sync history');
    }

    return [];
  }

  private async getEnvFiles(): Promise<HistoryItem[]> {
    const projectId = getSavedProjectId();
    
    if (!projectId) {
      return [new HistoryItem(
        'Run "EnvSync: Push" to configure project',
        vscode.TreeItemCollapsibleState.None,
        'file',
        '',
        ''
      )];
    }
    
    const files = await findEnvFiles();
    
    if (files.length === 0) {
      return [new HistoryItem(
        'No .env files found in workspace',
        vscode.TreeItemCollapsibleState.None,
        'file',
        projectId,
        ''
      )];
    }
    
    const items: HistoryItem[] = [];
    
    for (const filePath of files) {
      const fileName = path.basename(filePath);
      
      try {
        const response = await axios.get(
          `${getApiUrl()}/files/${projectId}/${encodeURIComponent(fileName)}`,
          { headers: { Authorization: `Bearer ${this.accessToken}` } }
        );
        
        const lastSyncDate = response.data.updated_at 
          ? new Date(response.data.updated_at)
          : undefined;
        
        items.push(new HistoryItem(
          fileName,
          vscode.TreeItemCollapsibleState.Collapsed,
          'file',
          projectId,
          fileName,
          undefined,
          lastSyncDate
        ));
      } catch {
        items.push(new HistoryItem(
          fileName,
          vscode.TreeItemCollapsibleState.None,
          'file',
          projectId,
          fileName,
          undefined,
          undefined
        ));
      }
    }
    
    return items;
  }

  private async getFileVersions(projectId: string, fileName: string): Promise<HistoryItem[]> {
    try {
      const response = await axios.get(
        `${getApiUrl()}/files/${projectId}/${encodeURIComponent(fileName)}/history`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      
      if (!response.data.history || response.data.history.length === 0) {
        return [new HistoryItem(
          'No version history available',
          vscode.TreeItemCollapsibleState.None,
          'version',
          projectId,
          fileName
        )];
      }
      
      return response.data.history.map((version: any) => {
        return new HistoryItem(
          version.isCurrent ? 'Current Version' : `Version from ${format(new Date(version.timestamp), 'MMM d, yyyy h:mm a')}`,
          vscode.TreeItemCollapsibleState.None,
          'version',
          projectId,
          fileName,
          version.id,
          new Date(version.timestamp),
          version.isCurrent
        );
      });
    } catch (error) {
      console.error('Error getting file versions:', error);
      throw error;
    }
  }
}

export function registerHistoryView(context: vscode.ExtensionContext) {
  const getStoredToken = async (): Promise<string | null> => {
    return await context.secrets.get('envsync.accessToken') ?? null;
  };

  let initialToken: string | null = null;
  
  const historyProvider = new HistoryProvider(initialToken);
  
  getStoredToken().then(token => {
    historyProvider.updateAccessToken(token);
  });
  
  const historyView = vscode.window.createTreeView('envsyncHistory', {
    treeDataProvider: historyProvider,
    showCollapseAll: true
  });
  
  const restoreVersionCommand = vscode.commands.registerCommand('envsync.restoreVersion', async (item: HistoryItem) => {
    if (!item || !item.versionId) return;
    
    try {
      const accessToken = await context.secrets.get('envsync.accessToken');
      
      if (!accessToken) {
        vscode.window.showErrorMessage('Please login first');
        return;
      }
      
      const choice = await vscode.window.showWarningMessage(
        `Restore this version of ${item.fileName}?`,
        { modal: true },
        'Restore'
      );
      
      if (choice !== 'Restore') return;
      
      const response = await axios.post(
        `${getApiUrl()}/files/${item.projectId}/${encodeURIComponent(item.fileName)}/restore`,
        { versionId: item.versionId },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      
      if (response.data.success) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;
        
        const userEmail = context.globalState.get<string>('envsync.userEmail') ?? '';
        const deviceId = machineIdSync();
        
        let decryptedContent: string;
        const encryptedContent = response.data.content;
        
        if (isLegacyFormat(encryptedContent)) {
          const legacyKey = legacyCrypto.SHA256(`${userEmail}-${deviceId}-envsync-key`).toString();
          const bytes = legacyCrypto.AES.decrypt(encryptedContent, legacyKey);
          decryptedContent = bytes.toString(legacyCrypto.enc.Utf8);
        } else {
          const passphrase = `${userEmail}:${deviceId}:envsync-v1`;
          decryptedContent = decrypt(encryptedContent, passphrase);
        }
        
        if (response.data.hash) {
          const computedHash = computeHash(decryptedContent);
          if (computedHash !== response.data.hash) {
            throw new Error('Integrity check failed: content hash mismatch');
          }
        }
        
        for (const folder of workspaceFolders) {
          const globPattern = new vscode.RelativePattern(folder, `**/${item.fileName}`);
          const files = await vscode.workspace.findFiles(globPattern, '**/node_modules/**');
          
          if (files.length > 0) {
            await vscode.workspace.fs.writeFile(
              files[0],
              Buffer.from(decryptedContent, 'utf8')
            );
            
            await vscode.window.showTextDocument(files[0]);
            
            vscode.window.showInformationMessage(`Restored ${item.fileName} to version from ${format(item.timestamp!, 'MMM d, yyyy h:mm a')}`);
            
            historyProvider.refresh();
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error restoring version:', error);
      vscode.window.showErrorMessage(`Failed to restore version: ${(error as any).message}`);
    }
  });
  
  const refreshCommand = vscode.commands.registerCommand('envsync.refreshHistory', () => {
    historyProvider.refresh();
  });
  
  context.subscriptions.push(
    historyView,
    restoreVersionCommand,
    refreshCommand,
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('envsync.filePatterns')) {
        historyProvider.refresh();
      }
    })
  );
  
  return historyProvider;
}
