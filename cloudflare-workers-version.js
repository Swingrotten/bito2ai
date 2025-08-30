// Cloudflare Workers version of BITO OpenAI Compatible API

const BITO_API_URL = "https://bitoai.bito.ai/ai/v2/chat/";

// Built-in models configuration
const BITO_MODELS = {
  data: [
    {
      id: "Claude Sonnet 3.7",
      object: "model",
      created: 1677649963,
      owned_by: "bitoai",
      bito_config: {
        modelId: 42,
        aiModelType: "ADVANCED",
        ideName: "CLI",
        ideId: 0
      }
    },
    {
      id: "o3-mini High",
      object: "model",
      created: 1677649963,
      owned_by: "bitoai",
      bito_config: {
        modelId: 38,
        aiModelType: "ADVANCED",
        ideName: "CLI",
        ideId: 0
      }
    }
  ]
};

function generateId() {
  return `chatcmpl-${crypto.randomUUID().replace(/-/g, '')}`;
}

function getBitoModelDetails(modelId) {
  return BITO_MODELS.data.find(model => model.id === modelId);
}

function prepareBitoPromptAndContext(messages) {
  if (!messages.length) {
    throw new Error("No messages provided");
  }

  const systemPrompts = messages
    .filter(msg => msg.role === "system")
    .map(msg => msg.content)
    .join("\n");

  const userAssistantMessages = messages.filter(
    msg => msg.role === "user" || msg.role === "assistant"
  );

  if (!userAssistantMessages.length) {
    if (systemPrompts) {
      return [systemPrompts, []];
    } else {
      throw new Error("No user or assistant messages found");
    }
  }

  const corePromptContent = userAssistantMessages[userAssistantMessages.length - 1].content;
  const bitoPrompt = systemPrompts
    ? `${systemPrompts}\n\n${corePromptContent}`.trim()
    : corePromptContent;

  const contextMessages = userAssistantMessages.slice(0, -1);
  const bitoContext = [];

  for (let i = 0; i < contextMessages.length; i++) {
    if (contextMessages[i].role === "user" &&
        i + 1 < contextMessages.length &&
        contextMessages[i + 1].role === "assistant") {
      bitoContext.push({
        question: contextMessages[i].content,
        answer: contextMessages[i + 1].content
      });
      i++; // Skip next message as it's already processed
    }
  }

  return [bitoPrompt, bitoContext];
}

