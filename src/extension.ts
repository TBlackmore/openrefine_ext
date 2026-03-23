import * as vscode from 'vscode';
import { OpenRefineServer } from './server/OpenRefineServer';
import { OpenRefineEditorProvider } from './editor/OpenRefineEditorProvider';
import { OpenRefineClient } from './api/OpenRefineClient';

let server: OpenRefineServer;
let client: OpenRefineClient;

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "openrefine-vscode" is now active!');

    // Initialize Server
    server = new OpenRefineServer();
    const port = vscode.workspace.getConfiguration('openrefine').get<number>('server.port', 3333);
    client = new OpenRefineClient(`http://127.0.0.1:${port}`);

    // Register Custom Editor Provider
    context.subscriptions.push(OpenRefineEditorProvider.register(context, server, client));
    
    // Register Save Command (triggers standard save)
    context.subscriptions.push(vscode.commands.registerCommand('openrefine.save', async () => {
         await vscode.commands.executeCommand('workbench.action.files.save');
    }));
}

export function deactivate() {
    if (server) {
        server.stop();
    }
}
