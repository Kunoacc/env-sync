const workspaceFoldersValue: Array<{ uri: { fsPath: string }; name: string }> = [];

export const workspace = {
  get workspaceFolders() {
    return workspaceFoldersValue;
  },
  set workspaceFolders(value: Array<{ uri: { fsPath: string }; name: string }>) {
    workspaceFoldersValue.length = 0;
    workspaceFoldersValue.push(...value);
  },
  getConfiguration: () => ({
    get: () => undefined
  }),
  findFiles: async () => [] as Array<{ fsPath: string }>
};

export type WorkspaceFolder = { uri: { fsPath: string }; name: string };
export type WorkspaceConfiguration = { get: (key: string) => unknown };
export type Uri = { fsPath: string };
export class RelativePattern {
  pattern: string;

  constructor(_: { uri: { fsPath: string }; name: string }, pattern: string) {
    this.pattern = pattern;
  }
}
