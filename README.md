# OpenRefine for VS Code

This extension integrates OpenRefine into Visual Studio Code, allowing you to clean and transform data files directly within your editor.

## Features

- **Open CSV, TSV, and JSON files** in OpenRefine.
- **Embedded Webview**: Uses OpenRefine's powerful interface inside VS Code.
- **Save Changes**: Exports cleaned data back to the original file.
- **Project Isolation**: Automatically creates a temporary OpenRefine project for each file.

## Requirements

- **Java Runtime Environment (JRE)**: OpenRefine requires Java to run.
- **OpenRefine Installation**: You must have OpenRefine installed on your system.
  - Download from: [https://openrefine.org/download.html](https://openrefine.org/download.html)

## Configuration

1. Set `openrefine.installPath` to the path of your OpenRefine executable.
   - **Windows**: Path to `refine.bat` or `openrefine.exe`.
   - **Linux/Mac**: Path to `refine` shell script.
2. (Optional) Set `openrefine.javaPath` if Java is not in your system PATH.
3. (Optional) Set `openrefine.server.port` (default: 3333).

## Usage

1. Open a `.csv`, `.tsv`, or `.json` file in VS Code.
2. Right-click the file and select **Open with...**.
3. Choose **OpenRefine**.
4. The file will be imported into a new OpenRefine project.
5. Perform your data cleaning operations.
6. To save changes, use **File > Save** (or `Ctrl+S`). This will export the current state back to the original file.

## Troubleshooting

- **Server not starting?**
  - Verify Java installation.
  - Check the `Output` panel -> "OpenRefine Server" channel for logs.
  - Ensure port 3333 is free.

- **Import failed?**
  - Check if the file is valid CSV/JSON.
  - Check OpenRefine logs.
