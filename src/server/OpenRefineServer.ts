import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

export class OpenRefineServer {
    private process: cp.ChildProcess | undefined;
    private outputChannel: vscode.OutputChannel;
    private port: number;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('OpenRefine Server');
        this.port = vscode.workspace.getConfiguration('openrefine').get<number>('server.port', 3333);
    }

    public async start(): Promise<boolean> {
        this.outputChannel.appendLine('Checking if OpenRefine is already running...');
        if (await this.isServerRunning()) {
            this.outputChannel.appendLine('OpenRefine is already running.');
            return true;
        }

        const javaPath = this.getJavaPath();
        if (!javaPath) {
            vscode.window.showErrorMessage('Java is not installed or not in PATH. Please install Java to run OpenRefine.');
            return false;
        }

        const refinePath = this.getRefinePath();
        if (!refinePath || !fs.existsSync(refinePath)) {
            const selection = await vscode.window.showErrorMessage(
                'OpenRefine executable not found. Please set "openrefine.installPath" in settings.',
                'Open Settings'
            );
            if (selection === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'openrefine.installPath');
            }
            return false;
        }

        this.outputChannel.appendLine(`Starting OpenRefine from: ${refinePath}`);
        
        // Arguments for headless mode
        // Note: The 'refine' script might need different handling than directly invoking java
        // But usually, one runs the 'refine' shell script/bat file.
        // We can pass -Drefine.headless=true to the script if it forwards args, 
        // or set environment variable REFINE_HEADLESS=true depending on the script version.
        // As a safe bet, we invoke the script.
        
        const env = { ...process.env, REFINE_HEADLESS: 'true', REFINE_PORT: this.port.toString() };

        // For Windows, it might be refine.bat, for Linux/Mac it's refine
        const isWindows = process.platform === 'win32';
        
        try {
            this.process = cp.spawn(refinePath, [], {
                env,
                shell: isWindows // needed for bat files
            });

            this.process.stdout?.on('data', (data) => {
                this.outputChannel.append(`[stdout] ${data}`);
            });

            this.process.stderr?.on('data', (data) => {
                this.outputChannel.append(`[stderr] ${data}`);
            });

            this.process.on('error', (error) => {
                this.outputChannel.appendLine(`Failed to start OpenRefine: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to start OpenRefine: ${error.message}`);
            });
            
            this.process.on('close', (code) => {
                 this.outputChannel.appendLine(`OpenRefine process exited with code ${code}`);
                 this.process = undefined;
            });

            // Wait for the server to be ready
            return await this.waitForServer(10000); // Wait up to 10 seconds

        } catch (e) {
             this.outputChannel.appendLine(`Error spawning process: ${e}`);
             return false;
        }
    }

    public stop() {
        if (this.process) {
            this.outputChannel.appendLine('Stopping OpenRefine server...');
            this.process.kill();
            this.process = undefined;
        }
    }

    private getJavaPath(): string | null {
        // Check configuration first
        const configPath = vscode.workspace.getConfiguration('openrefine').get<string>('javaPath');
        if (configPath && fs.existsSync(configPath)) {
            return configPath;
        }

        // Check if java is in PATH
        try {
            cp.execSync('java -version');
            return 'java';
        } catch (e) {
            return null;
        }
    }

    private getRefinePath(): string | null {
        const configPath = vscode.workspace.getConfiguration('openrefine').get<string>('installPath');
         if (configPath) {
            return configPath;
        }
        return null; // Prompt user to set it
    }

    private async isServerRunning(): Promise<boolean> {
        return new Promise((resolve) => {
            const req = http.get(`http://127.0.0.1:${this.port}/`, (res) => {
                resolve(true); // If we get a response, it's running
            });
            req.on('error', () => {
                resolve(false);
            });
            req.end();
        });
    }

    private async waitForServer(timeout: number): Promise<boolean> {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (await this.isServerRunning()) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return false;
    }
}
