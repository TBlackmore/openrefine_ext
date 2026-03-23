import axios from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

export class OpenRefineClient {
    private baseUrl: string;

    constructor(baseUrl: string = 'http://127.0.0.1:3333') {
        this.baseUrl = baseUrl;
    }

    public async getCsrfToken(): Promise<string> {
        try {
            const response = await axios.get(`${this.baseUrl}/command/core/get-csrf-token`);
            return response.data.token;
        } catch (error) {
            console.error('Failed to get CSRF token:', error);
            throw error;
        }
    }

    public async createProject(filePath: string): Promise<string> {
        const token = await this.getCsrfToken();
        const form = new FormData();
        
        form.append('project-name', path.basename(filePath, path.extname(filePath)));
        form.append('project-file', fs.createReadStream(filePath));
        form.append('csrf_token', token);

        try {
            // We need to prevent redirect to catch the project ID from the Location header
            const response = await axios.post(`${this.baseUrl}/command/core/create-project-from-upload`, form, {
                headers: {
                    ...form.getHeaders()
                },
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400 // Accept 3xx as success
            });

            // If it redirected (302), check Location header
            if (response.status === 302 || response.status === 301) {
                const location = response.headers['location'];
                if (location) {
                    const url = new URL(location, this.baseUrl);
                    const projectId = url.searchParams.get('project');
                    if (projectId) {
                        return projectId;
                    }
                }
            }
            
            throw new Error('Could not extract project ID from response');

        } catch (error: any) {
            // If axios followed redirect automatically (default behavior is to follow, but we set maxRedirects: 0)
            // If we somehow ended up at the project page, the URL in response.request.res.responseUrl might help
             if (error.response && (error.response.status === 302 || error.response.status === 301)) {
                  const location = error.response.headers['location'];
                  if (location) {
                    const url = new URL(location, this.baseUrl);
                    const projectId = url.searchParams.get('project');
                    if (projectId) {
                        return projectId;
                    }
                }
             }
            console.error('Failed to create project:', error);
            throw error;
        }
    }

    public async exportProject(projectId: string, format: string = 'csv'): Promise<string> {
        const token = await this.getCsrfToken();
        
        // Use export-rows
        const params = new URLSearchParams();
        params.append('project', projectId);
        params.append('format', format);
        params.append('engine', '{"facets":[],"mode":"row-based"}');
        params.append('csrf_token', token);

        try {
            const response = await axios.post(`${this.baseUrl}/command/core/export-rows/${projectId}.${format}`, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            return response.data;
        } catch (error) {
             console.error('Failed to export project:', error);
            throw error;
        }
    }
}
