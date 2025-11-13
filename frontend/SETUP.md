# Frontend-Simple Setup Guide

Complete guide to setting up the simplified frontend from scratch.

## 🎯 Overview

The frontend-simple is a minimal Next.js app with only the agent chat interface. It requires:
- 21 npm packages (vs 67 in full frontend)
- 7 UI components (vs 60+ in full frontend)
- 1 page (vs 10+ in full frontend)

## 📋 Required Files

### Already Created ✅

1. `package.json` - Dependencies
2. `tsconfig.json` - TypeScript config
3. `next.config.ts` - Next.js config
4. `tailwind.config.ts` - Tailwind config
5. `postcss.config.mjs` - PostCSS config
6. `.env.example` - Environment template
7. `README.md` - Documentation

### Need to Create 📝

The following files need to be copied from the full frontend or created:

#### 1. UI Components (`src/components/ui/`)

These can be copied from `/frontend/components/ui/`:
- `button.tsx`
- `card.tsx`
- `input.tsx`
- `textarea.tsx`
- `label.tsx`
- `separator.tsx`
- `toast.tsx`
- `toaster.tsx`

#### 2. Main App Files (`src/app/`)

**`src/app/layout.tsx`**:
```typescript
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "next-themes"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "LANA | AI Image Generator Agent",
  description: "Conversational AI agent for image generation with Solana payments",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
```

**`src/app/page.tsx`**:
Copy the agent page from `/frontend/app/agent/page.tsx` and adapt it to use simplified imports and remove unused features.

**`src/app/globals.css`**:
Copy from `/frontend/app/globals.css` - includes Tailwind directives and CSS variables.

## 🚀 Quick Setup Steps

### Option 1: Manual Setup

1. **Install Dependencies**
```bash
cd frontend-simple
npm install
```

2. **Copy UI Components**
```bash
# From root directory
cp frontend/components/ui/button.tsx frontend-simple/src/components/ui/
cp frontend/components/ui/card.tsx frontend-simple/src/components/ui/
cp frontend/components/ui/input.tsx frontend-simple/src/components/ui/
cp frontend/components/ui/textarea.tsx frontend-simple/src/components/ui/
cp frontend/components/ui/label.tsx frontend-simple/src/components/ui/
cp frontend/components/ui/separator.tsx frontend-simple/src/components/ui/
cp frontend/components/ui/toast.tsx frontend-simple/src/components/ui/
cp frontend/components/ui/toaster.tsx frontend-simple/src/components/ui/
```

3. **Copy App Files**
```bash
cp frontend/app/agent/page.tsx frontend-simple/src/app/page.tsx
cp frontend/app/globals.css frontend-simple/src/app/globals.css
```

4. **Create Layout**
Create `frontend-simple/src/app/layout.tsx` with the content shown above.

5. **Configure Environment**
```bash
cp .env.example .env.local
# Edit .env.local with your backend URL
```

6. **Start Development Server**
```bash
npm run dev
```

### Option 2: Using Provided Script

Create `setup.sh` in `frontend-simple/`:

```bash
#!/bin/bash

echo "🚀 Setting up Frontend-Simple..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create directories
echo "📁 Creating directories..."
mkdir -p src/components/ui src/app src/lib src/hooks

# Copy UI components
echo "🎨 Copying UI components..."
cp ../frontend/components/ui/button.tsx src/components/ui/
cp ../frontend/components/ui/card.tsx src/components/ui/
cp ../frontend/components/ui/input.tsx src/components/ui/
cp ../frontend/components/ui/textarea.tsx src/components/ui/
cp ../frontend/components/ui/label.tsx src/components/ui/
cp ../frontend/components/ui/separator.tsx src/components/ui/
cp ../frontend/components/ui/toast.tsx src/components/ui/
cp ../frontend/components/ui/toaster.tsx src/components/ui/

# Copy app files
echo "📄 Copying app files..."
cp ../frontend/app/agent/page.tsx src/app/page.tsx
cp ../frontend/app/globals.css src/app/globals.css

# Copy utilities that already exist
echo "✅ Utilities already created"

# Setup environment
echo "⚙️  Setting up environment..."
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "✏️  Please edit .env.local with your configuration"
fi

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env.local with your backend URL"
echo "2. Run 'npm run dev' to start development server"
echo "3. Visit http://localhost:3000"
```

Run it:
```bash
chmod +x setup.sh
./setup.sh
```

## 🔧 Manual File Creation

If you prefer to create files manually or can't copy from the full frontend:

### 1. Create Button Component

`src/components/ui/button.tsx`:
```typescript
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

### 2. Create Other Components

For other components (Card, Input, Textarea, Label, Separator, Toast, Toaster), you can:
1. Copy from the full frontend (`/frontend/components/ui/`)
2. Use shadcn/ui CLI: `npx shadcn-ui@latest add button card input textarea label separator toast`
3. Create minimal versions yourself

## 🎨 Globals CSS

`src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

## ✅ Verification

After setup, verify:

1. **Dependencies Installed**
```bash
ls node_modules/@modelcontextprotocol
# Should exist
```

2. **Files Created**
```bash
ls src/app/
# Should show: layout.tsx page.tsx globals.css

ls src/components/ui/
# Should show: button.tsx card.tsx input.tsx etc.
```

3. **Development Server Starts**
```bash
npm run dev
# Should start on port 3000
```

4. **Page Loads**
Open `http://localhost:3000` - should see agent chat interface

## 🐛 Common Issues

### "Module not found: Can't resolve '@/components/ui/button'"
- UI components not created yet
- Copy from full frontend or use shadcn CLI

### "Module not found: Can't resolve '@/lib/utils'"
- Already created in this setup
- Check file exists at `src/lib/utils.ts`

### "Cannot find module 'next'"
- Dependencies not installed
- Run `npm install`

### "Port 3000 already in use"
- Kill other process on port 3000
- Or change port: `npm run dev -- -p 3001`

## 📝 Next Steps

After setup:
1. Configure `.env.local` with your backend URL
2. Start backend-simple on port 3001
3. Start frontend-simple on port 3000
4. Test the agent chat interface
5. Customize styles if needed

## 🎯 Alternative: Use shadcn/ui

If you want to quickly generate UI components:

```bash
npx shadcn-ui@latest init

# Then add components:
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add textarea
npx shadcn-ui@latest add label
npx shadcn-ui@latest add separator
npx shadcn-ui@latest add toast
```

This will auto-generate all UI components!

---

**Ready to build!** Follow the steps above to get your simplified frontend running. 🚀

