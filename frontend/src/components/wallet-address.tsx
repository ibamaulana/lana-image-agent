'use client'

import { Wallet, Copy, Check } from 'lucide-react'
import { useState } from 'react'

export function WalletAddress() {
  const [copied, setCopied] = useState(false)
  const walletAddress = '9mp5ZH5vHQ7p4ePTeb1YnPSutQg9P52SfUeZse4ozKaJ'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
      <div className="flex items-center gap-3 mb-3">
        <Wallet className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Official Wallet Address</h3>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-sm font-mono bg-background px-3 py-2 rounded border border-border break-all">
          {walletAddress}
        </code>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-sm text-primary hover:underline transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
