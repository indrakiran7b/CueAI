/** Webpack-safe stub so Next never bundles @xenova/transformers. */
export const env = {
  cacheDir: "",
  allowLocalModels: false,
};

export async function pipeline(): Promise<never> {
  throw new Error("Local transformers embeddings are not loaded in this Next.js server.");
}
