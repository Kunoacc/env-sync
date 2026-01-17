import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import { findEnvFiles } from './project';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('project utils', () => {
  it('finds env files matching defaults', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envsync-'));
    const workspaceFolder = { uri: { fsPath: tempDir }, name: 'temp' } as vscode.WorkspaceFolder;

    const envFile = path.join(tempDir, '.env');
    const appSettings = path.join(tempDir, 'appsettings.Development.json');
    const envrcFile = path.join(tempDir, '.envrc');

    fs.writeFileSync(envFile, 'HELLO=world');
    fs.writeFileSync(appSettings, '{"Hello": "World"}');
    fs.writeFileSync(envrcFile, 'export HELLO=world');

    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      configurable: true,
      get: () => [workspaceFolder]
    });
    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: () => undefined
    } as unknown as vscode.WorkspaceConfiguration);

    jest.spyOn(vscode.workspace, 'findFiles').mockImplementation(async (pattern) => {
      const glob = typeof pattern === 'string' ? pattern : pattern.pattern;
      if (glob.endsWith('**/.env')) {
        return [{ fsPath: envFile }] as vscode.Uri[];
      }
      if (glob.endsWith('**/.envrc')) {
        return [{ fsPath: envrcFile }] as vscode.Uri[];
      }
      if (glob.endsWith('**/appsettings.*.json')) {
        return [{ fsPath: appSettings }] as vscode.Uri[];
      }
      return [] as vscode.Uri[];
    });

    const files = await findEnvFiles();
    expect(files).toEqual(expect.arrayContaining([envFile, appSettings, envrcFile]));
  });
});
