export interface EmbeddingResult {
  vector: number[];
  text: string;
}

export interface EmbeddingConfig {
  apiKey?: string;
  baseUrl?: string;
}

export class EmbeddingService {
  private apiKey?: string;
  private baseUrl: string;
  private cache: Map<string, number[]>;
  private model: string;

  constructor(config: EmbeddingConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.cache = new Map();
    this.model = 'text-embedding-3-small';
  }

  /**
   * Convert text to embedding vector
   */
  async embed(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = text;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const apiKey = this.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('API key not set. Provide apiKey in config or set OPENAI_API_KEY environment variable.');
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { data: [{ embedding: number[] }] };
    const embedding = data.data[0].embedding;

    // Cache the result
    this.cache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Batch embed multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // Check cache for each text and collect uncached ones
    const results: number[][] = [];
    const uncachedTexts: { index: number; text: string }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cacheKey = texts[i];
      if (this.cache.has(cacheKey)) {
        results[i] = this.cache.get(cacheKey)!;
      } else {
        uncachedTexts.push({ index: i, text: texts[i] });
      }
    }

    // If all were cached, return early
    if (uncachedTexts.length === 0) {
      return results;
    }

    const apiKey = this.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('API key not set. Provide apiKey in config or set OPENAI_API_KEY environment variable.');
    }

    // Batch API call for remaining texts
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: uncachedTexts.map(t => t.text),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { data: { embedding: number[] }[] };

    // Map results back to correct positions and cache them
    for (let i = 0; i < uncachedTexts.length; i++) {
      const embedding = data.data[i].embedding;
      results[uncachedTexts[i].index] = embedding;
      this.cache.set(uncachedTexts[i].text, embedding);
    }

    return results;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Retrieve top-k most similar texts from a corpus
   */
  async retrieveTopK(
    query: string,
    corpus: { id: string; text: string }[],
    k: number,
    getEmbedding: (text: string) => Promise<number[]>
  ): Promise<{ id: string; text: string; score: number }[]> {
    // Get query embedding
    const queryEmbedding = await getEmbedding(query);

    // Compute similarity for each corpus item
    const scored = await Promise.all(
      corpus.map(async (item) => {
        const itemEmbedding = await getEmbedding(item.text);
        const score = this.cosineSimilarity(queryEmbedding, itemEmbedding);
        return { id: item.id, text: item.text, score };
      })
    );

    // Sort by score descending and take top-k
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}