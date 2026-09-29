import "dotenv/config";
import { Pinecone } from "@pinecone-database/pinecone";
import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index("rag-auto-embed");

async function retrieve(query) {
    const results = await index.searchRecords({
        query: {
            inputs: {
                text: query,
            },
            topK: 5,
        },
    });
    // console.log("results ::", JSON.stringify(results, null, 2));
    return results;
}

const question = "what is attention ?";
// const results = await retrieve(question);
// console.log("results ::", results);

async function generateAnswer(question, context) {
    const completion = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages: [
            {
                role: "system",
                content: `
You are a helpful RAG assistant.

Answer the user's question using ONLY the provided context.

If the answer cannot be found in the context, say:
"I don't have enough information in the provided documents."

Do not make up information.
        `,
            },
            {
                role: "user",
                content: `
Context:
${context}

Question:
${question}
        `,
            },
        ],
    });

    return completion.choices[0].message.content;
}

async function rag(question) {

    // 1. Retrieve relevant records from Pinecone
    const results = await retrieve(question);
    console.log("results ::", JSON.stringify(results));

    // 2. Extract text from retrieved records
    const context = results.result.hits
        .map((hit) => hit.fields?.chunk_text)
        .filter(Boolean)
        .join("\n\n");

    console.log("context ::", JSON.stringify(context));

    // 3. Send question + retrieved context to LLM
    const answer = await generateAnswer(question, context);
    return answer;
}

const answer = await rag(question);
console.log("\nANSWER:\n");
console.log(answer);