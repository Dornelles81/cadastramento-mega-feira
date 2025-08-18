import { NextApiRequest, NextApiResponse } from 'next'

// Azure Face API configuration
const AZURE_FACE_ENDPOINT = process.env.AZURE_FACE_ENDPOINT || 'https://YOUR-RESOURCE-NAME.cognitiveservices.azure.com'
const AZURE_FACE_KEY = process.env.AZURE_FACE_KEY || 'your-api-key-here'

// Detection parameters
const DETECTION_MODEL = 'detection_03'
const RECOGNITION_MODEL = 'recognition_04'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { imageData } = req.body

    if (!imageData) {
      return res.status(400).json({ error: 'Image data is required' })
    }

    // Check if Azure credentials are configured
    if (!AZURE_FACE_KEY || AZURE_FACE_KEY === 'your-api-key-here') {
      console.warn('Azure Face API not configured, returning mock data')
      
      // Return mock data for development
      return res.status(200).json([{
        faceId: 'mock-face-' + Date.now(),
        faceRectangle: {
          top: 150,
          left: 200,
          width: 200,
          height: 200
        },
        faceAttributes: {
          age: 25,
          gender: 'neutral',
          smile: 0.8,
          glasses: 'NoGlasses',
          emotion: {
            happiness: 0.8,
            neutral: 0.2
          },
          blur: {
            blurLevel: 'low',
            value: 0.1
          },
          exposure: {
            exposureLevel: 'goodExposure',
            value: 0.5
          },
          noise: {
            noiseLevel: 'low',
            value: 0.1
          },
          occlusion: {
            foreheadOccluded: false,
            eyeOccluded: false,
            mouthOccluded: false
          }
        },
        recognitionModel: RECOGNITION_MODEL,
        faceQuality: {
          score: 0.9,
          isGoodQuality: true
        }
      }])
    }

    // Convert base64 to binary
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const imageBuffer = Buffer.from(base64Data, 'base64')

    // Call Azure Face API
    const detectUrl = `${AZURE_FACE_ENDPOINT}/face/v1.0/detect`
    const params = new URLSearchParams({
      returnFaceId: 'true',
      returnFaceLandmarks: 'false',
      returnFaceAttributes: 'age,gender,smile,facialHair,glasses,emotion,blur,exposure,noise,makeup,accessories,occlusion,headPose',
      recognitionModel: RECOGNITION_MODEL,
      returnRecognitionModel: 'true',
      detectionModel: DETECTION_MODEL
    })

    const response = await fetch(`${detectUrl}?${params}`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_FACE_KEY,
        'Content-Type': 'application/octet-stream'
      },
      body: imageBuffer
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Azure Face API error:', response.status, errorText)
      
      // Handle specific Azure errors
      if (response.status === 401) {
        return res.status(401).json({ 
          error: 'Azure Face API authentication failed. Please check your API key.' 
        })
      } else if (response.status === 429) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Please try again later.' 
        })
      }
      
      return res.status(500).json({ 
        error: 'Face detection failed',
        details: errorText 
      })
    }

    const faces = await response.json()

    // Add quality assessment
    const facesWithQuality = faces.map((face: any) => {
      // Calculate quality score based on various factors
      let qualityScore = 1.0
      
      // Check blur
      if (face.faceAttributes?.blur?.value > 0.7) qualityScore -= 0.3
      else if (face.faceAttributes?.blur?.value > 0.4) qualityScore -= 0.1
      
      // Check exposure
      if (face.faceAttributes?.exposure?.exposureLevel !== 'goodExposure') qualityScore -= 0.2
      
      // Check noise
      if (face.faceAttributes?.noise?.value > 0.7) qualityScore -= 0.2
      else if (face.faceAttributes?.noise?.value > 0.4) qualityScore -= 0.1
      
      // Check occlusion
      if (face.faceAttributes?.occlusion?.foreheadOccluded) qualityScore -= 0.1
      if (face.faceAttributes?.occlusion?.eyeOccluded) qualityScore -= 0.3
      if (face.faceAttributes?.occlusion?.mouthOccluded) qualityScore -= 0.1
      
      // Check face size (should be at least 200x200)
      if (face.faceRectangle.width < 200 || face.faceRectangle.height < 200) {
        qualityScore -= 0.2
      }

      return {
        ...face,
        faceQuality: {
          score: Math.max(0, Math.min(1, qualityScore)),
          isGoodQuality: qualityScore >= 0.7
        }
      }
    })

    return res.status(200).json(facesWithQuality)
  } catch (error) {
    console.error('Face detection error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
}