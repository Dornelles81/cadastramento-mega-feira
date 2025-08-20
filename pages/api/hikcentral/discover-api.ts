import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import https from 'https';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const httpsAgent = new https.Agent({
    rejectUnauthorized: false
  });

  const baseURL = 'https://127.0.0.1';
  const results: any = {};

  // Common API paths to test
  const apiPaths = [
    // OpenAPI/Swagger endpoints
    '/swagger',
    '/swagger-ui',
    '/swagger.json',
    '/api-docs',
    '/api/swagger.json',
    '/v2/api-docs',
    '/v3/api-docs',
    
    // HikCentral specific
    '/api',
    '/api/v1',
    '/api/v2',
    '/artemis',
    '/artemis/api',
    '/ISAPI',
    '/SDK',
    
    // Web portal endpoints
    '/portal',
    '/portal/api',
    '/portal/rest',
    '/web',
    '/web/api',
    
    // Authentication endpoints
    '/auth',
    '/login',
    '/api/auth',
    '/api/login',
    '/portal/login',
    
    // Person/Visitor management
    '/api/person',
    '/api/visitor',
    '/api/access',
    '/api/resource',
    '/portal/person',
    '/portal/visitor',
    
    // Version/Info endpoints
    '/version',
    '/api/version',
    '/api/info',
    '/system/info',
    '/api/system/info'
  ];

  console.log('Starting HikCentral API discovery...');

  for (const path of apiPaths) {
    try {
      const url = `${baseURL}${path}`;
      const response = await axios.get(url, {
        httpsAgent,
        timeout: 5000,
        validateStatus: () => true, // Accept any status code
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json, text/html, */*'
        }
      });

      results[path] = {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'content-type': response.headers['content-type'],
          'server': response.headers['server']
        },
        hasContent: response.data ? true : false,
        contentPreview: response.data ? 
          (typeof response.data === 'string' ? 
            response.data.substring(0, 200) : 
            JSON.stringify(response.data).substring(0, 200)) : null
      };

      // Check for redirects
      if (response.status === 301 || response.status === 302) {
        results[path].redirect = response.headers['location'];
      }

      // Special handling for successful endpoints
      if (response.status === 200) {
        console.log(`✓ Found active endpoint: ${path}`);
        
        // Check if it's an API documentation endpoint
        if (path.includes('swagger') || path.includes('api-docs')) {
          results[path].apiDocs = true;
        }
      }

    } catch (error: any) {
      results[path] = {
        status: 'error',
        error: error.code || error.message
      };
    }
  }

  // Analyze results
  const analysis = {
    totalTested: apiPaths.length,
    accessible: Object.keys(results).filter(k => results[k].status === 200).length,
    authRequired: Object.keys(results).filter(k => results[k].status === 401 || results[k].status === 403).length,
    notFound: Object.keys(results).filter(k => results[k].status === 404).length,
    errors: Object.keys(results).filter(k => results[k].status === 'error').length
  };

  // Find best candidates for API
  const apiCandidates = Object.keys(results)
    .filter(k => results[k].status === 200 || results[k].status === 401)
    .map(k => ({ path: k, ...results[k] }));

  return res.status(200).json({
    success: true,
    baseURL: baseURL,
    analysis: analysis,
    apiCandidates: apiCandidates,
    allResults: results,
    recommendations: [
      'Look for endpoints returning 200 (accessible) or 401 (auth required)',
      'Check redirect locations for actual API paths',
      'Endpoints with JSON content-type are likely API endpoints',
      'Try authenticating with credentials to access protected endpoints'
    ],
    timestamp: new Date().toISOString()
  });
}