async function streamBitoResponse(payload, headers, modelName) {
  const streamId = generateId();
  let firstChunk = true;
  const encoder = new TextEncoder();

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    try {
      const response = await fetch(BITO_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorData = {
          id: streamId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          choices: [{
            delta: { content: `BITO API Error (${response.status}): ${errorText}` },
            index: 0,
            finish_reason: "error"
          }]
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
        await writer.write(encoder.encode("data: [DONE]\n\n"));
        await writer.close();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let jsonData = trimmed;
          if (trimmed.startsWith("data:")) {
            jsonData = trimmed.slice(5).trim();
          }

          if (jsonData === "[DONE]") {
            const finalChoice = {
              delta: {},
              index: 0,
              finish_reason: "stop"
            };
            const finalResponse = {
              id: streamId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: modelName,
              choices: [finalChoice]
            };
            await writer.write(encoder.encode(`data: ${JSON.stringify(finalResponse)}\n\n`));
            await writer.write(encoder.encode("data: [DONE]\n\n"));
            await writer.close();
            return;
          }

          try {
            const bitoResponse = JSON.parse(jsonData);
            let textChunk = "";

            if (bitoResponse.choices && bitoResponse.choices.length > 0) {
              textChunk = bitoResponse.choices[0].text || "";
            }

            const delta = {};
            if (firstChunk) {
              delta.role = "assistant";
              firstChunk = false;
            }

            if (textChunk) {
              delta.content = textChunk;
            }

            if (delta.role || delta.content) {
              const streamResponse = {
                id: streamId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: modelName,
                choices: [{
                  delta,
                  index: 0,
                  finish_reason: null
                }]
              };
              await writer.write(encoder.encode(`data: ${JSON.stringify(streamResponse)}\n\n`));
            }
          } catch (e) {
            console.error("JSON parse error:", e, "Raw:", jsonData);
          }
        }
      }
    } catch (error) {
      const errorData = {
        id: streamId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [{
          delta: { content: `Request error: ${error.message}` },
          index: 0,
          finish_reason: "error"
        }]
      };
      await writer.write(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
      await writer.write(encoder.encode("data: [DONE]\n\n"));
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}

async function nonStreamBitoResponse(payload, headers, modelName) {
  const aggregatedContent = [];
  let finalFinishReason = "stop";

  const streamResponse = await streamBitoResponse(payload, headers, modelName);
  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      const jsonData = trimmed.slice(6).trim();
      if (jsonData === "[DONE]") break;

      try {
        const streamResp = JSON.parse(jsonData);
        if (streamResp.choices && streamResp.choices[0]) {
          const choice = streamResp.choices[0];
          if (choice.delta && choice.delta.content) {
            aggregatedContent.push(choice.delta.content);
          }
          if (choice.finish_reason && choice.finish_reason !== "stop") {
            finalFinishReason = choice.finish_reason;
            break;
          }
        }
      } catch (e) {
        console.error("Error parsing stream event:", e);
      }
    }
  }

  const fullResponseText = aggregatedContent.join("");

  return {
    id: generateId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [{
      message: {
        role: "assistant",
        content: fullResponseText
      },
      index: 0,
      finish_reason: finalFinishReason
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

function extractBearerToken(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

function createCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const corsHeaders = createCorsHeaders();

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  // Extract and validate BITO token from Authorization header
  const bitoToken = extractBearerToken(request);
  if (!bitoToken) {
    return new Response(JSON.stringify({
      error: {
        message: "Invalid or missing API key",
        type: "invalid_request_error"
      }
    }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  // Handle /v1/models endpoint
  if (url.pathname === "/v1/models" && request.method === "GET") {
    const models = {
      object: "list",
      data: BITO_MODELS.data.map(model => ({
        id: model.id,
        object: model.object,
        created: model.created,
        owned_by: model.owned_by
      }))
    };

    return new Response(JSON.stringify(models), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  // Handle /v1/chat/completions endpoint
  if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
    try {
      const requestData = await request.json();

      const modelDefinition = getBitoModelDetails(requestData.model);
      if (!modelDefinition || !modelDefinition.bito_config) {
        return new Response(JSON.stringify({
          error: {
            message: `Model '${requestData.model}' not found`,
            type: "invalid_request_error"
          }
        }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      const bitoConfig = modelDefinition.bito_config;
      const [bitoPrompt, bitoContext] = prepareBitoPromptAndContext(requestData.messages);

      const customLlmConfig = {
        temperature: requestData.temperature ?? bitoConfig.temperature ?? 0.7,
        max_tokens: requestData.max_tokens ?? bitoConfig.max_tokens
      };

      if (requestData.top_p === null || requestData.top_p === undefined) {
        customLlmConfig.top_p = null;
      }

      // Filter out null/undefined values except top_p
      const finalCustomLlmConfig = {};
      for (const [k, v] of Object.entries(customLlmConfig)) {
        if (v !== null && v !== undefined) {
          finalCustomLlmConfig[k] = v;
        } else if (k === "top_p" && v === null) {
          finalCustomLlmConfig[k] = null;
        }
      }

      const bitoPayload = {
        aiModelType: bitoConfig.aiModelType || "ADVANCED",
        ideId: bitoConfig.ideId || 0,
        prompt: bitoPrompt,
        modelId: bitoConfig.modelId,
        ideName: bitoConfig.ideName || "CLI",
        context: bitoContext,
        Type: bitoConfig.Type || 1,
        Stream: true,
        topN: bitoConfig.topN || 0,
        topNThreshold: bitoConfig.topNThreshold || 0,
        folderPath: bitoConfig.folderPath || "",
        customllmconfig: finalCustomLlmConfig
      };

      if (!bitoPayload.modelId) {
        return new Response(JSON.stringify({
          error: {
            message: `Model '${requestData.model}' configuration missing modelId`,
            type: "invalid_request_error"
          }
        }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      const bitoHeaders = {
        "User-Agent": "CloudflareWorkers-Bito-Client/1.0.0",
        "Content-Type": "application/json",
        "authorization": bitoToken
      };

      if (requestData.stream) {
        const streamResponse = await streamBitoResponse(bitoPayload, bitoHeaders, requestData.model);
        return new Response(streamResponse.body, {
          headers: { ...streamResponse.headers, ...corsHeaders }
        });
      } else {
        const response = await nonStreamBitoResponse(bitoPayload, bitoHeaders, requestData.model);
        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

    } catch (error) {
      return new Response(JSON.stringify({
        error: {
          message: `Request processing error: ${error.message}`,
          type: "internal_server_error"
        }
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }
  }

  return new Response("Not Found", {
    status: 404,
    headers: corsHeaders
  });
}

// Cloudflare Workers entry point
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// For newer Workers runtime
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request);
  }
};