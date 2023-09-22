async function startNewConversation(sender, env) {
  await env.KV.delete(sender);

  const response = [
    { message: "Success ✅" },
    { message: `Your ID: (${sender})` },
    { message: "Conversation started anew." },
  ];

  return { replies: response };
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function makeApiRequest(url, data, headers) {
  try {
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: headers.Authorization ? `Bearer ${headers.Authorization}` : '',
      },
      body: JSON.stringify(data),
    };

    const response = await fetch(url, requestOptions);
    return response.json();
  } catch (error) {
    throw error;
  }
}

async function handleImageRequest(imageDesc, env) {
  const imageUrl = await makeApiRequest(
    `${env.API_URL}/v1/images/generations`, // Fixed the template literal
    { prompt: imageDesc, n: 1, size: "1024x1024" },
    { Authorization: env.API_KEY },
  );

  return {
    replies: [
      { message: "Success ✅" },
      { message: `Generated image:\n${imageUrl.data[0].url}` },
    ],
  };
}

async function handleTTSRequest(ttsDesc, env) {
  const ttsUrl = await makeApiRequest(
    `${env.API_URL}/v1/audio/speech`, // Fixed the template literal
    { input: ttsDesc },
    { Authorization: env.API_KEY },
  );

  return {
    replies: [
      { message: "Success ✅" },
      { message: `Generated TTS:\n${ttsUrl.url}` },
    ],
  };
}

async function handleChatRequest(sender, message, env) {
  try {
    const existingConversation = JSON.parse(await env.KV.get(sender)) || [];
    existingConversation.push({ role: "user", content: message });

    const chatResponse = await makeApiRequest(
      `${env.API_URL}/v1/chat/completions`, // Fixed the template literal
      {
        model: env.CHAT_MODEL,
        messages: [
          {
            role: "system",
            content: env.SYSTEM_MESSAGE,
          },
          ...existingConversation,
        ],
        stream: JSON.parse(env.CHAT_STREAM),
        max_tokens: parseInt(env.CHAT_TOKEN),
        temperature: parseFloat(env.CHAT_TEMPERATURE),
      },
      { Authorization: env.API_KEY },
    );

    existingConversation.push({
      role: "assistant",
      content: chatResponse.choices[0].message.content,
    });

    await env.KV.put(sender, JSON.stringify(existingConversation));

    return {
      replies: [
        { message: "Success ✅" },
        { message: chatResponse.choices[0].message.content },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleRequest(request, env) {
  try {
    const requestData = await request.json();
    const { sender, message } = requestData.query;
    const trimmedMessage = message.trim().toLowerCase();
    let responseBody;

    switch (trimmedMessage) {
      case "/new":
        responseBody = await startNewConversation(sender, env);
        break;
      case "/help":
        responseBody = {
          replies: [
            { message: "Commands:" },
            { message: "/new - Start a new conversation." },
            { message: "/img (desc) - Generate an image." },
            { message: "/tts (desc) - Generate text-to-speech." },
            { message: "/help - Show this help message." },
          ],
        };
        break;
      default:
        if (trimmedMessage.startsWith("/img")) {
          const imageDesc = trimmedMessage.substring(5).trim();
          if (imageDesc === "") {
            responseBody = {
              replies: [
                { message: "Error ❌" },
                { message: "Please provide a description for the image." },
              ],
            };
          } else {
            responseBody = await handleImageRequest(imageDesc, env);
          }
        } else if (trimmedMessage.startsWith("/tts")) {
          const ttsDesc = trimmedMessage.substring(5).trim();
          if (ttsDesc === "") {
            responseBody = {
              replies: [
                { message: "Error ❌" },
                { message: "Please provide a description for the TTS." },
              ],
            };
          } else {
            responseBody = await handleTTSRequest(ttsDesc, env);
          }
        } else {
          responseBody = await handleChatRequest(sender, message, env);
        }
        break;
    }

    return jsonResponse(responseBody);
  } catch (error) {
    const errorMessage =
      "Oops! An error occurred. Try again later or switch to another chatbot.\n\nTelegram: t.me/veronisabot\nTelegram: t.me/veronitabot";
    const errorResponse = jsonResponse({
      replies: [
        { message: "Error ❌" },
        { message: errorMessage },
      ],
    });
    return errorResponse;
  }
}

export default {
  async fetch(request, env, ctx) {
    return await handleRequest(request, env);
  },
};
