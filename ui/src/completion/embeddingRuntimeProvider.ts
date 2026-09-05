import { getApi } from "../appHelper.js";
import { createEmbeddingCompletionProvider } from "./embeddingProvider";

export const embeddingCompletionProvider = createEmbeddingCompletionProvider(() => getApi().getEmbeddings());
