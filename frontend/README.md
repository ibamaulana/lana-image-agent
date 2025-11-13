# Lana Agent Frontend (Simplified)

A simplified, focused frontend with **only the AI agent chat interface** for image generation with Solana payments.

## ✨ Features

- 🤖 **AI Agent Chat** - Conversational interface with Gemini orchestrator
- 💬 **Streaming Responses** - Real-time Server-Sent Events
- 💰 **x402 Payments** - Integrated Solana payments  
- 🎨 **Image Generation** - AI-powered image creation
- 📱 **Responsive Design** - Works on all devices
- ⚡ **Minimal Dependencies** - Only what's needed

## 📁 Project Structure

```
frontend-simple/
├── src/
│   ├── app/                      # Next.js app directory
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Agent chat page
│   │   └── globals.css           # Global styles
│   │
│   ├── components/
│   │   └── ui/                   # UI components
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── textarea.tsx
│   │       ├── label.tsx
│   │       ├── separator.tsx
│   │       └── toast.tsx
│   │
│   ├── lib/                      # Utilities
│   │   ├── utils.ts              # Helper functions
│   │   └── config.ts             # Configuration
│   │
│   └── hooks/                    # Custom hooks
│       └── use-toast.tsx         # Toast notifications
│
├── public/                       # Static assets
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── tailwind.config.ts            # Tailwind config
└── next.config.ts                # Next.js config
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd frontend-simple
npm install
```

### 2. Configure Environment

Create `.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_X402_PRICE_USD=0.06
NEXT_PUBLIC_X402_NETWORK=solana-devnet
```

### 3. Start Development Server

```bash
npm run dev
```

Visit: `http://localhost:3000`

## 📦 Dependencies

### Core (9 dependencies)
- **next** - React framework
- **react** & **react-dom** - React library
- **@modelcontextprotocol/sdk** - MCP client
- **x402** - Payment protocol
- **tailwindcss** - Styling
- **lucide-react** - Icons
- **uuid** - ID generation
- **bs58** - Solana utilities

### Comparison

| | Full Frontend | Simple Frontend |
|--|---------------|-----------------|
| **Dependencies** | 67 | 21 |
| **Pages** | 10+ | 1 |
| **Components** | 60+ | 7 |
| **Features** | Many | Agent only |
| **Setup Time** | 10 min | 2 min |

## 🎯 What's Included

### ✅ Included

- AI Agent chat interface
- Streaming conversations
- x402 payment integration
- Image generation display
- Toast notifications
- Dark mode support
- Responsive design

### ❌ Not Included  

- User authentication
- Profile management
- Collections
- Image gallery
- Social features
- Multiple pages
- Complex state management

## 🎨 Agent Page Features

### Chat Interface
- **Conversational AI** - Natural language interaction
- **Streaming** - Real-time message streaming
- **Tool Calls** - Auto wallet, prompt, payment, generation
- **Message Types** - Text, images, suggestions, system logs

### Payment Flow
1. User describes desired image
2. Agent suggests optimized prompt
3. Display prompt with "Pay & Generate" button
4. User clicks to pay ($0.06 USDC)
5. Image generation starts automatically
6. Display generated image in chat

### Image Display
- **Generated Images** - Full display with metadata
- **Download Button** - Save images locally
- **Model Info** - Show which model was used
- **Prompt Display** - View the generation prompt

## 🔧 Configuration

### Backend URL

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

Must point to your backend-simple server.

### Payment Settings

```env
NEXT_PUBLIC_X402_PRICE_USD=0.06
NEXT_PUBLIC_X402_NETWORK=solana-devnet
```

## 📝 Usage

### Basic Flow

1. **Open App** → Chat interface loads
2. **Type Message** → "Create a cyberpunk cityscape"
3. **Agent Responds** → Suggests optimized prompt
4. **Review Suggestion** → See prompt, model, aspect ratio
5. **Click Pay** → Sign Solana payment
6. **Image Generates** → Wait ~10 seconds
7. **View Result** → Image appears in chat
8. **Download** → Save to device

### Example Conversation

```
User: I want a realistic photo of a sunset over mountains

Agent: Let me create an optimized prompt for you...
      [Shows suggestion card]
      
      Prompt: "a realistic photo of a sunset over mountains,
              hyperrealistic, photorealistic, high detail"
      Model: Flux Schnell
      Aspect Ratio: 16:9
      Style: Realistic
      
      [Pay & Generate Button - $0.06 USDC]

User: [Clicks Pay & Generate]

Agent: ✓ Payment settled
       🎨 Generating image...
       ✅ Image generated!
       [Displays image]
```

