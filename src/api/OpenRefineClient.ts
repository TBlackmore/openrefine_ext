import axios from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

export class OpenRefineClient {
    private baseUrl: string;

    constructor(baseUrl: string = 'http://127.0.0.1:3333') {
        this.baseUrl = baseUrl;
    }

    /**
     * Fetches a CSRF token from OpenRefine (available since OpenRefine 3.4).
     * Returns null if the server does not support CSRF tokens (older versions).
     */
    public async getCsrfToken(): Promise<string | null> {
        try {
            const response = await axios.get(`${this.baseUrl}/command/core/get-csrf-token`);
            return response.data.token ?? null;
        } catch (error) {
            // The CSRF token endpoint was added in OpenRefine 3.4.
            // Older versions return a 500 — fall back to no token.
            console.warn('CSRF token endpoint unavailable (OpenRefine < 3.4?), proceeding without it.');
            return null;
        }
    }

    public async createProject(filePath: string): Promise<string> {
        const token = await this.getCsrfToken();
        const form = new FormData();
        
        form.append('project-name', path.basename(filePath, path.extname(filePath)));
        form.append('project-file', fs.createReadStream(filePath));
        if (token) {
            form.append('csrf_token', token);
        }

        try {
            // Allow axios to follow redirects so we can extract the project ID
            // from the final URL. OpenRefine responds with a 302 redirect to
            // /project?project=<id> upon successful project creation.
            const response = await axios.post(`${this.baseUrl}/command/core/create-project-from-upload`, form, {
                headers: {
                    ...form.getHeaders()
                },
                maxRedirects: 5,
                validateStatus: (status) => status >= 200 && status < 400
            });

            // Case 1: Redirect was followed — extract project ID from the final URL.
            // axios (via follow-redirects) exposes the final URL on response.request.res.responseUrl.
            const finalUrl: string | undefined = (response.request as any)?.res?.responseUrl;
            if (finalUrl) {
                const url = new URL(finalUrl);
                const projectId = url.searchParams.get('project');
                if (projectId) {
                    return projectId;
                }
            }

            // Case 2: Redirect was not followed — check the Location header directly.
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

        } catch (error: unknown) {
            // Case 3: axios threw on redirect (e.g. maxRedirects exceeded or network error).
            // Check if the error response itself is a redirect with a Location header.
            if (
                error !== null &&
                typeof error === 'object' &&
                'response' in error &&
                error.response !== null &&
                typeof error.response === 'object' &&
                'status' in error.response &&
                'headers' in error.response &&
                (error.response.status === 302 || error.response.status === 301)
            ) {
                const headers = error.response.headers as Record<string, string | undefined>;
                const location = headers['location'];
                if (location) {
                    const url = new URL(location, this.baseUrl);
                    const projectId = url.searchParams.get('project');
                    if (projectId) {
                        return projectId;
                    }
                }
            }
            console.error('Failed to create project:', error);
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    public async exportProject(projectId: string, format: string = 'csv'): Promise<string> {
        const token = await this.getCsrfToken();
        
        // Use export-rows
        const params = new URLSearchParams();
        params.append('project', projectId);
        params.append('format', format);
        params.append('engine', '{"facets":[],"mode":"row-based"}');
        if (token) {
            params.append('csrf_token', token);
        }

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
