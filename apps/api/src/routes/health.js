import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'api',
    timestamp: new Date().toISOString(),
    features: {
      model3dChunkedUpload: true,
      modelChunkSize: 1048576,
    },
  });
});
