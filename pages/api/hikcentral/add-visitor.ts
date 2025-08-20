import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import https from 'https';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, cpf, email, phone, validFrom, validTo } = req.body;

  if (!name || !cpf) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['name', 'cpf']
    });
  }

  try {
    // Configure HTTPS agent to accept self-signed certificates
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });

    // HikCentral Professional Visitor API
    const baseURL = 'https://127.0.0.1';
    
    // Create visitor data structure for HikCentral
    const visitorData = {
      visitorName: name,
      visitorIdCard: cpf.replace(/\D/g, ''), // Remove non-digits
      phoneNo: phone,
      email: email,
      visitorCompany: 'Mega Feira 2025',
      visitPurpose: 'Evento',
      validTimes: 1, // Number of times visitor can enter
      beginTime: validFrom || new Date().toISOString(),
      endTime: validTo || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days default
      // Auto approve if configured
      visitorStatus: 1 // 0: pending, 1: approved
    };

    console.log('Adding visitor to HikCentral:', visitorData);

    // Try to add visitor via web API
    const response = await axios.post(
      `${baseURL}/api/visitor/v1/visitor/add`,
      visitorData,
      {
        httpsAgent,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          // Basic auth if needed
          'Authorization': 'Basic ' + Buffer.from('admin:Index2016').toString('base64')
        },
        timeout: 30000
      }
    );

    console.log('Visitor added successfully:', response.data);

    return res.status(200).json({
      success: true,
      message: 'Visitor added to HikCentral Professional',
      data: response.data,
      visitorInfo: {
        name: name,
        cpf: cpf,
        status: 'approved'
      }
    });

  } catch (error: any) {
    console.error('Failed to add visitor:', error);
    
    // Check if it's a connection error
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Cannot connect to HikCentral Professional',
        details: 'Make sure HikCentral is running on https://127.0.0.1',
        suggestion: 'You may need to add the visitor manually through the HikCentral interface'
      });
    }
    
    // Check for auth errors
    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed',
        details: 'Check HikCentral credentials'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Failed to add visitor',
      details: error.message,
      response: error.response?.data
    });
  }
}