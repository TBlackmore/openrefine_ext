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
            // OpenRefine responds with a redirect to /project?project=<id> after creation.
            // We allow axios to follow redirects (default) so the final URL contains the project ID.
            // Alternatively, if the redirect is not followed, the Location header will contain it.
            const response = await axios.post(`${this.baseUrl}/command/core/create-project-from-upload`, form, {
                headers: {
                    ...form.getHeaders()
                },
                validateStatus: (status) => status >= 200 && status < 400
            });

            // Case 1: Axios returned a redirect response directly (Location header present).
            // This covers 301, 302, 303, 307, 308 and any other redirect status codes.
            const location = response.headers['location'];
            if (location) {
                const url = new URL(location, this.baseUrl);
                const projectId = url.searchParams.get('project');
                if (projectId) {
                    return projectId;
                }
            }

            // Case 2: Axios followed the redirect and landed on the project page.
            // In Node.js, response.request.path contains the path+query of the final request,
            // e.g. '/project?project=<id>'.
            const finalRequestPath: string | undefined = response.request?.path;
            if (finalRequestPath) {
                const url = new URL(finalRequestPath, this.baseUrl);
                const projectId = url.searchParams.get('project');
                if (projectId) {
                    return projectId;
                }
            }

            throw new Error('Could not extract project ID from response');

        } catch (error: any) {
            // Handle the case where axios throws due to an unexpected redirect or error response
            // but the Location header is still present and contains the project ID.
            const location = error.response?.headers?.['location'];
            if (location) {
                const url = new URL(location, this.baseUrl);
                const projectId = url.searchParams.get('project');
                if (projectId) {
                    return projectId;
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
