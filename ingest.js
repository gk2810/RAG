import "dotenv/config";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || "rag-auto-embed";
const EMBEDDING_DIMENSIONS = 1024;

export async function loadAndSplitPDF(filePath) {
    const loader = new PDFLoader(filePath);
    const documents = await loader.load();

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

    const chunks = await splitter.splitDocuments(documents);
    const chunksWithIds = chunks.map((doc, index) => {
        doc.id = `attention-pdf-chunk-${index}`;
        return doc;
    });
    console.log(`Split the document into ${chunks.length} chunks.`);
    return chunksWithIds;
}

function getEmbeddingModel() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("Missing GOOGLE_API_KEY (or GEMINI_API_KEY) in .env");
    }

    return new GoogleGenerativeAIEmbeddings({
        apiKey,
        model: "gemini-embedding-001",
        taskType: TaskType.RETRIEVAL_DOCUMENT,
        outputDimensionality: EMBEDDING_DIMENSIONS,
    });
}

export async function createEmbeddings(docs) {
    const texts = docs.map((doc) => doc.pageContent);
    const embeddingModel = getEmbeddingModel();
    const vectors = await embeddingModel.embedDocuments(texts);
    console.log(`Created ${vectors.length} embeddings.`);
    return { embeddingModel, vectors };
}

async function getOrCreateIndex(pinecone, indexName) {
    const { indexes } = await pinecone.indexes.list();
    // console.log("indexes ::", indexes);
    // process.exit(1);
    const exists = indexes?.some((index) => index.name === indexName);

    if (!exists) {
        console.log(`Creating Pinecone index "${indexName}"...`);
        await pinecone.indexes.createForModel({
            name: indexName,
            cloud: 'aws',
            region: 'us-east-1',
            embed: {
                model: 'multilingual-e5-large', // or 'llama-text-embed-v2'
                fieldMap: { text: 'chunk_text' }, // The property holding your text
            },
            waitUntilReady: true,
        });
        console.log(`Pinecone index "${indexName}" is ready.`);
    }

    return pinecone.index(indexName);
}

export async function uploadToPinecone(filePath) {
    try {
        const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

        const docs = await loadAndSplitPDF(filePath);
        const records = docs.map((doc, idx) => ({
            id: `chunk-${idx}`,
            chunk_text: doc.pageContent, // Matches the fieldMap defined above
            // metadata: doc.metadata        // LangChain metadata (e.g., page number)
        }));
        const pineconeIndex = await getOrCreateIndex(pinecone, INDEX_NAME);
        process.exit(1);
        // return await pineconeIndex.upsertRecords({ records });

        const results = await index.searchRecords({
            query: {
                topK: 3,
                inputs: { text: 'what is the refund policy?' },
            },
        });

        console.log(results.matches);
        process.exit(1);
        // console.log("docs >_", docs)


        const embeddingsResponse = await pinecone.inference.embed(
            'llama-text-embed-v2',
            docs,
            { inputType: 'passage' }
        );
        process.exit(1);
        // const { embeddingModel, vectors } = await createEmbeddings(docs);

        // const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
        // const pineconeIndex = await getOrCreateIndex(pinecone, INDEX_NAME);

        // const vectorStore = new PineconeStore(embeddingModel, { pineconeIndex });
        // console.log(vectors, `Created embeddings >_`);
        // console.log(docs, `docs >_`);

        // await vectorStore.addVectors(vectors, docs);

        // console.log("Uploaded all chunks into Pinecone successfully.");
        // return vectorStore;
    } catch (err) {
        console.error("Error during ingestion:", err);
        process.exit(1);
    }
}

const filePath = process.argv[2] || "./attention.pdf";

uploadToPinecone(filePath)
    .then((r) => {
        console.log("Ingestion completed successfully.", r);
    })
    .catch((error) => {
        console.error("Error during upload to pinecone :", error);
        process.exit(1);
    });
