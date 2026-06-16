export type EmbeddingProvider = {
  embed(text: string): Promise<number[]>;
};

export type ChatProvider = {
  complete(prompt: string): Promise<string>;
};
