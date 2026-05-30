import { describe, it, expect, beforeEach } from 'vitest';
import { EmbeddingService } from './embedding';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(() => {
    service = new EmbeddingService();
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vector = [0.1, 0.2, 0.3, 0.4];
      const similarity = service.cosineSimilarity(vector, vector);
      expect(similarity).toBeCloseTo(1, 10);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const similarity = service.cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(0, 10);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      const similarity = service.cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(-1, 10);
    });

    it('should handle multi-dimensional vectors', () => {
      const a = [0.5, 0.5, 0.5, 0.5];
      const b = [0.5, 0.5, 0.5, 0.5];
      const similarity = service.cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(1, 10);
    });

    it('should throw error for vectors of different lengths', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(() => service.cosineSimilarity(a, b)).toThrow('Vectors must have the same dimension');
    });

    it('should return 0 for zero vectors', () => {
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const similarity = service.cosineSimilarity(a, b);
      expect(similarity).toBe(0);
    });
  });

  describe('cache functionality', () => {
    it('should clear cache successfully', () => {
      service.clearCache();
      // No error means success
      expect(true).toBe(true);
    });

    it('should allow creation with custom baseUrl', () => {
      const customService = new EmbeddingService({
        baseUrl: 'https://custom.api.endpoint.com/v1',
      });
      expect(customService).toBeDefined();
    });

    it('should allow creation with custom apiKey', () => {
      const customService = new EmbeddingService({
        apiKey: 'test-key',
      });
      expect(customService).toBeDefined();
    });

    it('should allow creation with both custom apiKey and baseUrl', () => {
      const customService = new EmbeddingService({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.endpoint.com/v1',
      });
      expect(customService).toBeDefined();
    });
  });

  describe('retrieveTopK', () => {
    it('should retrieve top-k results', async () => {
      // Mock getEmbedding to return predefined vectors
      const mockEmbeddings: Record<string, number[]> = {
        'hello': [1, 0, 0],
        'hello world': [1, 0, 0],
        'goodbye world': [-1, 0, 0],
        'hello there': [0.8, 0.1, 0.1],
      };

      const getEmbedding = async (text: string): Promise<number[]> => {
        return mockEmbeddings[text] || [0, 0, 0];
      };

      const corpus = [
        { id: '1', text: 'hello world' },
        { id: '2', text: 'goodbye world' },
        { id: '3', text: 'hello there' },
      ];

      const results = await service.retrieveTopK('hello', corpus, 2, getEmbedding);

      expect(results).toHaveLength(2);
      // 'hello world' should be top result (identical embedding to 'hello')
      expect(results[0].id).toBe('1');
      expect(results[0].score).toBeCloseTo(1, 5);
    });
  });
});