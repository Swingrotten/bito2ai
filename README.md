# BITO2AI - OpenAI Compatible API Proxy

A lightweight proxy service that provides OpenAI-compatible API interface for BITO AI, available in multiple runtime environments.

## 🚀 Features

- **OpenAI Compatible**: Drop-in replacement for OpenAI API endpoints
- **Multi-Runtime Support**: Python (FastAPI), Deno, and Cloudflare Workers versions
- **Streaming Support**: Real-time response streaming
- **Simple Authentication**: Direct BITO token usage via Authorization header
- **Built-in Models**: Pre-configured Claude Sonnet 3.7 and o3-mini High models
- **CORS Support**: Cross-origin requests enabled

## 📦 Available Versions

### 1. Python (FastAPI) - `main.py`
- Full-featured implementation with comprehensive error handling
- Requires: Python 3.7+, FastAPI, httpx, uvicorn
- Run: `python main.py`

### 2. Deno - `deno-version.ts`
- Modern TypeScript runtime with built-in security
- No external dependencies required
- Run: `deno run --allow-net deno-version.ts`

### 3. Cloudflare Workers - `cloudflare-workers-version.js`
- Edge computing deployment with global distribution
- Zero cold start, automatic scaling
- Deploy via Cloudflare Workers dashboard or Wrangler CLI

## 🛠 Quick Start

### Prerequisites
- Valid BITO API token
- Choose your preferred runtime environment

### Installation & Usage

#### Python Version
```bash
pip install fastapi httpx uvicorn
python main.py
```

#### Deno Version
```bash
deno run --allow-net deno-version.ts
```

#### Cloudflare Workers
1. Copy `cloudflare-workers-version.js` to your Workers project
2. Deploy via Wrangler: `wrangler publish`

## 🔧 API Usage

### Authentication
Use your BITO API token directly as the Bearer token:

```bash
curl -X POST http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_BITO_TOKEN" \
  -d '{
    "model": "Claude Sonnet 3.7",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

### Available Endpoints

#### List Models
```
GET /v1/models
```

#### Chat Completions
```
POST /v1/chat/completions
```

**Parameters:**
- `model`: Model name ("Claude Sonnet 3.7" or "o3-mini High")
- `messages`: Array of message objects
- `stream`: Boolean for streaming response (default: false)
- `temperature`: Float between 0-2 (optional)
- `max_tokens`: Integer (optional)
- `top_p`: Float between 0-1 (optional)

### Example Response
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1677649963,
  "model": "Claude Sonnet 3.7",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    },
    "index": 0,
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

## 🏗 Architecture

### Key Changes from Original
- **Simplified Authentication**: No external config files needed
- **Direct Token Usage**: BITO token passed via Authorization header
- **Embedded Configuration**: Models and settings built into code
- **Multi-Platform**: Same functionality across Python, Deno, and CF Workers

### Data Flow
1. Client sends OpenAI-format request with BITO token
2. Proxy validates token and transforms request format
3. Request forwarded to BITO API with proper headers
4. Response transformed back to OpenAI format
5. Streaming or complete response returned to client

## 🔒 Security Notes

- **Token Security**: Never expose BITO tokens in client-side code
- **HTTPS Only**: Always use HTTPS in production
- **Rate Limiting**: Consider implementing rate limiting for production use
- **CORS**: Adjust CORS settings based on your security requirements

## 🚨 Limitations

- **Image Support**: Current version only supports text input/output
- **Model Limitations**: Only pre-configured models available
- **Error Handling**: Basic error handling implemented
- **Usage Tracking**: No built-in usage analytics

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This is an unofficial proxy service for BITO AI. Use at your own risk and ensure compliance with BITO AI's terms of service. The authors are not responsible for any misuse or violations of third-party services.

## 🔧 Troubleshooting

### Common Issues

1. **"Invalid API Key" Error**
   - Ensure your BITO token is valid and properly formatted
   - Check the Authorization header format: `Bearer YOUR_TOKEN`

2. **CORS Issues**
   - Verify CORS headers are properly configured
   - Check if your domain is allowed

3. **Streaming Not Working**
   - Ensure your client supports Server-Sent Events (SSE)
   - Check network configuration for streaming support

### Getting Help

- Check existing GitHub issues
- Create a new issue with detailed error information
- Include runtime environment and version details