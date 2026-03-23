import * as vscode from 'vscode';
import * as path from 'path';
import { OpenRefineServer } from '../server/OpenRefineServer';
import { OpenRefineClient } from '../api/OpenRefineClient';

class OpenRefineDocument implements vscode.CustomDocument {
    
    constructor(
        public readonly uri: vscode.Uri,
        public readonly projectId: string
    ) {}

    dispose(): void {
        // Maybe delete the project from OpenRefine server?
        // But we want to keep it if the user closes and reopens quickly?
        // For now, do nothing.
    }
}

export class OpenRefineEditorProvider implements vscode.CustomEditorProvider<OpenRefineDocument> {
    
    public static readonly viewType = 'openrefine.editor';
    private server: OpenRefineServer;
    private client: OpenRefineClient;

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<OpenRefineDocument>>();
    public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    constructor(private readonly context: vscode.ExtensionContext, server: OpenRefineServer, client: OpenRefineClient) {
        this.server = server;
        this.client = client;
    }

    public static register(context: vscode.ExtensionContext, server: OpenRefineServer, client: OpenRefineClient): vscode.Disposable {
        const provider = new OpenRefineEditorProvider(context, server, client);
        const providerRegistration = vscode.window.registerCustomEditorProvider(OpenRefineEditorProvider.viewType, provider);
        return providerRegistration;
    }

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<OpenRefineDocument> {
        
        // Ensure server is running
        const started = await this.server.start();
        if (!started) {
            throw new Error('OpenRefine server failed to start.');
        }

        // Upload file and create project
        // Note: This might be slow for large files. Should show progress.
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Importing into OpenRefine...",
            cancellable: false
        }, async (progress) => {
            try {
                const projectId = await this.client.createProject(uri.fsPath);
                return new OpenRefineDocument(uri, projectId);
            } catch (e) {
                vscode.window.showErrorMessage(`Could not extract project ID from response: ${e}`);
                throw e;
            }
        });
    }

    async resolveCustomEditor(
        document: OpenRefineDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken
    ): Promise<void> {
        
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: []
        };

        const projectId = document.projectId;
        const port = vscode.workspace.getConfiguration('openrefine').get<number>('server.port', 3333);
        const url = `http://127.0.0.1:${port}/project?project=${projectId}`;

        webviewPanel.webview.html = this.getHtmlForWebview(url);
        
        // Listen for save request from VS Code (e.g. valid for dirty documents, but here we don't track dirty state easily)
        // Actually, we should register a command openrefine.save making use of the active editor.
    }

    private getHtmlForWebview(url: string): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:*; style-src 'unsafe-inline';">
                <style>
                    body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
                    iframe { width: 100%; height: 100%; border: none; }
                </style>
            </head>
            <body>
                <iframe src="${url}"></iframe>
            </body>
            </html>
        `;
    }

    // Since we don't track edits in real-time (OpenRefine does internally),
    // we don't implement saveCustomDocument in a granular way.
    // Instead, we export the whole project on save.
    async saveCustomDocument(document: OpenRefineDocument, cancellation: vscode.CancellationToken): Promise<void> {
        await this.saveDocument(document);
    }

    async saveCustomDocumentAs(document: OpenRefineDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
        await this.saveDocument(document, destination);
    }

    async revertCustomDocument(document: OpenRefineDocument, cancellation: vscode.CancellationToken): Promise<void> {
        // Re-import?
    }

    async backupCustomDocument(document: OpenRefineDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
        return {
            id: document.projectId,
            delete: () => {}
        };
    }

    async saveDocument(document: OpenRefineDocument, destination?: vscode.Uri) {
         return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Saving from OpenRefine...",
            cancellable: false
        }, async (progress) => {
            try {
                // Determine format from extension
                const targetUri = destination || document.uri;
                const ext = path.extname(targetUri.fsPath).toLowerCase().replace('.', '');
                // Map extension to OpenRefine format defaults
                // csv -> csv, tsv -> tsv, json -> json?
                // OpenRefine formats: 'csv', 'tsv', 'xls', 'xlsx', 'ods', 'html'
                let format = 'csv';
                if (ext === 'tsv') format = 'tsv';
                if (ext === 'json') format = 'json'; // OpenRefine might export project metadata as JSON or JSON records. 'json' usually means records.
                
                const data = await this.client.exportProject(document.projectId, format);
                
                // Write data to file
                // data might be string or buffer. axios response.data is string by default for text.
                // We need to write it to destination.
                // vscode.workspace.fs.writeFile expects Uint8Array.
                const buffer = Buffer.from(data, 'utf8'); // encoding?
                await vscode.workspace.fs.writeFile(targetUri, buffer);

            } catch (e) {
                 vscode.window.showErrorMessage(`Failed to save file: ${e}`);
                 throw e;
            }
        });
    }
}