## 🎨 Customization

### Change Styles

Edit `src/app/globals.css` for theme colors:

```css
:root {
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* ... */
}
```

### Change Greeting

Edit `src/app/page.tsx`:

```typescript
const ASSISTANT_GREETING = "Your custom greeting here...";
```

### Change Price Display

Edit `.env.local`:

```env
NEXT_PUBLIC_X402_PRICE_USD=0.10
```

## 🏗️ Building for Production

```bash
npm run build
npm start
```

Or deploy to Vercel:

```bash
vercel
```

## 🔍 File Purposes

### Configuration Files

- `next.config.ts` - Next.js configuration
- `tsconfig.json` - TypeScript settings
- `tailwind.config.ts` - Tailwind CSS theme
- `postcss.config.mjs` - PostCSS plugins

### Source Files

- `src/app/layout.tsx` - Root layout with providers
- `src/app/page.tsx` - Main agent chat page
- `src/app/globals.css` - Global styles and CSS variables
- `src/lib/utils.ts` - Utility functions (cn helper)
- `src/lib/config.ts` - Centralized configuration
- `src/hooks/use-toast.tsx` - Toast notification hook

### UI Components

All in `src/components/ui/`:
- `button.tsx` - Button component
- `card.tsx` - Card container
- `input.tsx` - Text input
- `textarea.tsx` - Multi-line input
- `label.tsx` - Form label
- `separator.tsx` - Visual separator
- `toast.tsx` - Toast notifications
- `toaster.tsx` - Toast provider

## 🐛 Troubleshooting

### "Cannot connect to backend"
- Check backend is running on port 3001
- Verify `NEXT_PUBLIC_BACKEND_URL` is correct
- Check CORS settings in backend

### "Payment fails"
- Ensure wallet has sufficient SOL for fees
- Check `X402_SOLANA_RECEIVING_ADDRESS` in backend
- Verify network (devnet vs mainnet)

### "Image not loading"
- Check Replicate API token in backend
- Verify backend has credits
- Check browser console for errors

### Dark mode not working
- Ensure `ThemeProvider` is in layout
- Check `next-themes` is installed
- Verify CSS variables are defined

## 📚 Learn More

- [Next.js Docs](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [MCP SDK](https://modelcontextprotocol.io)
- [x402 Protocol](https://docs.x402.org)
- [Backend Simple Docs](../backend-simple/README.md)

## 🤝 Integration

### With Backend-Simple

1. Start backend: `cd backend-simple && npm run dev`
2. Start frontend: `cd frontend-simple && npm run dev`
3. Backend on `:3001`, Frontend on `:3000`
4. They communicate via API calls

### Environment Match

Frontend `.env.local`:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_X402_PRICE_USD=0.06
```

Backend `.env`:
```env
PORT=3001
X402_PRICE_USD=0.06
```

Prices must match!

## 🎯 Development Tips

### Hot Reload
- Changes auto-reload in development
- Backend changes need server restart
- Frontend changes are instant

### Debugging
- Open browser DevTools (F12)
- Check Console for errors
- Check Network for API calls
- Check Application for localStorage

### State Management
- Uses React hooks (useState, useEffect)
- No Redux or complex state management
- Simple and straightforward

## 📊 Performance

- **Initial Load**: ~2MB (with dependencies)
- **Chat Loading**: Instant (SSE streaming)
- **Image Generation**: ~10-30s (Replicate API)
- **Payment**: ~2-3s (Solana transaction)

## 🔒 Security Notes

### Current (Development)
- No authentication (relies on backend)
- Client-side payment signing
- Environment variables exposed to client

### Production Needs
- Add authentication
- Secure API keys
- Rate limiting
- Input validation
- HTTPS only

## 🚀 Deployment

### Vercel (Recommended)
```bash
vercel
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables
Set in deployment platform:
- `NEXT_PUBLIC_BACKEND_URL`
- `NEXT_PUBLIC_X402_PRICE_USD`
- `NEXT_PUBLIC_X402_NETWORK`

## 📝 License

ISC

---

**Simple, focused, and ready to use!** 🚀

For the full frontend with all features, see `/frontend`.
For the backend API, see `/backend-simple`.

